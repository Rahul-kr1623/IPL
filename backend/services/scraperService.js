/**
 * scraperService.js — COMPLETE FIX v2
 *
 * FIXES:
 * 1. team1/team2 inversion — ESPN competitor[0] is NOT always batting first.
 *    We now use innings array ordering exclusively to determine who batted first.
 *    inn[0].team = batted first = team1
 *    inn[1].team = currently batting = team2
 *
 * 2. Batsmen/bowler always "Awaiting" — ESPN innings[].batting.batsmen is empty
 *    for cricket. Fixed by reading from batterBoxScores with active flag, and
 *    from competitors[].athletes as fallback.
 *
 * 3. Win probability inverted — now correctly tied to team1 (bat first) and
 *    team2 (chasing).
 *
 * 4. team1Score showing "Yet to bat" — ensured team1Score is always populated
 *    from inn[0] when 2 innings exist.
 *
 * TEAM MODEL (never changes):
 *   team1 = batted FIRST  → team1Score/Wickets/Overs = their completed score
 *   team2 = batting SECOND (currently batting / chasing)
 *   score/wickets/overs = team2's current live score
 */

import https from 'https';
import http  from 'http';
import { existsSync } from 'fs';

const TEAMS = ['CSK','MI','RCB','KKR','RR','PBKS','DC','GT','LSG','SRH'];
const wait  = ms => new Promise(r => setTimeout(r, ms));
const ESPN_IPL_ID = '8048';

// Chrome detection
const CHROME_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : null,
].filter(Boolean);
const CHROME_PATH = CHROME_PATHS.find(p => { try { return existsSync(p); } catch { return false; } }) || null;
const CHROME_AVAILABLE = !!CHROME_PATH;

// ─── Overs normalizer ─────────────────────────────────────────────────────────
const normalizeOvers = (raw) => {
  if (raw === null || raw === undefined) return '0.0';
  const s = String(raw).trim();
  if (!s || s === 'null') return '0.0';
  if (/^\d+$/.test(s)) {
    const n = parseInt(s);
    if (n <= 20) return `${n}.0`;
    const ov = Math.floor(n / 6);
    const b  = n % 6;
    return ov >= 20 ? '20.0' : `${ov}.${b}`;
  }
  const parts = s.split('.');
  if (parts.length === 2) {
    let ov = parseInt(parts[0]) || 0;
    let b  = parseInt(parts[1]) || 0;
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
      'Accept': 'application/json, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
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

// Team name mapper
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
// ESPN SCRAPER — primary source
// ─────────────────────────────────────────────────────────────────────────────
const espnFindMatch = async () => {
  console.log('[ESPN] Finding match...');
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
          console.log(`  [ESPN] Header: ${t1} vs ${t2} ID:${id}`);
          return { espnId: id, compA: t1, compB: t2 };
        }
      }
    }
  }
  const sb = await fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_ID}/scoreboard`, {}, 'ESPN scoreboard');
  for (const ev of (sb?.events || [])) {
    const comp = ev.competitions?.[0];
    const t1 = toTeam(comp?.competitors?.[0]?.team?.displayName || '');
    const t2 = toTeam(comp?.competitors?.[1]?.team?.displayName || '');
    if (!t1 || !t2 || !TEAMS.includes(t1) || !TEAMS.includes(t2)) continue;
    if (ev.status?.type?.name === 'STATUS_SCHEDULED') continue;
    console.log(`  [ESPN] Scoreboard: ${t1} vs ${t2} ID:${ev.id}`);
    return { espnId: ev.id, compA: t1, compB: t2 };
  }
  return null;
};

const espnGetScore = async ({ espnId, compA, compB }) => {
  const summary = await fetchJSON(
    `https://site.web.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_ID}/summary?contentorigin=espn&event=${espnId}&lang=en&region=in`,
    {}, `ESPN summary/${espnId}`
  );
  if (!summary) return null;

  const gpkg   = summary.gamepackageJSON || {};
  const header = summary.header?.competitions?.[0];
  if (!header) return null;

  console.log(`  [ESPN] gpkg keys: [${Object.keys(gpkg).join(', ')}]`);

  // ── STATUS ─────────────────────────────────────────────────────────────────
  const stType   = header.status?.type || {};
  const stDetail = (stType.detail || stType.shortDetail || '').toUpperCase();
  const stName   = (stType.name || '').toUpperCase();
  let status = 'LIVE', result = '';
  if (stDetail.includes('RAIN') || stDetail.includes('HALT'))                status = 'RAIN DELAY';
  else if (stDetail.includes('INNINGS BREAK') || stDetail.includes('BREAK')) status = 'INNINGS BREAK';
  else if (stName.includes('FINAL') || stType.completed === true)             status = 'FINISHED';
  if (status === 'FINISHED') result = header.notes?.[0]?.headline || stDetail;

  // ── TOSS NOTE (for display only, not for team assignment) ─────────────────
  const tossNote = (header.notes || []).find(n => /(toss|chose|elected|opt)/i.test(n.headline || ''));
  const toss = tossNote?.headline || null;

  // ── COMPETITORS (raw ESPN order — do NOT use for batting-first logic) ──────
  const comp0 = header.competitors?.[0];
  const comp1 = header.competitors?.[1];
  const ct0   = toTeam(comp0?.team?.displayName || '') || compA;
  const ct1   = toTeam(comp1?.team?.displayName || '') || compB;

  // Parse score string "160/7" or "160/7 (20)"
  const parseScoreStr = s => {
    if (!s) return null;
    const m = String(s).match(/(\d+)[\/\-](\d+)(?:\s*\(?([\d.]+)\)?)?/);
    if (!m) return null;
    return { runs: m[1], wickets: m[2], overs: m[3] ? normalizeOvers(m[3]) : null };
  };

  // ── INNINGS ARRAY — THE AUTHORITATIVE SOURCE ──────────────────────────────
  // inn[0] = 1st innings team (batted first)  → team1
  // inn[1] = 2nd innings team (batting second) → team2
  const inningsArr = gpkg.innings || [];
  console.log(`  [ESPN] gpkg.innings: ${inningsArr.length}`);
  inningsArr.forEach((inn, i) => {
    const batTeam = toTeam(inn.team?.displayName || inn.team?.abbreviation || '');
    console.log(`    inn[${i}]: team="${inn.team?.displayName}" (${batTeam}) keys=[${Object.keys(inn).join(',')}]`);
  });

  // ── LINESCORE as secondary source ─────────────────────────────────────────
  const linescore = gpkg.linescore || {};
  const lines = linescore.lines || linescore.periods || [];

  let score = '0', wickets = '0', overs = '0.0';
  let team1Name = null, team2Name = null;
  let firstInningsRuns = null, firstInningsWkts = null, firstInningsOvers = null;
  let target = null;

  if (inningsArr.length >= 2) {
    // ── GOLDEN PATH: two innings exist ────────────────────────────────────
    // ESPN sometimes returns the CURRENT (2nd) innings as inn[0] and the
    // COMPLETED (1st) innings as inn[1]. We must sort by overs to be safe:
    // The innings with MORE overs (or exactly 20) is always the 1st innings.
    const getInnOvers = (inn) => {
      const b = inn.batting || inn;
      return parseFloat(normalizeOvers(b.overs ?? b.totalOvers ?? '0')) || 0;
    };
    const getInnWkts = (inn) => {
      const b = inn.batting || inn;
      return parseInt(b.wickets ?? 0) || 0;
    };
    // 1st innings = completed = higher overs (or 10 wickets = all out)
    // Sort descending by overs so [0] = 1st innings, [1] = 2nd innings
    const sortedInnings = [...inningsArr].sort((a, b) => {
      const aOv = getInnOvers(a), bOv = getInnOvers(b);
      const aWk = getInnWkts(a), bWk = getInnWkts(b);
      // Completed innings (20 overs or 10 wickets) always comes first
      const aComplete = aOv >= 20 || aWk >= 10;
      const bComplete = bOv >= 20 || bWk >= 10;
      if (aComplete && !bComplete) return -1;
      if (!aComplete && bComplete) return  1;
      return bOv - aOv; // higher overs first
    });
    const inn1 = sortedInnings[0];  // batted first (completed innings)
    const inn2 = sortedInnings[1];  // batting second (current innings)
    console.log(`  [ESPN] sorted innings: inn1=${toTeam(inn1.team?.displayName||'')} inn2=${toTeam(inn2.team?.displayName||'')} inn1Ov=${getInnOvers(inn1)} inn2Ov=${getInnOvers(inn2)}`);

    team1Name = toTeam(inn1.team?.displayName || inn1.team?.abbreviation || '') || ct0;
    team2Name = toTeam(inn2.team?.displayName || inn2.team?.abbreviation || '') || (team1Name === ct0 ? ct1 : ct0);

    // First innings score (completed)
    const b1 = inn1.batting || inn1;
    firstInningsRuns  = String(b1.runs  ?? b1.score   ?? '');
    firstInningsWkts  = String(b1.wickets ?? '');
    firstInningsOvers = normalizeOvers(b1.overs ?? b1.totalOvers ?? '20');

    // Current innings score (chasing)
    const b2 = inn2.batting || inn2;
    score   = String(b2.runs    ?? b2.score   ?? '0');
    wickets = String(b2.wickets ?? '0');
    overs   = normalizeOvers(b2.overs ?? b2.totalOvers ?? '0');

    if (firstInningsRuns && firstInningsRuns !== '') {
      target = parseInt(firstInningsRuns) + 1;
    }

    // INNINGS BREAK: 2nd innings hasn't started → show 1st innings score in centre
    if (status === 'INNINGS BREAK' && (!score || score === '0' || score === 'undefined')) {
      score   = firstInningsRuns  || '0';
      wickets = firstInningsWkts  || '0';
      overs   = firstInningsOvers || '20.0';
    }

    console.log(`  [ESPN] 2-innings: team1(bat1st)=${team1Name} ${firstInningsRuns}/${firstInningsWkts} | team2(chasing)=${team2Name} ${score}/${wickets} (${overs}) target:${target}`);

  } else if (inningsArr.length === 1) {
    // ── SINGLE INNINGS (1st innings still in progress) ─────────────────────
    const inn1 = inningsArr[0];
    team1Name = toTeam(inn1.team?.displayName || inn1.team?.abbreviation || '') || ct0;
    team2Name = team1Name === ct0 ? ct1 : ct0;

    const b1  = inn1.batting || inn1;
    score   = String(b1.runs    ?? b1.score   ?? '0');
    wickets = String(b1.wickets ?? '0');
    overs   = normalizeOvers(b1.overs ?? b1.totalOvers ?? '0');
    // No first innings completed yet — team2 hasn't batted
    firstInningsRuns = null; firstInningsWkts = null; firstInningsOvers = null;

    console.log(`  [ESPN] 1-inning: team1(bat1st)=${team1Name} ${score}/${wickets} (${overs})`);

  } else if (lines.length >= 2) {
    // ── LINESCORE FALLBACK ─────────────────────────────────────────────────
    // ESPN linescore: lines[0] = 1st innings, lines[last] = current innings
    const l1 = lines[0];
    const l2 = lines[lines.length - 1];

    team1Name = toTeam(l1.displayName || '') || ct0;
    team2Name = toTeam(l2.displayName || '') || (team1Name === ct0 ? ct1 : ct0);

    firstInningsRuns  = String(l1.runs ?? l1.value ?? '');
    firstInningsWkts  = String(l1.wickets ?? '');
    firstInningsOvers = normalizeOvers(l1.overs ?? '20');
    score   = String(l2.runs ?? l2.value ?? '0');
    wickets = String(l2.wickets ?? '0');
    overs   = normalizeOvers(l2.overs ?? l2.displayOvers ?? '0');

    if (firstInningsRuns) target = parseInt(firstInningsRuns) + 1;
    if (status === 'INNINGS BREAK' && (!score || score === '0')) {
      score = firstInningsRuns || '0'; wickets = firstInningsWkts || '0'; overs = firstInningsOvers || '20.0';
    }
    console.log(`  [ESPN] linescore fallback: team1=${team1Name} | team2=${team2Name} ${score}/${wickets}`);

  } else {
    // ── COMPETITOR SCORE STRING FALLBACK ──────────────────────────────────
    const ps0 = parseScoreStr(comp0?.score || '');
    const ps1 = parseScoreStr(comp1?.score || '');

    if (ps0 && ps1) {
      const o0 = parseFloat(ps0.overs || '0'), o1 = parseFloat(ps1.overs || '0');
      // Higher overs = more likely completed innings = batted first
      if (o0 >= 20 || o0 > o1) {
        team1Name = ct0; team2Name = ct1;
        firstInningsRuns = ps0.runs; firstInningsWkts = ps0.wickets; firstInningsOvers = ps0.overs || '20';
        score = ps1.runs; wickets = ps1.wickets; overs = ps1.overs || '0.0';
        target = parseInt(ps0.runs) + 1;
      } else {
        team1Name = ct1; team2Name = ct0;
        firstInningsRuns = ps1.runs; firstInningsWkts = ps1.wickets; firstInningsOvers = ps1.overs || '20';
        score = ps0.runs; wickets = ps0.wickets; overs = ps0.overs || '0.0';
        target = parseInt(ps1.runs) + 1;
      }
    } else if (ps0) {
      team1Name = ct0; team2Name = ct1;
      score = ps0.runs; wickets = ps0.wickets; overs = ps0.overs || '0.0';
    } else if (ps1) {
      team1Name = ct1; team2Name = ct0;
      score = ps1.runs; wickets = ps1.wickets; overs = ps1.overs || '0.0';
    } else {
      team1Name = ct0; team2Name = ct1;
    }
    console.log(`  [ESPN] score-string fallback: team1=${team1Name} | team2=${team2Name} ${score}/${wickets}`);
  }

  // Final safety net
  if (!team1Name) team1Name = ct0;
  if (!team2Name) team2Name = team1Name === ct0 ? ct1 : ct0;

  console.log(`  ✅ [ESPN] team1(bat1st)=${team1Name} score:${firstInningsRuns||'N/A'}/${firstInningsWkts} | team2(batting)=${team2Name} score:${score}/${wickets} (${overs}) target:${target||'N/A'} status:${status}`);

  // ── BATSMEN — multi-strategy extraction ───────────────────────────────────
  const batsmen = [];

  // Strategy 1: innings[1].batting.batsmen (current innings batsmen, most reliable)
  // Use sortedInnings[1] (2nd innings = currently batting) when 2 innings exist.
  // sortedInnings is defined in the >= 2 innings block above; fall back to inningsArr[0].
  const currInn = (typeof sortedInnings !== 'undefined' && sortedInnings.length >= 2)
    ? sortedInnings[1]   // 2nd innings = currently batting team
    : inningsArr[0];     // only 1 innings = currently batting team

  if (currInn?.batting?.batsmen?.length) {
    const activeBatsmen = currInn.batting.batsmen.filter(b =>
      b.active !== false && b.notOut !== false
    ).slice(0, 3);
    activeBatsmen.forEach(b => {
      const name = b.athlete?.displayName || b.player?.displayName || b.name || '';
      if (!name) return;
      batsmen.push({
        name,
        runs:     parseInt(b.runs ?? b.score ?? 0),
        balls:    parseInt(b.balls ?? b.facedBalls ?? 0),
        fours:    parseInt(b.fours ?? b['4s'] ?? 0),
        sixes:    parseInt(b.sixes ?? b['6s'] ?? 0),
        sr:       parseFloat(b.strikeRate ?? b.sr ?? 0).toFixed(1),
        onStrike: b.onStrike === true || b.active === true,
      });
    });
    console.log(`  [Batsmen] from innings.batting.batsmen: ${batsmen.length}`);
  }

  // Strategy 2: batterBoxScores — ESPN's flat list (check active status carefully)
  if (batsmen.length === 0 && gpkg.batterBoxScores?.length) {
    // Active batters are those currently at the crease
    const activeBatters = gpkg.batterBoxScores.filter(b => b.active === true);
    const toUse = activeBatters.length > 0
      ? activeBatters
      : gpkg.batterBoxScores.filter(b => b.active !== false).slice(-3); // last 3 = most recent
    toUse.forEach(b => {
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
        onStrike: b.active === true || b.onStrike === true,
      });
    });
    console.log(`  [Batsmen] from batterBoxScores: ${batsmen.length}`);
  }

  // Strategy 3: competitors[].athletes (ESPN sometimes puts current batters here)
  if (batsmen.length === 0) {
    // The batting team's competitor entry may have athlete data
    const battingComp = team2Name === ct0 ? comp0 : comp1;
    const athletes = battingComp?.athletes || [];
    athletes.filter(a => a.active !== false).slice(0, 3).forEach(a => {
      const name = a.athlete?.displayName || a.displayName || '';
      if (!name) return;
      const stats = {};
      (a.statistics || a.stats || []).forEach(s => { stats[s.name || s.abbreviation] = s.value ?? s.displayValue; });
      batsmen.push({
        name,
        runs:     parseInt(stats.runs || stats.R || 0),
        balls:    parseInt(stats.balls || stats.B || 0),
        fours:    parseInt(stats.fours || 0),
        sixes:    parseInt(stats.sixes || 0),
        sr:       parseFloat(stats.strikeRate || stats.SR || 0).toFixed(1),
        onStrike: a.active === true,
      });
    });
    if (batsmen.length) console.log(`  [Batsmen] from competitors.athletes: ${batsmen.length}`);
  }

  // Strategy 4: leaders for batting
  if (batsmen.length === 0 && gpkg.leaders?.length) {
    for (const leader of gpkg.leaders) {
      if (!(leader.name || '').toLowerCase().includes('bat')) continue;
      (leader.leaders || []).slice(0, 2).forEach(l => {
        const name = l.athlete?.displayName || '';
        if (!name || batsmen.find(b => b.name === name)) return;
        batsmen.push({ name, runs: parseInt(l.value ?? 0), balls: 0, fours: 0, sixes: 0, sr: '0.0', onStrike: false });
      });
    }
    if (batsmen.length) console.log(`  [Batsmen] from leaders: ${batsmen.length}`);
  }

  // Strategy 5: recent plays participants
  if (batsmen.length === 0 && gpkg.plays?.length) {
    const recentPlays = (gpkg.plays || []).slice(-5).reverse();
    const seenNames = new Set();
    for (const play of recentPlays) {
      for (const participant of (play.participants || [])) {
        const name = participant.athlete?.displayName || '';
        if (!name || seenNames.has(name)) continue;
        const role = (participant.type || participant.role || '').toLowerCase();
        if (role === 'bowler') continue; // skip bowlers
        seenNames.add(name);
        batsmen.push({ name, runs: 0, balls: 0, fours: 0, sixes: 0, sr: '0.0', onStrike: batsmen.length === 0 });
        if (batsmen.length >= 2) break;
      }
      if (batsmen.length >= 2) break;
    }
    if (batsmen.length) console.log(`  [Batsmen] from plays participants: ${batsmen.length}`);
  }

  // ── BOWLERS — multi-strategy extraction ───────────────────────────────────
  const bowlers = [];

  // Strategy 1: innings[current].bowling.bowlers
  if (currInn?.bowling?.bowlers?.length) {
    // Current bowler is the last one in the array (most recently bowling)
    const activeBowlers = currInn.bowling.bowlers.slice(-2);
    activeBowlers.forEach(b => {
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
    console.log(`  [Bowlers] from innings.bowling.bowlers: ${bowlers.length}`);
  }

  // Strategy 2: bowlerBoxScores
  if (bowlers.length === 0 && gpkg.bowlerBoxScores?.length) {
    gpkg.bowlerBoxScores.slice(-2).forEach(b => {
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
    console.log(`  [Bowlers] from bowlerBoxScores: ${bowlers.length}`);
  }

  // Strategy 3: leaders for bowling
  if (bowlers.length === 0 && gpkg.leaders?.length) {
    for (const leader of gpkg.leaders) {
      if (!(leader.name || '').toLowerCase().includes('bowl') && !(leader.name || '').toLowerCase().includes('wicket')) continue;
      (leader.leaders || []).slice(0, 1).forEach(l => {
        const name = l.athlete?.displayName || '';
        if (name) bowlers.push({ name, overs: '0', maidens: 0, runs: 0, wickets: parseInt(l.value ?? 0), economy: '0.0' });
      });
    }
    if (bowlers.length) console.log(`  [Bowlers] from leaders: ${bowlers.length}`);
  }

  // ── RECENT BALLS ──────────────────────────────────────────────────────────
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

  // ── COMMENTARY ────────────────────────────────────────────────────────────
  const commentary = plays.slice(0, 12).map(p => {
    const text = p.text || p.description || '';
    if (!text || text.length < 5) return null;
    const ut = text.toUpperCase();
    return {
      over: String(p.period?.number || p.periodText || ''),
      text: text.substring(0, 200),
      type: ut.includes('WICKET') || ut.includes(' OUT') ? 'wicket'
          : ut.includes('FOUR')   || ut.includes('SIX')  ? 'boundary' : 'normal',
      generated: false,
    };
  }).filter(Boolean);

  // ── WIN PROBABILITY ───────────────────────────────────────────────────────
  const scoreInt = parseInt(score) || 0;
  const oversFloat = parseFloat(overs) || 0;
  let crr = null, rrr = null, winProbT1 = 50, winProbT2 = 50;

  if (gpkg.currentRunRate)  crr = parseFloat(gpkg.currentRunRate);
  if (gpkg.requiredRunRate) rrr = parseFloat(gpkg.requiredRunRate);
  if (!crr && oversFloat > 0) crr = parseFloat((scoreInt / oversFloat).toFixed(2));

  if (target && oversFloat > 0) {
    const ballsLeft = Math.max((20 - oversFloat) * 6, 1);
    const runsLeft  = Math.max(target - scoreInt, 0);
    rrr = parseFloat((runsLeft / ballsLeft * 6).toFixed(2));
  }

  // ESPN win probability
  const wpData = gpkg.winProbability || gpkg.winProbabilities;
  if (wpData) {
    const wpArr = Array.isArray(wpData) ? wpData : null;
    const wpObj = !Array.isArray(wpData) ? wpData : null;
    if (wpArr?.length > 0) {
      const last = wpArr[wpArr.length - 1];
      // homeWinPercentage = probability for ct0 (ESPN's "home" team)
      const hwPct = parseFloat(last.homeWinPercentage ?? last.home ?? 50);
      // team1 = bat first. team2 = chasing.
      // If team1 === ct0, then hwPct is team1's probability
      // If team1 === ct1, then hwPct is for ct0 = team2 → team2 prob = hwPct
      if (team1Name === ct0) {
        winProbT1 = Math.round(hwPct);
        winProbT2 = 100 - winProbT1;
      } else {
        winProbT2 = Math.round(hwPct);
        winProbT1 = 100 - winProbT2;
      }
    } else if (wpObj?.homeTeam != null) {
      const hwPct = parseFloat(wpObj.homeTeam ?? 50);
      if (team1Name === ct0) {
        winProbT1 = Math.round(hwPct);
        winProbT2 = 100 - winProbT1;
      } else {
        winProbT2 = Math.round(hwPct);
        winProbT1 = 100 - winProbT2;
      }
    }
  }

  // Compute from RRR/CRR if ESPN didn't provide prob
  if (winProbT1 === 50 && winProbT2 === 50) {
    if (rrr && crr && crr > 0) {
      // RRR/CRR ratio: if ratio < 1 chaser is ahead → team2 has higher prob
      const r = rrr / crr;
      winProbT2 = r < 0.5 ? 88 : r < 0.75 ? 78 : r < 0.9 ? 66 : r < 1.0 ? 55
                : r < 1.1 ? 46 : r < 1.3 ? 37 : r < 1.6 ? 28 : r < 2.0 ? 18 : 10;
      winProbT1 = 100 - winProbT2;
    } else if (crr && !target && oversFloat > 0) {
      // 1st innings — project final score
      const proj = crr * 20;
      winProbT1 = proj > 195 ? 65 : proj > 180 ? 60 : proj > 165 ? 55 : proj > 150 ? 50 : proj > 135 ? 45 : 38;
      winProbT2 = 100 - winProbT1;
    }
  }

  if (status === 'FINISHED' && result) {
    const w = result.toUpperCase();
    // Check which team name appears in result string
    if (w.includes(team1Name)) { winProbT1 = 100; winProbT2 = 0; }
    else if (w.includes(team2Name)) { winProbT2 = 100; winProbT1 = 0; }
  }
  if (['ABANDONED', 'POSTPONED'].includes(status)) { winProbT1 = 50; winProbT2 = 50; }

  console.log(`  ✅ [ESPN] FINAL: team1(bat1st)=${team1Name} ${firstInningsRuns||'N/A'} | team2(bat2nd)=${team2Name} ${score}/${wickets} (${overs})`);
  console.log(`     CRR:${crr} RRR:${rrr} WinProb: T1(${team1Name})=${winProbT1}% T2(${team2Name})=${winProbT2}%`);
  if (batsmen.length) console.log(`     🏏 ${batsmen.map(b=>`${b.name}${b.onStrike?'*':''}: ${b.runs}(${b.balls})`).join(' | ')}`);
  if (bowlers.length) console.log(`     🎯 ${bowlers.map(b=>`${b.name}: ${b.wickets}/${b.runs}(${b.overs})`).join(' | ')}`);

  return {
    team1: { name: team1Name },
    team2: { name: team2Name },
    score, wickets, overs,
    team1Score:   firstInningsRuns  || null,
    team1Wickets: firstInningsWkts  || null,
    team1Overs:   firstInningsOvers ? normalizeOvers(firstInningsOvers) : null,
    target: target || null,
    status, result, toss,
    winProb:   winProbT2,
    winProbT1, winProbT2,
    recent:    recent.slice(0, 6),
    batsmen:   batsmen.slice(0, 3),
    bowlers:   bowlers.slice(0, 2),
    commentary: commentary.slice(0, 10),
    crr, rrr,
    espnId,
    // 1 = 1st innings in progress (team1 currently batting)
    // 2 = 2nd innings in progress (team2 currently batting)
    currentInnings: (firstInningsRuns && firstInningsRuns !== '' && firstInningsRuns !== 'null') ? 2 : 1,
    source: 'espn',
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// CB PROXY — secondary source
// ─────────────────────────────────────────────────────────────────────────────
const cbProxyFetch = async () => {
  console.log('[CB-Proxy] Trying...');
  const list = await fetchJSON('https://cricbuzz-live.vercel.app/v1/matches', {}, 'CB-Proxy matches');
  if (!list?.data?.matches) { console.log('  [CB-Proxy] Down/no response'); return null; }

  let iplMatch = null;
  for (const m of list.data.matches) {
    const title = (m.title || '').toUpperCase();
    const teamsFound = TEAMS.filter(t => title.includes(t));
    if (!title.includes('IPL') && !title.includes('PREMIER') && teamsFound.length < 2) continue;
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
  console.log(`  [CB-Proxy] liveScore:"${d.liveScore}" update:"${(d.update||'').substring(0,80)}"`);

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

  const update = (d.update || '').toUpperCase();
  let status = 'LIVE', result = '';
  if (update.includes('WON') || update.includes(' WIN')) { status = 'FINISHED'; result = d.update || ''; }
  else if (update.includes('RAIN') || update.includes('HALT') || update.includes('DELAY')) status = 'RAIN DELAY';
  else if (update.includes('BREAK')) status = 'INNINGS BREAK';

  let target = null, team1ScoreStr = null, team1WktsStr = null;
  const tgtM   = (d.update||'').match(/[Tt]arget[:\s]+(\d+)/i);
  const needsM = (d.update||'').match(/need[s]?\s+(\d+)\s+(?:more\s+)?runs?/i);
  if (tgtM)  { target = parseInt(tgtM[1]); team1ScoreStr = String(target - 1); }
  else if (needsM) { target = parseInt(score) + parseInt(needsM[1]); team1ScoreStr = String(target - 1); }

  const toss = null;

  const parseBR = s => { const m=String(s||'').match(/(\d+)\s*\((\d+)\)/); return m?{runs:parseInt(m[1]),balls:parseInt(m[2])}:{runs:parseInt(String(s||'').match(/(\d+)/)?.[1]||0),balls:0}; };
  const batsmen = [];
  if (d.batsmanOne?.length > 1) { const {runs,balls}=parseBR(d.batsmanOneRun); batsmen.push({name:d.batsmanOne,runs,balls,fours:0,sixes:0,sr:parseFloat(d.batsmanOneSR||(balls?((runs/balls)*100).toFixed(1):'0.0')).toFixed(1),onStrike:true}); }
  if (d.batsmanTwo?.length > 1) { const {runs,balls}=parseBR(d.batsmanTwoRun); batsmen.push({name:d.batsmanTwo,runs,balls,fours:0,sixes:0,sr:parseFloat(d.batsmanTwoSR||(balls?((runs/balls)*100).toFixed(1):'0.0')).toFixed(1),onStrike:false}); }

  const bowlers = [];
  if (d.bowlerOne?.length > 1 && d.bowlerOne !== 'BOWLER') bowlers.push({name:d.bowlerOne,overs:normalizeOvers(d.bowlerOneOver),maidens:0,runs:parseInt(d.bowlerOneRun??0),wickets:parseInt(d.bowlerOneWickets??0),economy:String(d.bowlerOneEconomy||'0.0')});
  if (d.bowlerTwo?.length > 1 && d.bowlerTwo !== 'BOWLER' && d.bowlerTwo !== 'O') bowlers.push({name:d.bowlerTwo,overs:normalizeOvers(d.bowlerTwoOver),maidens:0,runs:parseInt(d.bowlerTwoRun??0),wickets:parseInt(d.bowlerTwoWicket??d.bowlerTwoWickets??0),economy:String(d.bowlerTwoEconomy||'0.0')});

  // team1 = batted first; if there's a target, battingTeam is chasing (team2), so bowling team batted first
  const bowlingTeam = battingTeam === teamA ? teamB : teamA;
  const team1Name   = target ? bowlingTeam : battingTeam;
  const team2Name   = team1Name === teamA ? teamB : teamA;

  const crr = parseFloat(d.runRate||0)||null;
  let rrr = null;
  if (target && crr) { const bl=Math.max((20-parseFloat(overs))*6,1); rrr=parseFloat(((target-parseInt(score))/bl*6).toFixed(2)); }
  let wP1=50,wP2=50;
  if(rrr&&crr&&crr>0){const r=rrr/crr;wP2=r<0.5?88:r<0.75?78:r<0.9?66:r<1.0?55:r<1.1?46:r<1.3?37:r<1.6?28:18;wP1=100-wP2;}
  else if(crr&&!target&&parseFloat(overs)>0){const p=crr*20;wP1=p>195?65:p>180?60:p>165?55:p>150?50:p>135?45:38;wP2=100-wP1;}
  if(status==='FINISHED'){const w=result.toUpperCase();if(w.includes(team1Name)){wP1=100;wP2=0;}else if(w.includes(team2Name)){wP2=100;wP1=0;}}

  console.log(`  ✅ [CB-Proxy] team1(bat1st)=${team1Name} | team2(bat2nd)=${team2Name} | ${score}/${wickets} (${overs}) | ${status}`);
  if (batsmen.length) console.log(`     🏏 ${batsmen.map(b=>`${b.name}${b.onStrike?'*':''}: ${b.runs}(${b.balls})`).join(' | ')}`);

  return {team1:{name:team1Name},team2:{name:team2Name},score,wickets,overs,team1Score:team1ScoreStr||null,team1Wickets:team1WktsStr||null,team1Overs:null,target:target||null,status,result,toss,winProb:wP2,winProbT1:wP1,winProbT2:wP2,recent:['·','·','·','·','·','·'],batsmen,bowlers,commentary:[],crr,rrr,source:'cricbuzz-proxy',currentInnings:target?2:1};
};

// ─────────────────────────────────────────────────────────────────────────────
// CB DIRECT — tertiary source
// ─────────────────────────────────────────────────────────────────────────────
const cbDirectFetch = async () => {
  console.log('[CB-Direct] Trying...');
  const cbH = {'Referer':'https://www.cricbuzz.com/','X-Requested-With':'XMLHttpRequest'};
  const list = await fetchJSON('https://www.cricbuzz.com/api/cricket-match/live-scores', cbH, 'CB live-scores');
  if (!list) { console.log('  [CB-Direct] Blocked'); return null; }

  const allM = [];
  for (const s of (list.matchDetails||[])) allM.push(...(s?.matchDetailsMap?.match||[]));
  for (const t of (list.typeMatches||[])) for (const sm of (t.seriesMatches||[])) allM.push(...(sm?.seriesAdWrapper?.matches||sm?.matches||[]));
  if (list.matches) allM.push(...list.matches);

  let meta = null;
  for (const m of allM) {
    const info=m?.matchInfo||m;
    if(!(info?.seriesName||'').toUpperCase().includes('IPL')&&!(info?.seriesName||'').toUpperCase().includes('PREMIER'))continue;
    if((info?.state||'').toUpperCase()==='PREVIEW')continue;
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
  if(!mini){console.log('  [CB-Direct] Miniscore blocked');return null;}

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
  let toss=null;
  if(tDec&&tWId){const tosser=tWId===meta.t1Id?meta.team1:meta.team2;toss=`${tosser} chose to ${tDec}`;}

  const btId=ms?.battingTeamId||ms?.batTeam?.teamId;
  let currentBatting=meta.team1,currentBowling=meta.team2;
  if(btId){currentBatting=btId===meta.t1Id?meta.team1:meta.team2;currentBowling=currentBatting===meta.team1?meta.team2:meta.team1;}

  const batSc=ms?.batTeam?.teamScore||{};
  let score=String(ms?.score??batSc?.runs??'0');
  let wickets=String(ms?.wickets??batSc?.wickets??'0');
  let overs=normalizeOvers(ms?.overs??batSc?.overs??'0');

  const innL=ms?.matchScoreDetails?.inningsScoreList||[];
  let t1Sc=null,t1Wk=null,t1Ov=null,target=null;

  // CB innings list: innL[0] = 1st innings completed, innL[1] = current
  if(innL.length>=2){
    const p=innL[0];
    t1Sc=String(p.score??'');t1Wk=String(p.wickets??'');t1Ov=String(p.overs??'');
    target=parseInt(p.score??0)+1;
  } else {
    // Check bowling team score
    const bowlSc=ms?.bowlTeam?.teamScore||{};
    if(bowlSc.runs!=null){t1Sc=String(bowlSc.runs??'');t1Wk=String(bowlSc.wickets??'');t1Ov=String(bowlSc.overs??'');if(t1Sc)target=parseInt(t1Sc)+1;}
  }
  if(!target&&ms?.target)target=parseInt(ms.target);

  const crr=parseFloat(ms?.currentRunRate||0)||null;
  const rrr=parseFloat(ms?.requiredRunRate||0)||null;

  // team1 = batted first = bowling team when 2nd innings; batting team when 1st innings
  const isSecondInnings = innL.length>=2 || (t1Sc && t1Sc !== '');
  const team1Name = isSecondInnings ? currentBowling : currentBatting;
  const team2Name = team1Name===meta.team1 ? meta.team2 : meta.team1;

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
  if(rrr&&crr&&crr>0){const r=rrr/crr;wP2=r<0.5?88:r<0.75?78:r<0.9?66:r<1.0?55:r<1.1?46:r<1.3?37:r<1.6?28:18;wP1=100-wP2;}
  else if(crr&&!target){const p=crr*20;wP1=p>195?65:p>180?60:p>165?55:p>150?50:p>135?45:38;wP2=100-wP1;}
  if(status==='FINISHED'){const w=result.toUpperCase();if(w.includes(team1Name)){wP1=100;wP2=0;}else if(w.includes(team2Name)){wP2=100;wP1=0;}}

  console.log(`  ✅ [CB-Direct] team1(bat1st)=${team1Name} | team2=${team2Name} | ${score}/${wickets} (${overs}) | ${status}`);
  return{team1:{name:team1Name},team2:{name:team2Name},score,wickets,overs,team1Score:t1Sc||null,team1Wickets:t1Wk||null,team1Overs:t1Ov||null,target:target||null,status,result,toss,winProb:wP2,winProbT1:wP1,winProbT2:wP2,recent:recent.slice(0,6),batsmen:batsmen.slice(0,3),bowlers:bowlers.slice(0,2),commentary:commentary.slice(0,10),crr,rrr,source:'cricbuzz-api',currentInnings:(t1Sc&&t1Sc!=='')?2:1};
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export const scrapeLiveMatch = async () => {
  console.log('━━━ [Scraper] Starting ━━━');

  // CB-Direct is the most reliable — try it FIRST
  try {
    const r = await cbDirectFetch();
    if (r) { console.log('━━━ Done via CB-Direct ━━━'); return { ...r, lastUpdated: new Date() }; }
  } catch(e) { console.log('[CB-Direct fatal]', e.message); }

  // CB-Proxy as second option
  try {
    const r = await cbProxyFetch();
    if (r) { console.log('━━━ Done via CB-Proxy ━━━'); return { ...r, lastUpdated: new Date() }; }
  } catch(e) { console.log('[CB-Proxy fatal]', e.message); }

  // ESPN as fallback (often returns stale data)
  try {
    const meta = await espnFindMatch();
    if (meta) {
      const r = await espnGetScore(meta);
      if (r && !(r.score === '0' && r.status === 'LIVE' && !r.team1Score)) {
        console.log('━━━ Done via ESPN ━━━');
        return { ...r, lastUpdated: new Date() };
      }
    }
  } catch(e) { console.log('[ESPN fatal]', e.message); }

  if (!CHROME_AVAILABLE) { console.log('━━━ All failed, no Chrome ━━━'); return null; }
  return await browserFallback();
};
// ─────────────────────────────────────────────────────────────────────────────
// STANDINGS + STATS
// ─────────────────────────────────────────────────────────────────────────────
export const scrapeIPLStandingsAndStats = async () => {
  console.log('[Standings] Fetching IPL standings + stats...');
  let pointsTable = null, orangeCap = null, purpleCap = null;
  let topBatsmen = [], topBowlers = [];

  try {
    const data = await fetchJSON(
      `https://site.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_ID}/standings`,
      {}, 'ESPN standings'
    );
    const entries = data?.children?.[0]?.standings?.entries
                 || data?.children?.[0]?.entries
                 || data?.standings?.entries
                 || [];
    console.log(`  [Standings] ESPN entries: ${entries.length}`);
    if (entries.length >= 4) {
      const table = entries.map(e => {
        const team = toTeam(e.team?.displayName || e.team?.abbreviation || '');
        if (!team || !TEAMS.includes(team)) return null;
        const stats = {};
        (e.stats || []).forEach(s => { stats[s.name || s.abbreviation] = s.value ?? s.displayValue; });
        return {
          team,
          played: parseInt(stats.gamesPlayed || stats.GP || stats.played || 0),
          won:    parseInt(stats.wins        || stats.W  || stats.won    || 0),
          lost:   parseInt(stats.losses      || stats.L  || stats.lost   || 0),
          pts:    parseInt(stats.points      || stats.PTS|| stats.pts    || 0),
          nrr:    parseFloat(stats.netRunRate || stats.NRR || stats.nrr || 0).toFixed(3),
        };
      }).filter(Boolean).sort((a, b) => b.pts - a.pts || parseFloat(b.nrr) - parseFloat(a.nrr));
      if (table.length >= 4) { pointsTable = table; console.log(`  [Standings] ESPN OK: ${table.length} teams`); }
    }
  } catch(e) { console.log('[Standings ESPN]', e.message); }

  if (!pointsTable) {
    for (const sid of ['9241','9237','9300','9350','9280']) {
      try {
        const data = await fetchJSON(`https://www.cricbuzz.com/api/cricket-series/${sid}/standings`, {}, `CB standings ${sid}`);
        const rows = data?.pointsTable?.[0]?.pointsTableInfo || data?.pointsTableInfo || [];
        if (!Array.isArray(rows) || rows.length < 4) continue;
        const table = rows.map(r => ({
          team:   toTeam(r.teamSName || r.teamName || '') || '',
          played: parseInt(r.matchesPlayed || 0),
          won:    parseInt(r.matchesWon    || 0),
          lost:   parseInt(r.matchesLost   || 0),
          pts:    parseInt(r.points        || 0),
          nrr:    parseFloat(r.nrr || 0).toFixed(3),
        })).filter(t => TEAMS.includes(t.team)).sort((a, b) => b.pts - a.pts);
        if (table.length >= 4) { pointsTable = table; console.log(`  [Standings] CB sid=${sid}: ${table.length} teams`); break; }
      } catch(e) { /* try next */ }
    }
  }

  try {
    const runsData = await fetchJSON(
      `https://site.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_ID}/statistics?type=batting`,
      {}, 'ESPN batting stats'
    );
    const battingList = runsData?.athletes || runsData?.results || runsData?.statistics || [];
    if (Array.isArray(battingList) && battingList.length > 0) {
      topBatsmen = battingList.slice(0, 10).map(p => {
        const name = p.athlete?.displayName || p.displayName || p.name || '';
        const statsArr = p.stats || p.statistics || [];
        const stats = {}; statsArr.forEach(s => { stats[s.name || s.abbreviation] = s.value ?? s.displayValue; });
        return { name, team: '', runs: parseInt(stats.runs || stats.R || p.value || 0) };
      }).filter(p => p.name && p.runs > 0).sort((a, b) => b.runs - a.runs);
      orangeCap = topBatsmen[0] || null;
      if (orangeCap) console.log(`  [Stats] Orange Cap: ${orangeCap.name} (${orangeCap.runs})`);
    }
  } catch(e) { console.log('[Stats ESPN batting]', e.message); }

  if (topBatsmen.length === 0 || topBowlers.length === 0) {
    for (const sid of ['9241','9237','9300']) {
      if (topBatsmen.length > 0 && topBowlers.length > 0) break;
      try {
        const [bat, bowl] = await Promise.all([
          fetchJSON(`https://www.cricbuzz.com/api/cricket-series/${sid}/stats?statsType=mostRuns`,    {}, `CB runs ${sid}`),
          fetchJSON(`https://www.cricbuzz.com/api/cricket-series/${sid}/stats?statsType=mostWickets`, {}, `CB wickets ${sid}`),
        ]);
        const parseP = (d, type) => {
          const list = d?.statsDetails?.[0]?.playerStatsList || d?.values?.[0]?.playerStats || d?.statsList || d?.values || [];
          return (Array.isArray(list) ? list : []).slice(0, 10).map(p => ({
            name:    p.playerName || p.name || '',
            team:    (p.teamSName || '').toUpperCase(),
            runs:    type === 'bat'  ? parseInt(p.runs    || p.value || 0) : undefined,
            wickets: type === 'bowl' ? parseInt(p.wickets || p.value || 0) : undefined,
          })).filter(p => p.name.length > 2);
        };
        const bats  = parseP(bat,  'bat').sort((a,b) => (b.runs||0)    - (a.runs||0));
        const bowls = parseP(bowl, 'bowl').sort((a,b) => (b.wickets||0) - (a.wickets||0));
        if (bats.length > 0  && topBatsmen.length === 0) { topBatsmen = bats;  orangeCap = bats[0];  }
        if (bowls.length > 0 && topBowlers.length === 0) { topBowlers = bowls; purpleCap = bowls[0]; }
        if (orangeCap || purpleCap) console.log(`  [Stats] CB sid=${sid}: Orange:${orangeCap?.name} Purple:${purpleCap?.name}`);
      } catch(e) { /* try next */ }
    }
  }

  return {
    pointsTable: pointsTable || [],
    orangeCap:   orangeCap  || null,
    purpleCap:   purpleCap  || null,
    topBatsmen,
    topBowlers,
    lastUpdated: new Date(),
    source: pointsTable ? 'espn+cricbuzz' : 'fallback',
  };
};
export const scrapeIPLStandings = scrapeIPLStandingsAndStats;

// ─────────────────────────────────────────────────────────────────────────────
// Browser fallback (local dev only)
// ─────────────────────────────────────────────────────────────────────────────
let _pptr = null;
const getPptr = async () => {
  if (_pptr) return _pptr;
  try { _pptr = (await import('puppeteer-core')).default; return _pptr; } catch {}
  try { _pptr = (await import('puppeteer')).default;      return _pptr; } catch {}
  return null;
};

const browserFallback = async () => {
  const pptr = await getPptr(); if (!pptr) return null;
  let browser;
  try {
    browser = await pptr.launch({ executablePath: CHROME_PATH, headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process'] });
    const mp = await browser.newPage();
    await mp.goto('https://www.cricbuzz.com/cricket-match/live-scores', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(3000);
    const mm = await mp.evaluate(TEAMS => {
      const links=Array.from(document.querySelectorAll('a[href*="/live-cricket-scores/"]'));const seen=new Set(),c=[];
      for(const a of links){const href=a.getAttribute('href')||'',hu=href.toUpperCase();if(seen.has(href))continue;if(!hu.includes('IPL')&&!hu.includes('INDIAN-PREMIER'))continue;const idM=href.match(/\/live-cricket-scores\/(\d+)\//);if(!idM)continue;const t=TEAMS.filter(t=>hu.includes(`-${t}-`)||hu.includes(`/${t}-`)||hu.endsWith(`-${t}`));if(t.length<2)continue;seen.add(href);const card=a.closest('[class*="cb-col"]')||a.parentElement;const hint=card?.querySelector('.cb-text-live')?'LIVE':card?.querySelector('.cb-text-complete,.cb-text-stumps')?'FINISHED':'UPCOMING';c.push({matchId:idM[1],cbUrl:'https://www.cricbuzz.com'+href,team1:t[0],team2:t[1],priority:hint==='LIVE'?0:hint==='FINISHED'?1:2});}c.sort((a,b)=>a.priority-b.priority);return c[0]||null;
    }, TEAMS);
    await mp.close();
    if (!mm) { await browser.close(); return null; }

    const gp = await browser.newPage();
    await gp.goto(`https://www.google.com/search?q=${encodeURIComponent(`${mm.team1} vs ${mm.team2} IPL 2026 live score`)}&hl=en`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await wait(3000);
    const graw = await gp.evaluate((T,t1,t2) => {
      const ws=['.liveticker','.liveresults-sports-immersive__match-tile','.imso_mh__ma-cont','[jsname="ESiMyd"]'];let w=null;for(const s of ws){const el=document.querySelector(s);if(el?.innerText?.length>30){w=el;break;}}
      const text=w?.innerText?.trim()||'';if(!text||!text.toUpperCase().includes(t1)||!text.toUpperCase().includes(t2))return null;
      const aS=[...text.matchAll(/(\d{2,3})\s*[\/\-]\s*(\d{1,2})\s*\(\s*(\d{1,2}\.?\d?)\s*\)/g)];if(!aS.length)return null;
      const sm=aS[aS.length-1];const up=text.toUpperCase();let st='LIVE',res='';
      const wM=text.match(new RegExp(`\\b(${T.join('|')})\\b\\s+won\\s+by\\s+([\\d]+\\s+(?:runs?|wickets?))`, 'i'));
      if(wM){st='FINISHED';res=`${wM[1].toUpperCase()} won by ${wM[2]}`;}else if(up.includes('RAIN'))st='RAIN DELAY';else if(up.includes('INNINGS BREAK'))st='INNINGS BREAK';
      const cM=text.match(/CRR\s*:?\s*([\d.]+)/i),rM=text.match(/RRR\s*:?\s*([\d.]+)/i),tM=text.match(/[Tt]arget[:\s]*(\d{2,3})/);
      return{score:sm[1],wickets:sm[2],overs:sm[3]||'0.0',status:st,result:res,crr:cM?parseFloat(cM[1]):null,rrr:rM?parseFloat(rM[1]):null,target:tM?parseInt(tM[1]):null};
    }, TEAMS, mm.team1, mm.team2);
    await gp.close(); await browser.close();
    if (!graw) return null;
    // If target exists, mm.team2 (URL team2) is chasing = team2, mm.team1 batted first = team1
    const team1n = graw.target ? mm.team1 : mm.team1;
    const team2n = graw.target ? mm.team2 : mm.team2;
    let wP1=50,wP2=50;
    if(graw.rrr&&graw.crr&&graw.crr>0){const r=graw.rrr/graw.crr;wP2=r<0.5?88:r<0.75?78:r<0.9?66:r<1.0?55:r<1.1?46:r<1.3?37:18;wP1=100-wP2;}
    console.log(`  ✅ [Google] ${mm.team1} vs ${mm.team2} | ${graw.score}/${graw.wickets} (${normalizeOvers(graw.overs)})`);
    return{team1:{name:team1n},team2:{name:team2n},score:graw.score,wickets:graw.wickets,overs:normalizeOvers(graw.overs),team1Score:null,team1Wickets:null,team1Overs:null,target:graw.target||null,status:graw.status,result:graw.result,toss:null,winProb:wP2,winProbT1:wP1,winProbT2:wP2,recent:['·','·','·','·','·','·'],batsmen:[],bowlers:[],commentary:[],crr:graw.crr,rrr:graw.rrr,source:'google',currentInnings:graw.target?2:1,lastUpdated:new Date()};
  } catch(e) { if(browser) await browser.close(); console.error('[Browser fatal]', e.message); return null; }
};