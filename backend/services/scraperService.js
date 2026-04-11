/**
 * scraperService.js  —  REWRITTEN
 *
 * Strategy (fastest → most reliable):
 *   1. Cricbuzz miniscore JSON  → live score, batsmen, bowler, recent balls
 *   2. Cricbuzz commentary JSON → ball-by-ball commentary
 *   3. Cricbuzz scorecard JSON  → full innings data
 *   4. crex.com HTML           → fallback if Cricbuzz JSON fails
 *   5. Google HTML             → last resort
 *
 * Points table / caps: cricbuzz series JSON  (12h cycle)
 *
 * HOW: Cricbuzz's own website calls these XHR endpoints.
 *   They are public (no auth), just need a browser-like User-Agent.
 *   Match ID is parsed from the Cricbuzz listing page URL slug.
 */

import puppeteer from 'puppeteer-core';

const CHROME =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  process.env.CHROME_PATH ||
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/usr/bin/google-chrome-stable');

const TEAMS = ['CSK', 'MI', 'RCB', 'KKR', 'RR', 'PBKS', 'DC', 'GT', 'LSG', 'SRH'];
const wait = ms => new Promise(r => setTimeout(r, ms));

// IPL 2026 series ID on Cricbuzz — update if wrong
const CB_SERIES_ID = '9241';  // verify from cricbuzz.com/cricket-series URL

const LAUNCH = {
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helper — uses puppeteer page to fetch JSON (bypasses CORS / bot blocks)
// ─────────────────────────────────────────────────────────────────────────────
const fetchJSON = async (page, url, timeoutMs = 15000) => {
  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
    if (!response || !response.ok()) return null;
    const text = await page.evaluate(() => document.body?.innerText || '');
    if (!text || text.length < 10) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: Get today's IPL match ID from Cricbuzz listing
// ─────────────────────────────────────────────────────────────────────────────
const findMatchFromCricbuzz = async browser => {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.cricbuzz.com/cricket-match/live-scores', {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await wait(2500);

    const match = await page.evaluate(TEAMS => {
      const links = Array.from(document.querySelectorAll('a[href*="/live-cricket-scores/"]'));
      const seen = new Set();
      const candidates = [];

      for (const a of links) {
        const href = a.getAttribute('href') || '';
        const hu = href.toUpperCase();
        if (seen.has(href)) continue;
        if (!hu.includes('IPL') && !hu.includes('INDIAN-PREMIER')) continue;

        // Extract match ID from URL: /live-cricket-scores/149746/gt-vs-dc-...
        const idM = href.match(/\/live-cricket-scores\/(\d+)\//);
        if (!idM) continue;

        const t = TEAMS.filter(t =>
          hu.includes(`-${t}-`) || hu.includes(`/${t}-`) || hu.endsWith(`-${t}`)
        );
        if (t.length < 2) continue;
        seen.add(href);

        const card = a.closest('[class*="cb-col"]') || a.parentElement;
        const liveEl = card?.querySelector('.cb-text-live');
        const doneEl = card?.querySelector('.cb-text-complete,.cb-text-stumps');
        const hint = liveEl ? 'LIVE' : doneEl ? 'FINISHED' : 'UPCOMING';

        candidates.push({
          matchId: idM[1],
          cbUrl: 'https://www.cricbuzz.com' + href,
          team1: t[0],
          team2: t[1],
          statusHint: hint,
          priority: hint === 'LIVE' ? 0 : hint === 'FINISHED' ? 1 : 2,
        });
      }

      candidates.sort((a, b) => a.priority - b.priority);
      return candidates[0] || null;
    }, TEAMS);

    await page.close();
    return match;
  } catch (err) {
    await page.close().catch(() => { });
    console.error('[CB listing]', err.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2: Cricbuzz miniscore JSON — PRIMARY live data source
//
// Endpoint: https://www.cricbuzz.com/api/cricket-match/{matchId}/miniscore
// Returns: { minScore: { batsman, bwlr, score, wickets, overs, status, ... } }
// ─────────────────────────────────────────────────────────────────────────────
const fetchCricbuzzMiniscore = async (browser, matchId) => {
  const page = await browser.newPage();
  try {
    // Set headers to mimic browser XHR request
    await page.setExtraHTTPHeaders({
      'Accept': 'application/json, text/plain, */*',
      'Referer': `https://www.cricbuzz.com/live-cricket-scores/${matchId}/`,
      'X-Requested-With': 'XMLHttpRequest',
    });

    const url = `https://www.cricbuzz.com/api/cricket-match/${matchId}/miniscore`;
    console.log(`🔗 [CB miniscore] ${url}`);

    const data = await fetchJSON(page, url, 15000);
    await page.close();

    if (!data?.minScore) {
      console.log('[CB miniscore] No minScore in response');
      return null;
    }

    return parseCricbuzzMiniscore(data, matchId);
  } catch (err) {
    await page.close().catch(() => { });
    console.error('[CB miniscore]', err.message);
    return null;
  }
};

// Parse the Cricbuzz miniscore JSON into our standard format
const parseCricbuzzMiniscore = (data, matchId) => {
  const ms = data.minScore || {};
  const mc = data.matchHeader || data.matchInfo || {};

  // ── Status ────────────────────────────────────────────────────────────────
  const statusMap = {
    'Rain': 'RAIN DELAY',
    'Innings Break': 'INNINGS BREAK',
    'Super Over': 'SUPER OVER',
    'Match not started': 'UPCOMING',
    'Abandoned': 'ABANDONED',
    'Stumps': 'INNINGS BREAK',
  };
  let status = 'LIVE';
  let result = '';
  const statusText = ms.status || mc.status || '';

  for (const [key, val] of Object.entries(statusMap)) {
    if (statusText.toLowerCase().includes(key.toLowerCase())) {
      status = val; break;
    }
  }

  // Check for finished
  if (statusText.toLowerCase().includes('won')) {
    status = 'FINISHED';
    result = statusText;
  }
  if (ms.matchEnded || mc.complete) {
    status = 'FINISHED';
    if (!result) result = statusText;
  }

  // ── Teams ─────────────────────────────────────────────────────────────────
  // miniscore gives: team1 (batting), team2 (bowling) in live context
  // or matchHeader.team1/team2
  const rawTeam1 = mc.team1?.shortName || mc.team1?.name || '';
  const rawTeam2 = mc.team2?.shortName || mc.team2?.name || '';

  // Map to our abbreviations
  const matchTeam = name => {
    const u = name.toUpperCase();
    return TEAMS.find(t => u.includes(t) || t.includes(u.substring(0, 3))) || name.toUpperCase().substring(0, 4);
  };

  const t1 = matchTeam(rawTeam1) || 'TBD';
  const t2 = matchTeam(rawTeam2) || 'TBD';

  // ── Innings data ──────────────────────────────────────────────────────────
  // ms.batTeam = currently batting team info
  // ms.bowlTeam = currently bowling team
  // ms.inningsId: 1 = first innings, 2 = second innings
  const inningsId = ms.inningsId || 1;
  const batTeamId = ms.batTeam?.id || ms.batTeamId;
  const team1Id = mc.team1?.id;

  // Batting team
  let battingTeam = t2;
  let bowlingTeam = t1;
  if (batTeamId && team1Id) {
    battingTeam = batTeamId === team1Id ? t1 : t2;
    bowlingTeam = battingTeam === t1 ? t2 : t1;
  }

  // ── Current score & Clean Wickets ──────────────────────────────────────────
  // ── Current score & Bulletproof Wickets Logic ──────────────────────────────
  const score = String(ms.score ?? ms.runs ?? 0);

// 🛡️ SAFE WICKETS
const rawWkts = ms.wkts ?? ms.wickets ?? 0;
const wickets = String(parseInt(rawWkts) || 0);

// 🛡️ SAFE OVERS (IMPORTANT FIX)
let overs = String(ms.overs ?? '0.0');

// fix corrupted values like "716.2"
if (/^\d{3,}/.test(overs)) {
  overs = overs.slice(-4); // → "16.2"
}

// fix ".2" → "0.2"
if (/^\.\d$/.test(overs)) {
  overs = "0" + overs;
}
  let team1Score = null, team1Wickets = null, team1Overs = null;
  let target = null;

  if (inningsId === 2) {
    // Previous innings data
    const prev = ms.prevInningsScore || ms.team1Score || null;
    if (prev) {
      // format: "152/8 (20 Ov)"
      const m = String(prev).match(/(\d+)[\/\-](\d+)\s*\(?([\d.]+)/);
      if (m) {
        team1Score = m[1];
        team1Wickets = m[2];
        team1Overs = m[3];
        target = parseInt(m[1]) + 1;
      }
    }
    // Alternative: from ms directly
    if (!team1Score && ms.target) {
      target = ms.target;
      team1Score = String(ms.target - 1);
    }
  }

  // CRR / RRR
  const crr = ms.currentRunRate ? parseFloat(ms.currentRunRate) : null;
  const rrr = ms.requiredRunRate ? parseFloat(ms.requiredRunRate) : null;

  // ── Batsmen ───────────────────────────────────────────────────────────────
  // ms.batsman: [{ name, runs, balls, fours, sixes, strikeRate, outDec?, isStriker }]
  const batsmen = (ms.batsman || []).slice(0, 3).map(b => ({
    name: b.name || b.batName || 'Unknown',
    runs: parseInt(b.runs ?? b.score ?? 0),
    balls: parseInt(b.balls ?? 0),
    fours: parseInt(b.fours ?? b['4s'] ?? 0),
    sixes: parseInt(b.sixes ?? b['6s'] ?? 0),
    sr: b.strikeRate ? parseFloat(b.strikeRate).toFixed(1)
      : (b.balls ? ((b.runs / b.balls) * 100).toFixed(1) : '0.0'),
    onStrike: b.isStriker ?? b.striker ?? false,
  }));

  // ── Bowler ────────────────────────────────────────────────────────────────
  // ms.bowler: { name, overs, maidens, runs, wickets, economy, isStriker }
  const bowlers = (ms.bowler ? [ms.bowler] : []).concat(ms.bowlers || []).slice(0, 2).map(b => ({
    name: b.name || b.bowlName || 'Unknown',
    overs: String(b.overs ?? '0'),
    maidens: parseInt(b.maidens ?? b.maiden ?? 0),
    runs: parseInt(b.runs ?? 0),
    wickets: parseInt(b.wickets ?? b.wkts ?? 0),
    economy: b.economy ? parseFloat(b.economy).toFixed(1)
      : (b.overs ? (b.runs / parseFloat(b.overs)).toFixed(1) : '0.0'),
  }));

  // ── Recent balls ──────────────────────────────────────────────────────────
  // ms.recentOvsStats: "1 0 2 W 4 ." or similar
  // ms.lastFewOvers: "0 1 0 1 1 0 | 4 W 1 0"
  let recent = [];
  const recentStr = ms.recentOvsStats || ms.lastFewOvers || ms.recentBalls || '';
  if (recentStr) {
    recent = recentStr
      .replace(/\|/g, ' ')
      .trim()
      .split(/\s+/)
      .map(b => {
        const u = b.toUpperCase();
        if (u === '.' || u === '·') return '·';
        if (u === 'W') return 'W';
        if (u === 'WD' || u === 'WIDE') return 'WD';
        if (u === 'NB' || u === 'NO-BALL') return 'NB';
        if (/^\d+$/.test(u)) return u;
        return '·';
      })
      .filter(Boolean)
      .slice(-6);
  }
  while (recent.length < 6) recent.push('·');

  // ── Toss ──────────────────────────────────────────────────────────────────
  const tossText = mc.tossResults?.tossWinnerName
    ? `${mc.tossResults.tossWinnerName} chose to ${mc.tossResults.decision || 'bat'}`
    : null;

  // ── Win probability ───────────────────────────────────────────────────────
  let winProbT1 = 50, winProbT2 = 50;
  if (ms.winProbability) {
    winProbT2 = Math.round(parseFloat(ms.winProbability));
    winProbT1 = 100 - winProbT2;
  } else if (rrr && crr) {
    const ratio = rrr / crr;
    winProbT2 = ratio < 0.75 ? 78 : ratio < 0.9 ? 66 : ratio < 1.0 ? 55
      : ratio < 1.1 ? 47 : ratio < 1.3 ? 38 : ratio < 1.6 ? 28 : 16;
    winProbT1 = 100 - winProbT2;
  } else if (rrr) {
    winProbT2 = rrr < 6 ? 78 : rrr < 8 ? 64 : rrr < 10 ? 50 : rrr < 12 ? 36 : 20;
    winProbT1 = 100 - winProbT2;
  } else if (status === 'LIVE' && inningsId === 1) {
    const proj = crr ? crr * 20 : (parseInt(score) / Math.max(parseFloat(overs), 1)) * 20;
    winProbT2 = proj > 185 ? 62 : proj > 165 ? 56 : proj > 145 ? 50 : proj > 130 ? 44 : 38;
    winProbT1 = 100 - winProbT2;
  }

  if (status === 'FINISHED') {
    const wonTeam = result.toUpperCase();
    if (wonTeam.includes(battingTeam)) { winProbT2 = 100; winProbT1 = 0; }
    else if (wonTeam.includes(bowlingTeam)) { winProbT1 = 100; winProbT2 = 0; }
  }

  return {
    team1: { name: bowlingTeam },
    team2: { name: battingTeam },
    score,
    wickets,
    overs,
    team1Score,
    team1Wickets,
    team1Overs,
    target,
    status,
    result,
    toss: tossText,
    winProbT1,
    winProbT2,
    winProb: winProbT2,
    crr,
    rrr,
    recent: recent.slice(0, 6),
    batsmen,
    bowlers,
    commentary: [],   // filled separately
    source: 'cricbuzz-json',
    _matchId: matchId,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3: Cricbuzz commentary JSON — ball-by-ball
//
// Endpoint: https://www.cricbuzz.com/api/cricket-match/{matchId}/commentary/{inningsId}
// Returns: { commentary: { commentaryList: [...] } }
// ─────────────────────────────────────────────────────────────────────────────
const fetchCricbuzzCommentary = async (browser, matchId, inningsId = 1) => {
  const page = await browser.newPage();
  try {
    await page.setExtraHTTPHeaders({
      'Accept': 'application/json',
      'Referer': `https://www.cricbuzz.com/live-cricket-scores/${matchId}/`,
      'X-Requested-With': 'XMLHttpRequest',
    });

    const url = `https://www.cricbuzz.com/api/cricket-match/${matchId}/commentary/${inningsId}`;
    console.log(`🔗 [CB commentary] ${url}`);

    const data = await fetchJSON(page, url, 15000);
    await page.close();

    if (!data) return [];

    // commentaryList items: { commText, event, overNumber, ballNumber, ... }
    const list = data.commentary?.commentaryList
      || data.commentaryList
      || data.commentaries
      || [];

    return list.slice(0, 15).map(item => {
      const text = item.commText || item.commentary || item.text || '';
      const over = item.overNumber != null
        ? `${item.overNumber}.${item.ballNumber ?? ''}`
        : (item.over || '');
      const evt = (item.event || '').toLowerCase();
      const type = evt.includes('wicket') || text.toLowerCase().includes(' out')
        ? 'wicket'
        : evt.includes('four') || evt.includes('six') || text.toLowerCase().includes('boundary')
          ? 'boundary'
          : 'normal';
      return { over, text: text.substring(0, 200), type, generated: false };
    }).filter(c => c.text.length > 5);
  } catch (err) {
    await page.close().catch(() => { });
    console.error('[CB commentary]', err.message);
    return [];
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4: Cricbuzz scorecard JSON — full innings detail
//
// Endpoint: https://www.cricbuzz.com/api/cricket-match/{matchId}/scorecard
// ─────────────────────────────────────────────────────────────────────────────
const fetchCricbuzzScorecard = async (browser, matchId) => {
  const page = await browser.newPage();
  try {
    await page.setExtraHTTPHeaders({
      'Accept': 'application/json',
      'Referer': `https://www.cricbuzz.com/live-cricket-scorecard/${matchId}/`,
      'X-Requested-With': 'XMLHttpRequest',
    });

    const url = `https://www.cricbuzz.com/api/cricket-match/${matchId}/scorecard`;
    console.log(`🔗 [CB scorecard] ${url}`);

    const data = await fetchJSON(page, url, 15000);
    await page.close();

    if (!data?.scoreCard) return null;
    return data;
  } catch (err) {
    await page.close().catch(() => { });
    console.error('[CB scorecard]', err.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT — called every 40s
// ─────────────────────────────────────────────────────────────────────────────
export const scrapeLiveMatch = async () => {
  let browser;
  try {
    browser = await puppeteer.launch(LAUNCH);

    // ── 1. Find today's match ID ──────────────────────────────────────────
    const matchInfo = await findMatchFromCricbuzz(browser);
    if (!matchInfo) {
      console.log('[Scraper] No IPL match found.');
      await browser.close();
      return null;
    }

    console.log(`🏏 ${matchInfo.team1} vs ${matchInfo.team2} | ${matchInfo.statusHint}`);
    console.log(`   Match ID: ${matchInfo.matchId}`);

    // ── 2. Cricbuzz miniscore JSON (primary) ──────────────────────────────
    let result = await fetchCricbuzzMiniscore(browser, matchInfo.matchId);

    if (result) {
      // Fill in teams if miniscore returned TBD
      if (result.team1?.name === 'TBD') result.team1 = { name: matchInfo.team1 };
      if (result.team2?.name === 'TBD') result.team2 = { name: matchInfo.team2 };

      // ── 3. Commentary (parallel-ish) ────────────────────────────────────
      const inningsId = result.overs && parseFloat(result.overs) > 0
        ? (result.team1Score ? 2 : 1)   // crude detection
        : 1;

      const commentary = await fetchCricbuzzCommentary(browser, matchInfo.matchId, inningsId);
      if (commentary.length > 0) {
        result.commentary = commentary;
        console.log(`✅ [CB commentary] ${commentary.length} items`);
      }

      // ── 4. If batsmen empty, try scorecard ──────────────────────────────
      if (result.batsmen.length === 0) {
        console.log('⚠️ No batsmen from miniscore, trying scorecard…');
        const sc = await fetchCricbuzzScorecard(browser, matchInfo.matchId);
        if (sc) {
          const filled = enrichFromScorecard(result, sc);
          if (filled) result = filled;
        }
      }

      console.log(`✅ [cricbuzz-json] ${result.team1?.name} vs ${result.team2?.name} | ${result.score}/${result.wickets} (${result.overs}) | ${result.status}`);
      result.batsmen?.forEach(b =>
        console.log(`   🏏 ${b.name}${b.onStrike ? '*' : ''}: ${b.runs}(${b.balls}) SR:${b.sr}`)
      );
      result.bowlers?.forEach(b =>
        console.log(`   🎯 ${b.name}: ${b.wickets}/${b.runs} (${b.overs})`)
      );

    } else {
      // ── 5. Fallback: crex.com HTML scraping ─────────────────────────────
      console.log('⚠️ Cricbuzz JSON failed → crex.com HTML…');
      result = await scrapeCrexDotCom(browser, matchInfo);

      if (!result) {
        // ── 6. Last resort: Google ─────────────────────────────────────────
        console.log('⚠️ crex.com failed → Google…');
        result = await scrapeFromGoogle(browser, matchInfo.team1, matchInfo.team2);
      }
    }

    await browser.close();

    if (!result) { console.log('⚠️ All sources failed.'); return null; }

    return { ...result, lastUpdated: new Date() };

  } catch (err) {
    if (browser) await browser.close();
    console.error('❌ Scraper fatal:', err.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Enrich miniscore result with scorecard data (batsmen / bowler fallback)
// ─────────────────────────────────────────────────────────────────────────────
const enrichFromScorecard = (result, scData) => {
  try {
    const scoreCard = scData.scoreCard || [];
    // Find the current (latest) innings
    const inn = scoreCard[scoreCard.length - 1];
    if (!inn) return result;

    // Batsmen — only "not out" players
    const batsmenData = (inn.batTeamDetails?.batsmenData || inn.batsmen || {});
    const batsmenArr = Object.values(batsmenData)
      .filter(b => b.outDesc === '' || b.outDesc == null || b.isNotOut)
      .slice(0, 3);

    if (batsmenArr.length > 0) {
      result.batsmen = batsmenArr.map(b => ({
        name: b.batName || b.name || 'Unknown',
        runs: parseInt(b.runs ?? 0),
        balls: parseInt(b.balls ?? 0),
        fours: parseInt(b.fours ?? b['4s'] ?? 0),
        sixes: parseInt(b.sixes ?? b['6s'] ?? 0),
        sr: b.strikeRate
          ? parseFloat(b.strikeRate).toFixed(1)
          : (b.balls ? ((b.runs / b.balls) * 100).toFixed(1) : '0.0'),
        onStrike: b.isStriker ?? false,
      }));
    }

    // Bowlers — last 2 who bowled
    const bowlersData = inn.bowlTeamDetails?.bowlersData || inn.bowlers || {};
    const bowlersArr = Object.values(bowlersData)
      .filter(b => parseFloat(b.overs || 0) > 0)
      .slice(-2);

    if (bowlersArr.length > 0) {
      result.bowlers = bowlersArr.map(b => ({
        name: b.bowlName || b.name || 'Unknown',
        overs: String(b.overs ?? '0'),
        maidens: parseInt(b.maidens ?? 0),
        runs: parseInt(b.runs ?? 0),
        wickets: parseInt(b.wickets ?? 0),
        economy: b.economy
          ? parseFloat(b.economy).toFixed(1)
          : (b.overs ? (b.runs / parseFloat(b.overs)).toFixed(1) : '0.0'),
      }));
    }

    // Previous innings score (for target)
    if (scoreCard.length >= 2 && !result.team1Score) {
      const prevInn = scoreCard[scoreCard.length - 2];
      const prevScore = prevInn?.scoreDetails?.runs;
      const prevWickets = prevInn?.scoreDetails?.wickets;
      const prevOvers = prevInn?.scoreDetails?.overs;
      if (prevScore != null) {
        result.team1Score = String(prevScore);
        result.team1Wickets = String(prevWickets ?? 10);
        result.team1Overs = String(prevOvers ?? '20');
        result.target = parseInt(prevScore) + 1;
      }
    }

    return result;
  } catch (err) {
    console.error('[enrichFromScorecard]', err.message);
    return result;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// FALLBACK A: crex.com HTML scraping
// ─────────────────────────────────────────────────────────────────────────────
const scrapeCrexDotCom = async (browser, matchInfo) => {
  const page = await browser.newPage();
  try {
    const t1l = matchInfo.team1.toLowerCase();
    const t2l = matchInfo.team2.toLowerCase();

    await page.goto('https://crex.com/', { waitUntil: 'domcontentloaded', timeout: 25000 });
    await wait(2500);

    let crexUrl = await page.evaluate((t1l, t2l) => {
      const links = Array.from(document.querySelectorAll('a[href]'));
      for (const link of links) {
        const hl = link.href.toLowerCase();
        if (
          (hl.includes('cricket-live-score') || hl.includes('scoreboard')) &&
          (hl.includes(t1l.substring(0, 3)) || hl.includes(t2l.substring(0, 3)))
        ) return link.href;
      }
      return null;
    }, t1l, t2l);

    if (!crexUrl) { await page.close(); return null; }

    console.log(`🔗 [crex.com] ${crexUrl}`);
    await page.goto(crexUrl, { waitUntil: 'networkidle2', timeout: 35000 });
    await wait(4000);

    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    await page.close();

    if (bodyText.length < 50) return null;

    // Quick parse for basic score
    const scoreRx = /(\d{1,3})[\/\-](\d{1,2})\s*\(?([\d]+\.[\d])\)?/;
    const scoreM = bodyText.match(scoreRx);
    if (!scoreM) return null;

    const wonRx = new RegExp(`\\b(${TEAMS.join('|')})\\b\\s+won\\s+by\\s+([\\d]+\\s+(?:runs?|wickets?))`, 'i');
    const wonM = bodyText.match(wonRx);
    const upper = bodyText.toUpperCase();

    let status = 'LIVE', result = '';
    if (upper.includes('RAIN DELAY') || upper.includes('COVERS ON')) status = 'RAIN DELAY';
    else if (upper.includes('INNINGS BREAK')) status = 'INNINGS BREAK';
    else if (wonM) { status = 'FINISHED'; result = `${wonM[1].toUpperCase()} won by ${wonM[2]}`; }

    const tossRx = /(KKR|MI|CSK|RCB|RR|PBKS|DC|GT|LSG|SRH)\s+(?:opt|chose|elected)\s+to\s+(bat|bowl|field)/i;
    const tossM = bodyText.match(tossRx);
    const toss = tossM ? `${tossM[1]} chose to ${tossM[2]}` : null;

    // Batsmen
    const batsmen = [];
    const bRx = /([A-Z][a-z]+(?:\s+[A-Z][a-z.]+){1,3})\s+(\d+)\s*\((\d+)\)/g;
    for (const m of bodyText.matchAll(bRx)) {
      if (batsmen.length >= 3) break;
      const name = m[1].trim();
      if (name.length < 2 || name.length > 35) continue;
      batsmen.push({
        name, runs: parseInt(m[2]), balls: parseInt(m[3]),
        fours: 0, sixes: 0,
        sr: m[3] !== '0' ? ((parseInt(m[2]) / parseInt(m[3])) * 100).toFixed(1) : '0.0',
        onStrike: bodyText.includes(m[1] + '*') || bodyText.includes(m[1] + ' 🖊'),
      });
    }

    // Bowlers
    const bowlers = [];
    const bwRx = /([A-Z][a-z]+(?:\s+[A-Z][a-z.]+){1,3})\s+(\d+)[–\-](\d+)\s*\(([\d.]+)\)/g;
    for (const m of bodyText.matchAll(bwRx)) {
      if (bowlers.length >= 2) break;
      const name = m[1].trim();
      if (name.length < 2 || name.length > 35) continue;
      bowlers.push({
        name, wickets: parseInt(m[2]), runs: parseInt(m[3]), overs: m[4], maidens: 0,
        economy: parseFloat(m[4]) ? (parseInt(m[3]) / parseFloat(m[4])).toFixed(1) : '0.0',
      });
    }

    const battingTeam = matchInfo.team2;
    const bowlingTeam = matchInfo.team1;

    let winProbT1 = 50, winProbT2 = 50;
    const p1M = bodyText.match(new RegExp(`\\b${battingTeam}\\b[^%\\d]*(\\d{1,3})\\s*%`, 'i'));
    const p2M = bodyText.match(new RegExp(`\\b${bowlingTeam}\\b[^%\\d]*(\\d{1,3})\\s*%`, 'i'));
    if (p1M && p2M) {
      const p1 = parseInt(p1M[1]), p2 = parseInt(p2M[1]);
      if (Math.abs(p1 + p2 - 100) <= 5) { winProbT2 = p1; winProbT1 = p2; }
    }

    return {
      team1: { name: bowlingTeam },
      team2: { name: battingTeam },
      score: scoreM[1],
      wickets: scoreM[2],
      overs: scoreM[3],
      team1Score: null, team1Wickets: null, team1Overs: null, target: null,
      status, result, toss,
      winProbT1, winProbT2, winProb: winProbT2,
      crr: null, rrr: null,
      recent: ['·', '·', '·', '·', '·', '·'],
      batsmen, bowlers, commentary: [],
      source: 'crex.com',
    };

  } catch (err) {
    await page.close().catch(() => { });
    console.error('[crex.com]', err.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// FALLBACK B: Google
// ─────────────────────────────────────────────────────────────────────────────
const scrapeFromGoogle = async (browser, t1, t2) => {
  const page = await browser.newPage();
  try {
    const q = `${t1} vs ${t2} IPL 2026 live score`;
    await page.goto(`https://www.google.com/search?q=${encodeURIComponent(q)}&hl=en`, {
      waitUntil: 'domcontentloaded', timeout: 25000,
    });
    await wait(2500);

    const raw = await page.evaluate((TEAMS, t1, t2) => {
      const text = document.body?.innerText || '';
      if (!text) return null;

      const upper = text.toUpperCase();
      let status = 'LIVE', result = '';

      const wonRx = new RegExp(`\\b(${TEAMS.join('|')})\\b\\s+won\\s+by\\s+([\\d]+\\s+(?:runs?|wickets?))`, 'i');
      const wonM = text.match(wonRx);
      if (wonM) { status = 'FINISHED'; result = `${wonM[1].toUpperCase()} won by ${wonM[2]}`; }
      else if (upper.includes('RAIN')) status = 'RAIN DELAY';
      else if (upper.includes('INNINGS BREAK')) status = 'INNINGS BREAK';

      const sm = text.match(/(\d{2,3})[\/\-](\d{1,2})\s*\(?([\d.]+(?:\.\d)?)\)?/);
      if (!sm) return null;

      const crrM = text.match(/CRR\s*:?\s*([\d.]+)/i);
      const rrrM = text.match(/RRR\s*:?\s*([\d.]+)/i);
      const tM = text.match(/[Tt]arget\s*:?\s*(\d{2,3})/);

      // Try to find win % for batting team (Google sometimes shows it)
      const p1M = text.match(new RegExp(`\\b${t1}\\b[^%\\d]*(\\d{1,3})\\s*%`, 'i'));
      const p2M = text.match(new RegExp(`\\b${t2}\\b[^%\\d]*(\\d{1,3})\\s*%`, 'i'));
      let wP1 = 50, wP2 = 50;
      if (p1M && p2M) {
        const p1 = parseInt(p1M[1]), p2 = parseInt(p2M[1]);
        if (Math.abs(p1 + p2 - 100) <= 5) { wP1 = p1; wP2 = p2; }
      }

      const toss = text.match(/(KKR|MI|CSK|RCB|RR|PBKS|DC|GT|LSG|SRH)\s+(?:chose|opted)\s+to\s+(bat|bowl)/i);

      return {
        score: sm[1], wickets: sm[2], overs: sm[3] || '0.0',
        status, result,
        toss: toss ? `${toss[1]} chose to ${toss[2]}` : null,
        crr: crrM ? parseFloat(crrM[1]) : null,
        rrr: rrrM ? parseFloat(rrrM[1]) : null,
        target: tM ? parseInt(tM[1]) : null,
        winProbT1: wP1, winProbT2: wP2,
      };
    }, TEAMS, t1, t2);

    await page.close();
    if (!raw) return null;

    return {
      team1: { name: t1 },
      team2: { name: t2 },
      score: raw.score,
      wickets: raw.wickets,
      overs: raw.overs,
      team1Score: null, team1Wickets: null, team1Overs: null,
      target: raw.target,
      status: raw.status,
      result: raw.result,
      toss: raw.toss,
      winProbT1: raw.winProbT1,
      winProbT2: raw.winProbT2,
      winProb: raw.winProbT2,
      crr: raw.crr,
      rrr: raw.rrr,
      recent: ['·', '·', '·', '·', '·', '·'],
      batsmen: [],
      bowlers: [],
      commentary: [],
      source: 'google',
    };
  } catch (err) {
    await page.close().catch(() => { });
    console.error('[Google]', err.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// STANDINGS + STATS — called every 12h
// Primary: Cricbuzz series JSON API
// Fallback: computed matchDataEngine data
// ─────────────────────────────────────────────────────────────────────────────
export const scrapeIPLStandingsAndStats = async () => {
  let browser;
  try {
    browser = await puppeteer.launch(LAUNCH);
    const page = await browser.newPage();

    await page.setExtraHTTPHeaders({
      'Accept': 'application/json',
      'Referer': 'https://www.cricbuzz.com/',
      'X-Requested-With': 'XMLHttpRequest',
    });

    // ── Points table ──────────────────────────────────────────────────────
    let pointsTable = null;
    try {
      // Cricbuzz series standings JSON
      // URL: https://www.cricbuzz.com/api/series/{seriesId}/standings
      const url = `https://www.cricbuzz.com/api/series/${CB_SERIES_ID}/standings`;
      console.log(`🔗 [CB standings] ${url}`);

      const data = await fetchJSON(page, url, 20000);
      if (data) {
        // Parse standings: { pointsTable: [{ pointsTableInfo: [{ teamId, teamName, played, won, lost, tied, noResult, pts, nrr }] }] }
        const rows = data.pointsTable?.[0]?.pointsTableInfo
          || data.standings
          || data.teams
          || [];

        const parsed = rows.map(r => {
          const abbr = r.teamSName || r.teamAbbr || r.teamName?.substring(0, 4).toUpperCase() || '';
          const team = TEAMS.find(t => abbr.includes(t) || r.teamName?.toUpperCase().includes(t)) || abbr;
          return {
            team,
            played: parseInt(r.matchesPlayed ?? r.played ?? r.pld ?? 0),
            won: parseInt(r.matchesWon ?? r.won ?? r.w ?? 0),
            lost: parseInt(r.matchesLost ?? r.lost ?? r.l ?? 0),
            pts: parseInt(r.pts ?? r.points ?? 0),
            nrr: parseFloat(r.nrr ?? r.netRunRate ?? 0),
          };
        }).filter(r => r.team && TEAMS.includes(r.team));

        if (parsed.length >= 4) {
          pointsTable = parsed.sort((a, b) => b.pts - a.pts || b.nrr - a.nrr);
          console.log(`📊 [CB standings] ${pointsTable.length} teams`);
        }
      }
    } catch (e) {
      console.error('[CB standings JSON]', e.message);
    }

    // Fallback: crex.com HTML for standings
    if (!pointsTable) {
      try {
        await page.goto('https://crex.com/series/V8B/indian-premier-league-2026/points-table', {
          waitUntil: 'domcontentloaded', timeout: 25000,
        });
        await wait(3000);
        pointsTable = await page.evaluate(TEAMS => {
          const rows = Array.from(document.querySelectorAll(
            '[class*="standing"] tr,[class*="points"] tr,[class*="table"] tr,table tr'
          ));
          const table = [];
          rows.forEach(row => {
            const text = row.innerText?.trim().toUpperCase() || '';
            const team = TEAMS.find(t => text.startsWith(t) || text.includes(` ${t} `) || text.includes(`\t${t}\t`));
            if (!team) return;
            const nums = [...text.matchAll(/([\+\-]?\d+\.?\d*)/g)].map(m => parseFloat(m[1]));
            if (nums.length < 3) return;
            const pts = nums.find((n, i) => i >= 1 && n <= 28 && Number.isInteger(n));
            const nrr = nums.find(n => n > -10 && n < 10 && !Number.isInteger(n) && n !== 0);
            if (pts === undefined) return;
            table.push({ team, played: parseInt(nums[0]) || 0, won: parseInt(nums[1]) || 0, lost: parseInt(nums[2]) || 0, pts: pts || 0, nrr: nrr || 0 });
          });
          return table.length >= 4 ? table.sort((a, b) => b.pts - a.pts) : null;
        }, TEAMS);
        console.log(`📊 [crex standings] ${pointsTable?.length || 0} teams`);
      } catch (e) {
        console.error('[crex standings]', e.message);
      }
    }

    // ── Orange/Purple caps (Cricbuzz stats) ───────────────────────────────
    let orangeCap = null, purpleCap = null, topBatsmen = [], topBowlers = [];
    try {
      // Most runs
      const runsUrl = `https://www.cricbuzz.com/api/series/${CB_SERIES_ID}/stats?statType=most-runs`;
      const runsData = await fetchJSON(page, runsUrl, 15000);
      if (runsData?.values?.length) {
        topBatsmen = runsData.values.slice(0, 10).map(p => ({
          name: p.playerName || p.name || 'Unknown',
          runs: parseInt(p.value ?? p.runs ?? 0),
          team: p.teamSName || '',
        })).filter(p => p.runs > 0);
        orangeCap = topBatsmen[0] || null;
        console.log(`🏏 Orange Cap: ${orangeCap?.name} (${orangeCap?.runs} runs)`);
      }
    } catch (e) { console.error('[CB orange cap]', e.message); }

    try {
      // Most wickets
      const wktsUrl = `https://www.cricbuzz.com/api/series/${CB_SERIES_ID}/stats?statType=most-wickets`;
      const wktsData = await fetchJSON(page, wktsUrl, 15000);
      if (wktsData?.values?.length) {
        topBowlers = wktsData.values.slice(0, 10).map(p => ({
          name: p.playerName || p.name || 'Unknown',
          wickets: parseInt(p.value ?? p.wickets ?? 0),
          team: p.teamSName || '',
        })).filter(p => p.wickets > 0);
        purpleCap = topBowlers[0] || null;
        console.log(`🎯 Purple Cap: ${purpleCap?.name} (${purpleCap?.wickets} wickets)`);
      }
    } catch (e) { console.error('[CB purple cap]', e.message); }

    await page.close();
    await browser.close();

    return {
      pointsTable: pointsTable || [],
      orangeCap,
      purpleCap,
      topBatsmen,
      topBowlers,
      lastUpdated: new Date(),
      source: 'cricbuzz-json',
    };

  } catch (err) {
    if (browser) await browser.close();
    console.error('[Standings/Stats]', err.message);
    return null;
  }
};

// Keep backward compat
export const scrapeIPLStandings = scrapeIPLStandingsAndStats;