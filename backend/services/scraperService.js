/**
 * scraperService.js — ALL 4 BUGS FIXED
 *
 * BUG 1: "7.6 overs" — ESPN sends overs as integer ball count (46 balls = 7.4 ov)
 *   but sometimes sends "7.6" which is invalid cricket notation.
 *   FIX: normalizeOvers() converts ball-count integers AND fixes x.6+ notation.
 *
 * BUG 2: No batsmen/bowler — ESPN batterBoxScores is often empty for cricket.
 *   Real data is in gpkg.innings[].batsmen[] and gpkg.innings[].bowlers[]
 *   FIX: Try batterBoxScores → innings[].batsmen → linescore → competitor.athletes
 *
 * BUG 3: Innings label wrong (CSK showing as "2nd innings" when batting 1st)
 *   Root cause: we assigned team1=bowlingTeam, team2=battingTeam in buildResult.
 *   In the DB/frontend, team1 = team that batted FIRST, team2 = team batting SECOND.
 *   FIX: Determine battingFirstTeam from toss, then assign team1/team2 correctly.
 *
 * BUG 4: Score drops to 0/0 at innings break
 *   Root cause: at innings break ESPN has 2 linescore lines. We were reading
 *   lines[last] which is the new (empty) innings instead of lines[previous].
 *   FIX: At INNINGS BREAK, show lines[0] (completed innings) as current score.
 *
 * WIN PROBABILITY: ESPN's gpkg has a winProbability object with home/away keys.
 *   Also parse from the status detail string if available.
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

// ─── Overs normalizer — FIX FOR BUG 1 ───────────────────────────────────────
// Handles: "46" (balls) → "7.4", "7.6" → "8.0", "20.0" → "20.0"
const normalizeOvers = (raw) => {
  if (!raw && raw !== 0) return '0.0';
  const s = String(raw).trim();
  if (!s || s === 'null' || s === 'undefined') return '0.0';

  // Pure integer with no dot — treat as total balls
  if (/^\d+$/.test(s)) {
    const balls = parseInt(s);
    if (balls > 120) return '20.0'; // sanity cap for T20
    const ov = Math.floor(balls / 6);
    const b  = balls % 6;
    return `${ov}.${b}`;
  }

  // Has a decimal — could be "7.6" (invalid) or "7.4" (valid)
  const parts = s.split('.');
  if (parts.length === 2) {
    let ov = parseInt(parts[0]) || 0;
    let b  = parseInt(parts[1]) || 0;
    // b >= 6 means over is complete — carry over
    while (b >= 6) { ov++; b -= 6; }
    if (ov >= 20) return '20.0';
    return `${ov}.${b}`;
  }
  return '0.0';
};

// ─── HTTP helper ──────────────────────────────────────────────────────────────
const fetchRaw = (url, hdrs = {}, ms = 15000) => new Promise((res, rej) => {
  const lib = url.startsWith('https') ? https : http;
  const req = lib.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      'Accept': 'application/json, */*', 'Accept-Language': 'en-US,en;q=0.9', 'Cache-Control': 'no-cache',
      ...hdrs,
    },
    timeout: ms,
  }, r => {
    if ([301,302,303,307,308].includes(r.statusCode) && r.headers.location)
      return fetchRaw(r.headers.location, hdrs, ms).then(res).catch(rej);
    let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode, body: d }));
  });
  req.on('error', rej);
  req.on('timeout', () => { req.destroy(); rej(new Error('timeout')); });
});

const fetchJSON = async (url, hdrs = {}, label = '') => {
  const tag = label || url.substring(0, 65);
  try {
    const { status, body } = await fetchRaw(url, hdrs);
    if (status !== 200) { console.log(`  [HTTP ${status}] ${tag}`); return null; }
    if (!body || body.length < 5) { console.log(`  [EMPTY] ${tag}`); return null; }
    if (!body.trim().startsWith('{') && !body.trim().startsWith('[')) {
      console.log(`  [NOT-JSON] ${tag} → ${body.substring(0, 50)}`); return null;
    }
    console.log(`  [OK ${status}] ${tag} (${body.length}b)`);
    return JSON.parse(body);
  } catch(e) { console.log(`  [ERR] ${tag} → ${e.message}`); return null; }
};

const toTeam = (s = '') => {
  const u = (s || '').toUpperCase();
  if (TEAMS.includes(u)) return u;
  const map = {
    'SUPER KINGS':'CSK','CHENNAI':'CSK',
    'MUMBAI INDIANS':'MI','MUMBAI':'MI',
    'ROYAL CHALLENGERS':'RCB','CHALLENGERS':'RCB','BANGALORE':'RCB','BENGALURU':'RCB',
    'KNIGHT RIDERS':'KKR','KOLKATA':'KKR',
    'RAJASTHAN ROYALS':'RR','RAJASTHAN':'RR','ROYALS':'RR',
    'PUNJAB KINGS':'PBKS','PUNJAB':'PBKS','KINGS XI':'PBKS',
    'DELHI CAPITALS':'DC','DELHI':'DC','CAPITALS':'DC',
    'GUJARAT TITANS':'GT','GUJARAT':'GT','TITANS':'GT',
    'LUCKNOW SUPER GIANTS':'LSG','LUCKNOW':'LSG','SUPER GIANTS':'LSG',
    'SUNRISERS':'SRH','HYDERABAD':'SRH','SUN RISERS':'SRH',
  };
  for (const [k,v] of Object.entries(map)) if (u.includes(k)) return v;
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// ESPN SOURCE — fully rewritten with all 4 fixes
// ─────────────────────────────────────────────────────────────────────────────
const espnFindMatch = async () => {
  console.log('[ESPN] Finding live IPL match...');

  // Try personalized header
  const hd = await fetchJSON(
    'https://site.api.espn.com/apis/personalized/v2/scoreboard/header?sport=cricket&region=in&tz=Asia/Calcutta',
    {}, 'ESPN header'
  );
  if (hd) {
    for (const sport of (hd.sports || [])) {
      for (const league of (sport.leagues || [])) {
        for (const ev of (league.events || [])) {
          const comps = ev.competitors || [];
          const t1 = toTeam(comps[0]?.displayName || comps[0]?.abbreviation || '');
          const t2 = toTeam(comps[1]?.displayName || comps[1]?.abbreviation || '');
          if (!t1 || !t2 || !TEAMS.includes(t1) || !TEAMS.includes(t2)) continue;
          if ((ev.status || '').toUpperCase() === 'PRE') continue;
          const id = ev.id || String(ev.uid || '').split('~e:')[1];
          console.log(`  [ESPN] Header match: ${t1} vs ${t2} ID:${id}`);
          return { espnId: id, teamA: t1, teamB: t2 };
        }
      }
    }
  }

  // Fallback: scoreboard
  const sb = await fetchJSON(
    `https://site.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_ID}/scoreboard`,
    {}, `ESPN scoreboard`
  );
  for (const ev of (sb?.events || [])) {
    const comp = ev.competitions?.[0];
    const t1 = toTeam(comp?.competitors?.[0]?.team?.displayName || '');
    const t2 = toTeam(comp?.competitors?.[1]?.team?.displayName || '');
    if (!t1 || !t2 || !TEAMS.includes(t1) || !TEAMS.includes(t2)) continue;
    if (ev.status?.type?.name === 'STATUS_SCHEDULED') continue;
    console.log(`  [ESPN] Scoreboard match: ${t1} vs ${t2} ID:${ev.id}`);
    return { espnId: ev.id, teamA: t1, teamB: t2 };
  }
  return null;
};

const espnGetScore = async ({ espnId, teamA, teamB }) => {
  const summary = await fetchJSON(
    `https://site.web.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_ID}/summary?contentorigin=espn&event=${espnId}&lang=en&region=in`,
    {}, `ESPN summary/${espnId}`
  );
  if (!summary) return null;

  // Log full structure to diagnose on Render
  const gpkg = summary.gamepackageJSON || {};
  const gpkgKeys = Object.keys(gpkg);
  console.log(`  [ESPN] gpkg keys: [${gpkgKeys.join(', ')}]`);
  if (gpkg.innings) console.log(`  [ESPN] innings count: ${gpkg.innings.length}`);
  if (gpkg.linescore) console.log(`  [ESPN] linescore keys: [${Object.keys(gpkg.linescore).join(', ')}]`);

  const header = summary.header?.competitions?.[0];
  if (!header) return null;

  // ── STATUS ─────────────────────────────────────────────────────────────────
  const statusType   = header.status?.type || {};
  const statusDetail = (statusType.detail || statusType.shortDetail || '').toUpperCase();
  const statusName   = (statusType.name   || '').toUpperCase();
  let status = 'LIVE', result = '';
  if (statusDetail.includes('RAIN') || statusDetail.includes('HALT')) status = 'RAIN DELAY';
  else if (statusDetail.includes('INNINGS BREAK') || statusDetail.includes('BREAK')) status = 'INNINGS BREAK';
  else if (statusName.includes('FINAL') || statusType.completed === true) status = 'FINISHED';
  if (status === 'FINISHED') {
    result = header.notes?.[0]?.headline || statusDetail || '';
  }

  // ── TOSS — FIX FOR BUG 3 ──────────────────────────────────────────────────
  // We need battingFirstTeam to correctly assign team1/team2 in DB
  let toss = null, battingFirstTeam = null, bowlingFirstTeam = null;
  const tossNote = (header.notes || []).find(n =>
    (n.headline || '').toLowerCase().includes('toss') ||
    (n.headline || '').toLowerCase().includes('chose') ||
    (n.headline || '').toLowerCase().includes('elected')
  );
  if (tossNote) {
    toss = tossNote.headline;
    // "KKR won the toss and elected to bat" or "CSK chose to bowl"
    const batM = toss.match(new RegExp(`(${TEAMS.join('|')}).*?(?:elected|chose|opt).*?to\\s+bat`, 'i'));
    const bowlM = toss.match(new RegExp(`(${TEAMS.join('|')}).*?(?:elected|chose|opt).*?to\\s+(?:bowl|field)`, 'i'));
    if (batM) {
      battingFirstTeam = toTeam(batM[1]) || batM[1].toUpperCase();
      bowlingFirstTeam = battingFirstTeam === teamA ? teamB : teamA;
    } else if (bowlM) {
      bowlingFirstTeam = toTeam(bowlM[1]) || bowlM[1].toUpperCase();
      battingFirstTeam = bowlingFirstTeam === teamA ? teamB : teamA;
    }
  }
  if (toss) console.log(`  [ESPN] Toss: "${toss}" → batFirst:${battingFirstTeam}`);

  // ── COMPETITORS ────────────────────────────────────────────────────────────
  const comp0 = header.competitors?.[0];
  const comp1 = header.competitors?.[1];
  const ct0 = toTeam(comp0?.team?.displayName || comp0?.team?.abbreviation || '') || teamA;
  const ct1 = toTeam(comp1?.team?.displayName || comp1?.team?.abbreviation || '') || teamB;

  // Parse competitor score strings "216/6 (20)" or "216/6"
  const parseScoreStr = (s = '') => {
    const m = String(s).match(/(\d+)[\/\-](\d+)\s*\(?([0-9.]+)?/);
    if (!m) return null;
    return { runs: m[1], wickets: m[2], overs: m[3] ? normalizeOvers(m[3]) : null };
  };

  const c0score = parseScoreStr(comp0?.score || '');
  const c1score = parseScoreStr(comp1?.score || '');
  console.log(`  [ESPN] Comp scores: ${ct0}="${comp0?.score}" | ${ct1}="${comp1?.score}"`);

  // ── INNINGS from gpkg.innings[] — most complete data source ───────────────
  // ESPN innings array: [{ id, team: { displayName }, batting: { runs, wickets, overs, batsmen: [], bowlers: [] } }]
  const inningsArr = gpkg.innings || [];
  console.log(`  [ESPN] innings[]: ${inningsArr.length}`);
  if (inningsArr.length > 0) {
    const inn = inningsArr[0];
    const innKeys = Object.keys(inn);
    console.log(`  [ESPN] innings[0] keys: [${innKeys.join(', ')}]`);
    if (inn.batting) console.log(`  [ESPN] innings[0].batting keys: [${Object.keys(inn.batting).join(', ')}]`);
  }

  // ── LINESCORE parsing ──────────────────────────────────────────────────────
  const linescore = gpkg.linescore || {};
  const lines = linescore.lines || linescore.periods || [];
  console.log(`  [ESPN] linescore.lines: ${lines.length}`);
  if (lines.length > 0) {
    lines.forEach((l, i) => console.log(`  [ESPN] line[${i}]: ${JSON.stringify(l).substring(0, 100)}`));
  }

  // ── DETERMINE CURRENT BATTING TEAM + SCORES ────────────────────────────────
  let currentBattingTeam = null, currentBowlingTeam = null;
  let score = '0', wickets = '0', overs = '0.0';
  let firstInningsTeam = null, firstInningsRuns = null, firstInningsWkts = null, firstInningsOvers = null;
  let target = null;

  if (inningsArr.length >= 2) {
    // Two innings exist — 2nd innings in progress
    const inn1 = inningsArr[0]; // completed first innings
    const inn2 = inningsArr[1]; // current second innings

    const inn1Team = toTeam(inn1.team?.displayName || inn1.team?.abbreviation || '') || ct0;
    const inn2Team = toTeam(inn2.team?.displayName || inn2.team?.abbreviation || '') || ct1;
    firstInningsTeam = inn1Team;
    currentBattingTeam  = inn2Team;
    currentBowlingTeam  = inn1Team;

    // First innings score
    const b1 = inn1.batting || inn1;
    firstInningsRuns  = String(b1.runs ?? b1.score ?? '');
    firstInningsWkts  = String(b1.wickets ?? '');
    firstInningsOvers = normalizeOvers(b1.overs ?? b1.totalOvers ?? '20');

    // Current innings score
    const b2 = inn2.batting || inn2;
    score   = String(b2.runs ?? b2.score ?? '0');
    wickets = String(b2.wickets ?? '0');
    overs   = normalizeOvers(b2.overs ?? b2.totalOvers ?? '0');

    if (firstInningsRuns && firstInningsRuns !== '') {
      target = parseInt(firstInningsRuns) + 1;
    }

    // BUG 4 FIX: At innings break, 2nd innings hasn't started yet
    // Show first innings score as "current" so UI doesn't show 0/0
    if (status === 'INNINGS BREAK' && (score === '0' || !score)) {
      score   = firstInningsRuns || '0';
      wickets = firstInningsWkts || '0';
      overs   = firstInningsOvers || '20.0';
      // Flip: now show the team about to bat as batting team
      currentBattingTeam = inn2Team;
      currentBowlingTeam = inn1Team;
    }

  } else if (inningsArr.length === 1) {
    // First innings in progress
    const inn1 = inningsArr[0];
    const inn1Team = toTeam(inn1.team?.displayName || inn1.team?.abbreviation || '') || ct0;
    currentBattingTeam = inn1Team;
    currentBowlingTeam = currentBattingTeam === ct0 ? ct1 : ct0;
    firstInningsTeam = inn1Team;

    const b1 = inn1.batting || inn1;
    score   = String(b1.runs ?? b1.score ?? '0');
    wickets = String(b1.wickets ?? '0');
    overs   = normalizeOvers(b1.overs ?? b1.totalOvers ?? '0');

  } else if (lines.length >= 2) {
    // Fallback: use linescore lines
    const l1 = lines[0], l2 = lines[lines.length - 1];
    const l1Team = toTeam(l1.displayName || l1.team?.displayName || '') || ct0;
    const l2Team = toTeam(l2.displayName || l2.team?.displayName || '') || ct1;
    firstInningsTeam = l1Team;
    currentBattingTeam = l2Team;
    currentBowlingTeam = l1Team;

    firstInningsRuns  = String(l1.value ?? l1.runs ?? '');
    firstInningsWkts  = String(l1.wickets ?? '');
    firstInningsOvers = normalizeOvers(l1.overs ?? '20');

    score   = String(l2.value ?? l2.runs ?? '0');
    wickets = String(l2.wickets ?? '0');
    overs   = normalizeOvers(l2.overs ?? l2.displayOvers ?? '0');
    if (firstInningsRuns) target = parseInt(firstInningsRuns) + 1;

    // BUG 4 FIX
    if (status === 'INNINGS BREAK' && (score === '0' || !score)) {
      score = firstInningsRuns || '0';
      wickets = firstInningsWkts || '0';
      overs = firstInningsOvers || '20.0';
    }

  } else if (lines.length === 1) {
    const l = lines[0];
    currentBattingTeam = toTeam(l.displayName || l.team?.displayName || '') || ct0;
    currentBowlingTeam = currentBattingTeam === ct0 ? ct1 : ct0;
    score   = String(l.value ?? l.runs ?? '0');
    wickets = String(l.wickets ?? '0');
    overs   = normalizeOvers(l.overs ?? l.displayOvers ?? '0');

  } else if (c0score || c1score) {
    // Absolute fallback: parse competitor score strings
    if (c0score && c1score) {
      // Both have scores — determine who's batting from overs
      const o0 = parseFloat(c0score.overs || '20');
      const o1 = parseFloat(c1score.overs || '20');
      if (o0 < o1 || (!c0score.overs && c1score.overs)) {
        currentBattingTeam = ct0; currentBowlingTeam = ct1;
        score = c0score.runs; wickets = c0score.wickets; overs = c0score.overs || '0.0';
        firstInningsRuns = c1score.runs; firstInningsWkts = c1score.wickets; firstInningsOvers = c1score.overs;
        target = parseInt(c1score.runs) + 1;
      } else {
        currentBattingTeam = ct1; currentBowlingTeam = ct0;
        score = c1score.runs; wickets = c1score.wickets; overs = c1score.overs || '0.0';
        firstInningsRuns = c0score.runs; firstInningsWkts = c0score.wickets; firstInningsOvers = c0score.overs;
        target = parseInt(c0score.runs) + 1;
      }
    } else if (c0score) {
      currentBattingTeam = ct0; currentBowlingTeam = ct1;
      score = c0score.runs; wickets = c0score.wickets; overs = c0score.overs || '0.0';
    } else {
      currentBattingTeam = ct1; currentBowlingTeam = ct0;
      score = c1score.runs; wickets = c1score.wickets; overs = c1score.overs || '0.0';
    }
  }

  // Use toss info to confirm batting team if we couldn't determine it
  if (!currentBattingTeam) {
    currentBattingTeam = battingFirstTeam || ct0;
    currentBowlingTeam = currentBattingTeam === ct0 ? ct1 : ct0;
  }

  // Determine if this is 1st or 2nd innings for correct assignment
  const isSecondInnings = inningsArr.length >= 2 || (firstInningsRuns != null && firstInningsRuns !== '');
  const isBatFirstTeam = isSecondInnings
    ? (currentBowlingTeam || battingFirstTeam || ct0)  // in 2nd innings, bowlingTeam batted 1st
    : (battingFirstTeam || currentBattingTeam);

  // ── BUG 3 FIX: Correct team1/team2 assignment ─────────────────────────────
  // In our DB model:
  //   team1 = team that BATTED FIRST (1st innings)
  //   team1Score/team1Wickets/team1Overs = 1st innings score
  //   team2 = team currently BATTING (or batted 2nd)
  //   score/wickets/overs = current/2nd innings score
  const team1Name = isBatFirstTeam;                                          // batted first
  const team2Name = team1Name === ct0 ? ct1 : ct0;                           // batted second

  // For 1st innings: team1 is batting, so current score IS team1's score
  // For 2nd innings: team1 has completed, team2 is currently batting

  console.log(`  [ESPN] team1(bat1st)=${team1Name} | team2(bat2nd)=${team2Name} | currentBatting=${currentBattingTeam}`);
  console.log(`  [ESPN] score=${score}/${wickets} (${overs}) | 1st inn: ${firstInningsRuns||'N/A'}/${firstInningsWkts} target:${target}`);

  // ── BATSMEN from multiple sources ─────────────────────────────────────────
  const batsmen = [];

  // Source A: innings[currentIdx].batting.batsmen
  const currentInnIdx = isSecondInnings ? 1 : 0;
  const currentInn = inningsArr[currentInnIdx];
  if (currentInn?.batting?.batsmen?.length) {
    currentInn.batting.batsmen
      .filter(b => b.active !== false)
      .slice(0, 3)
      .forEach(b => {
        const name = b.athlete?.displayName || b.player?.displayName || b.name || '';
        if (!name) return;
        batsmen.push({
          name,
          runs:     parseInt(b.runs ?? b.score ?? 0),
          balls:    parseInt(b.balls ?? b.facedBalls ?? 0),
          fours:    parseInt(b.fours ?? b['4s'] ?? 0),
          sixes:    parseInt(b.sixes ?? b['6s'] ?? 0),
          sr:       parseFloat(b.strikeRate ?? b.sr ?? 0).toFixed(1),
          onStrike: b.onStrike === true || b.currentBatsman === true || b.active === true,
        });
      });
    console.log(`  [ESPN] Batsmen from innings[${currentInnIdx}].batting.batsmen: ${batsmen.length}`);
  }

  // Source B: batterBoxScores
  if (batsmen.length === 0) {
    (gpkg.batterBoxScores || [])
      .filter(b => b.active !== false)
      .slice(0, 3)
      .forEach(b => {
        const name = b.athlete?.displayName || '';
        if (!name) return;
        const stats = {};
        (b.stats || []).forEach(s => { stats[s.name] = s.displayValue ?? s.value; });
        batsmen.push({
          name,
          runs:     parseInt(stats.runs || stats.R || 0),
          balls:    parseInt(stats.balls || stats.B || 0),
          fours:    parseInt(stats.fours || stats['4s'] || 0),
          sixes:    parseInt(stats.sixes || stats['6s'] || 0),
          sr:       parseFloat(stats.strikeRate || stats.SR || 0).toFixed(1),
          onStrike: b.active === true,
        });
      });
    if (batsmen.length) console.log(`  [ESPN] Batsmen from batterBoxScores: ${batsmen.length}`);
  }

  // Source C: competitor athletes (sometimes ESPN puts batsmen here)
  if (batsmen.length === 0) {
    const battingComp = currentBattingTeam === ct0 ? comp0 : comp1;
    const athletes = battingComp?.athletes || battingComp?.roster || [];
    athletes.filter(a => a.active || a.batting).slice(0, 3).forEach(a => {
      const name = a.displayName || a.athlete?.displayName || '';
      if (!name) return;
      batsmen.push({
        name,
        runs: parseInt(a.runs ?? a.score ?? 0),
        balls: parseInt(a.balls ?? 0),
        fours: 0, sixes: 0,
        sr: '0.0', onStrike: false,
      });
    });
    if (batsmen.length) console.log(`  [ESPN] Batsmen from competitor.athletes: ${batsmen.length}`);
  }

  // ── BOWLERS ────────────────────────────────────────────────────────────────
  const bowlers = [];

  // Source A: innings[currentIdx].bowling.bowlers
  if (currentInn?.bowling?.bowlers?.length) {
    currentInn.bowling.bowlers.slice(-2).forEach(b => {
      const name = b.athlete?.displayName || b.player?.displayName || b.name || '';
      if (!name) return;
      bowlers.push({
        name,
        overs:   normalizeOvers(b.overs ?? b.totalOvers ?? '0'),
        maidens: parseInt(b.maidens ?? 0),
        runs:    parseInt(b.runs ?? b.conceded ?? 0),
        wickets: parseInt(b.wickets ?? 0),
        economy: parseFloat(b.economy ?? b.er ?? 0).toFixed(1),
      });
    });
    console.log(`  [ESPN] Bowlers from innings[${currentInnIdx}].bowling.bowlers: ${bowlers.length}`);
  }

  // Source B: bowlerBoxScores
  if (bowlers.length === 0) {
    (gpkg.bowlerBoxScores || []).slice(-2).forEach(b => {
      const name = b.athlete?.displayName || '';
      if (!name) return;
      const stats = {};
      (b.stats || []).forEach(s => { stats[s.name] = s.displayValue ?? s.value; });
      bowlers.push({
        name,
        overs:   normalizeOvers(stats.overs || stats.O || '0'),
        maidens: parseInt(stats.maidens || stats.M || 0),
        runs:    parseInt(stats.runs    || stats.R || 0),
        wickets: parseInt(stats.wickets || stats.W || 0),
        economy: parseFloat(stats.economy || stats.ECO || 0).toFixed(1),
      });
    });
    if (bowlers.length) console.log(`  [ESPN] Bowlers from bowlerBoxScores: ${bowlers.length}`);
  }

  // ── RECENT BALLS ───────────────────────────────────────────────────────────
  const plays = gpkg.plays || gpkg.scoringPlays || [];
  const recent = ['·','·','·','·','·','·'];
  plays.slice(-6).forEach((p, i) => {
    const d = (p.text || p.description || '').toLowerCase();
    let b = '·';
    if (d.includes('wicket') || d.includes(' out')) b = 'W';
    else if (d.includes('six')) b = '6';
    else if (d.includes('four') || d.includes('boundary')) b = '4';
    else if (d.includes('wide')) b = 'WD';
    else if (d.includes('no ball')) b = 'NB';
    else { const m = d.match(/\b(\d)\s*run/); b = m ? m[1] : '·'; }
    recent[i] = b;
  });

  // ── COMMENTARY ─────────────────────────────────────────────────────────────
  const commentary = plays.slice(0, 12).map(p => {
    const text = p.text || p.description || '';
    if (!text || text.length < 5) return null;
    const ut = text.toUpperCase();
    return {
      over: String(p.period?.number || ''),
      text: text.substring(0, 200),
      type: ut.includes('WICKET') || ut.includes(' OUT') ? 'wicket'
          : ut.includes('FOUR')   || ut.includes('SIX')  ? 'boundary' : 'normal',
      generated: false,
    };
  }).filter(Boolean);

  // ── CRR/RRR ────────────────────────────────────────────────────────────────
  const crr = parseFloat(gpkg.currentRunRate || gpkg.crr || 0) || null;
  const rrr = parseFloat(gpkg.requiredRunRate || gpkg.rrr || 0) || null;

  // ── WIN PROBABILITY ────────────────────────────────────────────────────────
  let winProbT1 = 50, winProbT2 = 50;
  // ESPN sometimes has winProbability object
  const wp = gpkg.winProbability || gpkg.winProbabilities;
  if (wp) {
    // Could be { homeTeam: 70, awayTeam: 30 } or an array
    const wpArr = Array.isArray(wp) ? wp : null;
    const wpObj = !Array.isArray(wp) ? wp : null;
    if (wpArr?.length > 0) {
      const last = wpArr[wpArr.length - 1];
      const homeWP = parseFloat(last.homeWinPercentage ?? last.home ?? 50);
      winProbT1 = Math.round(currentBattingTeam === ct0 ? 100 - homeWP : homeWP);
      winProbT2 = 100 - winProbT1;
    } else if (wpObj) {
      const homeWP = parseFloat(wpObj.homeTeam ?? wpObj.home ?? wpObj.team1 ?? 50);
      winProbT1 = Math.round(currentBattingTeam === ct0 ? 100 - homeWP : homeWP);
      winProbT2 = 100 - winProbT1;
    }
  }
  // Fallback: CRR/RRR based
  if ((winProbT1 === 50 || winProbT2 === 50) && rrr && crr) {
    const r = rrr / crr;
    winProbT2 = r < 0.75 ? 78 : r < 0.9 ? 66 : r < 1.0 ? 55 : r < 1.1 ? 46 : r < 1.3 ? 37 : r < 1.6 ? 28 : 16;
    winProbT1 = 100 - winProbT2;
  } else if (winProbT1 === 50 && rrr) {
    winProbT2 = rrr < 6 ? 78 : rrr < 8 ? 64 : rrr < 10 ? 50 : rrr < 12 ? 36 : rrr < 15 ? 22 : 12;
    winProbT1 = 100 - winProbT2;
  } else if (winProbT1 === 50 && crr && !target) {
    // 1st innings — estimate from projected score
    const proj = crr * 20;
    winProbT2 = proj > 185 ? 62 : proj > 165 ? 56 : proj > 145 ? 50 : proj > 125 ? 44 : 38;
    winProbT1 = 100 - winProbT2;
  }
  if (status === 'FINISHED') {
    const w = result.toUpperCase();
    if (w.includes(team2Name)) { winProbT2 = 100; winProbT1 = 0; }
    else if (w.includes(team1Name)) { winProbT1 = 100; winProbT2 = 0; }
  }
  if (['ABANDONED', 'POSTPONED'].includes(status)) { winProbT1 = 50; winProbT2 = 50; }

  console.log(`  ✅ [ESPN] ${team1Name}(bat1st) vs ${team2Name}(bat2nd) | ${score}/${wickets} (${overs}) | ${status}`);
  if (batsmen.length) console.log(`     🏏 ${batsmen.map(b=>`${b.name}${b.onStrike?'*':''}: ${b.runs}(${b.balls})`).join(' | ')}`);
  if (bowlers.length) console.log(`     🎯 ${bowlers.map(b=>`${b.name}: ${b.wickets}/${b.runs} (${b.overs})`).join(' | ')}`);

  return {
    // BUG 3 FIX: team1 = batted first, team2 = batted second (currently batting in 2nd inn)
    team1: { name: team1Name },
    team2: { name: team2Name },
    score,
    wickets,
    overs,
    // 1st innings score (what the 2nd innings team needs to chase)
    team1Score:   firstInningsRuns  || null,
    team1Wickets: firstInningsWkts  || null,
    team1Overs:   firstInningsOvers || null,
    target:  target  || null,
    status,  result,  toss,
    winProb:   winProbT2,
    winProbT1, winProbT2,
    recent:    recent.slice(0, 6),
    batsmen:   batsmen.slice(0, 3),
    bowlers:   bowlers.slice(0, 2),
    commentary: commentary.slice(0, 10),
    crr, rrr,
    source: 'espn',
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// CB PROXY — secondary source
// ─────────────────────────────────────────────────────────────────────────────
const cbProxyFetch = async () => {
  console.log('[CB-Proxy] Trying...');
  const list = await fetchJSON('https://cricbuzz-live.vercel.app/v1/matches', {}, 'CB-Proxy matches');
  if (!list?.data?.matches) { console.log('  [CB-Proxy] No response'); return null; }

  let iplMatch = null;
  for (const m of list.data.matches) {
    const title = (m.title || '').toUpperCase();
    const teamsInTitle = TEAMS.filter(t => title.includes(t));
    if (!title.includes('IPL') && !title.includes('PREMIER') && teamsInTitle.length < 2) continue;
    iplMatch = m; break;
  }
  if (!iplMatch) { console.log('  [CB-Proxy] No IPL match'); return null; }

  const matchId = String(iplMatch.id || '');
  if (!matchId) return null;

  const title = (iplMatch.title || '').toUpperCase();
  const teams = TEAMS.filter(t => title.includes(t));
  const scoreData = await fetchJSON(`https://cricbuzz-live.vercel.app/v1/score/${matchId}`, {}, `CB-Proxy score/${matchId}`);
  if (!scoreData?.data) return null;

  const d = scoreData.data;
  console.log(`  [CB-Proxy] liveScore: "${d.liveScore}" update: "${(d.update||'').substring(0,80)}"`);

  const liveStr = d.liveScore || '';
  let teamA = teams[0] || 'TBD', teamB = teams[1] || 'TBD';
  let battingTeam = teamA, score = '0', wickets = '0', overs = '0.0';

  const fullM  = liveStr.match(/\b([A-Z]{2,4})\s+(\d+)[\/\-](\d+)\s*\(?([\d.]+)\)?/);
  const shortM = liveStr.match(/(\d+)[\/\-](\d+)\s*\(?([\d.]+)\)?/);
  if (fullM) {
    const st = toTeam(fullM[1]);
    if (st && TEAMS.includes(st)) battingTeam = st;
    score = fullM[2]; wickets = fullM[3]; overs = normalizeOvers(fullM[4]);
  } else if (shortM) {
    score = shortM[1]; wickets = shortM[2]; overs = normalizeOvers(shortM[3]);
  }
  const bowlingTeam = battingTeam === teamA ? teamB : teamA;

  const update = (d.update || '').toUpperCase();
  let status = 'LIVE', result = '';
  if (update.includes('WON') || update.includes(' WIN')) { status = 'FINISHED'; result = d.update || ''; }
  else if (update.includes('RAIN') || update.includes('HALT') || update.includes('DELAY')) status = 'RAIN DELAY';
  else if (update.includes('BREAK')) status = 'INNINGS BREAK';

  let target = null, team1Score = null;
  const tgtM  = (d.update||'').match(/[Tt]arget[:\s]+(\d+)/i);
  const needsM = (d.update||'').match(/need[s]?\s+(\d+)\s+(?:more\s+)?runs?/i);
  if (tgtM)  { target = parseInt(tgtM[1]);  team1Score = String(target - 1); }
  else if (needsM) { target = parseInt(score) + parseInt(needsM[1]); team1Score = String(target-1); }

  const tossM = (d.update||'').match(/(KKR|MI|CSK|RCB|RR|PBKS|DC|GT|LSG|SRH)\s+(?:opt(?:ed)?|chose)\s+to\s+(bat|bowl)/i);
  const toss  = tossM ? `${tossM[1].toUpperCase()} chose to ${tossM[2].toLowerCase()}` : null;

  const parseBR = s => { const m = String(s||'').match(/(\d+)\s*\((\d+)\)/); return m ? {runs:parseInt(m[1]),balls:parseInt(m[2])} : {runs:parseInt(String(s||'').match(/(\d+)/)?.[1]||0),balls:0}; };
  const batsmen = [];
  if (d.batsmanOne?.length > 1) { const {runs,balls}=parseBR(d.batsmanOneRun); batsmen.push({name:d.batsmanOne,runs,balls,fours:0,sixes:0,sr:parseFloat(d.batsmanOneSR||(balls?((runs/balls)*100).toFixed(1):'0.0')).toFixed(1),onStrike:true}); }
  if (d.batsmanTwo?.length > 1) { const {runs,balls}=parseBR(d.batsmanTwoRun); batsmen.push({name:d.batsmanTwo,runs,balls,fours:0,sixes:0,sr:parseFloat(d.batsmanTwoSR||(balls?((runs/balls)*100).toFixed(1):'0.0')).toFixed(1),onStrike:false}); }

  const bowlers = [];
  if (d.bowlerOne?.length > 1 && d.bowlerOne !== 'BOWLER') bowlers.push({name:d.bowlerOne,overs:normalizeOvers(d.bowlerOneOver),maidens:0,runs:parseInt(d.bowlerOneRun??0),wickets:parseInt(d.bowlerOneWickets??0),economy:String(d.bowlerOneEconomy||'0.0')});
  if (d.bowlerTwo?.length > 1 && d.bowlerTwo !== 'BOWLER' && d.bowlerTwo !== 'O') bowlers.push({name:d.bowlerTwo,overs:normalizeOvers(d.bowlerTwoOver),maidens:0,runs:parseInt(d.bowlerTwoRun??0),wickets:parseInt(d.bowlerTwoWicket??d.bowlerTwoWickets??0),economy:String(d.bowlerTwoEconomy||'0.0')});

  // BUG 3 FIX for CB proxy: determine team1 (batted first) correctly
  // If we have target data, bowlingTeam batted first
  const team1Name = target ? bowlingTeam : battingTeam;  // batted first
  const team2Name = target ? battingTeam : bowlingTeam;  // currently batting

  const crr = parseFloat(d.runRate||0)||null;
  let wP1=50,wP2=50;
  if(crr&&target){const rrr=((target-parseInt(score))/(Math.max((20-parseFloat(overs))*6,1)))*6;const r=rrr/crr;wP2=r<0.75?78:r<0.9?66:r<1.0?55:r<1.1?46:r<1.3?37:r<1.6?28:16;wP1=100-wP2;}
  else if(crr&&!target){const p=crr*20;wP2=p>185?62:p>165?56:p>145?50:p>125?44:38;wP1=100-wP2;}
  if(status==='FINISHED'){const w=result.toUpperCase();if(w.includes(team2Name)){wP2=100;wP1=0;}else{wP1=100;wP2=0;}}

  console.log(`  ✅ [CB-Proxy] ${team1Name}(bat1st) | ${score}/${wickets} (${overs}) | ${status}`);
  if (batsmen.length) console.log(`     🏏 ${batsmen.map(b=>`${b.name}${b.onStrike?'*':''}: ${b.runs}(${b.balls})`).join(' | ')}`);

  return { team1:{name:team1Name}, team2:{name:team2Name}, score, wickets, overs, team1Score:team1Score||null, team1Wickets:null, team1Overs:null, target:target||null, status, result, toss, winProb:wP2, winProbT1:wP1, winProbT2:wP2, recent:['·','·','·','·','·','·'], batsmen, bowlers, commentary:[], crr, rrr:null, source:'cricbuzz-proxy' };
};

// ─────────────────────────────────────────────────────────────────────────────
// CB DIRECT — tertiary source
// ─────────────────────────────────────────────────────────────────────────────
const cbDirectFetch = async () => {
  console.log('[CB-Direct] Trying...');
  const cbH = { 'Referer':'https://www.cricbuzz.com/', 'X-Requested-With':'XMLHttpRequest' };
  const list = await fetchJSON('https://www.cricbuzz.com/api/cricket-match/live-scores', cbH, 'CB live-scores');
  if (!list) { console.log('  [CB-Direct] Blocked/empty'); return null; }

  const allM = [];
  for (const s of (list.matchDetails||[])) allM.push(...(s?.matchDetailsMap?.match||[]));
  for (const t of (list.typeMatches||[])) for (const sm of (t.seriesMatches||[])) allM.push(...(sm?.seriesAdWrapper?.matches||sm?.matches||[]));
  if (list.matches) allM.push(...list.matches);

  let meta = null;
  for (const m of allM) {
    const info = m?.matchInfo||m;
    if (!(info?.seriesName||'').toUpperCase().includes('IPL') && !(info?.seriesName||'').toUpperCase().includes('PREMIER')) continue;
    if ((info?.state||'').toUpperCase()==='PREVIEW') continue;
    const t1=toTeam(info?.team1?.teamSName||info?.team1?.teamName||'');
    const t2=toTeam(info?.team2?.teamSName||info?.team2?.teamName||'');
    const mid=String(info?.matchId||'');
    if(!mid||!t1||!t2)continue;
    meta={matchId:mid,team1:t1,team2:t2,t1Id:info?.team1?.teamId,t2Id:info?.team2?.teamId};break;
  }
  if (!meta) { console.log('  [CB-Direct] No IPL match'); return null; }

  const cbMH={...cbH,'Referer':`https://www.cricbuzz.com/live-cricket-scores/${meta.matchId}/`};
  const [mR,cR,sR]=await Promise.allSettled([
    fetchJSON(`https://www.cricbuzz.com/api/cricket-match/${meta.matchId}/miniscore`,cbMH,'CB miniscore'),
    fetchJSON(`https://www.cricbuzz.com/api/cricket-match/${meta.matchId}/commentary/1`,cbMH,'CB commentary'),
    fetchJSON(`https://www.cricbuzz.com/api/cricket-scorecard/${meta.matchId}`,cbMH,'CB scorecard'),
  ]);
  const mini=mR.status==='fulfilled'?mR.value:null;
  const comm=cR.status==='fulfilled'?cR.value:null;
  const sc  =sR.status==='fulfilled'?sR.value:null;
  if (!mini) { console.log('  [CB-Direct] Miniscore blocked'); return null; }

  const ms=mini?.minScore||mini?.miniscore||mini;
  if(!ms||typeof ms!=='object')return null;
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
  let toss=null,battingFirst=null;
  if(tDec&&tWId){const tosser=tWId===meta.t1Id?meta.team1:meta.team2;battingFirst=tDec==='bat'?tosser:(tosser===meta.team1?meta.team2:meta.team1);toss=`${tosser} chose to ${tDec}`;}

  const btId=ms?.battingTeamId||ms?.batTeam?.teamId;
  let currentBatting=meta.team2,currentBowling=meta.team1;
  if(btId){currentBatting=btId===meta.t1Id?meta.team1:meta.team2;currentBowling=currentBatting===meta.team1?meta.team2:meta.team1;}

  const batScore=ms?.batTeam?.teamScore||{};const bowlScore=ms?.bowlTeam?.teamScore||{};
  let score=String(ms?.score??batScore?.runs??'0');
  let wickets=String(ms?.wickets??batScore?.wickets??'0');
  let overs=normalizeOvers(ms?.overs??batScore?.overs??'0');

  const innL=ms?.matchScoreDetails?.inningsScoreList||[];
  let t1Score=null,t1Wkts=null,t1Ov=null,target=null;
  if(innL.length>=2){const p=innL[0];t1Score=String(p.score??'');t1Wkts=String(p.wickets??'');t1Ov=String(p.overs??'');target=parseInt(p.score??0)+1;}
  else if(bowlScore.runs!=null){t1Score=String(bowlScore.runs??'');t1Wkts=String(bowlScore.wickets??'');t1Ov=String(bowlScore.overs??'');if(t1Score)target=parseInt(t1Score)+1;}
  if(!target&&ms?.target)target=parseInt(ms.target);

  // BUG 3 FIX: determine team1 (batted first) correctly
  const isInn2=innL.length>=2||(t1Score&&t1Score!=='');
  const team1Name = isInn2 ? currentBowling : (battingFirst||currentBatting);
  const team2Name = team1Name===meta.team1 ? meta.team2 : meta.team1;

  const crr=parseFloat(ms?.currentRunRate||0)||null;const rrr=parseFloat(ms?.requiredRunRate||0)||null;
  let batsmen=(ms?.batsman||[]).filter(Boolean).slice(0,3).map(b=>({name:b.batName||b.name||'',runs:parseInt(b.batRuns??0),balls:parseInt(b.batBalls??0),fours:parseInt(b.batFours??0),sixes:parseInt(b.batSixes??0),sr:parseFloat(b.batStrikeRate??0).toFixed(1),onStrike:b.isStriker??false})).filter(b=>b.name);
  let bowlers=(ms?.bowler?(Array.isArray(ms.bowler)?ms.bowler:[ms.bowler]):[]).filter(Boolean).slice(0,2).map(b=>({name:b.bowlName||b.name||'',overs:normalizeOvers(b.bowlOvs??'0'),maidens:parseInt(b.bowlMaidens??0),runs:parseInt(b.bowlRuns??0),wickets:parseInt(b.bowlWkts??0),economy:parseFloat(b.bowlEcon??0).toFixed(1)})).filter(b=>b.name);

  if(batsmen.length===0&&sc?.scoreCard){const cur=sc.scoreCard[sc.scoreCard.length-1];if(cur){const bM=cur.batTeamDetails?.batsmenData||{};Object.values(bM).filter(b=>!b.outDesc||b.outDesc.trim()==='').slice(0,3).forEach(b=>{batsmen.push({name:b.batName||'',runs:parseInt(b.runs??0),balls:parseInt(b.balls??0),fours:parseInt(b.fours??0),sixes:parseInt(b.sixes??0),sr:parseFloat(b.strikeRate??0).toFixed(1),onStrike:b.isStriker??false});});if(!bowlers.length){const bwM=cur.bowlTeamDetails?.bowlersData||{};Object.values(bwM).filter(b=>parseFloat(b.overs||0)>0).slice(-2).forEach(b=>{bowlers.push({name:b.bowlName||'',overs:normalizeOvers(b.overs??'0'),maidens:parseInt(b.maidens??0),runs:parseInt(b.runs??0),wickets:parseInt(b.wickets??0),economy:parseFloat(b.economy??0).toFixed(1)});});}}}

  const recentStr=ms?.recentOvsStats||ms?.lastFewOvers||'';
  let recent=[];
  if(recentStr)recent=recentStr.replace(/\|/g,' ').trim().split(/\s+/).map(b=>{const u=b.toUpperCase();if(!u||u==='.'||u==='·')return'·';if(u==='W')return'W';if(u==='WD')return'WD';if(u.startsWith('NB'))return'NB';if(/^\d+$/.test(u))return u==='0'?'·':u;return'·';}).slice(-6);
  while(recent.length<6)recent.push('·');
  const commentary=[];
  (comm?.commentary?.commentaryList||comm?.commentaryList||[]).slice(0,10).forEach(c=>{const text=c.commText||'';if(!text||text.length<5)return;const ut=text.toUpperCase();commentary.push({over:c.overNumber!=null?`${c.overNumber}.${c.ballNumber??''}`:'',text:text.substring(0,200),type:ut.includes('WICKET')||ut.includes(' OUT')?'wicket':ut.includes('FOUR')||ut.includes('SIX')?'boundary':'normal',generated:false});});

  let wP1=50,wP2=50;
  if(rrr&&crr){const r=rrr/crr;wP2=r<0.75?78:r<0.9?66:r<1.0?55:r<1.1?46:r<1.3?37:r<1.6?28:16;wP1=100-wP2;}
  else if(rrr){wP2=rrr<6?78:rrr<8?64:rrr<10?50:rrr<12?36:rrr<15?22:12;wP1=100-wP2;}
  if(status==='FINISHED'){const w=result.toUpperCase();if(w.includes(team2Name)){wP2=100;wP1=0;}else{wP1=100;wP2=0;}}

  console.log(`  ✅ [CB-Direct] ${team1Name}(bat1st) | ${score}/${wickets} (${overs}) | ${status}`);
  return {team1:{name:team1Name},team2:{name:team2Name},score,wickets,overs,team1Score:t1Score||null,team1Wickets:t1Wkts||null,team1Overs:t1Ov||null,target:target||null,status,result,toss,winProb:wP2,winProbT1:wP1,winProbT2:wP2,recent:recent.slice(0,6),batsmen:batsmen.slice(0,3),bowlers:bowlers.slice(0,2),commentary:commentary.slice(0,10),crr,rrr,source:'cricbuzz-api'};
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export const scrapeLiveMatch = async () => {
  console.log('━━━ [Scraper] Starting ━━━');

  try {
    const meta = await espnFindMatch();
    if (meta) {
      const r = await espnGetScore(meta);
      if (r && !(r.score === '0' && r.status === 'LIVE' && !r.team1Score)) {
        console.log('━━━ Done via ESPN ━━━');
        return { ...r, lastUpdated: new Date() };
      }
      if (r?.score === '0') console.log('  [ESPN] Score 0, trying CB...');
    }
  } catch(e) { console.log('[ESPN fatal]', e.message); }

  try {
    const r = await cbProxyFetch();
    if (r) { console.log('━━━ Done via CB-Proxy ━━━'); return { ...r, lastUpdated: new Date() }; }
  } catch(e) { console.log('[CB-Proxy fatal]', e.message); }

  try {
    const r = await cbDirectFetch();
    if (r) { console.log('━━━ Done via CB-Direct ━━━'); return { ...r, lastUpdated: new Date() }; }
  } catch(e) { console.log('[CB-Direct fatal]', e.message); }

  if (!CHROME_AVAILABLE) { console.log('━━━ All failed, no Chrome ━━━'); return null; }
  return await browserFallback();
};

// ─── Browser fallback (local dev) ────────────────────────────────────────────
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
    const gp=await browser.newPage();
    await gp.goto(`https://www.google.com/search?q=${encodeURIComponent(`${mm.team1} vs ${mm.team2} IPL 2026 live score`)}&hl=en`,{waitUntil:'domcontentloaded',timeout:25000});
    await wait(3000);
    const graw=await gp.evaluate((T,t1,t2)=>{
      const ws=['.liveticker','.liveresults-sports-immersive__match-tile','.imso_mh__ma-cont','[jsname="ESiMyd"]'];let w=null;for(const s of ws){const el=document.querySelector(s);if(el?.innerText?.length>30){w=el;break;}}
      const text=w?.innerText?.trim()||'';if(!text||!text.toUpperCase().includes(t1)||!text.toUpperCase().includes(t2))return null;
      const aS=[...text.matchAll(/(\d{2,3})\s*[\/\-]\s*(\d{1,2})\s*\(\s*(\d{1,2}\.?\d?)\s*\)/g)];if(!aS.length)return null;
      const sm=aS[aS.length-1];const up=text.toUpperCase();let st='LIVE',res='';
      const wM=text.match(new RegExp(`\\b(${T.join('|')})\\b\\s+won\\s+by\\s+([\\d]+\\s+(?:runs?|wickets?))`, 'i'));
      if(wM){st='FINISHED';res=`${wM[1].toUpperCase()} won by ${wM[2]}`;}else if(up.includes('RAIN'))st='RAIN DELAY';else if(up.includes('INNINGS BREAK'))st='INNINGS BREAK';
      const cM=text.match(/CRR\s*:?\s*([\d.]+)/i),rM=text.match(/RRR\s*:?\s*([\d.]+)/i),tM=text.match(/[Tt]arget[:\s]*(\d{2,3})/);
      return{score:sm[1],wickets:sm[2],overs:sm[3]||'0.0',status:st,result:res,crr:cM?parseFloat(cM[1]):null,rrr:rM?parseFloat(rM[1]):null,target:tM?parseInt(tM[1]):null};
    },TEAMS,mm.team1,mm.team2);
    await gp.close();await browser.close();
    if(!graw)return null;
    let wP1=50,wP2=50;if(graw.rrr&&graw.crr){const r=graw.rrr/graw.crr;wP2=r<0.75?78:r<0.9?66:r<1.0?55:r<1.1?46:r<1.3?37:16;wP1=100-wP2;}
    // For Google, we don't know who batted first from the snippet alone
    // Use target presence to guess
    const team1n = graw.target ? mm.team2 : mm.team1; // rough heuristic
    const team2n = graw.target ? mm.team1 : mm.team2;
    console.log(`  ✅ [Google] ${mm.team1} vs ${mm.team2} | ${graw.score}/${graw.wickets} (${normalizeOvers(graw.overs)})`);
    return{team1:{name:team1n},team2:{name:team2n},score:graw.score,wickets:graw.wickets,overs:normalizeOvers(graw.overs),team1Score:null,team1Wickets:null,team1Overs:null,target:graw.target||null,status:graw.status,result:graw.result,toss:null,winProb:wP2,winProbT1:wP1,winProbT2:wP2,recent:['·','·','·','·','·','·'],batsmen:[],bowlers:[],commentary:[],crr:graw.crr,rrr:graw.rrr,source:'google',lastUpdated:new Date()};
  }catch(e){if(browser)await browser.close();console.error('[Browser fatal]',e.message);return null;}
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

  if(!pointsTable){for(const sid of['9237','9241','9300','9350','9280']){try{const data=await fetchJSON(`https://www.cricbuzz.com/api/cricket-series/${sid}/standings`,{},'CB standings '+sid);const rows=data?.pointsTable?.[0]?.pointsTableInfo||data?.pointsTableInfo||[];if(!Array.isArray(rows)||rows.length<4)continue;const table=rows.map(r=>({team:toTeam(r.teamSName||r.teamName||'')||'',played:parseInt(r.matchesPlayed||0),won:parseInt(r.matchesWon||0),lost:parseInt(r.matchesLost||0),pts:parseInt(r.points||0),nrr:parseFloat(r.nrr||0).toFixed(3)})).filter(t=>TEAMS.includes(t.team)).sort((a,b)=>b.pts-a.pts);if(table.length>=4){pointsTable=table;console.log(`  [Standings] CB sid=${sid}: ${table.length} teams`);break;}}catch(e){/*next*/}}}

  for(const sid of['9237','9241','9300','9350','9280']){if(topBatsmen.length>0&&topBowlers.length>0)break;try{const[bat,bowl]=await Promise.all([fetchJSON(`https://www.cricbuzz.com/api/cricket-series/${sid}/stats?statsType=mostRuns`,{},'CB runs '+sid),fetchJSON(`https://www.cricbuzz.com/api/cricket-series/${sid}/stats?statsType=mostWickets`,{},'CB wickets '+sid)]);const parseP=(d,type)=>{const list=d?.statsDetails?.[0]?.playerStatsList||d?.values?.[0]?.playerStats||d?.statsList||d?.values||[];return(Array.isArray(list)?list:[]).slice(0,10).map(p=>({name:p.playerName||p.name||'',team:(p.teamSName||'').toUpperCase(),runs:type==='bat'?parseInt(p.runs||p.value||0):undefined,wickets:type==='bowl'?parseInt(p.wickets||p.value||0):undefined})).filter(p=>p.name.length>2);};const bats=parseP(bat,'bat').sort((a,b)=>(b.runs||0)-(a.runs||0));const bowls=parseP(bowl,'bowl').sort((a,b)=>(b.wickets||0)-(a.wickets||0));if(bats.length||bowls.length){if(!topBatsmen.length){topBatsmen=bats;orangeCap=bats[0]||null;}if(!topBowlers.length){topBowlers=bowls;purpleCap=bowls[0]||null;}console.log(`  [Stats] sid=${sid}: Orange:${orangeCap?.name} Purple:${purpleCap?.name}`);break;}}catch(e){/*next*/}}

  return{pointsTable:pointsTable||[],orangeCap,purpleCap,topBatsmen,topBowlers,lastUpdated:new Date(),source:pointsTable?'espn+cricbuzz':'fallback'};
};
export const scrapeIPLStandings = scrapeIPLStandingsAndStats;