/**
 * scraperService.js — DEFINITIVE VERSION
 *
 * WHAT THIS FIXES vs previous versions:
 *
 * 1. "No live IPL match found via JSON" — The Cricbuzz live-scores JSON has a
 *    nested structure that changes. We now try 3 different JSON endpoint formats
 *    AND fall back to HTML listing scraping to get the match ID.
 *
 * 2. "Chrome not available at /usr/bin/chromium" — Added CHROME_AVAILABLE check
 *    with multiple path fallbacks. HTTP fetch (no browser) is tried first.
 *
 * 3. Innings switchover — Uses battingTeamId from miniscore (Cricbuzz explicitly
 *    tells us who is batting), not heuristics. At innings break, scorecard
 *    innings array tells us order definitively.
 *
 * 4. Batsmen/bowler data — Cricbuzz miniscore JSON has `batsman[]` array and
 *    `bowler` object with full stats. Scorecard fallback for enrichment.
 *
 * 5. Commentary — Separate `/commentary/` endpoint returns ball-by-ball.
 *
 * 6. Points table / caps — Series JSON with multiple ID fallbacks.
 *
 * DATA FLOW:
 *   LIVE SCORE (every 40s):
 *     HTTP: CB live-scores JSON → find matchId
 *     HTTP: CB miniscore JSON  → score, batsmen, bowler, recent balls, win%
 *     HTTP: CB commentary JSON → ball-by-ball text
 *     HTTP: CB scorecard JSON  → enrich batsmen/bowler if missing
 *     Browser fallback (only if Chrome exists): crex.com → Google
 *
 *   STANDINGS (every 12h):
 *     HTTP: CB series standings JSON
 *     HTTP: CB series stats JSON (most runs, most wickets)
 *     Browser fallback: Cricbuzz HTML
 */

import https from 'https';
import http  from 'http';
import { existsSync } from 'fs';

// ─── Constants ────────────────────────────────────────────────────────────────
const TEAMS = ['CSK','MI','RCB','KKR','RR','PBKS','DC','GT','LSG','SRH'];
const wait  = ms => new Promise(r => setTimeout(r, ms));

// Multiple series IDs to try (Cricbuzz changes these each season)
const CB_SERIES_IDS = ['9241','9237','9300','9350','9280'];

// ─── Chrome detection ─────────────────────────────────────────────────────────
const CHROME_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : null,
].filter(Boolean);

const CHROME_PATH = CHROME_PATHS.find(p => { try { return existsSync(p); } catch { return false; } }) || null;
const CHROME_AVAILABLE = !!CHROME_PATH;

console.log(`[Scraper] Chrome available: ${CHROME_AVAILABLE}${CHROME_PATH ? ` at ${CHROME_PATH}` : ''}`);

// ─── HTTP helper (no browser, works on Render) ────────────────────────────────
const httpFetch = (url, opts = {}) => new Promise((resolve, reject) => {
  const lib  = url.startsWith('https') ? https : http;
  const req  = lib.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Mobile Safari/537.36',
      'Accept': 'application/json, text/html, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.cricbuzz.com/',
      'Cache-Control': 'no-cache',
      'X-Requested-With': 'XMLHttpRequest',
      ...(opts.headers || {}),
    },
    timeout: opts.timeout || 12000,
  }, res => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      return httpFetch(res.headers.location, opts).then(resolve).catch(reject);
    }
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => resolve({ status: res.statusCode, body: data }));
  });
  req.on('error', reject);
  req.on('timeout', () => { req.destroy(); reject(new Error('HTTP timeout')); });
});

const fetchJSON = async (url, opts = {}) => {
  try {
    const { status, body } = await httpFetch(url, opts);
    if (status !== 200 || !body || body.length < 5) return null;
    return JSON.parse(body);
  } catch { return null; }
};

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: Find today's IPL match ID via Cricbuzz JSON
//
// Cricbuzz JSON structure (live-scores endpoint):
// { matchDetails: [ { matchDetailsMap: { match: [ { matchInfo: {...}, matchScore: {...} } ] } } ] }
// OR
// { typeMatches: [ { seriesMatches: [ { seriesAdWrapper: { matches: [...] } } ] } ] }
// ─────────────────────────────────────────────────────────────────────────────
const findMatchViaHTTP = async () => {
  // Try the live-scores endpoint
  const data = await fetchJSON('https://www.cricbuzz.com/api/cricket-match/live-scores');
  if (!data) {
    console.log('[CB JSON] live-scores endpoint returned null');
    return null;
  }

  // Try all known JSON structures
  const allMatches = [];

  // Structure 1: matchDetails[].matchDetailsMap.match[]
  for (const section of (data.matchDetails || [])) {
    const matches = section?.matchDetailsMap?.match || [];
    allMatches.push(...matches);
  }

  // Structure 2: typeMatches[].seriesMatches[].seriesAdWrapper.matches[]
  for (const type of (data.typeMatches || [])) {
    for (const sm of (type.seriesMatches || [])) {
      const matches = sm?.seriesAdWrapper?.matches || sm?.matches || [];
      allMatches.push(...matches);
    }
  }

  // Structure 3: flat matches[]
  if (data.matches) allMatches.push(...data.matches);

  console.log(`[CB JSON] Found ${allMatches.length} total matches to scan`);

  for (const m of allMatches) {
    const info  = m?.matchInfo || m?.match?.matchInfo || m;
    const series = (info?.seriesName || info?.series?.name || '').toUpperCase();

    if (!series.includes('IPL') && !series.includes('PREMIER LEAGUE') && !series.includes('INDIAN PREMIER')) continue;

    const state  = (info?.state || info?.status || info?.matchStatus || '').toUpperCase();
    if (state === 'PREVIEW' || state === 'SCHEDULED') continue;

    // Get team abbreviations
    const t1raw = info?.team1?.teamSName || info?.team1ShortName || info?.team1?.shortName || '';
    const t2raw = info?.team2?.teamSName || info?.team2ShortName || info?.team2?.shortName || '';
    const t1 = matchTeamName(t1raw, info?.team1?.teamName);
    const t2 = matchTeamName(t2raw, info?.team2?.teamName);

    if (!t1 || !t2) continue;

    const mid = String(info?.matchId || info?.id || '');
    if (!mid) continue;

    return {
      matchId:   mid,
      team1:     t1,
      team2:     t2,
      t1Id:      info?.team1?.teamId,
      t2Id:      info?.team2?.teamId,
      seriesId:  String(info?.seriesId || CB_SERIES_IDS[0]),
      statusHint: state.includes('PROGRESS') || state.includes('LIVE') ? 'LIVE'
                : state.includes('COMPLETE') || state.includes('FINISH') ? 'FINISHED'
                : 'RECENT',
    };
  }

  return null;
};

// Map raw team name/abbr to our standard abbreviations
const matchTeamName = (abbr, fullName = '') => {
  const u = (abbr + ' ' + fullName).toUpperCase();
  // Direct match
  const direct = TEAMS.find(t => u.startsWith(t) || u.includes(` ${t} `) || u.includes(`\t${t}`));
  if (direct) return direct;
  // Name-based mapping
  const nameMap = {
    'SUPER KINGS': 'CSK', 'MUMBAI': 'MI', 'CHALLENGERS': 'RCB',
    'KOLKATA': 'KKR', 'ROYALS': 'RR', 'PUNJAB': 'PBKS',
    'CAPITALS': 'DC', 'GUJARAT': 'GT', 'LUCKNOW': 'LSG', 'SUNRISERS': 'SRH',
  };
  for (const [key, val] of Object.entries(nameMap)) {
    if (u.includes(key)) return val;
  }
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2: Cricbuzz miniscore JSON — core live data
//
// Endpoint: /api/cricket-match/{matchId}/miniscore
// Returns current score, batsmen, bowler, recent balls, win probability
// ─────────────────────────────────────────────────────────────────────────────
const getMiniscore = async (matchId, meta) => {
  const url = `https://www.cricbuzz.com/api/cricket-match/${matchId}/miniscore`;
  const data = await fetchJSON(url);
  if (!data) return null;

  // The response can be { minScore: {...} } or { miniscore: {...} } or the object directly
  const ms = data?.minScore || data?.miniscore || data?.miniScore || data;
  if (!ms || typeof ms !== 'object') return null;

  // ── Status ────────────────────────────────────────────────────────────────
  const rawStatus = (ms?.status || ms?.matchScoreDetails?.status || data?.matchHeader?.status || '').toLowerCase();
  let status = 'LIVE', result = '';

  if (rawStatus.includes('preview') || rawStatus.includes('yet to begin') || rawStatus === '') {
    console.log('[miniscore] Match not started');
    return null;
  }
  if (rawStatus.includes('rain') || rawStatus.includes('delay') || rawStatus.includes('halt'))
    status = 'RAIN DELAY';
  else if (rawStatus.includes('innings break') || rawStatus.includes('inns break') || rawStatus.includes('break'))
    status = 'INNINGS BREAK';
  else if (rawStatus.includes('super over'))
    status = 'SUPER OVER';
  else if (rawStatus.includes('abandoned') || rawStatus.includes('no result'))
    { status = 'ABANDONED'; result = 'Match Abandoned'; }
  else if (rawStatus.includes('complete') || rawStatus.includes('finish') || rawStatus.includes('won'))
    status = 'FINISHED';

  if (status === 'FINISHED' || rawStatus.includes('won')) {
    result = data?.matchHeader?.status || ms?.matchScoreDetails?.customStatus || rawStatus;
    // Ensure proper casing: "GT won by 100 runs"
    if (!result.match(/won by/i)) {
      const winTeam = data?.matchHeader?.winningTeam || '';
      const margin = data?.matchHeader?.winByRuns > 0
        ? `${data.matchHeader.winByRuns} runs`
        : data?.matchHeader?.winByWickets > 0
          ? `${data.matchHeader.winByWickets} wickets` : '';
      if (winTeam && margin) result = `${winTeam.toUpperCase()} won by ${margin}`;
    }
    status = 'FINISHED';
  }

  // ── Toss ──────────────────────────────────────────────────────────────────
  const tossWinnerId = data?.matchHeader?.tossResults?.tossWinnerId;
  const tossDec      = (data?.matchHeader?.tossResults?.decision || '').toLowerCase();
  let toss = null, battingFirstTeam = null;
  if (tossWinnerId && tossDec) {
    const tosser = tossWinnerId === meta.t1Id ? meta.team1 : meta.team2;
    battingFirstTeam = tossDec === 'bat' ? tosser : (tosser === meta.team1 ? meta.team2 : meta.team1);
    toss = `${tosser} chose to ${tossDec}`;
  }
  if (!toss && data?.matchHeader?.toss) {
    toss = data.matchHeader.toss;
    const tossRx = new RegExp(`(${TEAMS.join('|')}).*?chose\\s+to\\s+(bat|bowl)`, 'i');
    const tm = toss.match(tossRx);
    if (tm) {
      const tosser = tm[1].toUpperCase();
      battingFirstTeam = tm[2].toLowerCase()==='bat' ? tosser : (tosser===meta.team1?meta.team2:meta.team1);
    }
  }

  // ── Batting/bowling team assignment ──────────────────────────────────────
  // CRITICAL: Cricbuzz miniscore tells us battingTeamId directly
  const battingTeamId = ms?.battingTeamId || ms?.batTeam?.teamId || ms?.batTeamId;
  let battingTeam, bowlingTeam;

  if (battingTeamId) {
    battingTeam  = battingTeamId === meta.t1Id ? meta.team1 : meta.team2;
    bowlingTeam  = battingTeam === meta.team1 ? meta.team2 : meta.team1;
  } else if (battingFirstTeam) {
    // For innings 2, the other team bats
    const inningsId = ms?.inningsId || 1;
    battingTeam = inningsId === 1 ? battingFirstTeam
                : (battingFirstTeam === meta.team1 ? meta.team2 : meta.team1);
    bowlingTeam = battingTeam === meta.team1 ? meta.team2 : meta.team1;
  } else {
    battingTeam  = meta.team2;
    bowlingTeam  = meta.team1;
  }

  // ── Current score ─────────────────────────────────────────────────────────
  const batScore  = ms?.batTeam?.teamScore || ms?.score || {};
  const bowlScore = ms?.bowlTeam?.teamScore || {};

  // Handle various field name formats
  const score   = String(
    ms?.score  ?? ms?.runs  ?? batScore?.runs ?? batScore?.score ?? '0'
  );
  const wickets = String(
    ms?.wickets ?? ms?.wkts  ?? batScore?.wickets ?? '0'
  );

  // Overs can come as "3.4" or "34" (balls) — normalize
  let overs = String(ms?.overs ?? ms?.oversAndBalls ?? batScore?.overs ?? '0.0');
  if (/^\d{3,}$/.test(overs)) {
    // It's total balls — convert to over.ball format
    const b = parseInt(overs);
    overs = `${Math.floor(b/6)}.${b%6}`;
  }

  // ── Previous innings (1st innings score for target) ───────────────────────
  let team1Score = null, team1Wickets = null, team1Overs = null, target = null;

  // Try inningsScoreList first
  const inningsList = ms?.matchScoreDetails?.inningsScoreList || ms?.inningsScoreList || [];
  if (inningsList.length >= 2) {
    const prev = inningsList[0]; // first innings
    team1Score   = String(prev.score  ?? prev.runs   ?? '');
    team1Wickets = String(prev.wickets ?? '');
    team1Overs   = String(prev.overs  ?? '');
    target       = (parseInt(prev.score ?? prev.runs ?? 0)) + 1;
  } else if (inningsList.length === 1 && ms?.inningsId === 2) {
    const prev = inningsList[0];
    team1Score   = String(prev.score  ?? prev.runs   ?? '');
    team1Wickets = String(prev.wickets ?? '');
    team1Overs   = String(prev.overs  ?? '');
    target       = (parseInt(prev.score ?? prev.runs ?? 0)) + 1;
  }

  // Fallback: bowlTeam has previous innings score
  if (!team1Score && bowlScore.runs != null) {
    team1Score   = String(bowlScore.runs ?? '');
    team1Wickets = String(bowlScore.wickets ?? '');
    team1Overs   = String(bowlScore.overs  ?? '');
    if (team1Score) target = parseInt(team1Score) + 1;
  }

  // ms.target is explicitly provided sometimes
  if (!target && ms?.target) target = parseInt(ms.target);

  const crr = parseFloat(ms?.currentRunRate  || ms?.crr || 0) || null;
  const rrr = parseFloat(ms?.requiredRunRate || ms?.rrr || 0) || null;

  // ── Batsmen ───────────────────────────────────────────────────────────────
  // Cricbuzz: ms.batsman = [ { batName, batRuns, batBalls, batFours, batSixes, batStrikeRate, isStriker } ]
  const batsmenRaw = ms?.batsman || ms?.batsmanStriker
    ? [ms.batsmanStriker, ms.batsmanNonStriker].filter(Boolean)
    : ms?.batsmen || [];

  const batsmen = (Array.isArray(batsmenRaw) ? batsmenRaw : [batsmenRaw])
    .filter(Boolean)
    .slice(0, 3)
    .map(b => ({
      name:     b.batName  || b.name     || 'Unknown',
      runs:     parseInt(b.batRuns  ?? b.runs  ?? 0),
      balls:    parseInt(b.batBalls ?? b.balls ?? 0),
      fours:    parseInt(b.batFours ?? b.fours ?? b['4s'] ?? 0),
      sixes:    parseInt(b.batSixes ?? b.sixes ?? b['6s'] ?? 0),
      sr:       parseFloat(b.batStrikeRate ?? b.strikeRate ?? 0).toFixed(1),
      onStrike: b.isStriker ?? b.onStrike ?? false,
    }))
    .filter(b => b.name !== 'Unknown');

  // ── Bowler ────────────────────────────────────────────────────────────────
  // Cricbuzz: ms.bowler = { bowlName, bowlOvs, bowlMaidens, bowlRuns, bowlWkts, bowlEcon }
  const bowlerRaw  = ms?.bowler  || ms?.currentBowler || null;
  const bowlersRaw = ms?.bowlers || (bowlerRaw ? [bowlerRaw] : []);

  const bowlers = (Array.isArray(bowlersRaw) ? bowlersRaw : [bowlersRaw])
    .filter(Boolean)
    .slice(0, 2)
    .map(b => ({
      name:    b.bowlName || b.name    || 'Unknown',
      overs:   String(b.bowlOvs   ?? b.overs   ?? '0'),
      maidens: parseInt(b.bowlMaidens ?? b.maidens ?? 0),
      runs:    parseInt(b.bowlRuns    ?? b.runs    ?? 0),
      wickets: parseInt(b.bowlWkts    ?? b.wickets ?? 0),
      economy: parseFloat(b.bowlEcon  ?? b.economy ?? 0).toFixed(1),
    }))
    .filter(b => b.name !== 'Unknown');

  // ── Recent balls ──────────────────────────────────────────────────────────
  // Cricbuzz: ms.recentOvsStats = "1 0 2 W 4 ." or ms.lastFewOvers
  const recentStr = ms?.recentOvsStats || ms?.lastFewOvers || ms?.recentBalls || '';
  let recent = [];
  if (recentStr) {
    recent = recentStr
      .replace(/\|/g, ' ')
      .trim()
      .split(/\s+/)
      .map(b => {
        const u = b.toUpperCase().trim();
        if (!u || u === '.' || u === '·') return '·';
        if (u === 'W') return 'W';
        if (u === 'WD' || u === 'WIDE') return 'WD';
        if (u === 'NB' || u.startsWith('NB')) return 'NB';
        if (/^\d+$/.test(u)) return u === '0' ? '·' : u;
        return '·';
      })
      .filter(Boolean)
      .slice(-6);
  }
  while (recent.length < 6) recent.push('·');

  // ── Win probability ───────────────────────────────────────────────────────
  let winProbT1 = 50, winProbT2 = 50;
  const probRaw = ms?.winProbability
                || ms?.matchScoreDetails?.winProbability
                || data?.winProbability;

  if (probRaw && typeof probRaw === 'object') {
    const hp = parseFloat(probRaw.homeTeam ?? probRaw.team1 ?? 50);
    const ap = parseFloat(probRaw.awayTeam ?? probRaw.team2 ?? 50);
    winProbT1 = Math.round(battingTeam === meta.team1 ? ap : hp);
    winProbT2 = 100 - winProbT1;
  } else if (typeof probRaw === 'number') {
    winProbT2 = Math.round(probRaw);
    winProbT1 = 100 - winProbT2;
  } else if (rrr && crr) {
    const r = rrr / crr;
    winProbT2 = r < 0.75 ? 78 : r < 0.9 ? 66 : r < 1.0 ? 55
              : r < 1.1  ? 46 : r < 1.3  ? 37 : r < 1.6 ? 28 : 16;
    winProbT1 = 100 - winProbT2;
  } else if (rrr) {
    winProbT2 = rrr < 6 ? 78 : rrr < 8 ? 64 : rrr < 10 ? 50 : rrr < 12 ? 36 : rrr < 15 ? 22 : 12;
    winProbT1 = 100 - winProbT2;
  } else if (status === 'LIVE' && !target) {
    const proj = crr ? crr * 20 : (parseInt(score) / Math.max(parseFloat(overs), 1)) * 20;
    winProbT2 = proj > 185 ? 62 : proj > 165 ? 56 : proj > 145 ? 50 : proj > 125 ? 44 : 38;
    winProbT1 = 100 - winProbT2;
  }
  if (status === 'FINISHED') {
    const winner = result.toUpperCase();
    if (winner.includes(battingTeam)) { winProbT2 = 100; winProbT1 = 0; }
    else { winProbT1 = 100; winProbT2 = 0; }
  }
  if (['ABANDONED','POSTPONED'].includes(status)) { winProbT1 = 50; winProbT2 = 50; }

  return {
    team1:        { name: bowlingTeam },
    team2:        { name: battingTeam },
    score, wickets, overs,
    team1Score:   team1Score   || null,
    team1Wickets: team1Wickets || null,
    team1Overs:   team1Overs  || null,
    target:  target  || null,
    status, result, toss,
    winProb:   winProbT2,
    winProbT1, winProbT2,
    recent:    recent.slice(0, 6),
    batsmen:   batsmen.slice(0, 3),
    bowlers:   bowlers.slice(0, 2),
    commentary: [],
    crr, rrr,
    source:   'cricbuzz-api',
    _matchId: matchId,
    _inningsId: ms?.inningsId || 1,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3: Commentary via HTTP
// ─────────────────────────────────────────────────────────────────────────────
const getCommentary = async (matchId, inningsId = 1) => {
  const urls = [
    `https://www.cricbuzz.com/api/cricket-match/${matchId}/commentary/${inningsId}`,
    `https://www.cricbuzz.com/api/cricket-match/${matchId}/commentary`,
  ];

  for (const url of urls) {
    const data = await fetchJSON(url);
    if (!data) continue;

    const list = data?.commentary?.commentaryList
               || data?.commentaryList
               || data?.commentaries
               || [];

    if (!list.length) continue;

    const items = list.slice(0, 15).map(item => {
      const text = item.commText || item.commentary || item.text || '';
      if (!text || text.length < 5) return null;
      const over = item.overNumber != null
        ? `${item.overNumber}.${item.ballNumber ?? ''}`
        : String(item.over || '');
      const ut = text.toUpperCase();
      const type = ut.includes('WICKET') || ut.includes(' OUT') ? 'wicket'
                 : ut.includes('FOUR')   || ut.includes('SIX')  ? 'boundary'
                 : 'normal';
      return { over, text: text.substring(0, 200), type, generated: false };
    }).filter(Boolean);

    if (items.length > 0) return items;
  }
  return [];
};

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4: Enrich with scorecard (batsmen/bowler when miniscore misses them)
// ─────────────────────────────────────────────────────────────────────────────
const enrichWithScorecard = async (result, matchId) => {
  const data = await fetchJSON(`https://www.cricbuzz.com/api/cricket-scorecard/${matchId}`);
  if (!data?.scoreCard) return result;

  const innings = data.scoreCard;
  const currentInnings = innings[innings.length - 1];
  if (!currentInnings) return result;

  // Fill batsmen if missing
  if (result.batsmen.length === 0) {
    const batsmenMap = currentInnings.batTeamDetails?.batsmenData || {};
    const notOut = Object.values(batsmenMap)
      .filter(b => !b.outDesc || b.outDesc.trim() === '' || b.isNotOut)
      .slice(0, 3);

    result.batsmen = notOut.map(b => ({
      name:     b.batName  || 'Unknown',
      runs:     parseInt(b.runs  ?? 0),
      balls:    parseInt(b.balls ?? 0),
      fours:    parseInt(b.fours ?? b['4s'] ?? 0),
      sixes:    parseInt(b.sixes ?? b['6s'] ?? 0),
      sr:       parseFloat(b.strikeRate ?? 0).toFixed(1),
      onStrike: b.isStriker ?? false,
    })).filter(b => b.name !== 'Unknown');
  }

  // Fill bowlers if missing
  if (result.bowlers.length === 0) {
    const bowlersMap = currentInnings.bowlTeamDetails?.bowlersData || {};
    const recent = Object.values(bowlersMap)
      .filter(b => parseFloat(b.overs || 0) > 0)
      .slice(-2);

    result.bowlers = recent.map(b => ({
      name:    b.bowlName || 'Unknown',
      overs:   String(b.overs ?? '0'),
      maidens: parseInt(b.maidens ?? 0),
      runs:    parseInt(b.runs    ?? 0),
      wickets: parseInt(b.wickets ?? 0),
      economy: parseFloat(b.economy ?? 0).toFixed(1),
    })).filter(b => b.name !== 'Unknown');
  }

  // Fill previous innings if missing
  if (!result.team1Score && innings.length >= 2) {
    const prev = innings[innings.length - 2]?.scoreDetails;
    if (prev) {
      result.team1Score   = String(prev.runs    ?? '');
      result.team1Wickets = String(prev.wickets ?? '');
      result.team1Overs   = String(prev.overs   ?? '');
      result.target       = parseInt(prev.runs ?? 0) + 1;
    }
  }

  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT — called every 40s
// ─────────────────────────────────────────────────────────────────────────────
export const scrapeLiveMatch = async () => {

  // ══ STRATEGY 1: Pure HTTP (works on Render, no browser needed) ═══════════
  console.log('[Scraper] Trying Cricbuzz HTTP API...');

  let matchMeta = await findMatchViaHTTP();

  // If HTTP JSON fails to find match, try HTML scraping for match ID
  if (!matchMeta && CHROME_AVAILABLE) {
    console.log('[Scraper] JSON listing failed → trying browser listing...');
    matchMeta = await findMatchViaBrowser();
  }

  if (!matchMeta) {
    console.log('[Scraper] No IPL match found today. No live match in progress.');
    return null;
  }

  console.log(`🏏 Match: ${matchMeta.team1} vs ${matchMeta.team2} | ID:${matchMeta.matchId} | ${matchMeta.statusHint}`);

  // Get live score via HTTP
  let result = await getMiniscore(matchMeta.matchId, matchMeta);

  if (result) {
    // Get commentary via HTTP
    const commentary = await getCommentary(matchMeta.matchId, result._inningsId);
    if (commentary.length > 0) result.commentary = commentary;

    // Enrich batsmen/bowler via scorecard if missing
    if (result.batsmen.length === 0 || result.bowlers.length === 0) {
      console.log('[Scraper] Enriching with scorecard...');
      result = await enrichWithScorecard(result, matchMeta.matchId);
    }

    logResult(result);
    return { ...result, lastUpdated: new Date() };
  }

  // ══ STRATEGY 2: Browser scraping (fallback, only if Chrome available) ════
  if (!CHROME_AVAILABLE) {
    console.log('[Scraper] HTTP API failed. Chrome not available. Returning null.');
    return null;
  }

  console.log('[Scraper] HTTP API failed → Browser scraping...');
  return await scrapeViaBrowser(matchMeta);
};

const logResult = r => {
  console.log(`✅ [${r.source}] ${r.team1?.name} vs ${r.team2?.name} | ${r.score}/${r.wickets} (${r.overs}) | ${r.status}`);
  if (r.toss)   console.log(`   🪙 ${r.toss}`);
  if (r.result) console.log(`   🏆 ${r.result}`);
  r.batsmen?.forEach(b => console.log(`   🏏 ${b.name}${b.onStrike?'*':''}: ${b.runs}(${b.balls}) SR:${b.sr}`));
  r.bowlers?.forEach(b => console.log(`   🎯 ${b.name}: ${b.wickets}/${b.runs} (${b.overs})`));
  if (r.recent?.some(x=>x!=='·')) console.log(`   🎱 ${r.recent.join(' ')}`);
  if (r.winProbT1 !== 50) console.log(`   📊 ${r.team1?.name} ${r.winProbT1}% | ${r.team2?.name} ${r.winProbT2}%`);
  if (r.commentary?.length) console.log(`   💬 ${r.commentary.length} entries`);
};

// ─────────────────────────────────────────────────────────────────────────────
// Browser fallback — only runs when Chrome is available (local dev)
// ─────────────────────────────────────────────────────────────────────────────
let puppeteer = null;
const getPuppeteer = async () => {
  if (!puppeteer) {
    try { puppeteer = (await import('puppeteer-core')).default; } catch {
      try { puppeteer = (await import('puppeteer')).default; } catch { return null; }
    }
  }
  return puppeteer;
};

const LAUNCH = () => ({
  executablePath: CHROME_PATH,
  headless: 'new',
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--disable-gpu', '--single-process', '--no-zygote',
    '--disable-blink-features=AutomationControlled',
    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  ],
});

const findMatchViaBrowser = async () => {
  const pptr = await getPuppeteer();
  if (!pptr) return null;
  let browser;
  try {
    browser = await pptr.launch(LAUNCH());
    const page = await browser.newPage();
    await page.goto('https://www.cricbuzz.com/cricket-match/live-scores',
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(3000);

    const match = await page.evaluate(TEAMS => {
      const links = Array.from(document.querySelectorAll('a[href*="/live-cricket-scores/"]'));
      const seen = new Set(), candidates = [];
      for (const a of links) {
        const href = a.getAttribute('href') || '';
        const hu   = href.toUpperCase();
        if (seen.has(href)) continue;
        if (!hu.includes('IPL') && !hu.includes('INDIAN-PREMIER')) continue;
        const idM = href.match(/\/live-cricket-scores\/(\d+)\//);
        if (!idM) continue;
        const t = TEAMS.filter(t => hu.includes(`-${t}-`) || hu.includes(`/${t}-`) || hu.endsWith(`-${t}`));
        if (t.length < 2) continue;
        seen.add(href);
        const card   = a.closest('[class*="cb-col"]') || a.parentElement;
        const liveEl = card?.querySelector('.cb-text-live');
        const doneEl = card?.querySelector('.cb-text-complete,.cb-text-stumps');
        const hint   = liveEl ? 'LIVE' : doneEl ? 'FINISHED' : 'UPCOMING';
        candidates.push({ matchId:idM[1], cbUrl:'https://www.cricbuzz.com'+href, team1:t[0], team2:t[1], statusHint:hint, priority:hint==='LIVE'?0:hint==='FINISHED'?1:2 });
      }
      candidates.sort((a,b)=>a.priority-b.priority);
      return candidates[0]||null;
    }, TEAMS);

    await page.close(); await browser.close();
    return match;
  } catch(err) {
    if (browser) await browser.close();
    console.error('[browser listing]', err.message);
    return null;
  }
};

const scrapeViaBrowser = async matchMeta => {
  const pptr = await getPuppeteer();
  if (!pptr) return null;
  let browser;
  try {
    browser = await pptr.launch(LAUNCH());

    // Try crex.com
    let result = await scrapeCrexCom(browser, matchMeta);

    // Try Cricbuzz match page
    if (!result) {
      console.log('⚠️ crex failed → Cricbuzz page...');
      result = await scrapeCricbuzzPage(browser, matchMeta);
    }

    // Try Google (known teams only)
    if (!result) {
      console.log('⚠️ Cricbuzz page failed → Google...');
      result = await scrapeGoogle(browser, matchMeta.team1, matchMeta.team2);
    }

    await browser.close();
    if (result) { logResult(result); return { ...result, lastUpdated: new Date() }; }
    return null;
  } catch(err) {
    if (browser) await browser.close();
    console.error('❌ Browser fatal:', err.message);
    return null;
  }
};

// crex.com browser scraper
const scrapeCrexCom = async (browser, matchMeta) => {
  const page = await browser.newPage();
  try {
    await page.goto('https://crex.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await wait(2500);
    let crexUrl = await page.evaluate((t1,t2,TEAMS) => {
      for (const link of document.querySelectorAll('a[href]')) {
        const h=link.href||'',hu=h.toUpperCase(),hl=h.toLowerCase();
        if(!hl.includes('cricket-live-score')&&!hl.includes('scorecard'))continue;
        const found=TEAMS.filter(t=>hu.includes(`-${t}-`)||hu.includes(`/${t}-`));
        if(found.includes(t1)&&found.includes(t2))return h;
      }
      return null;
    }, matchMeta.team1, matchMeta.team2, TEAMS);

    if (!crexUrl) {
      await page.goto('https://crex.com/fixtures', {waitUntil:'domcontentloaded',timeout:15000});
      await wait(2000);
      crexUrl = await page.evaluate((t1,t2,TEAMS) => {
        for (const link of document.querySelectorAll('a[href]')) {
          const h=link.href||'',hu=h.toUpperCase();
          const found=TEAMS.filter(t=>hu.includes(`-${t}-`)||hu.includes(`/${t}-`));
          if(found.includes(t1)&&found.includes(t2))return h;
        }
        return null;
      }, matchMeta.team1, matchMeta.team2, TEAMS);
    }

    if (!crexUrl) { await page.close(); return null; }
    console.log(`🔗 [crex] ${crexUrl}`);
    await page.goto(crexUrl, {waitUntil:'networkidle2',timeout:30000});
    await wait(5000);

    const raw = await page.evaluate((TEAMS,t1,t2) => {
      const body=document.body?.innerText||'';
      if(body.length<100||body.includes('YET TO BEGIN'))return null;
      let team1=t1,team2=t2;
      const vsM=(document.title+' '+(document.querySelector('h1,h2')?.innerText||'')).toUpperCase().match(/\b([A-Z]{2,4})\s+VS?\s+([A-Z]{2,4})\b/);
      if(vsM&&TEAMS.includes(vsM[1])&&TEAMS.includes(vsM[2])){team1=vsM[1];team2=vsM[2];}
      const tossRx=/(KKR|MI|CSK|RCB|RR|PBKS|DC|GT|LSG|SRH)\s+(?:opt(?:ed)?|chose|elected)\s+to\s+(bat|bowl|field)/i;
      const tossM=body.match(tossRx);
      let toss=null,battingFirstTeam=null;
      if(tossM){const tosser=tossM[1].toUpperCase(),choice=tossM[2].toLowerCase();battingFirstTeam=choice==='bat'?tosser:(tosser===team1?team2:team1);toss=`${tosser} chose to ${choice}`;}
      const upper=body.toUpperCase();let status='LIVE',result='';
      if(upper.includes('RAIN DELAY')||upper.includes('COVERS ON'))status='RAIN DELAY';
      else if(upper.includes('ABANDONED')||(upper.includes('NO RESULT')&&!upper.includes('YET TO'))){status='ABANDONED';result='Match Abandoned';}
      else if(upper.includes('INNINGS BREAK')||upper.includes('INNS BREAK'))status='INNINGS BREAK';
      const wonRx=new RegExp(`\\b(${TEAMS.join('|')})\\b\\s+won\\s+by\\s+([\\d]+\\s+(?:runs?|wickets?))`, 'i');
      const wonM=body.match(wonRx);
      if(wonM&&(wonM[1].toUpperCase()===team1||wonM[1].toUpperCase()===team2)){status='FINISHED';result=`${wonM[1].toUpperCase()} won by ${wonM[2]}`;}
      const sRx=team=>{for(const rx of[new RegExp(`\\b${team}\\b[^\\n]{0,25}(\\d{1,3})[\\-/](\\d{1,2})[^\\d\\n]{0,15}(\\d{1,2}\\.\\d)`,'i'),new RegExp(`(\\d{1,3})[\\-/](\\d{1,2})[^\\d\\n]{0,15}(\\d{1,2}\\.\\d)[^\\n]{0,25}\\b${team}\\b`,'i'),new RegExp(`\\b${team}\\b[^\\n]{0,25}(\\d{1,3})[\\-/](\\d{1,2})`,'i')]){const m=body.match(rx);if(m&&parseInt(m[1])>=0)return{runs:m[1],wkts:m[2],overs:m[3]||null};}return null;};
      const s1=sRx(team1),s2=sRx(team2);
      const crrM=body.match(/CRR\s*:?\s*([\d.]+)/i),rrrM=body.match(/(?:RRR|Req\s*RR)\s*:?\s*([\d.]+)/i),targetM=body.match(/[Tt]arget\s*:?\s*(\d{2,3})/);
      const crr=crrM?parseFloat(crrM[1]):null,rrr=rrrM?parseFloat(rrrM[1]):null,target=targetM?parseInt(targetM[1]):null;
      const yetTeam=body.match(new RegExp(`(${TEAMS.join('|')})[^\\n]{0,50}[Yy]et\\s+to\\s+[Bb]at`))?.[1]?.toUpperCase()||null;
      let battingTeam,bowlingTeam,score,wickets,overs,fS=null,fW=null,fO=null,dT=target;
      if(s1&&s2){const o1=s1.overs?parseFloat(s1.overs):20,o2=s2.overs?parseFloat(s2.overs):20;if(yetTeam){bowlingTeam=yetTeam;battingTeam=yetTeam===team1?team2:team1;}else if(status==='FINISHED'&&wonM){battingTeam=wonM[1].toUpperCase();bowlingTeam=battingTeam===team1?team2:team1;}else if(status==='INNINGS BREAK'){const fb=battingFirstTeam||(o1>=o2?team1:team2);battingTeam=fb===team1?team2:team1;bowlingTeam=fb;}else{battingTeam=o2<=o1?team2:team1;bowlingTeam=battingTeam===team1?team2:team1;}if(battingTeam===team2){fS=s1.runs;fW=s1.wkts;fO=s1.overs||'20';score=s2.runs;wickets=s2.wkts;overs=s2.overs||'0.0';}else{fS=s2.runs;fW=s2.wkts;fO=s2.overs||'20';score=s1.runs;wickets=s1.wkts;overs=s1.overs||'0.0';}if(!dT&&fS)dT=parseInt(fS)+1;}else if(s1||s2){const s=s1||s2;battingTeam=battingFirstTeam||(yetTeam?(yetTeam===team1?team2:team1):(s1?team1:team2));bowlingTeam=battingTeam===team1?team2:team1;score=s.runs;wickets=s.wkts;overs=s.overs||'0.0';}else if(['ABANDONED','RAIN DELAY','POSTPONED'].includes(status)){battingTeam=battingFirstTeam||team1;bowlingTeam=battingTeam===team1?team2:team1;score='0';wickets='0';overs='0.0';}else return null;
      const batsmen=[];Array.from(document.querySelectorAll('[class*="batsman"],[class*="batter"],[class*="batting-player"],[class*="striker"]')).slice(0,3).forEach(card=>{const ct=card.innerText?.trim()||'';const name=(card.querySelector('[class*="name"]')?.innerText||ct.split('\n')[0]).replace(/[*†✏🖊]/g,'').trim();if(!name||name.length<2||name.length>35)return;const rbM=ct.match(/(\d+)\s*\((\d+)\)/);if(!rbM)return;const runs=parseInt(rbM[1])||0,balls=parseInt(rbM[2])||0;batsmen.push({name,runs,balls,fours:0,sixes:0,sr:balls?((runs/balls)*100).toFixed(1):'0.0',onStrike:ct.includes('🖊')||ct.includes('*')});});
      if(batsmen.length<1){const bRx=/([A-Z][a-z]+(?:\s+[A-Z][a-z.]+){1,3})\s+(\d+)\s*\((\d+)\)/g;[...body.matchAll(bRx)].slice(0,3).forEach(m=>{const name=m[1].trim();if(name.length<2||name.length>35)return;const runs=parseInt(m[2])||0,balls=parseInt(m[3])||0;batsmen.push({name,runs,balls,fours:0,sixes:0,sr:balls?((runs/balls)*100).toFixed(1):'0.0',onStrike:body.includes(m[1]+'*')});});}
      const bowlers=[];Array.from(document.querySelectorAll('[class*="bowler-card"],[class*="bowling-player"],[class*="current-bowler"]')).slice(0,2).forEach(card=>{const ct=card.innerText?.trim()||'';const name=(card.querySelector('[class*="name"]')?.innerText||ct.split('\n')[0]).replace(/†/g,'').trim();if(!name||name.length<2||name.length>35)return;const bM=ct.match(/(\d+)[–\-](\d+)\s*\((\d+\.?\d*)\)/);if(bM)bowlers.push({name,wickets:parseInt(bM[1]),runs:parseInt(bM[2]),overs:bM[3],maidens:0,economy:parseFloat(bM[3])?(parseInt(bM[2])/parseFloat(bM[3])).toFixed(1):'0.0'});});
      if(bowlers.length<1){const bwRx=/([A-Z][a-z]+(?:\s+[A-Z][a-z.]+){1,3})\s+(\d+)[–\-](\d+)\s*\((\d+\.?\d*)\)/g;[...body.matchAll(bwRx)].slice(0,2).forEach(m=>{const name=m[1].trim();if(name.length<2||name.length>35)return;bowlers.push({name,wickets:parseInt(m[2]),runs:parseInt(m[3]),overs:m[4],maidens:0,economy:parseFloat(m[4])?(parseInt(m[3])/parseFloat(m[4])).toFixed(1):'0.0'});});}
      const recent=[];const badges=Array.from(document.querySelectorAll('[class*="ball-badge"],[class*="ball-item"],[class*="over-ball"],[class*="ball-score"]'));if(badges.length>=3)badges.slice(-8).forEach(el=>{const t=el.innerText?.trim().toUpperCase().replace(/\s+/g,'');if(t&&t.length<=3&&/^[\dW·N]/.test(t)&&t!=='■')recent.push(t==='N'?'·':t);});if(recent.length<3){const overRx=/Over\s+\d+\s+((?:(?:\d|W|WD|NB|■)\s*){1,8})/g;[...body.matchAll(overRx)].slice(-2).forEach(om=>{om[1].trim().split(/\s+/).forEach(b=>{if(b==='■'||!b)return;if(/^[\dW]$/.test(b)||b==='WD'||b==='NB')recent.push(b.toUpperCase());});});}while(recent.length<6)recent.push('·');
      const commentary=[];const parseComm=els=>els.forEach(el=>{const text=el.innerText?.trim();if(!text||text.length<10||text.length>500)return;const ut=text.toUpperCase();const type=ut.includes(' OUT')||ut.includes('WICKET')?'wicket':ut.includes('FOUR')||ut.includes(' SIX')?'boundary':'normal';const over=text.match(/^(\d+\.\d+)/)?.[1]||text.match(/(\d+\.\d+)\s*:/)?.[1]||'';if(!commentary.some(c=>c.text===text.substring(0,200)))commentary.push({over,text:text.substring(0,200),type,generated:false});});parseComm(Array.from(document.querySelectorAll('[class*="comm-item"],[class*="commentary-item"],[class*="feed-item"],[class*="update-item"]')).slice(0,12));if(commentary.length<3)parseComm(Array.from(document.querySelectorAll('p,li')).filter(el=>{const t=el.innerText?.trim()||'';return t.length>15&&t.length<500&&(t.includes('IST')||/^\d+\.\d+/.test(t));}).slice(0,10));
      let wP1=50,wP2=50;for(const c of document.querySelectorAll('[class*="probability"],[class*="win-prob"],[class*="match-prob"]')){const t=c.innerText||'';const pcts=[...t.matchAll(/(\d{1,3})\s*%/g)].map(m=>parseInt(m[1]));if(pcts.length>=2&&Math.abs(pcts[0]+pcts[1]-100)<=5){const btp=t.toUpperCase().indexOf(battingTeam),bop=t.toUpperCase().indexOf(bowlingTeam);if(btp<bop){wP2=pcts[0];wP1=pcts[1];}else{wP1=pcts[0];wP2=pcts[1];}break;}}
      if(wP1===50){const p1M=body.match(new RegExp(`\\b${battingTeam}\\b[^%\\d]*(\\d{1,3})\\s*%`,'i')),p2M=body.match(new RegExp(`\\b${bowlingTeam}\\b[^%\\d]*(\\d{1,3})\\s*%`,'i'));if(p1M&&p2M){const p1=parseInt(p1M[1]),p2=parseInt(p2M[1]);if(Math.abs(p1+p2-100)<=5){wP2=p1;wP1=p2;}}}
      if(wP1===50&&rrr&&crr){const r=rrr/crr;wP2=r<0.75?78:r<0.9?66:r<1.0?55:r<1.1?47:r<1.3?38:r<1.6?28:16;wP1=100-wP2;}else if(wP1===50&&rrr){wP2=rrr<6?78:rrr<8?64:rrr<10?50:rrr<12?36:rrr<15?22:12;wP1=100-wP2;}
      if(status==='FINISHED'&&wonM){const w=wonM[1].toUpperCase();wP1=w===bowlingTeam?100:0;wP2=w===battingTeam?100:0;}
      return {battingTeam,bowlingTeam,score:String(score||'0'),wickets:String(wickets||'0'),overs:String(overs||'0.0'),team1Score:fS?String(fS):null,team1Wickets:fW?String(fW):null,team1Overs:fO?String(fO):null,target:dT||null,crr,rrr,status,result,toss,winProbT1:wP1,winProbT2:wP2,recent:recent.slice(0,6),batsmen:batsmen.slice(0,3),bowlers:bowlers.slice(0,2),commentary:commentary.slice(0,12)};
    }, TEAMS, matchMeta.team1, matchMeta.team2);

    await page.close();
    if(!raw)return null;
    return {team1:{name:raw.bowlingTeam},team2:{name:raw.battingTeam},score:raw.score,wickets:raw.wickets,overs:raw.overs,team1Score:raw.team1Score,team1Wickets:raw.team1Wickets,team1Overs:raw.team1Overs,target:raw.target,status:raw.status,result:raw.result,toss:raw.toss,winProb:raw.winProbT2,winProbT1:raw.winProbT1,winProbT2:raw.winProbT2,recent:raw.recent,batsmen:raw.batsmen,bowlers:raw.bowlers,commentary:raw.commentary,crr:raw.crr,rrr:raw.rrr,source:'crex.com'};
  } catch(err){await page.close().catch(()=>{});console.error('[crex]',err.message);return null;}
};

// Cricbuzz match page browser scraper
const scrapeCricbuzzPage = async (browser, matchMeta) => {
  const page = await browser.newPage();
  try {
    const url = matchMeta.cbUrl || `https://www.cricbuzz.com/live-cricket-scorecard/${matchMeta.matchId}`;
    await page.goto(url, {waitUntil:'domcontentloaded',timeout:30000});
    await wait(4000);
    const raw = await page.evaluate((TEAMS,t1,t2) => {
      const body=document.body?.innerText||'';if(body.length<200)return null;
      const upper=body.toUpperCase();let status='LIVE',result='';
      if(upper.includes('RAIN')&&(upper.includes('DELAY')||upper.includes('STOP')))status='RAIN DELAY';
      else if(upper.includes('ABANDONED')){status='ABANDONED';result='Match Abandoned';}
      else if(upper.includes('INNINGS BREAK'))status='INNINGS BREAK';
      const wonRx=new RegExp(`\\b(${TEAMS.join('|')})\\b\\s+won\\s+by\\s+([\\d]+\\s+(?:runs?|wickets?))`, 'i');
      const wonM=body.match(wonRx);if(wonM&&(wonM[1].toUpperCase()===t1||wonM[1].toUpperCase()===t2)){status='FINISHED';result=`${wonM[1].toUpperCase()} won by ${wonM[2]}`;}
      const tossEl=document.querySelector('.cb-toss-sts');let toss=tossEl?.innerText?.trim()||null,battingFirstTeam=null;
      const optM=body.match(/(KKR|MI|CSK|RCB|RR|PBKS|DC|GT|LSG|SRH)\s+(?:opt|chose|elected)\s+to\s+(bat|bowl|field)/i);
      if(optM){const tosser=optM[1].toUpperCase(),choice=optM[2].toLowerCase();battingFirstTeam=choice==='bat'?tosser:(tosser===t1?t2:t1);if(!toss)toss=`${tosser} chose to ${choice}`;}
      const ls=team=>{const m=body.match(new RegExp(`\\b${team}\\b[^\\d\\n]{0,20}(\\d{1,3})[/\\-](\\d{1,2})(?:[^\\d]*(\\d{1,2}\\.\\d))?`,'i'));return m&&parseInt(m[1])>=0?{runs:m[1],wkts:m[2],overs:m[3]||null}:null;};
      const s1=ls(t1),s2=ls(t2);
      const crrM=body.match(/CRR\s*:?\s*([\d.]+)/i),rrrM=body.match(/RRR\s*:?\s*([\d.]+)/i),targetM=body.match(/[Tt]arget\s*:?\s*(\d{2,3})/);
      const crr=crrM?parseFloat(crrM[1]):null,rrr=rrrM?parseFloat(rrrM[1]):null,target=targetM?parseInt(targetM[1]):null;
      const yetTeam=body.match(new RegExp(`(${TEAMS.join('|')})[^\\n]{0,50}[Yy]et\\s+to\\s+[Bb]at`))?.[1]?.toUpperCase()||null;
      let battingTeam=t2,bowlingTeam=t1,score,wickets,overs,fs=null,fw=null,fo=null,dT=target;
      if(s1&&s2){const o1=s1.overs?parseFloat(s1.overs):20,o2=s2.overs?parseFloat(s2.overs):20;if(yetTeam){bowlingTeam=yetTeam;battingTeam=yetTeam===t1?t2:t1;}else if(status==='FINISHED'&&wonM){battingTeam=wonM[1].toUpperCase();bowlingTeam=battingTeam===t1?t2:t1;}else if(status==='INNINGS BREAK'){const fb=battingFirstTeam||(o1>=o2?t1:t2);battingTeam=fb===t1?t2:t1;bowlingTeam=fb;}else{battingTeam=o2<=o1?t2:t1;bowlingTeam=battingTeam===t1?t2:t1;}if(battingTeam===t2){fs=s1.runs;fw=s1.wkts;fo=s1.overs||'20';score=s2.runs;wickets=s2.wkts;overs=s2.overs||'0.0';}else{fs=s2.runs;fw=s2.wkts;fo=s2.overs||'20';score=s1.runs;wickets=s1.wkts;overs=s1.overs||'0.0';}if(!dT&&fs)dT=parseInt(fs)+1;}else if(s1||s2){const s=s1||s2;battingTeam=battingFirstTeam||(yetTeam?(yetTeam===t1?t2:t1):(s1?t1:t2));bowlingTeam=battingTeam===t1?t2:t1;score=s.runs;wickets=s.wkts;overs=s.overs||'0.0';}else if(['ABANDONED','RAIN DELAY'].includes(status)){score='0';wickets='0';overs='0.0';}else return null;
      const batsmen=[],bowlers=[],recent=[],commentary=[];
      Array.from(document.querySelectorAll('.cb-min-bat-rw')).forEach(row=>{const cells=Array.from(row.querySelectorAll('.cb-col'));const nameEl=cells.find(c=>{const t=c.innerText?.trim();return t?.length>2&&!/^\d/.test(t)&&!['R','B','4s','6s','SR','Batter','M'].includes(t);});const name=nameEl?.innerText?.replace(/[*†(c)]+/g,'').trim();if(!name||name.length<2||name.length>35)return;const nums=cells.map(c=>c.innerText?.trim()).filter(t=>/^\d+\.?\d*$/.test(t)).map(Number);if(nums.length<2)return;batsmen.push({name,runs:nums[0]||0,balls:nums[1]||0,fours:nums[2]||0,sixes:nums[3]||0,sr:nums[1]?((nums[0]/nums[1])*100).toFixed(1):'0.0',onStrike:row.innerText?.includes('*')||false});});
      Array.from(document.querySelectorAll('.cb-min-fld-rw')).forEach(row=>{const cells=Array.from(row.querySelectorAll('.cb-col'));const nameEl=cells.find(c=>{const t=c.innerText?.trim();return t?.length>2&&!/^\d/.test(t)&&!['O','M','R','W','Eco','Bowler'].includes(t);});const name=nameEl?.innerText?.trim();if(!name||name.length<2||name.length>35)return;const nums=cells.map(c=>c.innerText?.trim()).filter(t=>/^\d+\.?\d*$/.test(t)).map(Number);if(nums.length<3)return;bowlers.push({name,overs:nums[0]?.toString()||'0',maidens:nums[1]||0,runs:nums[2]||0,wickets:nums[3]||0,economy:nums[0]?(nums[2]/nums[0]).toFixed(1):'0.0'});});
      Array.from(document.querySelectorAll('[class*="cb-col-90"]')).slice(0,8).forEach(el=>{const text=el.innerText?.trim()||'';if(!/^\d+\.\d+/.test(text))return;const lt=text.toLowerCase();let b='·';if(lt.includes(' out')||lt.includes('wicket'))b='W';else if(lt.includes('six')||lt.includes('6!'))b='6';else if(lt.includes('four')||lt.includes('4!'))b='4';else if(lt.includes('wide'))b='WD';else if(lt.includes('no ball'))b='NB';else{const rm=lt.match(/\b(\d)\s+run/);b=rm?rm[1]:'·';}recent.unshift(b);});recent.splice(6);while(recent.length<6)recent.push('·');
      Array.from(document.querySelectorAll('[class*="cb-col-90"]')).slice(0,12).forEach(el=>{const text=el.innerText?.trim();if(!text||text.length<8||text.length>300)return;const ut=text.toUpperCase();const type=ut.includes(' OUT')||ut.includes('WICKET')?'wicket':ut.includes('FOUR')||ut.includes(' SIX')?'boundary':'normal';const over=text.match(/^(\d+\.\d+)/)?.[1]||'';if(!commentary.some(c=>c.text===text.substring(0,150)))commentary.push({over,text:text.substring(0,150),type,generated:false});});
      let wP1=50,wP2=50;if(status==='FINISHED'&&wonM){const w=wonM[1].toUpperCase();wP1=w===bowlingTeam?100:0;wP2=w===battingTeam?100:0;}else if(rrr&&crr){const r=rrr/crr;wP2=r<0.75?78:r<0.9?66:r<1.0?55:r<1.1?47:r<1.3?38:28;wP1=100-wP2;}else if(rrr){wP2=rrr<6?78:rrr<8?64:rrr<10?50:rrr<12?36:20;wP1=100-wP2;}
      return {battingTeam,bowlingTeam,score:String(score||'0'),wickets:String(wickets||'0'),overs:String(overs||'0.0'),team1Score:fs?String(fs):null,team1Wickets:fw?String(fw):null,team1Overs:fo?String(fo):null,target:dT||null,crr,rrr,status,result,toss,winProbT1:wP1,winProbT2:wP2,recent,batsmen:batsmen.slice(0,3),bowlers:bowlers.slice(0,2),commentary:commentary.slice(0,10)};
    }, TEAMS, matchMeta.team1, matchMeta.team2);
    await page.close();
    if(!raw)return null;
    return {team1:{name:raw.bowlingTeam},team2:{name:raw.battingTeam},score:raw.score,wickets:raw.wickets,overs:raw.overs,team1Score:raw.team1Score,team1Wickets:raw.team1Wickets,team1Overs:raw.team1Overs,target:raw.target,status:raw.status,result:raw.result,toss:raw.toss,winProb:raw.winProbT2,winProbT1:raw.winProbT1,winProbT2:raw.winProbT2,recent:raw.recent,batsmen:raw.batsmen,bowlers:raw.bowlers,commentary:raw.commentary,crr:raw.crr,rrr:raw.rrr,source:'cricbuzz'};
  } catch(err){await page.close().catch(()=>{});console.error('[CB page]',err.message);return null;}
};

// Google browser fallback
const scrapeGoogle = async (browser, t1, t2) => {
  const page = await browser.newPage();
  try {
    await page.goto(`https://www.google.com/search?q=${encodeURIComponent(`${t1} vs ${t2} IPL 2026 live score`)}&hl=en`,{waitUntil:'domcontentloaded',timeout:25000});
    await wait(3000);
    const raw = await page.evaluate((TEAMS,t1,t2) => {
      const ws=['.liveticker','.liveresults-sports-immersive__match-tile','.imso_mh__ma-cont','[jsname="ESiMyd"]','.imspo_mt__mtch-cont'];
      let widget=null;for(const s of ws){const el=document.querySelector(s);if(el?.innerText?.length>30){widget=el;break;}}
      if(!widget)widget=Array.from(document.querySelectorAll('div')).find(d=>{const t=d.innerText||'';return/\d{2,3}[\/\-]\d{1,2}/.test(t)&&t.length<4000&&t.length>40;})||null;
      const text=widget?.innerText?.trim()||'';if(!text)return null;
      if(!text.toUpperCase().includes(t1)||!text.toUpperCase().includes(t2))return null;
      const sW=[...text.matchAll(/(\d{2,3})\s*[\/\-]\s*(\d{1,2})\s*\(\s*(\d{1,2}\.?\d?)\s*\)/g)];
      const sN=[...text.matchAll(/(\d{2,3})\s*[\/\-]\s*(\d{1,2})(?!\s*[\(\d])/g)];
      const aS=sW.length>0?sW:sN;if(!aS.length)return null;
      const oversM=text.match(/(\d{1,2}\.\d)\s*(?:ov|overs?)/i);const extractedOvers=oversM?.[1]||null;
      const upper=text.toUpperCase();let status='LIVE',result='';
      const wonRx=new RegExp(`\\b(${TEAMS.join('|')})\\b\\s+won\\s+by\\s+([\\d]+\\s+(?:runs?|wickets?))`, 'i');
      const wonM=text.match(wonRx);if(wonM&&(wonM[1].toUpperCase()===t1||wonM[1].toUpperCase()===t2)){status='FINISHED';result=`${wonM[1].toUpperCase()} won by ${wonM[2]}`;}
      else if(upper.includes('RAIN'))status='RAIN DELAY';else if(upper.includes('INNINGS BREAK'))status='INNINGS BREAK';
      const crrM=text.match(/CRR\s*:?\s*([\d.]+)/i),rrrM=text.match(/RRR\s*:?\s*([\d.]+)/i),tgtM=text.match(/[Tt]arget[:\s]*(\d{2,3})/);
      const crr=crrM?parseFloat(crrM[1]):null,rrr=rrrM?parseFloat(rrrM[1]):null,tgt=tgtM?parseInt(tgtM[1]):null;
      const ls1=(()=>{const m=text.match(new RegExp(`\\b${t1}\\b[^\\d]{0,15}(\\d{1,3})[/\\-](\\d{1,2})(?:\\s*\\((\\d{1,2}\\.?\\d?)\\))?`,'i'));return m&&parseInt(m[1])>=0?{runs:m[1],wkts:m[2],overs:m[3]}:null;})();
      const ls2=(()=>{const m=text.match(new RegExp(`\\b${t2}\\b[^\\d]{0,15}(\\d{1,3})[/\\-](\\d{1,2})(?:\\s*\\((\\d{1,2}\\.?\\d?)\\))?`,'i'));return m&&parseInt(m[1])>=0?{runs:m[1],wkts:m[2],overs:m[3]}:null;})();
      const yetTeam=text.match(new RegExp(`(${TEAMS.join('|')})[^\\n]{0,50}[Yy]et\\s+to\\s+[Bb]at`))?.[1]?.toUpperCase()||null;
      let bT=t2,bowT=t1,score,wkts,overs,fS=null,fW=null,fO=null,dT=tgt;
      if(ls1&&ls2){const o1=ls1.overs?parseFloat(ls1.overs):20,o2=ls2.overs?parseFloat(ls2.overs):20;if(yetTeam){bT=yetTeam===t1?t2:t1;bowT=yetTeam;}else if(status==='FINISHED'&&wonM){bT=wonM[1].toUpperCase();bowT=bT===t1?t2:t1;}else{bT=o2<=o1?t2:t1;bowT=bT===t1?t2:t1;}if(bT===t2){fS=ls1.runs;fW=ls1.wkts;fO=ls1.overs||'20';score=ls2.runs;wkts=ls2.wkts;overs=ls2.overs||extractedOvers||'0.0';}else{fS=ls2.runs;fW=ls2.wkts;fO=ls2.overs||'20';score=ls1.runs;wkts=ls1.wkts;overs=ls1.overs||extractedOvers||'0.0';}if(!dT&&fS)dT=parseInt(fS)+1;}else{const s=aS[aS.length-1];score=s[1];wkts=s[2];overs=s[3]||extractedOvers||'0.0';}
      let wP1=50,wP2=50;const pm1=text.match(new RegExp(`\\b${bT}\\b[^%\\d]*(\\d{1,3})\\s*%`,'i')),pm2=text.match(new RegExp(`\\b${bowT}\\b[^%\\d]*(\\d{1,3})\\s*%`,'i'));if(pm1&&pm2){const p1=parseInt(pm1[1]),p2=parseInt(pm2[1]);if(Math.abs(p1+p2-100)<=5){wP2=p1;wP1=p2;}}if(wP1===50&&rrr){wP2=rrr<6?78:rrr<8?64:rrr<10?50:rrr<12?36:20;wP1=100-wP2;}if(status==='FINISHED'&&wonM){const w=wonM[1].toUpperCase();wP1=w===bowT?100:0;wP2=w===bT?100:0;}
      const recent=[];const seqM=text.match(/\b([0-6W]|WD|NB)\s+([0-6W]|WD|NB)\s+([0-6W]|WD|NB)\s+([0-6W]|WD|NB)\s+([0-6W]|WD|NB)\s+([0-6W]|WD|NB)\b/i);if(seqM){for(let i=1;i<=6;i++)recent.push(seqM[i].toUpperCase());}while(recent.length<6)recent.push('·');
      return {battingTeam:bT,bowlingTeam:bowT,score:score||'0',wickets:wkts||'0',overs:overs||'0.0',team1Score:fS||null,team1Wickets:fW||null,team1Overs:fO||null,target:dT||null,crr,rrr,status,result,toss:null,winProbT1:wP1,winProbT2:wP2,recent,batsmen:[],bowlers:[],commentary:[]};
    }, TEAMS, t1, t2);
    await page.close();
    if(!raw)return null;
    return {team1:{name:raw.bowlingTeam},team2:{name:raw.battingTeam},score:raw.score,wickets:raw.wickets,overs:raw.overs,team1Score:raw.team1Score,team1Wickets:raw.team1Wickets,team1Overs:raw.team1Overs,target:raw.target,status:raw.status,result:raw.result,toss:raw.toss,winProb:raw.winProbT2,winProbT1:raw.winProbT1,winProbT2:raw.winProbT2,recent:raw.recent,batsmen:raw.batsmen,bowlers:raw.bowlers,commentary:raw.commentary,crr:raw.crr,rrr:raw.rrr,source:'google'};
  } catch(err){await page.close().catch(()=>{});console.error('[Google]',err.message);return null;}
};

// ─────────────────────────────────────────────────────────────────────────────
// STANDINGS + STATS — called every 12h (pure HTTP, no browser)
// ─────────────────────────────────────────────────────────────────────────────
export const scrapeIPLStandingsAndStats = async () => {
  let pointsTable = null, orangeCap = null, purpleCap = null;
  let topBatsmen = [], topBowlers = [];

  // Try multiple series IDs
  for (const sid of CB_SERIES_IDS) {
    if (pointsTable && topBatsmen.length > 0) break;

    try {
      // Points table
      if (!pointsTable) {
        const data = await fetchJSON(`https://www.cricbuzz.com/api/cricket-series/${sid}/standings`);
        if (data) {
          const rows = data?.pointsTable?.[0]?.pointsTableInfo
                    || data?.pointsTableInfo
                    || data?.standings || [];

          if (Array.isArray(rows) && rows.length >= 4) {
            const table = rows.map(r => ({
              team:   matchTeamName(r.teamSName||r.teamShortName||'', r.teamName||'') || '',
              played: parseInt(r.matchesPlayed || r.played || 0),
              won:    parseInt(r.matchesWon    || r.won    || 0),
              lost:   parseInt(r.matchesLost   || r.lost   || 0),
              pts:    parseInt(r.points        || r.pts    || 0),
              nrr:    parseFloat(r.nrr         || 0).toFixed(3),
            })).filter(t => TEAMS.includes(t.team)).sort((a,b)=>b.pts-a.pts);

            if (table.length >= 4) {
              pointsTable = table;
              console.log(`📊 [CB JSON sid=${sid}] Points table: ${table.length} teams`);
            }
          }
        }
      }

      // Stats
      if (topBatsmen.length === 0) {
        const [batting, bowling] = await Promise.all([
          fetchJSON(`https://www.cricbuzz.com/api/cricket-series/${sid}/stats?statsType=mostRuns`),
          fetchJSON(`https://www.cricbuzz.com/api/cricket-series/${sid}/stats?statsType=mostWickets`),
        ]);

        const parsePlayers = (data, type) => {
          const list = data?.statsDetails?.[0]?.playerStatsList
                    || data?.values?.[0]?.playerStats
                    || data?.statsList || data?.values || [];
          return (Array.isArray(list) ? list : []).slice(0, 10).map(p => ({
            name:    p.playerName || p.name || '',
            team:    (p.teamSName || '').toUpperCase(),
            runs:    type==='bat'  ? parseInt(p.runs    || p.value || 0) : undefined,
            wickets: type==='bowl' ? parseInt(p.wickets || p.value || 0) : undefined,
          })).filter(p => p.name.length > 2);
        };

        const bats  = parsePlayers(batting,  'bat').sort((a,b)=>(b.runs||0)-(a.runs||0));
        const bowls = parsePlayers(bowling, 'bowl').sort((a,b)=>(b.wickets||0)-(a.wickets||0));

        if (bats.length > 0 || bowls.length > 0) {
          topBatsmen = bats; topBowlers = bowls;
          orangeCap  = bats[0]  || null;
          purpleCap  = bowls[0] || null;
          console.log(`📊 [CB JSON sid=${sid}] Orange:${orangeCap?.name} | Purple:${purpleCap?.name}`);
        }
      }
    } catch(e) { console.log(`[standings sid=${sid}]`, e.message); }
  }

  // Browser fallback for standings if HTTP failed and Chrome is available
  if ((!pointsTable || !orangeCap) && CHROME_AVAILABLE) {
    const pptr = await getPuppeteer();
    if (pptr) {
      let browser;
      try {
        browser = await pptr.launch(LAUNCH());
        const page = await browser.newPage();

        if (!pointsTable) {
          await page.goto('https://www.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/points-table',
            {waitUntil:'domcontentloaded',timeout:20000});
          await wait(3000);
          const table = await page.evaluate(TEAMS => {
            const rows=Array.from(document.querySelectorAll('.cb-srs-pnts tbody tr,.cb-srs-pnts tr'));
            const out=[];
            rows.forEach(row=>{const cells=Array.from(row.querySelectorAll('td'));if(cells.length<5)return;const txt=cells[0]?.innerText?.trim().toUpperCase()||'';const team=TEAMS.find(t=>txt.includes(t));if(!team)return;const nums=cells.slice(1).map(c=>c.innerText.trim());const pts=nums.find(n=>/^\d+$/.test(n)&&parseInt(n)<=28);const nrr=nums.find(n=>/^[+\-]?\d+\.\d+$/.test(n));if(!pts)return;out.push({team,played:parseInt(nums[0])||0,won:parseInt(nums[1])||0,lost:parseInt(nums[2])||0,pts:parseInt(pts)||0,nrr:nrr||'0.000'});});
            return out.length>=4?out.sort((a,b)=>b.pts-a.pts):null;
          }, TEAMS);
          if (table) { pointsTable=table; console.log(`📊 [CB HTML] Points table: ${table.length} teams`); }
        }

        await page.close(); await browser.close();
      } catch(err) { if(browser) await browser.close(); }
    }
  }

  return {
    pointsTable: pointsTable || [],
    orangeCap:   orangeCap  || null,
    purpleCap:   purpleCap  || null,
    topBatsmen,
    topBowlers,
    lastUpdated: new Date(),
    source: pointsTable ? 'cricbuzz' : 'fallback',
  };
};

export const scrapeIPLStandings = scrapeIPLStandingsAndStats;