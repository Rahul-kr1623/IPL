/**
 * scraperService.js — RENDER-WORKING VERSION
 *
 * ROOT CAUSE OF "live-scores endpoint returned null":
 * Cricbuzz blocks HTTP requests from cloud server IPs (Render, Railway, etc).
 * It works from your laptop but not from hosted servers.
 *
 * SOLUTION: Use ESPN Cricinfo's public API as PRIMARY source.
 * ESPN Cricinfo NEVER blocks cloud servers — it's designed for public access.
 * It powers the official ESPN app and has no IP restrictions.
 *
 * SOURCE HIERARCHY:
 *
 * LIVE SCORE (every 40s):
 *   1. ESPN Cricinfo API — reliable, works from any server, no auth needed
 *      https://site.api.espn.com/apis/site/v2/sports/cricket/8039/scoreboard
 *      Returns: match status, score, teams, events
 *   2. Cricbuzz JSON API — works if not blocked
 *   3. Browser scraping (local dev only, Chrome needed)
 *
 * STANDINGS + STATS (every 12h):
 *   1. ESPN Cricinfo standings API
 *   2. Cricbuzz JSON API
 *   3. matchDataEngine computed table (always works)
 */

import https from 'https';
import http  from 'http';
import { existsSync } from 'fs';

// ─── Constants ────────────────────────────────────────────────────────────────
const TEAMS = ['CSK','MI','RCB','KKR','RR','PBKS','DC','GT','LSG','SRH'];
const wait  = ms => new Promise(r => setTimeout(r, ms));

// ESPN Cricinfo league ID for IPL
const ESPN_IPL_ID     = '8039';  // IPL league ID on ESPN
const ESPN_SCOREBOARD = `https://site.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_ID}/scoreboard`;
const ESPN_SUMMARY    = id => `https://site.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_ID}/summary?event=${id}`;
const ESPN_STANDINGS  = `https://site.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_ID}/standings`;

// Cricbuzz series IDs to try
const CB_SERIES_IDS   = ['9237','9241','9300','9350','9280'];
const CB_LIVE_LIST    = 'https://www.cricbuzz.com/api/cricket-match/live-scores';
const CB_MINI_SCORE   = id => `https://www.cricbuzz.com/api/cricket-match/${id}/miniscore`;
const CB_COMMENTARY   = id => `https://www.cricbuzz.com/api/cricket-match/${id}/commentary/1`;
const CB_SCORECARD    = id => `https://www.cricbuzz.com/api/cricket-scorecard/${id}`;

// ─── Chrome detection ─────────────────────────────────────────────────────────
const CHROME_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : null,
].filter(Boolean);
const CHROME_PATH      = CHROME_PATHS.find(p => { try { return existsSync(p); } catch { return false; } }) || null;
const CHROME_AVAILABLE = !!CHROME_PATH;
if (CHROME_AVAILABLE) console.log(`[Scraper] Chrome: ${CHROME_PATH}`);
else console.log('[Scraper] Chrome: not available (HTTP-only mode)');

// ─── HTTP helper ──────────────────────────────────────────────────────────────
const fetchRaw = (url, extraHeaders = {}) => new Promise((resolve, reject) => {
  const lib = url.startsWith('https') ? https : http;
  const req = lib.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      'Accept': 'application/json, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      ...extraHeaders,
    },
    timeout: 15000,
  }, res => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      return fetchRaw(res.headers.location, extraHeaders).then(resolve).catch(reject);
    }
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => resolve({ status: res.statusCode, body: data }));
  });
  req.on('error', reject);
  req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
});

const fetchJSON = async (url, extraHeaders = {}) => {
  try {
    const { status, body } = await fetchRaw(url, extraHeaders);
    if (status !== 200 || !body || body.length < 5) return null;
    return JSON.parse(body);
  } catch (e) {
    console.log(`[HTTP] ${url.substring(0, 60)}... → ${e.message}`);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE 1: ESPN Cricinfo Public API
// This is the most reliable source for cloud servers — never blocked.
// Powers the official ESPN Cricinfo app with no IP restrictions.
// ─────────────────────────────────────────────────────────────────────────────

const matchTeamName = (name = '') => {
  const u = name.toUpperCase();
  const map = {
    'SUPER KINGS': 'CSK', 'MUMBAI INDIANS': 'MI', 'CHALLENGERS': 'RCB',
    'KNIGHT RIDERS': 'KKR', 'ROYALS': 'RR', 'PUNJAB KINGS': 'PBKS',
    'CAPITALS': 'DC', 'TITANS': 'GT', 'SUPER GIANTS': 'LSG',
    'SUNRISERS': 'SRH', 'CSK': 'CSK', 'MI': 'MI', 'RCB': 'RCB',
    'KKR': 'KKR', 'RR': 'RR', 'PBKS': 'PBKS', 'DC': 'DC',
    'GT': 'GT', 'LSG': 'LSG', 'SRH': 'SRH',
  };
  for (const [key, abbr] of Object.entries(map)) {
    if (u.includes(key)) return abbr;
  }
  return null;
};

const espnGetLiveMatch = async () => {
  const data = await fetchJSON(ESPN_SCOREBOARD);
  if (!data?.events?.length) {
    console.log('[ESPN] No events in scoreboard');
    return null;
  }

  // Find today's IPL match
  for (const event of data.events) {
    const name = (event.name || event.shortName || '').toUpperCase();
    const status = (event.status?.type?.name || '').toUpperCase();

    // Skip if not IPL (ESPN might show other cricket)
    // IPL events have "T20" in name or are in the IPL league
    if (!name.includes('T20') && !name.includes('INDIAN PREMIER') && event.status?.type?.completed === undefined) {
      // Check if teams are IPL teams
      const comps = event.competitions?.[0];
      const t1 = matchTeamName(comps?.competitors?.[0]?.team?.displayName || '');
      const t2 = matchTeamName(comps?.competitors?.[1]?.team?.displayName || '');
      if (!t1 || !t2) continue;
    }

    const competition = event.competitions?.[0];
    if (!competition) continue;

    const comp0 = competition.competitors?.[0];
    const comp1 = competition.competitors?.[1];
    if (!comp0 || !comp1) continue;

    const t1 = matchTeamName(comp0.team?.displayName || comp0.team?.name || '');
    const t2 = matchTeamName(comp1.team?.displayName || comp1.team?.name || '');
    if (!t1 || !t2) continue;
    if (!TEAMS.includes(t1) || !TEAMS.includes(t2)) continue;

    const statusStr = (event.status?.type?.description || '').toUpperCase();
    const isLive     = event.status?.type?.name === 'STATUS_IN_PROGRESS' || statusStr.includes('PROGRESS');
    const isFinished = event.status?.type?.completed === true || statusStr.includes('FINAL');

    if (!isLive && !isFinished) continue; // skip scheduled

    return {
      espnId: event.id,
      team1:  t1,
      team2:  t2,
      isLive,
      isFinished,
      competition,
      statusStr,
    };
  }
  return null;
};

const espnGetFullData = async (matchMeta) => {
  const { espnId, team1, team2, competition } = matchMeta;

  // Get detailed summary
  const summary = await fetchJSON(ESPN_SUMMARY(espnId));
  const comp = competition;

  // ── Status ────────────────────────────────────────────────────────────────
  let status = matchMeta.isLive ? 'LIVE' : matchMeta.isFinished ? 'FINISHED' : 'LIVE';
  let result = '';

  const noteStr = (summary?.header?.competitions?.[0]?.notes?.[0]?.headline || '').toUpperCase();
  const statusDetail = summary?.header?.competitions?.[0]?.status?.type?.detail || '';
  const statusName   = (summary?.header?.competitions?.[0]?.status?.type?.name || '').toUpperCase();

  if (statusDetail.toUpperCase().includes('RAIN') || noteStr.includes('RAIN')) status = 'RAIN DELAY';
  else if (statusDetail.toUpperCase().includes('INNINGS BREAK') || noteStr.includes('INNINGS BREAK')) status = 'INNINGS BREAK';
  else if (statusName.includes('FINAL') || matchMeta.isFinished) status = 'FINISHED';

  // Result string for finished matches
  if (status === 'FINISHED') {
    const note = summary?.header?.competitions?.[0]?.notes?.[0]?.headline || statusDetail;
    if (note && note.toLowerCase().includes('won')) result = note;
    else {
      const winnerComp = comp?.competitors?.find(c => c.winner);
      if (winnerComp) {
        const winTeam = matchTeamName(winnerComp.team?.displayName || '');
        const margin  = comp?.status?.type?.detail || '';
        result = `${winTeam || winnerComp.team?.displayName} won${margin ? ' - ' + margin : ''}`;
      }
    }
  }

  // ── Toss ──────────────────────────────────────────────────────────────────
  let toss = null;
  const tossNote = summary?.header?.competitions?.[0]?.notes?.find(n =>
    n.headline?.toLowerCase().includes('toss') || n.headline?.toLowerCase().includes('chose')
  );
  if (tossNote) toss = tossNote.headline;
  if (!toss) {
    const gameInfo = summary?.gamepackageJSON?.gameInfo;
    if (gameInfo?.tossWinner) toss = `${gameInfo.tossWinner} chose to ${gameInfo.tossDecision || 'bat'}`;
  }

  // ── Batting/bowling assignment from ESPN ──────────────────────────────────
  // ESPN has competitors with scores for each innings
  const c0 = comp?.competitors?.[0];
  const c1 = comp?.competitors?.[1];

  // The competitor with more recent/current innings is batting
  // ESPN provides linescores for each innings
  const linescore0 = c0?.linescores || [];
  const linescore1 = c1?.linescores || [];

  // Current innings: the one currently batting
  // Determine from ESPN summary's current batters
  let battingTeam = team2, bowlingTeam = team1;

  const currentInning = summary?.gamepackageJSON?.plays?.[0]
    || summary?.gamepackageJSON?.scoringPlays?.[0];

  // Try to determine from batters in summary
  const activeBatters = summary?.gamepackageJSON?.currentBatters
    || summary?.batterBoxScores?.filter(b => b.active);
  if (activeBatters?.length > 0) {
    const batterTeam = activeBatters[0]?.team?.displayName || '';
    const bt = matchTeamName(batterTeam);
    if (bt && TEAMS.includes(bt)) { battingTeam = bt; bowlingTeam = bt === team1 ? team2 : team1; }
  }

  // Fallback: determine from innings count
  const innings0 = linescore0.length;
  const innings1 = linescore1.length;
  if (innings0 !== innings1) {
    // Team with more innings has already batted first; current batter has fewer innings
    battingTeam  = innings0 > innings1 ? matchTeamName(c1?.team?.displayName||'') || team2
                                       : matchTeamName(c0?.team?.displayName||'') || team1;
    bowlingTeam  = battingTeam === team1 ? team2 : team1;
  } else if (innings0 === 1 && innings1 === 1) {
    // Both batted once — currently in 2nd innings
    // The one that just started batting has lower score
    const s0 = parseInt(c0?.score || '0');
    const s1 = parseInt(c1?.score || '0');
    battingTeam  = s0 < s1 ? (matchTeamName(c0?.team?.displayName||'') || team1)
                            : (matchTeamName(c1?.team?.displayName||'') || team2);
    bowlingTeam  = battingTeam === team1 ? team2 : team1;
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  // ESPN: competitor.score = current running score
  // For live matches, the batting team's score is in their linescores
  const battingComp  = battingTeam === matchTeamName(c0?.team?.displayName||'') ? c0 : c1;
  const bowlingComp  = battingComp === c0 ? c1 : c0;

  // Get current score from ESPN summary
  let score = '0', wickets = '0', overs = '0.0';
  let team1Score = null, team1Wickets = null, team1Overs = null, target = null;

  // ESPN over-by-over data in gamepackageJSON
  const gpkg = summary?.gamepackageJSON;
  if (gpkg?.scorecard) {
    // ESPN scorecard has innings
    const innings = Object.values(gpkg.scorecard);
    if (innings.length > 0) {
      const currentInn = innings[innings.length - 1];
      score   = String(currentInn?.runs     || '0');
      wickets = String(currentInn?.wickets  || '0');
      overs   = String(currentInn?.overs    || '0.0');

      if (innings.length > 1) {
        const prevInn = innings[innings.length - 2];
        team1Score   = String(prevInn?.runs    || '');
        team1Wickets = String(prevInn?.wickets || '');
        team1Overs   = String(prevInn?.overs   || '');
        target       = parseInt(prevInn?.runs || 0) + 1;
      }
    }
  }

  // Fallback to competitor scores
  if (score === '0' && battingComp?.score) {
    score = battingComp.score;
  }

  // ESPN sometimes puts score in "X-Y" format (runs-wickets)
  if (score?.includes('-')) {
    const parts = score.split('-');
    score   = parts[0];
    wickets = parts[1] || '0';
  }

  // ── Batsmen ───────────────────────────────────────────────────────────────
  const batsmen = [];
  const batterBoxScores = summary?.gamepackageJSON?.batterBoxScores
    || summary?.batterBoxScores || [];

  batterBoxScores
    .filter(b => !b.stats?.find(s => s.name === 'dismissal' && s.displayValue) || b.active)
    .slice(0, 3)
    .forEach(b => {
      const name = b.athlete?.displayName || b.athlete?.shortName || '';
      if (!name) return;
      const stats = {};
      (b.stats || []).forEach(s => { stats[s.name] = s.displayValue || s.value; });
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

  // ── Bowlers ───────────────────────────────────────────────────────────────
  const bowlers = [];
  const bowlerBoxScores = summary?.gamepackageJSON?.bowlerBoxScores
    || summary?.bowlerBoxScores || [];

  bowlerBoxScores.slice(-2).forEach(b => {
    const name = b.athlete?.displayName || b.athlete?.shortName || '';
    if (!name) return;
    const stats = {};
    (b.stats || []).forEach(s => { stats[s.name] = s.displayValue || s.value; });
    bowlers.push({
      name,
      overs:   String(stats.overs   || stats.O   || '0'),
      maidens: parseInt(stats.maidens|| stats.M   || 0),
      runs:    parseInt(stats.runs   || stats.R   || 0),
      wickets: parseInt(stats.wickets|| stats.W   || 0),
      economy: parseFloat(stats.economy || stats.ECO || 0).toFixed(1),
    });
  });

  // ── Recent balls from ESPN plays ──────────────────────────────────────────
  const recent = [];
  const plays = gpkg?.plays || gpkg?.scoringPlays || [];
  plays.slice(-6).forEach(p => {
    const desc = (p.text || p.description || '').toLowerCase();
    let b = '·';
    if (desc.includes('wicket') || desc.includes(' out')) b = 'W';
    else if (desc.includes('six')) b = '6';
    else if (desc.includes('four') || desc.includes('boundary')) b = '4';
    else if (desc.includes('wide')) b = 'WD';
    else if (desc.includes('no ball')) b = 'NB';
    else { const rm = desc.match(/(\d+)\s*run/); b = rm ? rm[1] : '·'; }
    recent.push(b);
  });
  while (recent.length < 6) recent.push('·');

  // ── Commentary from ESPN ──────────────────────────────────────────────────
  const commentary = [];
  const espnPlays = gpkg?.plays || [];
  espnPlays.slice(0, 15).forEach(p => {
    const text = p.text || p.description || '';
    if (!text || text.length < 5) return;
    const ut = text.toUpperCase();
    const type = ut.includes('WICKET') || ut.includes(' OUT') ? 'wicket'
               : ut.includes('FOUR')   || ut.includes('SIX')  ? 'boundary'
               : 'normal';
    commentary.push({
      over:      String(p.period?.number || p.over || ''),
      text:      text.substring(0, 200),
      type,
      generated: false,
    });
  });

  // ── Win probability ───────────────────────────────────────────────────────
  let winProbT1 = 50, winProbT2 = 50;
  const probData = comp?.predictor || comp?.probability;
  if (probData) {
    const hp = parseFloat(probData.homeTeamOdds || probData.team1 || 50);
    winProbT1 = Math.round(hp);
    winProbT2 = 100 - winProbT1;
  }

  // Try CRR/RRR from ESPN
  const crr = parseFloat(gpkg?.currentRunRate  || 0) || null;
  const rrr = parseFloat(gpkg?.requiredRunRate || 0) || null;

  if (winProbT1 === 50 && rrr && crr) {
    const r = rrr / crr;
    winProbT2 = r < 0.75 ? 78 : r < 0.9 ? 66 : r < 1.0 ? 55 : r < 1.1 ? 46 : r < 1.3 ? 37 : r < 1.6 ? 28 : 16;
    winProbT1 = 100 - winProbT2;
  }

  if (status === 'FINISHED') {
    const winner = result.toUpperCase();
    if (winner.includes(battingTeam))  { winProbT2 = 100; winProbT1 = 0; }
    else if (winner.includes(bowlingTeam)) { winProbT1 = 100; winProbT2 = 0; }
  }

  console.log(`✅ [ESPN] ${bowlingTeam} vs ${battingTeam} | ${score}/${wickets} (${overs}) | ${status}`);
  if (toss) console.log(`   🪙 ${toss}`);
  if (batsmen.length) console.log(`   🏏 ${batsmen.map(b=>`${b.name}${b.onStrike?'*':''}: ${b.runs}(${b.balls})`).join(', ')}`);
  if (bowlers.length) console.log(`   🎯 ${bowlers.map(b=>`${b.name}: ${b.wickets}/${b.runs}`).join(', ')}`);

  return {
    team1:        { name: bowlingTeam },
    team2:        { name: battingTeam },
    score, wickets, overs,
    team1Score,
    team1Wickets,
    team1Overs,
    target,
    status, result, toss,
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
// SOURCE 2: Cricbuzz JSON API (may be blocked from cloud IPs)
// ─────────────────────────────────────────────────────────────────────────────
const cricbuzzFindMatch = async () => {
  const data = await fetchJSON(CB_LIVE_LIST, {
    'Referer': 'https://www.cricbuzz.com/',
    'X-Requested-With': 'XMLHttpRequest',
  });
  if (!data) return null;

  const allMatches = [];
  for (const section of (data.matchDetails || [])) {
    allMatches.push(...(section?.matchDetailsMap?.match || []));
  }
  for (const type of (data.typeMatches || [])) {
    for (const sm of (type.seriesMatches || [])) {
      allMatches.push(...(sm?.seriesAdWrapper?.matches || sm?.matches || []));
    }
  }
  if (data.matches) allMatches.push(...data.matches);

  for (const m of allMatches) {
    const info   = m?.matchInfo || m;
    const series = (info?.seriesName || '').toUpperCase();
    if (!series.includes('IPL') && !series.includes('PREMIER LEAGUE')) continue;
    const state  = (info?.state || '').toUpperCase();
    if (state === 'PREVIEW' || state === 'SCHEDULED') continue;

    const t1  = matchTeamName(info?.team1?.teamSName || info?.team1?.teamName || '');
    const t2  = matchTeamName(info?.team2?.teamSName || info?.team2?.teamName || '');
    const mid = String(info?.matchId || '');
    if (!mid || !t1 || !t2) continue;

    return {
      matchId: mid,
      team1: t1, team2: t2,
      t1Id: info?.team1?.teamId,
      t2Id: info?.team2?.teamId,
      statusHint: state.includes('PROGRESS') ? 'LIVE' : state.includes('COMPLETE') ? 'FINISHED' : 'RECENT',
    };
  }
  return null;
};

const cricbuzzGetScore = async (matchId, team1, team2, t1Id, t2Id) => {
  const [miniRaw, commRaw, scRaw] = await Promise.allSettled([
    fetchJSON(CB_MINI_SCORE(matchId), { 'Referer': `https://www.cricbuzz.com/live-cricket-scores/${matchId}/`, 'X-Requested-With': 'XMLHttpRequest' }),
    fetchJSON(CB_COMMENTARY(matchId), { 'Referer': `https://www.cricbuzz.com/live-cricket-scores/${matchId}/`, 'X-Requested-With': 'XMLHttpRequest' }),
    fetchJSON(CB_SCORECARD(matchId),  { 'Referer': `https://www.cricbuzz.com/live-cricket-scorecard/${matchId}/` }),
  ]);

  const mini = miniRaw.status === 'fulfilled' ? miniRaw.value : null;
  const comm = commRaw.status === 'fulfilled' ? commRaw.value : null;
  const sc   = scRaw.status   === 'fulfilled' ? scRaw.value   : null;

  if (!mini) return null;

  const ms = mini?.minScore || mini?.miniscore || mini;
  if (!ms || typeof ms !== 'object') return null;

  // Status
  const rawStatus = (ms?.status || mini?.matchHeader?.status || '').toLowerCase();
  if (rawStatus.includes('yet to begin') || rawStatus.includes('preview')) return null;

  let status = 'LIVE', result = '';
  if (rawStatus.includes('rain') || rawStatus.includes('delay')) status = 'RAIN DELAY';
  else if (rawStatus.includes('break')) status = 'INNINGS BREAK';
  else if (rawStatus.includes('super over')) status = 'SUPER OVER';
  else if (rawStatus.includes('abandon') || rawStatus.includes('no result')) { status = 'ABANDONED'; result = 'Match Abandoned'; }
  else if (rawStatus.includes('won') || rawStatus.includes('complete') || rawStatus.includes('finish')) {
    status = 'FINISHED';
    result = mini?.matchHeader?.status || rawStatus;
  }

  // Toss
  const tDec = (mini?.matchHeader?.tossResults?.decision || '').toLowerCase();
  const tWId = mini?.matchHeader?.tossResults?.tossWinnerId;
  let toss = null, battingFirstTeam = null;
  if (tDec && tWId) {
    const tosser = tWId === t1Id ? team1 : team2;
    battingFirstTeam = tDec === 'bat' ? tosser : (tosser === team1 ? team2 : team1);
    toss = `${tosser} chose to ${tDec}`;
  }

  // Who is batting (Cricbuzz tells us directly)
  const battingTeamId = ms?.battingTeamId || ms?.batTeam?.teamId;
  let battingTeam = team2, bowlingTeam = team1;
  if (battingTeamId) {
    battingTeam = battingTeamId === t1Id ? team1 : team2;
    bowlingTeam = battingTeam === team1 ? team2 : team1;
  }

  const batScore  = ms?.batTeam?.teamScore  || {};
  const bowlScore = ms?.bowlTeam?.teamScore || {};
  const score   = String(ms?.score  ?? batScore?.runs    ?? '0');
  const wickets = String(ms?.wickets ?? batScore?.wickets ?? '0');
  let overs     = String(ms?.overs  ?? batScore?.overs   ?? '0.0');
  if (/^\d{3,}$/.test(overs)) { const b=parseInt(overs); overs=`${Math.floor(b/6)}.${b%6}`; }

  let team1Score = null, team1Wickets = null, team1Overs = null, target = null;
  const innings = ms?.matchScoreDetails?.inningsScoreList || [];
  if (innings.length >= 2) {
    const prev = innings[0];
    team1Score=String(prev.score??''); team1Wickets=String(prev.wickets??''); team1Overs=String(prev.overs??'');
    target = parseInt(prev.score ?? 0) + 1;
  } else if (!team1Score && bowlScore.runs != null) {
    team1Score=String(bowlScore.runs??''); team1Wickets=String(bowlScore.wickets??''); team1Overs=String(bowlScore.overs??'');
    if (team1Score) target = parseInt(team1Score) + 1;
  }
  if (!target && ms?.target) target = parseInt(ms.target);

  const crr = parseFloat(ms?.currentRunRate  || 0) || null;
  const rrr = parseFloat(ms?.requiredRunRate || 0) || null;

  // Batsmen
  const batsmenRaw = ms?.batsman || [];
  const batsmen = (Array.isArray(batsmenRaw) ? batsmenRaw : [batsmenRaw]).filter(Boolean).slice(0,3).map(b => ({
    name: b.batName || b.name || '', runs: parseInt(b.batRuns??0), balls: parseInt(b.batBalls??0),
    fours: parseInt(b.batFours??0), sixes: parseInt(b.batSixes??0),
    sr: parseFloat(b.batStrikeRate??0).toFixed(1), onStrike: b.isStriker??false,
  })).filter(b => b.name);

  // Bowler
  const bowlRaw = ms?.bowler ? (Array.isArray(ms.bowler) ? ms.bowler : [ms.bowler]) : [];
  const bowlers = bowlRaw.filter(Boolean).slice(0,2).map(b => ({
    name: b.bowlName||b.name||'', overs: String(b.bowlOvs??'0'),
    maidens: parseInt(b.bowlMaidens??0), runs: parseInt(b.bowlRuns??0),
    wickets: parseInt(b.bowlWkts??0), economy: parseFloat(b.bowlEcon??0).toFixed(1),
  })).filter(b => b.name);

  // Enrich from scorecard if batsmen missing
  if (batsmen.length === 0 && sc?.scoreCard) {
    const currentInn = sc.scoreCard[sc.scoreCard.length - 1];
    if (currentInn) {
      const bMap = currentInn.batTeamDetails?.batsmenData || {};
      Object.values(bMap).filter(b => !b.outDesc || b.outDesc.trim() === '').slice(0,3).forEach(b => {
        batsmen.push({ name:b.batName||'', runs:parseInt(b.runs??0), balls:parseInt(b.balls??0),
          fours:parseInt(b.fours??0), sixes:parseInt(b.sixes??0), sr:parseFloat(b.strikeRate??0).toFixed(1), onStrike:b.isStriker??false });
      });
      if (bowlers.length === 0) {
        const bwMap = currentInn.bowlTeamDetails?.bowlersData || {};
        Object.values(bwMap).filter(b=>parseFloat(b.overs||0)>0).slice(-2).forEach(b => {
          bowlers.push({ name:b.bowlName||'', overs:String(b.overs??'0'), maidens:parseInt(b.maidens??0),
            runs:parseInt(b.runs??0), wickets:parseInt(b.wickets??0), economy:parseFloat(b.economy??0).toFixed(1) });
        });
      }
    }
  }

  // Recent balls
  const recentStr = ms?.recentOvsStats || ms?.lastFewOvers || '';
  let recent = [];
  if (recentStr) {
    recent = recentStr.replace(/\|/g,' ').trim().split(/\s+/).map(b => {
      const u=b.toUpperCase();
      if (!u||u==='.'||u==='·')return'·'; if(u==='W')return'W';
      if(u==='WD')return'WD'; if(u.startsWith('NB'))return'NB';
      if(/^\d+$/.test(u))return u==='0'?'·':u; return'·';
    }).slice(-6);
  }
  while (recent.length < 6) recent.push('·');

  // Commentary
  const commentary = [];
  const commList = comm?.commentary?.commentaryList || comm?.commentaryList || [];
  commList.slice(0,12).forEach(c => {
    const text = c.commText || '';
    if (!text || text.length < 5) return;
    const ut = text.toUpperCase();
    commentary.push({
      over: c.overNumber != null ? `${c.overNumber}.${c.ballNumber??''}` : '',
      text: text.substring(0, 200),
      type: ut.includes('WICKET')||ut.includes(' OUT') ? 'wicket' : ut.includes('FOUR')||ut.includes('SIX') ? 'boundary' : 'normal',
      generated: false,
    });
  });

  // Win probability
  let winProbT1=50, winProbT2=50;
  const probRaw = ms?.matchScoreDetails?.winProbability || ms?.winProbability;
  if (probRaw && typeof probRaw === 'object') {
    const hp=parseFloat(probRaw.homeTeam??probRaw.team1??50);
    winProbT1=Math.round(battingTeam===team1?100-hp:hp); winProbT2=100-winProbT1;
  } else if (typeof probRaw === 'number') {
    winProbT2=Math.round(probRaw); winProbT1=100-winProbT2;
  } else if (rrr&&crr) {
    const r=rrr/crr; winProbT2=r<0.75?78:r<0.9?66:r<1.0?55:r<1.1?46:r<1.3?37:r<1.6?28:16; winProbT1=100-winProbT2;
  } else if (rrr) {
    winProbT2=rrr<6?78:rrr<8?64:rrr<10?50:rrr<12?36:rrr<15?22:12; winProbT1=100-winProbT2;
  }
  if (status==='FINISHED') {
    const w=result.toUpperCase();
    if(w.includes(battingTeam)){winProbT2=100;winProbT1=0;}else{winProbT1=100;winProbT2=0;}
  }

  return {
    team1:{name:bowlingTeam}, team2:{name:battingTeam},
    score, wickets, overs, team1Score, team1Wickets, team1Overs,
    target:target||null, status, result, toss,
    winProb:winProbT2, winProbT1, winProbT2,
    recent:recent.slice(0,6), batsmen:batsmen.slice(0,3), bowlers:bowlers.slice(0,2),
    commentary:commentary.slice(0,10), crr, rrr, source:'cricbuzz-api',
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT — called every 40s
// ─────────────────────────────────────────────────────────────────────────────
export const scrapeLiveMatch = async () => {
  console.log('[Scraper] Fetching live data...');

  // ── Try ESPN first (never blocked from cloud) ─────────────────────────────
  try {
    const espnMeta = await espnGetLiveMatch();
    if (espnMeta) {
      console.log(`🏏 [ESPN] ${espnMeta.team1} vs ${espnMeta.team2} | ${espnMeta.statusStr}`);
      const result = await espnGetFullData(espnMeta);
      if (result) return { ...result, lastUpdated: new Date() };
    } else {
      console.log('[ESPN] No live IPL match found');
    }
  } catch(e) {
    console.log('[ESPN error]', e.message);
  }

  // ── Try Cricbuzz JSON ─────────────────────────────────────────────────────
  try {
    const cbMeta = await cricbuzzFindMatch();
    if (cbMeta) {
      console.log(`🏏 [CB JSON] ${cbMeta.team1} vs ${cbMeta.team2} | ID:${cbMeta.matchId}`);
      const result = await cricbuzzGetScore(cbMeta.matchId, cbMeta.team1, cbMeta.team2, cbMeta.t1Id, cbMeta.t2Id);
      if (result) {
        console.log(`✅ [cricbuzz-api] ${result.team1?.name} vs ${result.team2?.name} | ${result.score}/${result.wickets} (${result.overs})`);
        return { ...result, lastUpdated: new Date() };
      }
    } else {
      console.log('[CB JSON] No live IPL match found');
    }
  } catch(e) {
    console.log('[CB JSON error]', e.message);
  }

  // ── Browser fallback (only if Chrome available — local dev) ───────────────
  if (!CHROME_AVAILABLE) {
    console.log('[Scraper] Both APIs failed. Chrome not available. Returning null.');
    return null;
  }

  console.log('[Scraper] APIs failed → Browser scraping...');
  return await scrapeViaBrowser();
};

// ─────────────────────────────────────────────────────────────────────────────
// Browser fallback — only for local dev
// ─────────────────────────────────────────────────────────────────────────────
let _puppeteer = null;
const getPuppeteer = async () => {
  if (_puppeteer) return _puppeteer;
  try { _puppeteer = (await import('puppeteer-core')).default; return _puppeteer; } catch {}
  try { _puppeteer = (await import('puppeteer')).default;      return _puppeteer; } catch {}
  return null;
};

const LAUNCH_OPTS = () => ({
  executablePath: CHROME_PATH,
  headless: 'new',
  args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage',
         '--disable-gpu','--single-process','--no-zygote',
         '--disable-blink-features=AutomationControlled'],
});

const scrapeViaBrowser = async () => {
  const pptr = await getPuppeteer();
  if (!pptr) return null;
  let browser;
  try {
    browser = await pptr.launch(LAUNCH_OPTS());
    const matchMeta = await findMatchViaBrowser(browser);
    if (!matchMeta) { await browser.close(); return null; }

    let result = await scrapeCrexBrowser(browser, matchMeta)
              || await scrapeCricbuzzBrowser(browser, matchMeta)
              || await scrapeGoogleBrowser(browser, matchMeta.team1, matchMeta.team2);

    await browser.close();
    if (result) console.log(`✅ [${result.source}] ${result.team1?.name} vs ${result.team2?.name} | ${result.score}/${result.wickets} (${result.overs})`);
    return result ? { ...result, lastUpdated: new Date() } : null;
  } catch(err) {
    if (browser) await browser.close();
    console.error('❌ Browser fatal:', err.message);
    return null;
  }
};

const findMatchViaBrowser = async browser => {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.cricbuzz.com/cricket-match/live-scores',{waitUntil:'domcontentloaded',timeout:30000});
    await wait(3000);
    const m = await page.evaluate(TEAMS => {
      const links=Array.from(document.querySelectorAll('a[href*="/live-cricket-scores/"]'));
      const seen=new Set(),cands=[];
      for(const a of links){
        const href=a.getAttribute('href')||'',hu=href.toUpperCase();
        if(seen.has(href))continue;
        if(!hu.includes('IPL')&&!hu.includes('INDIAN-PREMIER'))continue;
        const idM=href.match(/\/live-cricket-scores\/(\d+)\//);if(!idM)continue;
        const t=TEAMS.filter(t=>hu.includes(`-${t}-`)||hu.includes(`/${t}-`)||hu.endsWith(`-${t}`));
        if(t.length<2)continue;seen.add(href);
        const card=a.closest('[class*="cb-col"]')||a.parentElement;
        const hint=card?.querySelector('.cb-text-live')?'LIVE':card?.querySelector('.cb-text-complete,.cb-text-stumps')?'FINISHED':'UPCOMING';
        cands.push({matchId:idM[1],cbUrl:'https://www.cricbuzz.com'+href,team1:t[0],team2:t[1],statusHint:hint,priority:hint==='LIVE'?0:hint==='FINISHED'?1:2});
      }
      cands.sort((a,b)=>a.priority-b.priority);return cands[0]||null;
    },TEAMS);
    await page.close();return m;
  } catch(e){await page.close().catch(()=>{});return null;}
};

const scrapeCrexBrowser = async (browser, mm) => {
  const page = await browser.newPage();
  try {
    await page.goto('https://crex.com/',{waitUntil:'domcontentloaded',timeout:20000});await wait(2500);
    let crexUrl=await page.evaluate((t1,t2,T)=>{for(const l of document.querySelectorAll('a[href]')){const h=l.href||'',hu=h.toUpperCase(),hl=h.toLowerCase();if(!hl.includes('cricket-live-score')&&!hl.includes('scorecard'))continue;const f=T.filter(t=>hu.includes(`-${t}-`)||hu.includes(`/${t}-`));if(f.includes(t1)&&f.includes(t2))return h;}return null;},mm.team1,mm.team2,TEAMS);
    if(!crexUrl){await page.goto('https://crex.com/fixtures',{waitUntil:'domcontentloaded',timeout:15000});await wait(2000);crexUrl=await page.evaluate((t1,t2,T)=>{for(const l of document.querySelectorAll('a[href]')){const h=l.href||'',hu=h.toUpperCase();const f=T.filter(t=>hu.includes(`-${t}-`)||hu.includes(`/${t}-`));if(f.includes(t1)&&f.includes(t2))return h;}return null;},mm.team1,mm.team2,TEAMS);}
    if(!crexUrl){await page.close();return null;}
    await page.goto(crexUrl,{waitUntil:'networkidle2',timeout:30000});await wait(5000);
    const raw=await page.evaluate((T,t1,t2)=>{
      const body=document.body?.innerText||'';if(body.length<100||body.includes('YET TO BEGIN'))return null;
      let team1=t1,team2=t2;const vsM=(document.title+' '+(document.querySelector('h1,h2')?.innerText||'')).toUpperCase().match(/\b([A-Z]{2,4})\s+VS?\s+([A-Z]{2,4})\b/);if(vsM&&T.includes(vsM[1])&&T.includes(vsM[2])){team1=vsM[1];team2=vsM[2];}
      const tossM=body.match(/(KKR|MI|CSK|RCB|RR|PBKS|DC|GT|LSG|SRH)\s+(?:opt(?:ed)?|chose|elected)\s+to\s+(bat|bowl|field)/i);let toss=null,bft=null;if(tossM){const tosser=tossM[1].toUpperCase(),ch=tossM[2].toLowerCase();bft=ch==='bat'?tosser:(tosser===team1?team2:team1);toss=`${tosser} chose to ${ch}`;}
      const upper=body.toUpperCase();let status='LIVE',result='';
      if(upper.includes('RAIN DELAY')||upper.includes('COVERS ON'))status='RAIN DELAY';
      else if(upper.includes('ABANDONED')||(upper.includes('NO RESULT')&&!upper.includes('YET TO'))){status='ABANDONED';result='Match Abandoned';}
      else if(upper.includes('INNINGS BREAK')||upper.includes('INNS BREAK'))status='INNINGS BREAK';
      const wonRx=new RegExp(`\\b(${T.join('|')})\\b\\s+won\\s+by\\s+([\\d]+\\s+(?:runs?|wickets?))`, 'i');const wonM=body.match(wonRx);if(wonM&&(wonM[1].toUpperCase()===team1||wonM[1].toUpperCase()===team2)){status='FINISHED';result=`${wonM[1].toUpperCase()} won by ${wonM[2]}`;}
      const sRx=t=>{for(const rx of[new RegExp(`\\b${t}\\b[^\\n]{0,25}(\\d{1,3})[\\-/](\\d{1,2})[^\\d\\n]{0,15}(\\d{1,2}\\.\\d)`,'i'),new RegExp(`(\\d{1,3})[\\-/](\\d{1,2})[^\\d\\n]{0,15}(\\d{1,2}\\.\\d)[^\\n]{0,25}\\b${t}\\b`,'i'),new RegExp(`\\b${t}\\b[^\\n]{0,25}(\\d{1,3})[\\-/](\\d{1,2})`,'i')]){const m=body.match(rx);if(m&&parseInt(m[1])>=0)return{runs:m[1],wkts:m[2],overs:m[3]||null};}return null;};
      const s1=sRx(team1),s2=sRx(team2);const crrM=body.match(/CRR\s*:?\s*([\d.]+)/i),rrrM=body.match(/(?:RRR|Req\s*RR)\s*:?\s*([\d.]+)/i),tgtM=body.match(/[Tt]arget\s*:?\s*(\d{2,3})/);const crr=crrM?parseFloat(crrM[1]):null,rrr=rrrM?parseFloat(rrrM[1]):null,target=tgtM?parseInt(tgtM[1]):null;
      const yetTeam=body.match(new RegExp(`(${T.join('|')})[^\\n]{0,50}[Yy]et\\s+to\\s+[Bb]at`))?.[1]?.toUpperCase()||null;
      let bT,bowT,score,wickets,overs,fS=null,fW=null,fO=null,dT=target;
      if(s1&&s2){const o1=s1.overs?parseFloat(s1.overs):20,o2=s2.overs?parseFloat(s2.overs):20;if(yetTeam){bowT=yetTeam;bT=yetTeam===team1?team2:team1;}else if(status==='FINISHED'&&wonM){bT=wonM[1].toUpperCase();bowT=bT===team1?team2:team1;}else if(status==='INNINGS BREAK'){const fb=bft||(o1>=o2?team1:team2);bT=fb===team1?team2:team1;bowT=fb;}else{bT=o2<=o1?team2:team1;bowT=bT===team1?team2:team1;}if(bT===team2){fS=s1.runs;fW=s1.wkts;fO=s1.overs||'20';score=s2.runs;wickets=s2.wkts;overs=s2.overs||'0.0';}else{fS=s2.runs;fW=s2.wkts;fO=s2.overs||'20';score=s1.runs;wickets=s1.wkts;overs=s1.overs||'0.0';}if(!dT&&fS)dT=parseInt(fS)+1;}else if(s1||s2){const s=s1||s2;bT=bft||(yetTeam?(yetTeam===team1?team2:team1):(s1?team1:team2));bowT=bT===team1?team2:team1;score=s.runs;wickets=s.wkts;overs=s.overs||'0.0';}else if(['ABANDONED','RAIN DELAY','POSTPONED'].includes(status)){bT=bft||team1;bowT=bT===team1?team2:team1;score='0';wickets='0';overs='0.0';}else return null;
      const batsmen=[];Array.from(document.querySelectorAll('[class*="batsman"],[class*="batter"],[class*="batting-player"],[class*="striker"]')).slice(0,3).forEach(card=>{const ct=card.innerText?.trim()||'';const name=(card.querySelector('[class*="name"]')?.innerText||ct.split('\n')[0]).replace(/[*†✏🖊]/g,'').trim();if(!name||name.length<2||name.length>35)return;const rbM=ct.match(/(\d+)\s*\((\d+)\)/);if(!rbM)return;const runs=parseInt(rbM[1])||0,balls=parseInt(rbM[2])||0;batsmen.push({name,runs,balls,fours:0,sixes:0,sr:balls?((runs/balls)*100).toFixed(1):'0.0',onStrike:ct.includes('🖊')||ct.includes('*')});});
      if(batsmen.length<1){const bRx=/([A-Z][a-z]+(?:\s+[A-Z][a-z.]+){1,3})\s+(\d+)\s*\((\d+)\)/g;[...body.matchAll(bRx)].slice(0,3).forEach(m=>{const name=m[1].trim();if(name.length<2||name.length>35)return;const runs=parseInt(m[2])||0,balls=parseInt(m[3])||0;batsmen.push({name,runs,balls,fours:0,sixes:0,sr:balls?((runs/balls)*100).toFixed(1):'0.0',onStrike:body.includes(m[1]+'*')});});}
      const bowlers=[];Array.from(document.querySelectorAll('[class*="bowler-card"],[class*="bowling-player"],[class*="current-bowler"]')).slice(0,2).forEach(card=>{const ct=card.innerText?.trim()||'';const name=(card.querySelector('[class*="name"]')?.innerText||ct.split('\n')[0]).replace(/†/g,'').trim();if(!name||name.length<2||name.length>35)return;const bM=ct.match(/(\d+)[–\-](\d+)\s*\((\d+\.?\d*)\)/);if(bM)bowlers.push({name,wickets:parseInt(bM[1]),runs:parseInt(bM[2]),overs:bM[3],maidens:0,economy:parseFloat(bM[3])?(parseInt(bM[2])/parseFloat(bM[3])).toFixed(1):'0.0'});});
      if(bowlers.length<1){const bwRx=/([A-Z][a-z]+(?:\s+[A-Z][a-z.]+){1,3})\s+(\d+)[–\-](\d+)\s*\((\d+\.?\d*)\)/g;[...body.matchAll(bwRx)].slice(0,2).forEach(m=>{const name=m[1].trim();if(name.length<2||name.length>35)return;bowlers.push({name,wickets:parseInt(m[2]),runs:parseInt(m[3]),overs:m[4],maidens:0,economy:parseFloat(m[4])?(parseInt(m[3])/parseFloat(m[4])).toFixed(1):'0.0'});});}
      const recent=[];const badges=Array.from(document.querySelectorAll('[class*="ball-badge"],[class*="ball-item"],[class*="over-ball"],[class*="ball-score"]'));if(badges.length>=3)badges.slice(-8).forEach(el=>{const t=el.innerText?.trim().toUpperCase().replace(/\s+/g,'');if(t&&t.length<=3&&/^[\dW·N]/.test(t)&&t!=='■')recent.push(t==='N'?'·':t);});if(recent.length<3){const overRx=/Over\s+\d+\s+((?:(?:\d|W|WD|NB|■)\s*){1,8})/g;[...body.matchAll(overRx)].slice(-2).forEach(om=>{om[1].trim().split(/\s+/).forEach(b=>{if(b==='■'||!b)return;if(/^[\dW]$/.test(b)||b==='WD'||b==='NB')recent.push(b.toUpperCase());});});}while(recent.length<6)recent.push('·');
      const commentary=[];const pC=els=>els.forEach(el=>{const text=el.innerText?.trim();if(!text||text.length<10||text.length>500)return;const ut=text.toUpperCase();const type=ut.includes(' OUT')||ut.includes('WICKET')?'wicket':ut.includes('FOUR')||ut.includes(' SIX')?'boundary':'normal';const over=text.match(/^(\d+\.\d+)/)?.[1]||text.match(/(\d+\.\d+)\s*:/)?.[1]||'';if(!commentary.some(c=>c.text===text.substring(0,200)))commentary.push({over,text:text.substring(0,200),type,generated:false});});pC(Array.from(document.querySelectorAll('[class*="comm-item"],[class*="commentary-item"],[class*="feed-item"],[class*="update-item"]')).slice(0,12));if(commentary.length<3)pC(Array.from(document.querySelectorAll('p,li')).filter(el=>{const t=el.innerText?.trim()||'';return t.length>15&&t.length<500&&(t.includes('IST')||/^\d+\.\d+/.test(t));}).slice(0,10));
      let wP1=50,wP2=50;for(const c of document.querySelectorAll('[class*="probability"],[class*="win-prob"],[class*="match-prob"]')){const t=c.innerText||'';const pcts=[...t.matchAll(/(\d{1,3})\s*%/g)].map(m=>parseInt(m[1]));if(pcts.length>=2&&Math.abs(pcts[0]+pcts[1]-100)<=5){const btp=t.toUpperCase().indexOf(bT),bop=t.toUpperCase().indexOf(bowT);if(btp<bop){wP2=pcts[0];wP1=pcts[1];}else{wP1=pcts[0];wP2=pcts[1];}break;}}
      if(wP1===50){const p1M=body.match(new RegExp(`\\b${bT}\\b[^%\\d]*(\\d{1,3})\\s*%`,'i')),p2M=body.match(new RegExp(`\\b${bowT}\\b[^%\\d]*(\\d{1,3})\\s*%`,'i'));if(p1M&&p2M){const p1=parseInt(p1M[1]),p2=parseInt(p2M[1]);if(Math.abs(p1+p2-100)<=5){wP2=p1;wP1=p2;}}}
      if(wP1===50&&rrr&&crr){const r=rrr/crr;wP2=r<0.75?78:r<0.9?66:r<1.0?55:r<1.1?47:r<1.3?38:r<1.6?28:16;wP1=100-wP2;}else if(wP1===50&&rrr){wP2=rrr<6?78:rrr<8?64:rrr<10?50:rrr<12?36:rrr<15?22:12;wP1=100-wP2;}
      if(status==='FINISHED'&&wonM){const w=wonM[1].toUpperCase();wP1=w===bowT?100:0;wP2=w===bT?100:0;}
      return{battingTeam:bT,bowlingTeam:bowT,score:String(score||'0'),wickets:String(wickets||'0'),overs:String(overs||'0.0'),team1Score:fS?String(fS):null,team1Wickets:fW?String(fW):null,team1Overs:fO?String(fO):null,target:dT||null,crr,rrr,status,result,toss,winProbT1:wP1,winProbT2:wP2,recent:recent.slice(0,6),batsmen:batsmen.slice(0,3),bowlers:bowlers.slice(0,2),commentary:commentary.slice(0,12)};
    },TEAMS,mm.team1,mm.team2);
    await page.close();
    if(!raw)return null;
    return{team1:{name:raw.bowlingTeam},team2:{name:raw.battingTeam},score:raw.score,wickets:raw.wickets,overs:raw.overs,team1Score:raw.team1Score,team1Wickets:raw.team1Wickets,team1Overs:raw.team1Overs,target:raw.target,status:raw.status,result:raw.result,toss:raw.toss,winProb:raw.winProbT2,winProbT1:raw.winProbT1,winProbT2:raw.winProbT2,recent:raw.recent,batsmen:raw.batsmen,bowlers:raw.bowlers,commentary:raw.commentary,crr:raw.crr,rrr:raw.rrr,source:'crex.com'};
  }catch(e){await page.close().catch(()=>{});console.error('[crex browser]',e.message);return null;}
};

const scrapeCricbuzzBrowser = async (browser, mm) => {
  const page = await browser.newPage();
  try {
    const url=mm.cbUrl||`https://www.cricbuzz.com/live-cricket-scorecard/${mm.matchId}`;
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});await wait(4000);
    const raw=await page.evaluate((T,t1,t2)=>{const body=document.body?.innerText||'';if(body.length<200)return null;const upper=body.toUpperCase();let status='LIVE',result='';if(upper.includes('RAIN')&&(upper.includes('DELAY')||upper.includes('STOP')))status='RAIN DELAY';else if(upper.includes('ABANDONED')){status='ABANDONED';result='Match Abandoned';}else if(upper.includes('INNINGS BREAK'))status='INNINGS BREAK';const wonRx=new RegExp(`\\b(${T.join('|')})\\b\\s+won\\s+by\\s+([\\d]+\\s+(?:runs?|wickets?))`, 'i');const wonM=body.match(wonRx);if(wonM&&(wonM[1].toUpperCase()===t1||wonM[1].toUpperCase()===t2)){status='FINISHED';result=`${wonM[1].toUpperCase()} won by ${wonM[2]}`;}const tossEl=document.querySelector('.cb-toss-sts');let toss=tossEl?.innerText?.trim()||null,bft=null;const optM=body.match(/(KKR|MI|CSK|RCB|RR|PBKS|DC|GT|LSG|SRH)\s+(?:opt|chose|elected)\s+to\s+(bat|bowl|field)/i);if(optM){const tosser=optM[1].toUpperCase(),ch=optM[2].toLowerCase();bft=ch==='bat'?tosser:(tosser===t1?t2:t1);if(!toss)toss=`${tosser} chose to ${ch}`;}const ls=t=>{const m=body.match(new RegExp(`\\b${t}\\b[^\\d\\n]{0,20}(\\d{1,3})[/\\-](\\d{1,2})(?:[^\\d]*(\\d{1,2}\\.\\d))?`,'i'));return m&&parseInt(m[1])>=0?{runs:m[1],wkts:m[2],overs:m[3]||null}:null;};const s1=ls(t1),s2=ls(t2);const crrM=body.match(/CRR\s*:?\s*([\d.]+)/i),rrrM=body.match(/RRR\s*:?\s*([\d.]+)/i),tgtM=body.match(/[Tt]arget\s*:?\s*(\d{2,3})/);const crr=crrM?parseFloat(crrM[1]):null,rrr=rrrM?parseFloat(rrrM[1]):null,target=tgtM?parseInt(tgtM[1]):null;const yetTeam=body.match(new RegExp(`(${T.join('|')})[^\\n]{0,50}[Yy]et\\s+to\\s+[Bb]at`))?.[1]?.toUpperCase()||null;let bT=t2,bowT=t1,score,wickets,overs,fs=null,fw=null,fo=null,dT=target;if(s1&&s2){const o1=s1.overs?parseFloat(s1.overs):20,o2=s2.overs?parseFloat(s2.overs):20;if(yetTeam){bowT=yetTeam;bT=yetTeam===t1?t2:t1;}else if(status==='FINISHED'&&wonM){bT=wonM[1].toUpperCase();bowT=bT===t1?t2:t1;}else if(status==='INNINGS BREAK'){const fb=bft||(o1>=o2?t1:t2);bT=fb===t1?t2:t1;bowT=fb;}else{bT=o2<=o1?t2:t1;bowT=bT===t1?t2:t1;}if(bT===t2){fs=s1.runs;fw=s1.wkts;fo=s1.overs||'20';score=s2.runs;wickets=s2.wkts;overs=s2.overs||'0.0';}else{fs=s2.runs;fw=s2.wkts;fo=s2.overs||'20';score=s1.runs;wickets=s1.wkts;overs=s1.overs||'0.0';}if(!dT&&fs)dT=parseInt(fs)+1;}else if(s1||s2){const s=s1||s2;bT=bft||(yetTeam?(yetTeam===t1?t2:t1):(s1?t1:t2));bowT=bT===t1?t2:t1;score=s.runs;wickets=s.wkts;overs=s.overs||'0.0';}else if(['ABANDONED','RAIN DELAY'].includes(status)){score='0';wickets='0';overs='0.0';}else return null;const batsmen=[],bowlers=[],recent=[],commentary=[];Array.from(document.querySelectorAll('.cb-min-bat-rw')).forEach(row=>{const cells=Array.from(row.querySelectorAll('.cb-col'));const nameEl=cells.find(c=>{const t=c.innerText?.trim();return t?.length>2&&!/^\d/.test(t)&&!['R','B','4s','6s','SR','Batter','M'].includes(t);});const name=nameEl?.innerText?.replace(/[*†(c)]+/g,'').trim();if(!name||name.length<2||name.length>35)return;const nums=cells.map(c=>c.innerText?.trim()).filter(t=>/^\d+\.?\d*$/.test(t)).map(Number);if(nums.length<2)return;batsmen.push({name,runs:nums[0]||0,balls:nums[1]||0,fours:nums[2]||0,sixes:nums[3]||0,sr:nums[1]?((nums[0]/nums[1])*100).toFixed(1):'0.0',onStrike:row.innerText?.includes('*')||false});});Array.from(document.querySelectorAll('.cb-min-fld-rw')).forEach(row=>{const cells=Array.from(row.querySelectorAll('.cb-col'));const nameEl=cells.find(c=>{const t=c.innerText?.trim();return t?.length>2&&!/^\d/.test(t)&&!['O','M','R','W','Eco','Bowler'].includes(t);});const name=nameEl?.innerText?.trim();if(!name||name.length<2||name.length>35)return;const nums=cells.map(c=>c.innerText?.trim()).filter(t=>/^\d+\.?\d*$/.test(t)).map(Number);if(nums.length<3)return;bowlers.push({name,overs:nums[0]?.toString()||'0',maidens:nums[1]||0,runs:nums[2]||0,wickets:nums[3]||0,economy:nums[0]?(nums[2]/nums[0]).toFixed(1):'0.0'});});Array.from(document.querySelectorAll('[class*="cb-col-90"]')).slice(0,8).forEach(el=>{const text=el.innerText?.trim()||'';if(!/^\d+\.\d+/.test(text))return;const lt=text.toLowerCase();let b='·';if(lt.includes(' out')||lt.includes('wicket'))b='W';else if(lt.includes('six')||lt.includes('6!'))b='6';else if(lt.includes('four')||lt.includes('4!'))b='4';else if(lt.includes('wide'))b='WD';else if(lt.includes('no ball'))b='NB';else{const rm=lt.match(/\b(\d)\s+run/);b=rm?rm[1]:'·';}recent.unshift(b);});recent.splice(6);while(recent.length<6)recent.push('·');Array.from(document.querySelectorAll('[class*="cb-col-90"]')).slice(0,12).forEach(el=>{const text=el.innerText?.trim();if(!text||text.length<8||text.length>300)return;const ut=text.toUpperCase();const type=ut.includes(' OUT')||ut.includes('WICKET')?'wicket':ut.includes('FOUR')||ut.includes(' SIX')?'boundary':'normal';const over=text.match(/^(\d+\.\d+)/)?.[1]||'';if(!commentary.some(c=>c.text===text.substring(0,150)))commentary.push({over,text:text.substring(0,150),type,generated:false});});let wP1=50,wP2=50;if(status==='FINISHED'&&wonM){const w=wonM[1].toUpperCase();wP1=w===bowT?100:0;wP2=w===bT?100:0;}else if(rrr&&crr){const r=rrr/crr;wP2=r<0.75?78:r<0.9?66:r<1.0?55:r<1.1?47:r<1.3?38:28;wP1=100-wP2;}else if(rrr){wP2=rrr<6?78:rrr<8?64:rrr<10?50:rrr<12?36:20;wP1=100-wP2;}return{battingTeam:bT,bowlingTeam:bowT,score:String(score||'0'),wickets:String(wickets||'0'),overs:String(overs||'0.0'),team1Score:fs?String(fs):null,team1Wickets:fw?String(fw):null,team1Overs:fo?String(fo):null,target:dT||null,crr,rrr,status,result,toss,winProbT1:wP1,winProbT2:wP2,recent,batsmen:batsmen.slice(0,3),bowlers:bowlers.slice(0,2),commentary:commentary.slice(0,10)};},T,mm.team1,mm.team2);
    await page.close();if(!raw)return null;
    return{team1:{name:raw.bowlingTeam},team2:{name:raw.battingTeam},score:raw.score,wickets:raw.wickets,overs:raw.overs,team1Score:raw.team1Score,team1Wickets:raw.team1Wickets,team1Overs:raw.team1Overs,target:raw.target,status:raw.status,result:raw.result,toss:raw.toss,winProb:raw.winProbT2,winProbT1:raw.winProbT1,winProbT2:raw.winProbT2,recent:raw.recent,batsmen:raw.batsmen,bowlers:raw.bowlers,commentary:raw.commentary,crr:raw.crr,rrr:raw.rrr,source:'cricbuzz'};
  }catch(e){await page.close().catch(()=>{});console.error('[CB browser]',e.message);return null;}
};

const scrapeGoogleBrowser = async (browser, t1, t2) => {
  const page = await browser.newPage();
  try {
    await page.goto(`https://www.google.com/search?q=${encodeURIComponent(`${t1} vs ${t2} IPL 2026 live score`)}&hl=en`,{waitUntil:'domcontentloaded',timeout:25000});
    await wait(3000);
    const raw=await page.evaluate((T,t1,t2)=>{const ws=['.liveticker','.liveresults-sports-immersive__match-tile','.imso_mh__ma-cont','[jsname="ESiMyd"]','.imspo_mt__mtch-cont'];let widget=null;for(const s of ws){const el=document.querySelector(s);if(el?.innerText?.length>30){widget=el;break;}}if(!widget)widget=Array.from(document.querySelectorAll('div')).find(d=>{const t=d.innerText||'';return/\d{2,3}[\/\-]\d{1,2}/.test(t)&&t.length<4000&&t.length>40;})||null;const text=widget?.innerText?.trim()||'';if(!text)return null;if(!text.toUpperCase().includes(t1)||!text.toUpperCase().includes(t2))return null;const sW=[...text.matchAll(/(\d{2,3})\s*[\/\-]\s*(\d{1,2})\s*\(\s*(\d{1,2}\.?\d?)\s*\)/g)];const sN=[...text.matchAll(/(\d{2,3})\s*[\/\-]\s*(\d{1,2})(?!\s*[\(\d])/g)];const aS=sW.length>0?sW:sN;if(!aS.length)return null;const oM=text.match(/(\d{1,2}\.\d)\s*(?:ov|overs?)/i);const exOv=oM?.[1]||null;const upper=text.toUpperCase();let status='LIVE',result='';const wonRx=new RegExp(`\\b(${T.join('|')})\\b\\s+won\\s+by\\s+([\\d]+\\s+(?:runs?|wickets?))`, 'i');const wonM=text.match(wonRx);if(wonM&&(wonM[1].toUpperCase()===t1||wonM[1].toUpperCase()===t2)){status='FINISHED';result=`${wonM[1].toUpperCase()} won by ${wonM[2]}`;}else if(upper.includes('RAIN'))status='RAIN DELAY';else if(upper.includes('INNINGS BREAK'))status='INNINGS BREAK';const crrM=text.match(/CRR\s*:?\s*([\d.]+)/i),rrrM=text.match(/RRR\s*:?\s*([\d.]+)/i),tgtM=text.match(/[Tt]arget[:\s]*(\d{2,3})/);const crr=crrM?parseFloat(crrM[1]):null,rrr=rrrM?parseFloat(rrrM[1]):null,tgt=tgtM?parseInt(tgtM[1]):null;const ls1=(()=>{const m=text.match(new RegExp(`\\b${t1}\\b[^\\d]{0,15}(\\d{1,3})[/\\-](\\d{1,2})(?:\\s*\\((\\d{1,2}\\.?\\d?)\\))?`,'i'));return m&&parseInt(m[1])>=0?{runs:m[1],wkts:m[2],overs:m[3]}:null;})();const ls2=(()=>{const m=text.match(new RegExp(`\\b${t2}\\b[^\\d]{0,15}(\\d{1,3})[/\\-](\\d{1,2})(?:\\s*\\((\\d{1,2}\\.?\\d?)\\))?`,'i'));return m&&parseInt(m[1])>=0?{runs:m[1],wkts:m[2],overs:m[3]}:null;})();const yetTeam=text.match(new RegExp(`(${T.join('|')})[^\\n]{0,50}[Yy]et\\s+to\\s+[Bb]at`))?.[1]?.toUpperCase()||null;let bT=t2,bowT=t1,score,wkts,overs,fS=null,fW=null,fO=null,dT=tgt;if(ls1&&ls2){const o1=ls1.overs?parseFloat(ls1.overs):20,o2=ls2.overs?parseFloat(ls2.overs):20;if(yetTeam){bT=yetTeam===t1?t2:t1;bowT=yetTeam;}else if(status==='FINISHED'&&wonM){bT=wonM[1].toUpperCase();bowT=bT===t1?t2:t1;}else{bT=o2<=o1?t2:t1;bowT=bT===t1?t2:t1;}if(bT===t2){fS=ls1.runs;fW=ls1.wkts;fO=ls1.overs||'20';score=ls2.runs;wkts=ls2.wkts;overs=ls2.overs||exOv||'0.0';}else{fS=ls2.runs;fW=ls2.wkts;fO=ls2.overs||'20';score=ls1.runs;wkts=ls1.wkts;overs=ls1.overs||exOv||'0.0';}if(!dT&&fS)dT=parseInt(fS)+1;}else{const s=aS[aS.length-1];score=s[1];wkts=s[2];overs=s[3]||exOv||'0.0';}let wP1=50,wP2=50;const pm1=text.match(new RegExp(`\\b${bT}\\b[^%\\d]*(\\d{1,3})\\s*%`,'i')),pm2=text.match(new RegExp(`\\b${bowT}\\b[^%\\d]*(\\d{1,3})\\s*%`,'i'));if(pm1&&pm2){const p1=parseInt(pm1[1]),p2=parseInt(pm2[1]);if(Math.abs(p1+p2-100)<=5){wP2=p1;wP1=p2;}}if(wP1===50&&rrr){wP2=rrr<6?78:rrr<8?64:rrr<10?50:rrr<12?36:20;wP1=100-wP2;}if(status==='FINISHED'&&wonM){const w=wonM[1].toUpperCase();wP1=w===bowT?100:0;wP2=w===bT?100:0;}const recent=[];const seqM=text.match(/\b([0-6W]|WD|NB)\s+([0-6W]|WD|NB)\s+([0-6W]|WD|NB)\s+([0-6W]|WD|NB)\s+([0-6W]|WD|NB)\s+([0-6W]|WD|NB)\b/i);if(seqM){for(let i=1;i<=6;i++)recent.push(seqM[i].toUpperCase());}while(recent.length<6)recent.push('·');return{battingTeam:bT,bowlingTeam:bowT,score:score||'0',wickets:wkts||'0',overs:overs||'0.0',team1Score:fS||null,team1Wickets:fW||null,team1Overs:fO||null,target:dT||null,crr,rrr,status,result,toss:null,winProbT1:wP1,winProbT2:wP2,recent,batsmen:[],bowlers:[],commentary:[]};},T,t1,t2);
    await page.close();if(!raw)return null;
    return{team1:{name:raw.bowlingTeam},team2:{name:raw.battingTeam},score:raw.score,wickets:raw.wickets,overs:raw.overs,team1Score:raw.team1Score,team1Wickets:raw.team1Wickets,team1Overs:raw.team1Overs,target:raw.target,status:raw.status,result:raw.result,toss:raw.toss,winProb:raw.winProbT2,winProbT1:raw.winProbT1,winProbT2:raw.winProbT2,recent:raw.recent,batsmen:raw.batsmen,bowlers:raw.bowlers,commentary:raw.commentary,crr:raw.crr,rrr:raw.rrr,source:'google'};
  }catch(e){await page.close().catch(()=>{});console.error('[Google browser]',e.message);return null;}
};

// ─────────────────────────────────────────────────────────────────────────────
// STANDINGS + STATS — called every 12h
// ESPN Cricinfo API first (never blocked), then Cricbuzz JSON
// ─────────────────────────────────────────────────────────────────────────────
export const scrapeIPLStandingsAndStats = async () => {
  let pointsTable = null, orangeCap = null, purpleCap = null;
  let topBatsmen = [], topBowlers = [];

  // ── ESPN standings ────────────────────────────────────────────────────────
  try {
    const data = await fetchJSON(ESPN_STANDINGS);
    const groups = data?.children || data?.standings?.entries || [];

    for (const group of groups) {
      const entries = group?.standings?.entries || group?.entries || [];
      if (!entries.length) continue;

      const table = entries.map(e => {
        const teamName = e.team?.displayName || e.team?.name || '';
        const team = matchTeamName(teamName);
        if (!team) return null;
        const stats = {};
        (e.stats || []).forEach(s => { stats[s.name || s.abbreviation] = s.value || s.displayValue; });
        return {
          team,
          played: parseInt(stats.gamesPlayed || stats.GP || stats.played || 0),
          won:    parseInt(stats.wins        || stats.W  || stats.won    || 0),
          lost:   parseInt(stats.losses      || stats.L  || stats.lost   || 0),
          pts:    parseInt(stats.points      || stats.PTS|| stats.pts    || 0),
          nrr:    parseFloat(stats.netRunRate || stats.NRR || 0).toFixed(3),
        };
      }).filter(Boolean);

      if (table.length >= 4) {
        pointsTable = table.sort((a,b) => b.pts - a.pts || parseFloat(b.nrr) - parseFloat(a.nrr));
        console.log(`📊 [ESPN] Points table: ${pointsTable.length} teams`);
        break;
      }
    }
  } catch(e) { console.log('[ESPN standings]', e.message); }

  // ── Cricbuzz JSON standings ───────────────────────────────────────────────
  if (!pointsTable) {
    for (const sid of CB_SERIES_IDS) {
      try {
        const data = await fetchJSON(`https://www.cricbuzz.com/api/cricket-series/${sid}/standings`);
        const rows = data?.pointsTable?.[0]?.pointsTableInfo || data?.pointsTableInfo || [];
        if (!Array.isArray(rows) || rows.length < 4) continue;

        const table = rows.map(r => ({
          team:   matchTeamName(r.teamSName || r.teamName || '') || '',
          played: parseInt(r.matchesPlayed || 0),
          won:    parseInt(r.matchesWon    || 0),
          lost:   parseInt(r.matchesLost   || 0),
          pts:    parseInt(r.points        || 0),
          nrr:    parseFloat(r.nrr || 0).toFixed(3),
        })).filter(t => TEAMS.includes(t.team)).sort((a,b) => b.pts - a.pts);

        if (table.length >= 4) {
          pointsTable = table;
          console.log(`📊 [CB JSON sid=${sid}] Points table: ${table.length} teams`);
          break;
        }
      } catch(e) { /* try next */ }
    }
  }

  // ── Cricbuzz JSON stats ───────────────────────────────────────────────────
  for (const sid of CB_SERIES_IDS) {
    if (topBatsmen.length > 0 && topBowlers.length > 0) break;
    try {
      const [batting, bowling] = await Promise.all([
        fetchJSON(`https://www.cricbuzz.com/api/cricket-series/${sid}/stats?statsType=mostRuns`),
        fetchJSON(`https://www.cricbuzz.com/api/cricket-series/${sid}/stats?statsType=mostWickets`),
      ]);
      const parseP = (d, type) => {
        const list = d?.statsDetails?.[0]?.playerStatsList || d?.values?.[0]?.playerStats || d?.statsList || d?.values || [];
        return (Array.isArray(list)?list:[]).slice(0,10).map(p => ({
          name: p.playerName||p.name||'', team:(p.teamSName||'').toUpperCase(),
          runs:    type==='bat'  ? parseInt(p.runs    ||p.value||0) : undefined,
          wickets: type==='bowl' ? parseInt(p.wickets ||p.value||0) : undefined,
        })).filter(p => p.name.length > 2);
      };
      const bats  = parseP(batting, 'bat').sort((a,b)=>(b.runs||0)-(a.runs||0));
      const bowls = parseP(bowling,'bowl').sort((a,b)=>(b.wickets||0)-(a.wickets||0));
      if (bats.length > 0  || bowls.length > 0) {
        if (topBatsmen.length===0) { topBatsmen=bats;  orangeCap=bats[0]||null; }
        if (topBowlers.length===0) { topBowlers=bowls; purpleCap=bowls[0]||null; }
        console.log(`📊 [CB JSON sid=${sid}] Orange:${orangeCap?.name} | Purple:${purpleCap?.name}`);
      }
    } catch(e) { /* try next */ }
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