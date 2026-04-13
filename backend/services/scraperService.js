/**
 * scraperService.js — ESPN SCORE FIX
 *
 * BUG FOUND: ESPN summary returns 0/0 because:
 * - We were reading from gamepackageJSON.scorecard (empty object)
 * - Actual live score is in header.competitions[0].competitors[].score
 * - And detailed innings are in gamepackageJSON.plays, linescore, etc.
 *
 * ALSO FIXED:
 * - CB Proxy returns HTTP 402 → it's down/rate-limited, moved ESPN to primary
 * - Index.js freeze logic was keeping old SRH 66/0 data locked in DB
 */

import https from 'https';
import http  from 'http';
import { existsSync } from 'fs';

const TEAMS = ['CSK','MI','RCB','KKR','RR','PBKS','DC','GT','LSG','SRH'];
const wait  = ms => new Promise(r => setTimeout(r, ms));
const ESPN_IPL_ID = '23694';

const CHROME_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : null,
].filter(Boolean);
const CHROME_PATH = CHROME_PATHS.find(p => { try { return existsSync(p); } catch { return false; } }) || null;
const CHROME_AVAILABLE = !!CHROME_PATH;

// ─── HTTP helper ──────────────────────────────────────────────────────────────
const fetchRaw = (url, headers = {}, ms = 15000) => new Promise((res, rej) => {
  const lib = url.startsWith('https') ? https : http;
  const req = lib.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      'Accept': 'application/json, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      ...headers,
    },
    timeout: ms,
  }, r => {
    if ([301,302,303,307,308].includes(r.statusCode) && r.headers.location)
      return fetchRaw(r.headers.location, headers, ms).then(res).catch(rej);
    let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode, body: d }));
  });
  req.on('error', rej);
  req.on('timeout', () => { req.destroy(); rej(new Error('timeout')); });
});

const fetchJSON = async (url, headers = {}, label = '') => {
  const tag = label || url.substring(0, 60);
  try {
    const { status, body } = await fetchRaw(url, headers);
    if (status !== 200) { console.log(`  [HTTP ${status}] ${tag}`); return null; }
    if (!body || body.length < 5) { console.log(`  [EMPTY] ${tag}`); return null; }
    if (!body.trim().startsWith('{') && !body.trim().startsWith('[')) {
      console.log(`  [NOT-JSON ${status}] ${tag} → ${body.substring(0, 60)}`); return null;
    }
    const parsed = JSON.parse(body);
    console.log(`  [OK ${status}] ${tag} (${body.length} bytes)`);
    return parsed;
  } catch(e) { console.log(`  [ERR] ${tag} → ${e.message}`); return null; }
};

const toTeam = (s = '') => {
  const u = s.toUpperCase();
  if (TEAMS.includes(u)) return u;
  const map = {
    'SUPER KINGS':'CSK','MUMBAI INDIANS':'MI','MUMBAI':'MI',
    'ROYAL CHALLENGERS':'RCB','CHALLENGERS':'RCB','BANGALORE':'RCB','BENGALURU':'RCB',
    'KNIGHT RIDERS':'KKR','KOLKATA':'KKR',
    'RAJASTHAN ROYALS':'RR','RAJASTHAN':'RR','ROYALS':'RR',
    'PUNJAB KINGS':'PBKS','PUNJAB':'PBKS','KINGS XI':'PBKS',
    'DELHI CAPITALS':'DC','DELHI':'DC','CAPITALS':'DC',
    'GUJARAT TITANS':'GT','GUJARAT':'GT','TITANS':'GT',
    'LUCKNOW SUPER GIANTS':'LSG','LUCKNOW':'LSG','SUPER GIANTS':'LSG',
    'SUNRISERS':'SRH','HYDERABAD':'SRH','SUN RISERS':'SRH',
    'CHENNAI':'CSK','SUPER KING':'CSK',
  };
  for (const [k,v] of Object.entries(map)) if (u.includes(k)) return v;
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE 1: ESPN Cricinfo — FIXED score parsing
//
// The ESPN summary JSON structure for cricket:
// {
//   header: {
//     competitions: [{
//       status: { type: { name, detail, completed } },
//       competitors: [
//         { id, team: { displayName }, score: "216/6", linescores: [...] },
//         { id, team: { displayName }, score: "109/5", linescores: [...] }
//       ],
//       notes: [{ headline: "SRH won toss..." }]
//     }]
//   },
//   gamepackageJSON: {
//     linescore: { lines: [{ displayName, runs, wickets, overs }] },
//     batterBoxScores: [{ athlete, stats, active }],
//     bowlerBoxScores: [{ athlete, stats }],
//     plays: [{ text, period }]
//   }
// }
// ─────────────────────────────────────────────────────────────────────────────
const espnFindMatch = async () => {
  console.log('[SRC1] ESPN Cricinfo (ID=23694)...');

  // Try personalized header first — most reliable for live IPL
  const headerData = await fetchJSON(
    'https://site.api.espn.com/apis/personalized/v2/scoreboard/header?sport=cricket&region=in&tz=Asia/Calcutta',
    {}, 'ESPN header'
  );

  if (headerData) {
    for (const sport of (headerData.sports || [])) {
      for (const league of (sport.leagues || [])) {
        for (const ev of (league.events || [])) {
          const comps = ev.competitors || [];
          const t1 = toTeam(comps[0]?.displayName || comps[0]?.abbreviation || '');
          const t2 = toTeam(comps[1]?.displayName || comps[1]?.abbreviation || '');
          if (!t1 || !t2) continue;
          if (!TEAMS.includes(t1) || !TEAMS.includes(t2)) continue;
          if ((ev.status || '').toUpperCase() === 'PRE') continue;
          const espnId = ev.id || String(ev.uid || '').split('~e:')[1];
          console.log(`  [SRC1] Found via header: ${t1} vs ${t2} | ID:${espnId}`);
          return { espnId, team1: t1, team2: t2 };
        }
      }
    }
  }

  // Fallback: scoreboard
  const sbData = await fetchJSON(
    `https://site.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_ID}/scoreboard`,
    {}, `ESPN scoreboard/${ESPN_IPL_ID}`
  );
  if (sbData?.events) {
    for (const ev of sbData.events) {
      const comp = ev.competitions?.[0];
      const t1 = toTeam(comp?.competitors?.[0]?.team?.displayName || comp?.competitors?.[0]?.team?.abbreviation || '');
      const t2 = toTeam(comp?.competitors?.[1]?.team?.displayName || comp?.competitors?.[1]?.team?.abbreviation || '');
      if (!t1 || !t2 || !TEAMS.includes(t1) || !TEAMS.includes(t2)) continue;
      if (ev.status?.type?.name === 'STATUS_SCHEDULED') continue;
      console.log(`  [SRC1] Found via scoreboard: ${t1} vs ${t2} | ID:${ev.id}`);
      return { espnId: ev.id, team1: t1, team2: t2 };
    }
  }
  return null;
};

const espnGetScore = async (meta) => {
  const { espnId, team1, team2 } = meta;

  const summary = await fetchJSON(
    `https://site.web.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_ID}/summary?contentorigin=espn&event=${espnId}&lang=en&region=in`,
    {}, `ESPN summary/${espnId}`
  );
  if (!summary) return null;

  // ── Log the top-level keys so we understand the structure ──────────────────
  const topKeys = Object.keys(summary);
  console.log(`  [SRC1] Summary keys: ${topKeys.join(', ')}`);
  const gpkg = summary.gamepackageJSON;
  if (gpkg) console.log(`  [SRC1] gpkg keys: ${Object.keys(gpkg).join(', ')}`);

  const header = summary.header?.competitions?.[0];
  if (!header) { console.log('  [SRC1] No header.competitions[0]'); return null; }

  // ── Status ─────────────────────────────────────────────────────────────────
  const statusType   = header.status?.type || {};
  const statusName   = (statusType.name   || '').toUpperCase();
  const statusDetail = (statusType.detail || '').toUpperCase();
  let status = 'LIVE', result = '';

  if (statusDetail.includes('RAIN') || statusDetail.includes('HALT')) status = 'RAIN DELAY';
  else if (statusDetail.includes('INNINGS BREAK') || statusDetail.includes('BREAK')) status = 'INNINGS BREAK';
  else if (statusName.includes('FINAL') || statusType.completed === true) status = 'FINISHED';
  if (status === 'FINISHED') {
    result = summary.header?.competitions?.[0]?.notes?.[0]?.headline || statusDetail || '';
  }

  // ── Toss ───────────────────────────────────────────────────────────────────
  const tossNote = (header.notes || []).find(n =>
    (n.headline || '').toLowerCase().includes('toss') || (n.headline || '').toLowerCase().includes('chose')
  );
  const toss = tossNote?.headline || null;

  // ── Teams and scores from competitors ─────────────────────────────────────
  // ESPN cricket: competitors[0].score = "216/6", competitors[1].score = "109/5"
  const comp0 = header.competitors?.[0];
  const comp1 = header.competitors?.[1];
  const ct0 = toTeam(comp0?.team?.displayName || comp0?.team?.abbreviation || '') || team1;
  const ct1 = toTeam(comp1?.team?.displayName || comp1?.team?.abbreviation || '') || team2;
  const scoreStr0 = comp0?.score || ''; // "216/6" or "216-6" or "216"
  const scoreStr1 = comp1?.score || '';

  console.log(`  [SRC1] Competitor scores: ${ct0}="${scoreStr0}" | ${ct1}="${scoreStr1}"`);

  // Parse "216/6" or "216-6" format
  const parseScore = (s) => {
    if (!s) return null;
    // Try "216/6 (20)" format
    const m1 = s.match(/(\d+)[\/\-](\d+)\s*\(?(\d+\.?\d*)?\)?/);
    if (m1) return { runs: m1[1], wickets: m1[2], overs: m1[3] || null };
    // Just runs
    const m2 = s.match(/^(\d+)$/);
    if (m2) return { runs: m2[1], wickets: '0', overs: null };
    return null;
  };

  const parsed0 = parseScore(scoreStr0);
  const parsed1 = parseScore(scoreStr1);

  // ── Determine batting/bowling from linescore ───────────────────────────────
  // gpkg.linescore.lines: [{ displayName: "SRH", runs: 216, wickets: 6, overs: "20" }]
  // The LAST line is the current innings
  let battingTeam = team2, bowlingTeam = team1;
  let score = '0', wickets = '0', overs = '0.0';
  let team1Score = null, team1Wickets = null, team1Overs = null, target = null;

  const linescore = gpkg?.linescore;
  const lines = linescore?.lines || linescore?.periods || [];
  console.log(`  [SRC1] linescore lines: ${lines.length}`);

  if (lines.length > 0) {
    // Lines are ordered: first innings first
    const curLine = lines[lines.length - 1];
    const prevLine = lines.length > 1 ? lines[lines.length - 2] : null;

    const curTeamName = curLine.displayName || curLine.team?.displayName || '';
    const curTeam = toTeam(curTeamName);
    console.log(`  [SRC1] Current innings: ${curTeamName} → ${curTeam}`);

    if (curTeam && TEAMS.includes(curTeam)) {
      battingTeam = curTeam;
      bowlingTeam = battingTeam === ct0 ? ct1 : ct0;
    }

    score   = String(curLine.runs    ?? curLine.value ?? '0');
    wickets = String(curLine.wickets ?? '0');
    overs   = String(curLine.overs   ?? curLine.displayOvers ?? '0.0');

    if (prevLine) {
      team1Score   = String(prevLine.runs    ?? '');
      team1Wickets = String(prevLine.wickets ?? '');
      team1Overs   = String(prevLine.overs   ?? prevLine.displayOvers ?? '');
      if (prevLine.runs != null) target = parseInt(prevLine.runs) + 1;
    }
  } else if (parsed0 && parsed1) {
    // No linescore — use competitor scores
    // The team with fewer overs is currently batting
    const o0 = parsed0.overs ? parseFloat(parsed0.overs) : 20;
    const o1 = parsed1.overs ? parseFloat(parsed1.overs) : 20;

    if (o0 < o1) {
      // ct0 is currently batting
      battingTeam = ct0; bowlingTeam = ct1;
      score = parsed0.runs; wickets = parsed0.wickets; overs = parsed0.overs || '0.0';
      team1Score = parsed1.runs; team1Wickets = parsed1.wickets; team1Overs = parsed1.overs || '20';
      target = parseInt(parsed1.runs) + 1;
    } else if (o1 < o0) {
      battingTeam = ct1; bowlingTeam = ct0;
      score = parsed1.runs; wickets = parsed1.wickets; overs = parsed1.overs || '0.0';
      team1Score = parsed0.runs; team1Wickets = parsed0.wickets; team1Overs = parsed0.overs || '20';
      target = parseInt(parsed0.runs) + 1;
    } else if (scoreStr0 && !scoreStr1) {
      battingTeam = ct0; bowlingTeam = ct1;
      score = parsed0.runs; wickets = parsed0.wickets; overs = parsed0.overs || '0.0';
    } else if (scoreStr1 && !scoreStr0) {
      battingTeam = ct1; bowlingTeam = ct0;
      score = parsed1.runs; wickets = parsed1.wickets; overs = parsed1.overs || '0.0';
    }
  } else if (parsed0) {
    // Only first innings
    battingTeam = ct0; bowlingTeam = ct1;
    score = parsed0.runs; wickets = parsed0.wickets; overs = parsed0.overs || '0.0';
  } else if (parsed1) {
    battingTeam = ct1; bowlingTeam = ct0;
    score = parsed1.runs; wickets = parsed1.wickets; overs = parsed1.overs || '0.0';
  }

  // If score is still 0 try linescores on competitors directly
  if (score === '0' && comp0?.linescores?.length) {
    const allLines = [
      ...(comp0.linescores || []).map(l => ({ ...l, teamName: ct0 })),
      ...(comp1?.linescores || []).map(l => ({ ...l, teamName: ct1 })),
    ];
    // Sort by period/sequence to get current
    if (allLines.length > 0) {
      const last = allLines[allLines.length - 1];
      battingTeam = last.teamName; bowlingTeam = battingTeam === ct0 ? ct1 : ct0;
      score   = String(last.value ?? last.runs ?? '0');
      wickets = String(last.wickets ?? '0');
      overs   = String(last.overs   ?? '0.0');
      if (allLines.length > 1) {
        const prev = allLines[allLines.length - 2];
        team1Score = String(prev.value ?? prev.runs ?? '');
        team1Wickets = String(prev.wickets ?? '');
        team1Overs   = String(prev.overs   ?? '');
        if (prev.value ?? prev.runs) target = parseInt(prev.value ?? prev.runs) + 1;
      }
    }
  }

  console.log(`  [SRC1] Resolved: ${bowlingTeam} bowling, ${battingTeam} batting: ${score}/${wickets} (${overs})`);
  if (team1Score) console.log(`  [SRC1] 1st innings: ${team1Score}/${team1Wickets} (${team1Overs}) Target:${target}`);

  // ── Batsmen ────────────────────────────────────────────────────────────────
  const batsmen = [];
  const batterBoxScores = gpkg?.batterBoxScores || [];
  batterBoxScores
    .filter(b => b.active !== false && b.active !== undefined ? b.active : true)
    .slice(0, 3)
    .forEach(b => {
      const name = b.athlete?.displayName || b.athlete?.shortName || '';
      if (!name) return;
      const stats = {};
      (b.stats || []).forEach(s => { stats[s.name] = s.displayValue ?? s.value; });
      batsmen.push({
        name,
        runs:     parseInt(stats.runs     || stats.R   || 0),
        balls:    parseInt(stats.balls    || stats.B   || 0),
        fours:    parseInt(stats.fours    || stats['4s'] || 0),
        sixes:    parseInt(stats.sixes    || stats['6s'] || 0),
        sr:       parseFloat(stats.strikeRate || stats.SR || 0).toFixed(1),
        onStrike: b.active === true,
      });
    });

  // ── Bowlers ────────────────────────────────────────────────────────────────
  const bowlers = [];
  const bowlerBoxScores = gpkg?.bowlerBoxScores || [];
  bowlerBoxScores.slice(-2).forEach(b => {
    const name = b.athlete?.displayName || b.athlete?.shortName || '';
    if (!name) return;
    const stats = {};
    (b.stats || []).forEach(s => { stats[s.name] = s.displayValue ?? s.value; });
    bowlers.push({
      name,
      overs:   String(stats.overs   || stats.O   || '0'),
      maidens: parseInt(stats.maidens|| stats.M   || 0),
      runs:    parseInt(stats.runs   || stats.R   || 0),
      wickets: parseInt(stats.wickets|| stats.W   || 0),
      economy: parseFloat(stats.economy || stats.ECO || 0).toFixed(1),
    });
  });

  // ── Recent balls from plays ────────────────────────────────────────────────
  const plays = gpkg?.plays || gpkg?.scoringPlays || [];
  const recent = ['·','·','·','·','·','·'];
  plays.slice(-6).forEach((p, i) => {
    const d = (p.text || p.description || '').toLowerCase();
    let b = '·';
    if (d.includes('wicket') || d.includes(' out')) b = 'W';
    else if (d.includes('six')) b = '6';
    else if (d.includes('four') || d.includes('boundary')) b = '4';
    else if (d.includes('wide')) b = 'WD';
    else if (d.includes('no ball')) b = 'NB';
    else { const m = d.match(/(\d)\s*run/); b = m ? m[1] : '·'; }
    recent[i] = b;
  });

  // ── Commentary ─────────────────────────────────────────────────────────────
  const commentary = plays.slice(0, 12).map(p => {
    const text = p.text || p.description || '';
    if (!text || text.length < 5) return null;
    const ut = text.toUpperCase();
    return {
      over: String(p.period?.number || p.over || ''),
      text: text.substring(0, 200),
      type: ut.includes('WICKET') || ut.includes(' OUT') ? 'wicket'
          : ut.includes('FOUR')   || ut.includes('SIX')  ? 'boundary' : 'normal',
      generated: false,
    };
  }).filter(Boolean);

  // ── Win probability ────────────────────────────────────────────────────────
  const crr = parseFloat(gpkg?.currentRunRate  || 0) || null;
  const rrr = parseFloat(gpkg?.requiredRunRate || 0) || null;
  let winProbT1 = 50, winProbT2 = 50;
  if (rrr && crr) {
    const r = rrr / crr;
    winProbT2 = r < 0.75 ? 78 : r < 0.9 ? 66 : r < 1.0 ? 55 : r < 1.1 ? 46 : r < 1.3 ? 37 : r < 1.6 ? 28 : 16;
    winProbT1 = 100 - winProbT2;
  } else if (rrr) {
    winProbT2 = rrr < 6 ? 78 : rrr < 8 ? 64 : rrr < 10 ? 50 : rrr < 12 ? 36 : rrr < 15 ? 22 : 12;
    winProbT1 = 100 - winProbT2;
  } else if (crr && !target) {
    const proj = crr * 20;
    winProbT2 = proj > 185 ? 62 : proj > 165 ? 56 : proj > 145 ? 50 : proj > 125 ? 44 : 38;
    winProbT1 = 100 - winProbT2;
  }
  if (status === 'FINISHED') {
    const w = result.toUpperCase();
    if (w.includes(battingTeam)) { winProbT2 = 100; winProbT1 = 0; }
    else if (w.includes(bowlingTeam)) { winProbT1 = 100; winProbT2 = 0; }
  }
  if (['ABANDONED', 'POSTPONED'].includes(status)) { winProbT1 = 50; winProbT2 = 50; }

  console.log(`  ✅ [SRC1 ESPN] ${bowlingTeam} vs ${battingTeam} | ${score}/${wickets} (${overs}) | ${status}`);
  if (batsmen.length) console.log(`     🏏 ${batsmen.map(b=>`${b.name}${b.onStrike?'*':''}: ${b.runs}(${b.balls})`).join(', ')}`);
  if (bowlers.length) console.log(`     🎯 ${bowlers.map(b=>`${b.name}: ${b.wickets}/${b.runs} (${b.overs})`).join(', ')}`);

  return {
    team1: { name: bowlingTeam }, team2: { name: battingTeam },
    score, wickets, overs,
    team1Score: team1Score || null,
    team1Wickets: team1Wickets || null,
    team1Overs: team1Overs || null,
    target: target || null,
    status, result, toss,
    winProb: winProbT2, winProbT1, winProbT2,
    recent, batsmen, bowlers, commentary,
    crr, rrr,
    source: 'espn',
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE 2: cricbuzz-live.vercel.app proxy
// Note: was returning HTTP 402 in logs — keep as fallback but not primary
// ─────────────────────────────────────────────────────────────────────────────
const cbProxyFetch = async () => {
  console.log('[SRC2] cricbuzz-live.vercel.app...');

  const matchList = await fetchJSON('https://cricbuzz-live.vercel.app/v1/matches', {}, 'CB-Proxy /v1/matches');
  if (!matchList?.data?.matches) { console.log('  [SRC2] No matches (proxy may be down)'); return null; }

  const matches = matchList.data.matches;
  console.log(`  [SRC2] ${matches.length} total matches`);

  let iplMatch = null;
  for (const m of matches) {
    const title = (m.title || '').toUpperCase();
    const teamsInTitle = TEAMS.filter(t => title.includes(t));
    if (!title.includes('IPL') && !title.includes('PREMIER LEAGUE') && teamsInTitle.length < 2) continue;
    iplMatch = m; break;
  }

  if (!iplMatch) { console.log('  [SRC2] No IPL match'); return null; }

  const matchId = String(iplMatch.id || '');
  if (!matchId) { console.log('  [SRC2] No match ID'); return null; }

  const title = (iplMatch.title || '').toUpperCase();
  const teams = TEAMS.filter(t => title.includes(t));
  console.log(`  [SRC2] IPL: "${iplMatch.title}" ID:${matchId}`);

  const scoreData = await fetchJSON(
    `https://cricbuzz-live.vercel.app/v1/score/${matchId}`,
    {}, `CB-Proxy /v1/score/${matchId}`
  );
  if (!scoreData?.data) { console.log('  [SRC2] No score data'); return null; }

  const d = scoreData.data;
  console.log(`  [SRC2] liveScore: "${d.liveScore}" | update: "${d.update}"`);

  const liveStr = d.liveScore || '';
  let team1 = teams[0] || 'TBD', team2 = teams[1] || 'TBD';
  let battingTeam = team2, bowlingTeam = team1;
  let score = '0', wickets = '0', overs = '0.0';

  const fullM  = liveStr.match(/\b([A-Z]{2,4})\s+(\d+)[\/\-](\d+)\s*\(?([\d.]+)\)?/);
  const shortM = liveStr.match(/(\d+)[\/\-](\d+)\s*\(?([\d.]+)\)?/);
  if (fullM) {
    const st = toTeam(fullM[1]);
    if (st && TEAMS.includes(st)) { battingTeam = st; bowlingTeam = battingTeam===team1?team2:team1; }
    score = fullM[2]; wickets = fullM[3]; overs = fullM[4] || '0.0';
  } else if (shortM) {
    score = shortM[1]; wickets = shortM[2]; overs = shortM[3] || '0.0';
  }

  const update = (d.update || '').toUpperCase();
  let status = 'LIVE', result = '';
  if (update.includes('WON') || update.includes(' WIN')) { status = 'FINISHED'; result = d.update || ''; }
  else if (update.includes('RAIN') || update.includes('HALT') || update.includes('DELAY')) status = 'RAIN DELAY';
  else if (update.includes('BREAK')) status = 'INNINGS BREAK';

  let target = null, team1Score = null;
  const tgtM  = (d.update || '').match(/[Tt]arget[:\s]+(\d+)/i);
  const needsM = (d.update || '').match(/need[s]?\s+(\d+)\s+(?:more\s+)?runs?/i);
  if (tgtM)  { target = parseInt(tgtM[1]);  team1Score = String(target - 1); }
  else if (needsM) { target = parseInt(score) + parseInt(needsM[1]); team1Score = String(target - 1); }

  const tossM = (d.update || '').match(/(KKR|MI|CSK|RCB|RR|PBKS|DC|GT|LSG|SRH)\s+(?:opt(?:ed)?|chose)\s+to\s+(bat|bowl)/i);
  const toss = tossM ? `${tossM[1].toUpperCase()} chose to ${tossM[2].toLowerCase()}` : null;

  const parseBR = s => { const m = String(s||'').match(/(\d+)\s*\((\d+)\)/); return m ? {runs:parseInt(m[1]),balls:parseInt(m[2])} : {runs:parseInt(String(s||'').match(/(\d+)/)?.[1]||0),balls:0}; };
  const batsmen = [];
  if (d.batsmanOne?.length > 1) { const {runs,balls}=parseBR(d.batsmanOneRun); batsmen.push({name:d.batsmanOne,runs,balls,fours:0,sixes:0,sr:parseFloat(d.batsmanOneSR||(balls?((runs/balls)*100).toFixed(1):'0.0')).toFixed(1),onStrike:true}); }
  if (d.batsmanTwo?.length > 1) { const {runs,balls}=parseBR(d.batsmanTwoRun); batsmen.push({name:d.batsmanTwo,runs,balls,fours:0,sixes:0,sr:parseFloat(d.batsmanTwoSR||(balls?((runs/balls)*100).toFixed(1):'0.0')).toFixed(1),onStrike:false}); }

  const bowlers = [];
  if (d.bowlerOne?.length > 1 && d.bowlerOne !== 'BOWLER') bowlers.push({name:d.bowlerOne,overs:String(d.bowlerOneOver??'0'),maidens:0,runs:parseInt(d.bowlerOneRun??0),wickets:parseInt(d.bowlerOneWickets??0),economy:String(d.bowlerOneEconomy||'0.0')});
  if (d.bowlerTwo?.length > 1 && d.bowlerTwo !== 'BOWLER' && d.bowlerTwo !== 'O') bowlers.push({name:d.bowlerTwo,overs:String(d.bowlerTwoOver??'0'),maidens:0,runs:parseInt(d.bowlerTwoRun??0),wickets:parseInt(d.bowlerTwoWicket??d.bowlerTwoWickets??0),economy:String(d.bowlerTwoEconomy||'0.0')});

  const crr = parseFloat(d.runRate || 0) || null;
  let winProbT1=50, winProbT2=50;
  if (status==='LIVE'&&target&&crr) { const rrr=((target-parseInt(score))/(Math.max((20-parseFloat(overs))*6,1)))*6; const r=rrr/crr; winProbT2=r<0.75?78:r<0.9?66:r<1.0?55:r<1.1?46:r<1.3?37:r<1.6?28:16; winProbT1=100-winProbT2; }
  else if (crr&&!target) { const p=crr*20; winProbT2=p>185?62:p>165?56:p>145?50:p>125?44:38; winProbT1=100-winProbT2; }
  if (status==='FINISHED') { const w=result.toUpperCase(); if(w.includes(battingTeam)){winProbT2=100;winProbT1=0;}else{winProbT1=100;winProbT2=0;} }

  console.log(`  ✅ [SRC2 CB-Proxy] ${bowlingTeam} vs ${battingTeam} | ${score}/${wickets} (${overs}) | ${status}`);
  if (batsmen.length) console.log(`     🏏 ${batsmen.map(b=>`${b.name}${b.onStrike?'*':''}: ${b.runs}(${b.balls})`).join(', ')}`);

  return { team1:{name:bowlingTeam}, team2:{name:battingTeam}, score, wickets, overs, team1Score:team1Score||null, team1Wickets:null, team1Overs:null, target:target||null, status, result, toss, winProb:winProbT2, winProbT1, winProbT2, recent:['·','·','·','·','·','·'], batsmen, bowlers, commentary:[], crr, rrr:null, source:'cricbuzz-proxy' };
};

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE 3: Cricbuzz direct JSON
// ─────────────────────────────────────────────────────────────────────────────
const cbDirectFetch = async () => {
  console.log('[SRC3] Cricbuzz direct JSON...');
  const cbH = { 'Referer':'https://www.cricbuzz.com/', 'X-Requested-With':'XMLHttpRequest' };

  const list = await fetchJSON('https://www.cricbuzz.com/api/cricket-match/live-scores', cbH, 'CB live-scores');
  if (!list) { console.log('  [SRC3] Cricbuzz blocked/empty'); return null; }

  const allMatches = [];
  for (const s of (list.matchDetails||[])) allMatches.push(...(s?.matchDetailsMap?.match||[]));
  for (const t of (list.typeMatches||[])) for (const sm of (t.seriesMatches||[])) allMatches.push(...(sm?.seriesAdWrapper?.matches||sm?.matches||[]));
  if (list.matches) allMatches.push(...list.matches);

  let meta = null;
  for (const m of allMatches) {
    const info = m?.matchInfo || m;
    if (!(info?.seriesName||'').toUpperCase().includes('IPL') && !(info?.seriesName||'').toUpperCase().includes('PREMIER')) continue;
    if ((info?.state||'').toUpperCase() === 'PREVIEW') continue;
    const t1 = toTeam(info?.team1?.teamSName||info?.team1?.teamName||'');
    const t2 = toTeam(info?.team2?.teamSName||info?.team2?.teamName||'');
    const mid = String(info?.matchId||'');
    if (!mid||!t1||!t2) continue;
    meta = { matchId:mid, team1:t1, team2:t2, t1Id:info?.team1?.teamId, t2Id:info?.team2?.teamId };
    break;
  }
  if (!meta) { console.log('  [SRC3] No IPL match'); return null; }

  const cbMH = {...cbH,'Referer':`https://www.cricbuzz.com/live-cricket-scores/${meta.matchId}/`};
  const [miniR,commR,scR] = await Promise.allSettled([
    fetchJSON(`https://www.cricbuzz.com/api/cricket-match/${meta.matchId}/miniscore`,cbMH,`CB miniscore`),
    fetchJSON(`https://www.cricbuzz.com/api/cricket-match/${meta.matchId}/commentary/1`,cbMH,`CB commentary`),
    fetchJSON(`https://www.cricbuzz.com/api/cricket-scorecard/${meta.matchId}`,cbMH,`CB scorecard`),
  ]);
  const mini=miniR.status==='fulfilled'?miniR.value:null;
  const comm=commR.status==='fulfilled'?commR.value:null;
  const sc  =scR.status  ==='fulfilled'?scR.value  :null;
  if (!mini) { console.log('  [SRC3] Miniscore blocked'); return null; }

  const ms = mini?.minScore||mini?.miniscore||mini;
  if (!ms||typeof ms!=='object') return null;
  const rawSt=(ms?.status||mini?.matchHeader?.status||'').toLowerCase();
  if(rawSt.includes('yet to begin')||rawSt.includes('preview'))return null;

  let status='LIVE',result='';
  if(rawSt.includes('rain')||rawSt.includes('delay'))status='RAIN DELAY';
  else if(rawSt.includes('break'))status='INNINGS BREAK';
  else if(rawSt.includes('super over'))status='SUPER OVER';
  else if(rawSt.includes('abandon')){status='ABANDONED';result='Match Abandoned';}
  else if(rawSt.includes('won')||rawSt.includes('complete')||rawSt.includes('finish')){status='FINISHED';result=mini?.matchHeader?.status||rawSt;}

  const tDec=(mini?.matchHeader?.tossResults?.decision||'').toLowerCase();
  const tWId=mini?.matchHeader?.tossResults?.tossWinnerId;
  const toss=tDec&&tWId?`${tWId===meta.t1Id?meta.team1:meta.team2} chose to ${tDec}`:null;
  const btId=ms?.battingTeamId||ms?.batTeam?.teamId;
  let battingTeam=meta.team2,bowlingTeam=meta.team1;
  if(btId){battingTeam=btId===meta.t1Id?meta.team1:meta.team2;bowlingTeam=battingTeam===meta.team1?meta.team2:meta.team1;}

  const batScore=ms?.batTeam?.teamScore||{};const bowlScore=ms?.bowlTeam?.teamScore||{};
  let score=String(ms?.score??batScore?.runs??'0');
  let wickets=String(ms?.wickets??batScore?.wickets??'0');
  let overs=String(ms?.overs??batScore?.overs??'0.0');
  if(/^\d{3,}$/.test(overs)){const b=parseInt(overs);overs=`${Math.floor(b/6)}.${b%6}`;}

  let team1Score=null,team1Wickets=null,team1Overs=null,target=null;
  const innL=ms?.matchScoreDetails?.inningsScoreList||[];
  if(innL.length>=2){const p=innL[0];team1Score=String(p.score??'');team1Wickets=String(p.wickets??'');team1Overs=String(p.overs??'');target=parseInt(p.score??0)+1;}
  else if(!team1Score&&bowlScore.runs!=null){team1Score=String(bowlScore.runs??'');team1Wickets=String(bowlScore.wickets??'');team1Overs=String(bowlScore.overs??'');if(team1Score)target=parseInt(team1Score)+1;}
  if(!target&&ms?.target)target=parseInt(ms.target);

  const crr=parseFloat(ms?.currentRunRate||0)||null;const rrr=parseFloat(ms?.requiredRunRate||0)||null;
  let batsmen=(ms?.batsman||[]).filter(Boolean).slice(0,3).map(b=>({name:b.batName||b.name||'',runs:parseInt(b.batRuns??0),balls:parseInt(b.batBalls??0),fours:parseInt(b.batFours??0),sixes:parseInt(b.batSixes??0),sr:parseFloat(b.batStrikeRate??0).toFixed(1),onStrike:b.isStriker??false})).filter(b=>b.name);
  let bowlers=(ms?.bowler?(Array.isArray(ms.bowler)?ms.bowler:[ms.bowler]):[]).filter(Boolean).slice(0,2).map(b=>({name:b.bowlName||b.name||'',overs:String(b.bowlOvs??'0'),maidens:parseInt(b.bowlMaidens??0),runs:parseInt(b.bowlRuns??0),wickets:parseInt(b.bowlWkts??0),economy:parseFloat(b.bowlEcon??0).toFixed(1)})).filter(b=>b.name);

  if(batsmen.length===0&&sc?.scoreCard){const cur=sc.scoreCard[sc.scoreCard.length-1];if(cur){const bM=cur.batTeamDetails?.batsmenData||{};Object.values(bM).filter(b=>!b.outDesc||b.outDesc.trim()==='').slice(0,3).forEach(b=>{batsmen.push({name:b.batName||'',runs:parseInt(b.runs??0),balls:parseInt(b.balls??0),fours:parseInt(b.fours??0),sixes:parseInt(b.sixes??0),sr:parseFloat(b.strikeRate??0).toFixed(1),onStrike:b.isStriker??false});});if(!bowlers.length){const bwM=cur.bowlTeamDetails?.bowlersData||{};Object.values(bwM).filter(b=>parseFloat(b.overs||0)>0).slice(-2).forEach(b=>{bowlers.push({name:b.bowlName||'',overs:String(b.overs??'0'),maidens:parseInt(b.maidens??0),runs:parseInt(b.runs??0),wickets:parseInt(b.wickets??0),economy:parseFloat(b.economy??0).toFixed(1)});});}}}

  const recentStr=ms?.recentOvsStats||ms?.lastFewOvers||'';
  let recent=[];
  if(recentStr)recent=recentStr.replace(/\|/g,' ').trim().split(/\s+/).map(b=>{const u=b.toUpperCase();if(!u||u==='.'||u==='·')return'·';if(u==='W')return'W';if(u==='WD')return'WD';if(u.startsWith('NB'))return'NB';if(/^\d+$/.test(u))return u==='0'?'·':u;return'·';}).slice(-6);
  while(recent.length<6)recent.push('·');
  const commentary=[];
  (comm?.commentary?.commentaryList||comm?.commentaryList||[]).slice(0,10).forEach(c=>{const text=c.commText||'';if(!text||text.length<5)return;const ut=text.toUpperCase();commentary.push({over:c.overNumber!=null?`${c.overNumber}.${c.ballNumber??''}`:'',text:text.substring(0,200),type:ut.includes('WICKET')||ut.includes(' OUT')?'wicket':ut.includes('FOUR')||ut.includes('SIX')?'boundary':'normal',generated:false});});

  let winProbT1=50,winProbT2=50;
  if(rrr&&crr){const r=rrr/crr;winProbT2=r<0.75?78:r<0.9?66:r<1.0?55:r<1.1?46:r<1.3?37:r<1.6?28:16;winProbT1=100-winProbT2;}
  else if(rrr){winProbT2=rrr<6?78:rrr<8?64:rrr<10?50:rrr<12?36:rrr<15?22:12;winProbT1=100-winProbT2;}
  if(status==='FINISHED'){const w=result.toUpperCase();if(w.includes(battingTeam)){winProbT2=100;winProbT1=0;}else{winProbT1=100;winProbT2=0;}}

  console.log(`  ✅ [SRC3 CB-Direct] ${bowlingTeam} vs ${battingTeam} | ${score}/${wickets} (${overs}) | ${status}`);
  return {team1:{name:bowlingTeam},team2:{name:battingTeam},score,wickets,overs,team1Score,team1Wickets,team1Overs,target:target||null,status,result,toss,winProb:winProbT2,winProbT1,winProbT2,recent:recent.slice(0,6),batsmen:batsmen.slice(0,3),bowlers:bowlers.slice(0,2),commentary:commentary.slice(0,10),crr,rrr,source:'cricbuzz-api'};
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export const scrapeLiveMatch = async () => {
  console.log('━━━ [Scraper] Starting fetch cycle ━━━');

  // SRC1: ESPN (most reliable from Render — found match correctly in logs)
  try {
    const meta = await espnFindMatch();
    if (meta) {
      const r = await espnGetScore(meta);
      if (r && (r.score !== '0' || r.status !== 'LIVE')) {
        console.log('━━━ [Scraper] Done via ESPN ━━━');
        return { ...r, lastUpdated: new Date() };
      }
      // ESPN found match but score is 0/0 — log structure and try next source
      if (r?.score === '0') console.log('  [SRC1] Score is 0/0 — ESPN structure may differ, trying SRC2...');
    }
  } catch(e) { console.log('[SRC1 fatal]', e.message); }

  // SRC2: CB Proxy
  try {
    const r = await cbProxyFetch();
    if (r) { console.log('━━━ [Scraper] Done via CB-Proxy ━━━'); return { ...r, lastUpdated: new Date() }; }
  } catch(e) { console.log('[SRC2 fatal]', e.message); }

  // SRC3: CB Direct
  try {
    const r = await cbDirectFetch();
    if (r) { console.log('━━━ [Scraper] Done via CB-Direct ━━━'); return { ...r, lastUpdated: new Date() }; }
  } catch(e) { console.log('[SRC3 fatal]', e.message); }

  if (!CHROME_AVAILABLE) {
    console.log('━━━ [Scraper] All HTTP sources failed. No Chrome. ━━━');
    return null;
  }
  return await browserFallback();
};

// browser fallback (local dev only — same as before)
let _pptr = null;
const getPptr = async () => { if(_pptr)return _pptr; try{_pptr=(await import('puppeteer-core')).default;return _pptr;}catch{}try{_pptr=(await import('puppeteer')).default;return _pptr;}catch{}return null; };
const browserFallback = async () => {
  const pptr=await getPptr();if(!pptr)return null;
  let browser;
  try {
    browser=await pptr.launch({executablePath:CHROME_PATH,headless:'new',args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process']});
    const mp=await browser.newPage();
    await mp.goto('https://www.cricbuzz.com/cricket-match/live-scores',{waitUntil:'domcontentloaded',timeout:30000});
    await wait(3000);
    const mm=await mp.evaluate(TEAMS=>{const links=Array.from(document.querySelectorAll('a[href*="/live-cricket-scores/"]'));const seen=new Set(),c=[];for(const a of links){const href=a.getAttribute('href')||'',hu=href.toUpperCase();if(seen.has(href))continue;if(!hu.includes('IPL')&&!hu.includes('INDIAN-PREMIER'))continue;const idM=href.match(/\/live-cricket-scores\/(\d+)\//);if(!idM)continue;const t=TEAMS.filter(t=>hu.includes(`-${t}-`)||hu.includes(`/${t}-`)||hu.endsWith(`-${t}`));if(t.length<2)continue;seen.add(href);const card=a.closest('[class*="cb-col"]')||a.parentElement;const hint=card?.querySelector('.cb-text-live')?'LIVE':card?.querySelector('.cb-text-complete,.cb-text-stumps')?'FINISHED':'UPCOMING';c.push({matchId:idM[1],cbUrl:'https://www.cricbuzz.com'+href,team1:t[0],team2:t[1],priority:hint==='LIVE'?0:hint==='FINISHED'?1:2});}c.sort((a,b)=>a.priority-b.priority);return c[0]||null;},TEAMS);
    await mp.close();
    if(!mm){await browser.close();return null;}
    // crex browser scrape
    try{
      const cp=await browser.newPage();
      await cp.goto('https://crex.com/',{waitUntil:'domcontentloaded',timeout:20000});await wait(2500);
      let cu=await cp.evaluate((t1,t2,T)=>{for(const l of document.querySelectorAll('a[href]')){const h=l.href||'',hu=h.toUpperCase(),hl=h.toLowerCase();if(!hl.includes('cricket-live-score')&&!hl.includes('scorecard'))continue;const f=T.filter(t=>hu.includes(`-${t}-`)||hu.includes(`/${t}-`));if(f.includes(t1)&&f.includes(t2))return h;}return null;},mm.team1,mm.team2,TEAMS);
      if(!cu){await cp.goto('https://crex.com/fixtures',{waitUntil:'domcontentloaded',timeout:15000});await wait(2000);cu=await cp.evaluate((t1,t2,T)=>{for(const l of document.querySelectorAll('a[href]')){const h=l.href||'',hu=h.toUpperCase();const f=T.filter(t=>hu.includes(`-${t}-`)||hu.includes(`/${t}-`));if(f.includes(t1)&&f.includes(t2))return h;}return null;},mm.team1,mm.team2,TEAMS);}
      if(cu){
        await cp.goto(cu,{waitUntil:'networkidle2',timeout:30000});await wait(5000);
        const body=await cp.evaluate(()=>document.body?.innerText||'');
        await cp.close();
        if(body.length>100){
          const sM=body.match(/(\d+)[\/\-](\d+)\s*\(?([\d.]+)\)?/);
          const wonM=body.match(/(KKR|MI|CSK|RCB|RR|PBKS|DC|GT|LSG|SRH)\s+won\s+by\s+([\d]+\s+(?:runs?|wickets?))/i);
          const tossM=body.match(/(KKR|MI|CSK|RCB|RR|PBKS|DC|GT|LSG|SRH)\s+(?:opt(?:ed)?|chose)\s+to\s+(bat|bowl)/i);
          const bRx=/([A-Z][a-z]+(?:\s+[A-Z][a-z.]+){1,3})\s+(\d+)\s*\((\d+)\)/g;
          const batsmen=[];[...body.matchAll(bRx)].slice(0,3).forEach(m=>{if(m[1].length<2||m[1].length>35)return;batsmen.push({name:m[1].trim(),runs:parseInt(m[2]),balls:parseInt(m[3]),fours:0,sixes:0,sr:m[3]!=='0'?((parseInt(m[2])/parseInt(m[3]))*100).toFixed(1):'0.0',onStrike:body.includes(m[1]+'*')});});
          if(sM){await browser.close();console.log(`  ✅ [SRC4 crex] ${mm.team1} vs ${mm.team2} | ${sM[1]}/${sM[2]} (${sM[3]})`);return{team1:{name:mm.team1},team2:{name:mm.team2},score:sM[1],wickets:sM[2],overs:sM[3],team1Score:null,team1Wickets:null,team1Overs:null,target:null,status:wonM?'FINISHED':'LIVE',result:wonM?`${wonM[1].toUpperCase()} won by ${wonM[2]}`:'',toss:tossM?`${tossM[1]} chose to ${tossM[2]}`:null,winProb:50,winProbT1:50,winProbT2:50,recent:['·','·','·','·','·','·'],batsmen,bowlers:[],commentary:[],crr:null,rrr:null,source:'crex.com',lastUpdated:new Date()};}
        }
      }else await cp.close().catch(()=>{});
    }catch(e){console.log('[crex browser]',e.message);}
    // Google fallback
    const gp=await browser.newPage();
    await gp.goto(`https://www.google.com/search?q=${encodeURIComponent(`${mm.team1} vs ${mm.team2} IPL 2026 live score`)}&hl=en`,{waitUntil:'domcontentloaded',timeout:25000});await wait(3000);
    const graw=await gp.evaluate((T,t1,t2)=>{const ws=['.liveticker','.liveresults-sports-immersive__match-tile','.imso_mh__ma-cont','[jsname="ESiMyd"]','.imspo_mt__mtch-cont'];let w=null;for(const s of ws){const el=document.querySelector(s);if(el?.innerText?.length>30){w=el;break;}}const text=w?.innerText?.trim()||'';if(!text||!text.toUpperCase().includes(t1)||!text.toUpperCase().includes(t2))return null;const aS=[...(text.matchAll(/(\d{2,3})\s*[\/\-]\s*(\d{1,2})\s*\(\s*(\d{1,2}\.?\d?)\s*\)/g))];if(!aS.length)return null;const sm=aS[aS.length-1];const up=text.toUpperCase();let st='LIVE',res='';const wM=text.match(new RegExp(`\\b(${T.join('|')})\\b\\s+won\\s+by\\s+([\\d]+\\s+(?:runs?|wickets?))`, 'i'));if(wM){st='FINISHED';res=`${wM[1].toUpperCase()} won by ${wM[2]}`;}else if(up.includes('RAIN'))st='RAIN DELAY';else if(up.includes('INNINGS BREAK'))st='INNINGS BREAK';const cM=text.match(/CRR\s*:?\s*([\d.]+)/i),rM=text.match(/RRR\s*:?\s*([\d.]+)/i),tM=text.match(/[Tt]arget[:\s]*(\d{2,3})/);return{score:sm[1],wickets:sm[2],overs:sm[3]||'0.0',status:st,result:res,crr:cM?parseFloat(cM[1]):null,rrr:rM?parseFloat(rM[1]):null,target:tM?parseInt(tM[1]):null};},TEAMS,mm.team1,mm.team2);
    await gp.close();await browser.close();
    if(!graw)return null;
    let wP1=50,wP2=50;if(graw.rrr&&graw.crr){const r=graw.rrr/graw.crr;wP2=r<0.75?78:r<0.9?66:r<1.0?55:r<1.1?46:r<1.3?37:16;wP1=100-wP2;}
    console.log(`  ✅ [SRC4 Google] ${mm.team1} vs ${mm.team2} | ${graw.score}/${graw.wickets} (${graw.overs}) | ${graw.status}`);
    return{team1:{name:mm.team1},team2:{name:mm.team2},score:graw.score,wickets:graw.wickets,overs:graw.overs,team1Score:null,team1Wickets:null,team1Overs:null,target:graw.target||null,status:graw.status,result:graw.result,toss:null,winProb:wP2,winProbT1:wP1,winProbT2:wP2,recent:['·','·','·','·','·','·'],batsmen:[],bowlers:[],commentary:[],crr:graw.crr,rrr:graw.rrr,source:'google',lastUpdated:new Date()};
  }catch(e){if(browser)await browser.close();console.error('[SRC4 fatal]',e.message);return null;}
};

// ─────────────────────────────────────────────────────────────────────────────
// STANDINGS + STATS
// ─────────────────────────────────────────────────────────────────────────────
export const scrapeIPLStandingsAndStats = async () => {
  console.log('[Standings] Fetching...');
  let pointsTable=null,orangeCap=null,purpleCap=null,topBatsmen=[],topBowlers=[];

  try {
    const data=await fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_ID}/standings`,{},'ESPN standings');
    const entries=data?.children?.[0]?.standings?.entries||data?.standings?.entries||[];
    if(entries.length>=4){const table=entries.map(e=>{const team=toTeam(e.team?.displayName||e.team?.abbreviation||'');if(!TEAMS.includes(team))return null;const stats={};(e.stats||[]).forEach(s=>{stats[s.name||s.abbreviation]=s.value??s.displayValue;});return{team,played:parseInt(stats.gamesPlayed||stats.GP||0),won:parseInt(stats.wins||stats.W||0),lost:parseInt(stats.losses||stats.L||0),pts:parseInt(stats.points||stats.PTS||0),nrr:parseFloat(stats.netRunRate||stats.NRR||0).toFixed(3)};}).filter(Boolean).sort((a,b)=>b.pts-a.pts);if(table.length>=4){pointsTable=table;console.log(`  [Standings] ESPN: ${table.length} teams`);}}
  }catch(e){console.log('[Standings ESPN]',e.message);}

  if(!pointsTable){for(const sid of['9237','9241','9300','9350','9280']){try{const data=await fetchJSON(`https://www.cricbuzz.com/api/cricket-series/${sid}/standings`,{},'CB standings '+sid);const rows=data?.pointsTable?.[0]?.pointsTableInfo||data?.pointsTableInfo||[];if(!Array.isArray(rows)||rows.length<4)continue;const table=rows.map(r=>({team:toTeam(r.teamSName||r.teamName||'')||'',played:parseInt(r.matchesPlayed||0),won:parseInt(r.matchesWon||0),lost:parseInt(r.matchesLost||0),pts:parseInt(r.points||0),nrr:parseFloat(r.nrr||0).toFixed(3)})).filter(t=>TEAMS.includes(t.team)).sort((a,b)=>b.pts-a.pts);if(table.length>=4){pointsTable=table;console.log(`  [Standings] CB sid=${sid}: ${table.length} teams`);break;}}catch(e){/*try next*/}}}

  for(const sid of['9237','9241','9300','9350','9280']){if(topBatsmen.length>0&&topBowlers.length>0)break;try{const[bat,bowl]=await Promise.all([fetchJSON(`https://www.cricbuzz.com/api/cricket-series/${sid}/stats?statsType=mostRuns`,{},'CB mostRuns '+sid),fetchJSON(`https://www.cricbuzz.com/api/cricket-series/${sid}/stats?statsType=mostWickets`,{},'CB mostWickets '+sid)]);const parseP=(d,type)=>{const list=d?.statsDetails?.[0]?.playerStatsList||d?.values?.[0]?.playerStats||d?.statsList||d?.values||[];return(Array.isArray(list)?list:[]).slice(0,10).map(p=>({name:p.playerName||p.name||'',team:(p.teamSName||'').toUpperCase(),runs:type==='bat'?parseInt(p.runs||p.value||0):undefined,wickets:type==='bowl'?parseInt(p.wickets||p.value||0):undefined})).filter(p=>p.name.length>2);};const bats=parseP(bat,'bat').sort((a,b)=>(b.runs||0)-(a.runs||0));const bowls=parseP(bowl,'bowl').sort((a,b)=>(b.wickets||0)-(a.wickets||0));if(bats.length||bowls.length){if(!topBatsmen.length){topBatsmen=bats;orangeCap=bats[0]||null;}if(!topBowlers.length){topBowlers=bowls;purpleCap=bowls[0]||null;}console.log(`  [Stats] sid=${sid}: Orange:${orangeCap?.name} Purple:${purpleCap?.name}`);break;}}catch(e){/*try next*/}}

  return{pointsTable:pointsTable||[],orangeCap,purpleCap,topBatsmen,topBowlers,lastUpdated:new Date(),source:pointsTable?'espn+cricbuzz':'fallback'};
};
export const scrapeIPLStandings = scrapeIPLStandingsAndStats;