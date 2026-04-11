/**
 * scraperService.js
 *
 * RENDER-COMPATIBLE VERSION
 *
 * THE CORE PROBLEM WITH RENDER FREE TIER:
 * - Chrome/Chromium is NOT installed by default
 * - Even after installing it, Puppeteer fails due to missing libs
 * - Free tier has 512MB RAM — Chrome alone uses 200-400MB
 *
 * SOLUTION: HTTP-FIRST APPROACH
 * Use Node's built-in https module to call Cricbuzz's internal JSON API
 * endpoints (the ones their mobile app uses). These return clean JSON
 * with no browser needed. Puppeteer is only used as last resort.
 *
 * DATA SOURCES (in priority order):
 * 1. Cricbuzz Internal JSON API — no browser, instant, works on Render
 *    Endpoints used by their mobile app, publicly accessible
 * 2. ESPN Cricinfo JSON API — no browser, works on Render
 * 3. Puppeteer → crex.com (only if env has Chrome, i.e. local dev)
 * 4. Puppeteer → Cricbuzz match page (local dev fallback)
 * 5. Puppeteer → Google (local dev last resort)
 */

import puppeteer from 'puppeteer';
import https from 'https';

const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH
  || (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/usr/bin/chromium');

const TEAMS = ['CSK','MI','RCB','KKR','RR','PBKS','DC','GT','LSG','SRH'];
const wait  = ms => new Promise(r => setTimeout(r, ms));

// ─── Check if Chrome is available ────────────────────────────────────────────
import { existsSync } from 'fs';
const CHROME_AVAILABLE = (() => {
  try { return existsSync(CHROME); } catch { return false; }
})();

const LAUNCH = {
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--disable-gpu', '--single-process', '--no-zygote',
    '--disable-blink-features=AutomationControlled',
    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  ],
};

// ─── HTTP helper — no browser needed ─────────────────────────────────────────
const httpGet = (url, headers = {}) => new Promise((resolve, reject) => {
  const req = https.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 Mobile Safari/537.36',
      'Accept': 'application/json, text/html, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.cricbuzz.com/',
      'Cache-Control': 'no-cache',
      ...headers,
    },
    timeout: 12000,
  }, res => {
    // Follow redirects
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      return httpGet(res.headers.location, headers).then(resolve).catch(reject);
    }
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => resolve(data));
  });
  req.on('error', reject);
  req.on('timeout', () => { req.destroy(); reject(new Error('HTTP timeout')); });
});

const httpGetJSON = async (url, headers = {}) => {
  try {
    const text = await httpGet(url, headers);
    return JSON.parse(text);
  } catch { return null; }
};

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE 1: Cricbuzz Internal JSON API
// These are the endpoints used by Cricbuzz's own mobile app.
// They return structured JSON — no HTML parsing needed.
// ─────────────────────────────────────────────────────────────────────────────

const CB_LIVE_LIST   = 'https://www.cricbuzz.com/api/cricket-match/live-scores';
const CB_MINI_SCORE  = id => `https://www.cricbuzz.com/api/cricket-match/${id}/mini-scorecard`;
const CB_SCORECARD   = id => `https://www.cricbuzz.com/api/cricket-scorecard/${id}`;
const CB_MATCH_INFO  = id => `https://www.cricbuzz.com/api/cricket-match/${id}/match-info`;
const CB_COMMENTARY  = id => `https://www.cricbuzz.com/api/cricket-match/${id}/commentary?page=1`;

// Points table & stats
const CB_POINTS_TABLE = 'https://www.cricbuzz.com/api/cricket-series/9237/standings';
const CB_MOST_RUNS    = 'https://www.cricbuzz.com/api/cricket-series/9237/stats?statsType=mostRuns';
const CB_MOST_WKTS   = 'https://www.cricbuzz.com/api/cricket-series/9237/stats?statsType=mostWickets';

// Alternate series IDs in case 9237 is wrong
const CB_SERIES_IDS  = ['9237', '9203', '9280', '9300'];

/**
 * Find today's live/recent IPL match via Cricbuzz JSON
 */
const findMatchViaJSON = async () => {
  try {
    const data = await httpGetJSON(CB_LIVE_LIST);
    if (!data) return null;

    // Cricbuzz JSON structure varies — try multiple known formats
    const sections = data?.matchDetails || data?.typeMatches || data?.matches || [];

    for (const section of (Array.isArray(sections) ? sections : [])) {
      // Format 1: matchDetails[].matchDetailsMap.match[]
      const matches1 = section?.matchDetailsMap?.match || [];
      // Format 2: typeMatches[].seriesMatches[].seriesAdWrapper.matches[]
      const seriesMatches = section?.seriesMatches || [];
      const matches2 = seriesMatches.flatMap(s =>
        s?.seriesAdWrapper?.matches || s?.matches || []
      );

      for (const m of [...matches1, ...matches2]) {
        const info   = m?.matchInfo || m;
        const series = (info?.seriesName || info?.series?.name || '').toUpperCase();
        const state  = (info?.state || info?.status || info?.matchStatus || '').toUpperCase();

        if (!series.includes('IPL') && !series.includes('PREMIER LEAGUE')) continue;
        if (state === 'PREVIEW' || state === 'SCHEDULED') continue; // not started

        const t1  = (info?.team1?.teamSName || info?.team1ShortName || '').toUpperCase();
        const t2  = (info?.team2?.teamSName || info?.team2ShortName || '').toUpperCase();
        const mid = String(info?.matchId || info?.id || '');

        if (!mid || !TEAMS.includes(t1) || !TEAMS.includes(t2)) continue;

        return {
          matchId:    mid,
          team1:      t1,
          team2:      t2,
          statusHint: state.includes('PROGRESS') || state.includes('LIVE') ? 'LIVE'
                    : state.includes('COMPLETE') || state.includes('FINISH') ? 'FINISHED'
                    : 'RECENT',
          cbUrl: `https://www.cricbuzz.com/live-cricket-scorecard/${mid}`,
          seriesId: String(info?.seriesId || '9237'),
        };
      }
    }
    return null;
  } catch (err) {
    console.log('[CB JSON list]', err.message);
    return null;
  }
};

/**
 * Get full scorecard via Cricbuzz JSON API
 */
const getScoreViaJSON = async (matchId, team1, team2) => {
  try {
    // Fetch mini scorecard, full scorecard, and commentary in parallel
    const [mini, sc, info, comm] = await Promise.allSettled([
      httpGetJSON(CB_MINI_SCORE(matchId)),
      httpGetJSON(CB_SCORECARD(matchId)),
      httpGetJSON(CB_MATCH_INFO(matchId)),
      httpGetJSON(CB_COMMENTARY(matchId)),
    ]);

    const miniData  = mini.status  === 'fulfilled' ? mini.value  : null;
    const scData    = sc.status    === 'fulfilled' ? sc.value    : null;
    const infoData  = info.status  === 'fulfilled' ? info.value  : null;
    const commData  = comm.status  === 'fulfilled' ? comm.value  : null;

    if (!miniData && !scData) {
      console.log('[CB JSON score] Both mini and scorecard failed');
      return null;
    }

    const ms   = miniData?.miniscore || miniData;
    const mi   = infoData?.matchInfo || infoData;

    // ── Match status ──────────────────────────────────────────────────────
    const stateStr = (
      mi?.state || ms?.matchScoreDetails?.state ||
      mi?.status || ms?.status || ''
    ).toUpperCase();

    // Don't save data if match hasn't started
    if (stateStr.includes('PREVIEW') || stateStr.includes('SCHEDULE') ||
        stateStr.includes('YET TO') || stateStr === '') {
      console.log('[CB JSON] Match not started yet');
      return null;
    }

    let status = 'LIVE', result = '';
    if (stateStr.includes('RAIN') || stateStr.includes('DELAY'))       status = 'RAIN DELAY';
    else if (stateStr.includes('INNINGS_BREAK') || stateStr.includes('INNINGS BREAK')) status = 'INNINGS BREAK';
    else if (stateStr.includes('SUPER_OVER') || stateStr.includes('SUPER OVER'))       status = 'SUPER OVER';
    else if (stateStr.includes('ABANDON') || stateStr.includes('NO RESULT'))           { status = 'ABANDONED'; result = 'Match Abandoned'; }
    else if (stateStr.includes('COMPLETE') || stateStr.includes('FINISH'))             status = 'FINISHED';

    // Result string
    if (status === 'FINISHED') {
      result = mi?.status || ms?.matchScoreDetails?.customStatus || '';
      if (!result && mi?.winningTeam) {
        const margin = mi.winByRuns > 0 ? `${mi.winByRuns} runs`
                     : mi.winByWickets > 0 ? `${mi.winByWickets} wickets` : '';
        if (margin) result = `${mi.winningTeam.toUpperCase()} won by ${margin}`;
      }
    }

    // ── Toss ─────────────────────────────────────────────────────────────
    const tossWinnerId = mi?.tossResults?.tossWinnerId;
    const t1Id = mi?.team1?.teamId, t2Id = mi?.team2?.teamId;
    const tossDec = (mi?.tossResults?.decision || '').toLowerCase();
    let toss = null, battingFirstTeam = null;
    if (tossWinnerId && tossDec) {
      const tosser = tossWinnerId === t1Id ? team1 : team2;
      battingFirstTeam = tossDec === 'bat' ? tosser : (tosser === team1 ? team2 : team1);
      toss = `${tosser} chose to ${tossDec}`;
    }
    // Also check free-text toss info
    if (!toss && mi?.toss) {
      toss = mi.toss;
      const tossRx = new RegExp(`(${TEAMS.join('|')}).*?chose\\s+to\\s+(bat|bowl)`, 'i');
      const tm = mi.toss.match(tossRx);
      if (tm) {
        const tosser = tm[1].toUpperCase();
        battingFirstTeam = tm[2].toLowerCase()==='bat' ? tosser : (tosser===team1?team2:team1);
      }
    }

    // ── Scores ────────────────────────────────────────────────────────────
    const battingTeamId = ms?.battingTeamId || ms?.batTeam?.teamId;
    let battingTeam = team2, bowlingTeam = team1;
    if (battingTeamId) {
      battingTeam = battingTeamId === t1Id ? team1 : team2;
      bowlingTeam = battingTeam === team1 ? team2 : team1;
    } else if (battingFirstTeam) {
      // Use innings order from scorecard if available
      const innings = scData?.scoreCard || scData?.innings || [];
      if (innings.length >= 2) {
        // 2nd innings team is currently batting (unless INNINGS BREAK)
        const inn2Team = innings[1]?.batTeamDetails?.batTeamShortName?.toUpperCase()
                      || innings[1]?.team?.shortName?.toUpperCase() || '';
        if (TEAMS.includes(inn2Team)) {
          battingTeam = inn2Team;
          bowlingTeam = battingTeam === team1 ? team2 : team1;
        }
      } else if (innings.length === 1) {
        // Only one innings — use toss info
        battingTeam = battingFirstTeam;
        bowlingTeam = battingTeam === team1 ? team2 : team1;
      }
    }

    // Current score
    const batScore = ms?.batTeam?.teamScore || {};
    const bowlScore= ms?.bowlTeam?.teamScore || {};
    const score    = String(batScore.runs ?? batScore.score ?? '0');
    const wickets  = String(batScore.wickets ?? '0');
    const overs    = String(batScore.overs ?? ms?.overs ?? '0.0');

    // 1st innings score
    const team1Score   = String(bowlScore.runs   ?? bowlScore.score  ?? '') || null;
    const team1Wickets = String(bowlScore.wickets ?? '') || null;
    const team1Overs   = String(bowlScore.overs   ?? '') || null;

    // Target
    const inningsList = ms?.matchScoreDetails?.inningsScoreList || [];
    let target = null;
    if (inningsList.length >= 2) {
      target = parseInt(inningsList[0].score) + 1;
    } else if (inningsList.length === 1 && status !== 'LIVE') {
      target = parseInt(inningsList[0].score) + 1;
    }

    const crr = parseFloat(ms?.currentRunRate)  || null;
    const rrr = parseFloat(ms?.requiredRunRate) || null;

    // ── Batsmen ───────────────────────────────────────────────────────────
    const batsmen = [];
    const batsmenRaw = ms?.batsman || ms?.batsmenData || [];
    (Array.isArray(batsmenRaw) ? batsmenRaw : [batsmenRaw]).slice(0,3).forEach(b => {
      if (!b) return;
      const name = b.batName || b.name || b.playerName;
      if (!name) return;
      batsmen.push({
        name:     name,
        runs:     parseInt(b.batRuns ?? b.runs ?? 0),
        balls:    parseInt(b.batBalls ?? b.balls ?? 0),
        fours:    parseInt(b.batFours ?? b.fours ?? 0),
        sixes:    parseInt(b.batSixes ?? b.sixes ?? 0),
        sr:       parseFloat(b.batStrikeRate ?? b.strikeRate ?? 0).toFixed(1),
        onStrike: b.onStrike === true || b.isCurrentBatsman === true,
      });
    });

    // ── Bowler ────────────────────────────────────────────────────────────
    const bowlers = [];
    const bowlerRaw = ms?.bowler ? (Array.isArray(ms.bowler) ? ms.bowler : [ms.bowler]) : [];
    bowlerRaw.slice(0,2).forEach(b => {
      if (!b) return;
      const name = b.bowlName || b.name;
      if (!name) return;
      bowlers.push({
        name:    name,
        overs:   String(b.bowlOvs ?? b.overs ?? '0'),
        maidens: parseInt(b.bowlMaidens ?? b.maidens ?? 0),
        runs:    parseInt(b.bowlRuns ?? b.runs ?? 0),
        wickets: parseInt(b.bowlWkts ?? b.wickets ?? 0),
        economy: parseFloat(b.bowlEcon ?? b.economy ?? 0).toFixed(1),
      });
    });

    // ── Recent balls ──────────────────────────────────────────────────────
    const recent = [];
    const ballsRaw = ms?.lastSixBalls || ms?.recentOvers || ms?.recentBalls || [];
    if (Array.isArray(ballsRaw)) {
      ballsRaw.slice(-6).forEach(b => {
        const s = String(b?.ball ?? b?.score ?? b ?? '·').toUpperCase();
        recent.push(s === '0' ? '·' : s || '·');
      });
    }
    while (recent.length < 6) recent.push('·');

    // ── Commentary ────────────────────────────────────────────────────────
    const commentary = [];
    const commList = commData?.commentary || commData?.commList
                  || scData?.commentary || scData?.commList || [];
    (Array.isArray(commList) ? commList : []).slice(0, 10).forEach(c => {
      const text = c?.commText || c?.text || c?.comment || '';
      if (!text || text.length < 5) return;
      const ut   = text.toUpperCase();
      const type = ut.includes('WICKET') || ut.includes(' OUT') ? 'wicket'
                 : ut.includes('FOUR')   || ut.includes('SIX')  ? 'boundary'
                 : 'normal';
      commentary.push({
        over:      String(c?.overNumber ?? c?.over ?? ''),
        text:      text.substring(0, 200),
        type,
        generated: false,
      });
    });

    // ── Win probability ───────────────────────────────────────────────────
    let winProbT1 = 50, winProbT2 = 50;
    const probRaw = ms?.matchScoreDetails?.winProbability || ms?.winProbability;
    if (probRaw && typeof probRaw === 'object') {
      const p1 = parseFloat(probRaw.homeTeam ?? probRaw.team1 ?? 50);
      const p2 = parseFloat(probRaw.awayTeam ?? probRaw.team2 ?? 50);
      // battingTeam is team2 in our model, bowlingTeam is team1
      winProbT1 = Math.round(battingTeam === team1 ? p2 : p1);
      winProbT2 = 100 - winProbT1;
    } else if (rrr && crr) {
      const r = rrr / crr;
      winProbT2 = r < 0.75 ? 78 : r < 0.9 ? 66 : r < 1.0 ? 55
               : r < 1.1  ? 46 : r < 1.3  ? 37 : r < 1.6 ? 28 : 16;
      winProbT1 = 100 - winProbT2;
    } else if (rrr) {
      winProbT2 = rrr < 6 ? 78 : rrr < 8 ? 64 : rrr < 10 ? 50 : rrr < 12 ? 36 : rrr < 15 ? 22 : 12;
      winProbT1 = 100 - winProbT2;
    } else if (status === 'LIVE' && !target) {
      const proj = (parseInt(score)||0) / (parseFloat(overs)||1) * 20;
      winProbT2 = proj > 185 ? 62 : proj > 165 ? 56 : proj > 145 ? 50 : proj > 125 ? 44 : 38;
      winProbT1 = 100 - winProbT2;
    }
    if (status === 'FINISHED') {
      const winner = result?.split(' ')[0]?.toUpperCase() || '';
      winProbT1 = winner === bowlingTeam ? 100 : 0;
      winProbT2 = winner === battingTeam ? 100 : 0;
    }
    if (['ABANDONED','POSTPONED'].includes(status)) { winProbT1=50; winProbT2=50; }

    console.log(`[CB JSON] ${battingTeam} batting: ${score}/${wickets} (${overs}) | ${status}`);
    if (batsmen.length) console.log(`  Batsmen: ${batsmen.map(b=>`${b.name} ${b.runs}(${b.balls})`).join(', ')}`);
    if (bowlers.length) console.log(`  Bowler:  ${bowlers.map(b=>`${b.name} ${b.wickets}/${b.runs}`).join(', ')}`);
    if (recent.some(x=>x!=='·')) console.log(`  Balls:   ${recent.join(' ')}`);

    return {
      team1:        { name: bowlingTeam },
      team2:        { name: battingTeam },
      score, wickets, overs,
      team1Score:   team1Score || null,
      team1Wickets: team1Wickets || null,
      team1Overs:   team1Overs || null,
      target:       target || null,
      status, result, toss,
      winProb:   winProbT2,
      winProbT1, winProbT2,
      recent:    recent.slice(0, 6),
      batsmen:   batsmen.slice(0, 3),
      bowlers:   bowlers.slice(0, 2),
      commentary: commentary.slice(0, 10),
      crr, rrr,
      source: 'cricbuzz-api',
    };

  } catch (err) {
    console.log('[CB JSON score error]', err.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT — called every 40s
// ─────────────────────────────────────────────────────────────────────────────
export const scrapeLiveMatch = async () => {

  // ══ SOURCE 1: Cricbuzz JSON API (works on Render, no browser needed) ══════
  console.log('[Scraper] Trying Cricbuzz JSON API...');
  try {
    const matchMeta = await findMatchViaJSON();

    if (!matchMeta) {
      console.log('[Scraper] No live IPL match found via JSON.');
      // Don't return null yet — try browser if available (local dev)
    } else {
      console.log(`🏏 [JSON] ${matchMeta.team1} vs ${matchMeta.team2} | ID:${matchMeta.matchId}`);
      const result = await getScoreViaJSON(matchMeta.matchId, matchMeta.team1, matchMeta.team2);
      if (result) {
        return { ...result, lastUpdated: new Date() };
      }
      console.log('[Scraper] JSON score fetch failed, trying browser...');
    }
  } catch (err) {
    console.log('[Scraper] JSON API error:', err.message);
  }

  // ══ SOURCE 2-5: Puppeteer browser scraping (local dev / Render with Chrome) ══
  if (!CHROME_AVAILABLE) {
    console.log('[Scraper] Chrome not available. JSON API failed. Returning null.');
    console.log(`  Chrome path checked: ${CHROME}`);
    return null;
  }

  let browser;
  try {
    browser = await puppeteer.launch(LAUNCH);

    // Find match via Cricbuzz listing (browser)
    const matchMeta = await findMatchViaBrowser(browser);
    if (!matchMeta) {
      console.log('[Scraper] No IPL match found on Cricbuzz listing.');
      await browser.close();
      return null;
    }
    console.log(`🏏 [Browser] ${matchMeta.team1} vs ${matchMeta.team2} | ${matchMeta.statusHint}`);

    // Try crex.com
    let result = await scrapeCrexCom(browser, matchMeta);

    // Fallback: Cricbuzz match page
    if (!result) {
      console.log('⚠️ crex failed → Cricbuzz page...');
      result = await scrapeCricbuzzMatchPage(browser, matchMeta);
    }

    // Last resort: Google (only with known teams — prevents stale results)
    if (!result) {
      console.log('⚠️ Cricbuzz page failed → Google...');
      result = await scrapeGoogle(browser, matchMeta.team1, matchMeta.team2);
    }

    await browser.close();

    if (!result) { console.log('⚠️ All sources failed.'); return null; }
    logResult(result);
    return { ...result, lastUpdated: new Date() };

  } catch (err) {
    if (browser) await browser.close();
    console.error('❌ Browser scraping fatal:', err.message);
    return null;
  }
};

const logResult = r => {
  console.log(`✅ [${r.source}] ${r.team1?.name} vs ${r.team2?.name} | ${r.score}/${r.wickets} (${r.overs}) | ${r.status}`);
  if (r.toss)   console.log(`   🪙 ${r.toss}`);
  if (r.result) console.log(`   🏆 ${r.result}`);
  r.batsmen?.forEach(b => console.log(`   🏏 ${b.name}${b.onStrike?'*':''}: ${b.runs}(${b.balls})`));
  r.bowlers?.forEach(b => console.log(`   🎯 ${b.name}: ${b.wickets}/${b.runs} (${b.overs})`));
};

// ─────────────────────────────────────────────────────────────────────────────
// BROWSER SOURCE 1: Cricbuzz listing (match discovery)
// ─────────────────────────────────────────────────────────────────────────────
const findMatchViaBrowser = async browser => {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.cricbuzz.com/cricket-match/live-scores',
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(3000);

    const match = await page.evaluate(TEAMS => {
      const links = Array.from(document.querySelectorAll('a[href*="/live-cricket-scores/"]'));
      const seen = new Set();
      const candidates = [];

      for (const a of links) {
        const href = a.getAttribute('href') || '';
        const hu   = href.toUpperCase();
        if (seen.has(href)) continue;
        if (!hu.includes('IPL') && !hu.includes('INDIAN-PREMIER')) continue;

        const urlTeams = TEAMS.filter(t =>
          hu.includes(`-${t}-`) || hu.includes(`/${t}-`) || hu.endsWith(`-${t}`)
        );
        if (urlTeams.length < 2) continue;
        seen.add(href);

        const card   = a.closest('[class*="cb-col"]') || a.parentElement;
        const liveEl = card?.querySelector('.cb-text-live');
        const doneEl = card?.querySelector('.cb-text-complete, .cb-text-stumps');
        const hint   = liveEl ? 'LIVE' : doneEl ? 'FINISHED' : 'UPCOMING';

        candidates.push({
          cbUrl: 'https://www.cricbuzz.com' + href,
          team1: urlTeams[0], team2: urlTeams[1],
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
    await page.close().catch(() => {});
    console.error('[CB listing browser]', err.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// BROWSER SOURCE 2: crex.com
// ─────────────────────────────────────────────────────────────────────────────
const scrapeCrexCom = async (browser, matchMeta) => {
  const page = await browser.newPage();
  try {
    const t1l = matchMeta.team1.toLowerCase();
    const t2l = matchMeta.team2.toLowerCase();

    await page.goto('https://crex.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await wait(2500);

    let crexUrl = await page.evaluate((t1, t2, TEAMS) => {
      for (const link of document.querySelectorAll('a[href]')) {
        const h = link.href || '', hu = h.toUpperCase(), hl = h.toLowerCase();
        if (!hl.includes('cricket-live-score') && !hl.includes('scorecard')) continue;
        const found = TEAMS.filter(t => hu.includes(`-${t}-`) || hu.includes(`/${t}-`));
        if (found.includes(t1) && found.includes(t2)) return h;
      }
      return null;
    }, matchMeta.team1, matchMeta.team2, TEAMS);

    if (!crexUrl) {
      await page.goto('https://crex.com/fixtures', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await wait(2000);
      crexUrl = await page.evaluate((t1, t2, TEAMS) => {
        for (const link of document.querySelectorAll('a[href]')) {
          const h = link.href || '', hu = h.toUpperCase();
          const found = TEAMS.filter(t => hu.includes(`-${t}-`) || hu.includes(`/${t}-`));
          if (found.includes(t1) && found.includes(t2)) return h;
        }
        return null;
      }, matchMeta.team1, matchMeta.team2, TEAMS);
    }

    if (!crexUrl) { await page.close(); return null; }

    console.log(`🔗 [crex] ${crexUrl}`);
    await page.goto(crexUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await wait(5000);

    const raw = await page.evaluate((TEAMS, t1, t2) => {
      const body = document.body?.innerText || '';
      if (body.length < 100 || body.includes('YET TO BEGIN')) return null;

      let team1 = t1, team2 = t2;
      const vsM = (document.title+' '+(document.querySelector('h1,h2')?.innerText||'')).toUpperCase().match(/\b([A-Z]{2,4})\s+VS?\s+([A-Z]{2,4})\b/);
      if (vsM && TEAMS.includes(vsM[1]) && TEAMS.includes(vsM[2])) { team1=vsM[1]; team2=vsM[2]; }

      const tossRx = /(KKR|MI|CSK|RCB|RR|PBKS|DC|GT|LSG|SRH)\s+(?:opt(?:ed)?|chose|elected)\s+to\s+(bat|bowl|field)/i;
      const tossM  = body.match(tossRx);
      let toss=null, battingFirstTeam=null;
      if (tossM) {
        const tosser=tossM[1].toUpperCase(), choice=tossM[2].toLowerCase();
        battingFirstTeam = choice==='bat' ? tosser : (tosser===team1?team2:team1);
        toss = `${tosser} chose to ${choice}`;
      }

      const upper = body.toUpperCase();
      let status='LIVE', result='';
      if (upper.includes('RAIN DELAY')||upper.includes('COVERS ON')) status='RAIN DELAY';
      else if (upper.includes('ABANDONED')||(upper.includes('NO RESULT')&&!upper.includes('YET TO'))) { status='ABANDONED'; result='Match Abandoned'; }
      else if (upper.includes('INNINGS BREAK')||upper.includes('INNS BREAK')||upper.includes('INNINGS COMPLETE')) status='INNINGS BREAK';
      else if (upper.includes('SUPER OVER')) status='SUPER OVER';

      const wonRx=new RegExp(`\\b(${TEAMS.join('|')})\\b\\s+won\\s+by\\s+([\\d]+\\s+(?:runs?|wickets?))`, 'i');
      const wonM=body.match(wonRx);
      if (wonM&&(wonM[1].toUpperCase()===team1||wonM[1].toUpperCase()===team2)) { status='FINISHED'; result=`${wonM[1].toUpperCase()} won by ${wonM[2]}`; }

      const sRx=team=>{
        for(const rx of [
          new RegExp(`\\b${team}\\b[^\\n]{0,25}(\\d{1,3})[\\-/](\\d{1,2})[^\\d\\n]{0,15}(\\d{1,2}\\.\\d)`,'i'),
          new RegExp(`(\\d{1,3})[\\-/](\\d{1,2})[^\\d\\n]{0,15}(\\d{1,2}\\.\\d)[^\\n]{0,25}\\b${team}\\b`,'i'),
          new RegExp(`\\b${team}\\b[^\\n]{0,25}(\\d{1,3})[\\-/](\\d{1,2})`,'i'),
        ]){ const m=body.match(rx); if(m&&parseInt(m[1])>=0)return{runs:m[1],wkts:m[2],overs:m[3]||null}; }
        return null;
      };
      const s1=sRx(team1),s2=sRx(team2);
      const crrM=body.match(/CRR\s*:?\s*([\d.]+)/i);
      const rrrM=body.match(/(?:RRR|Req\s*RR|Required[^:]*Rate)\s*:?\s*([\d.]+)/i);
      const targetM=body.match(/[Tt]arget\s*:?\s*(\d{2,3})/);
      const crr=crrM?parseFloat(crrM[1]):null,rrr=rrrM?parseFloat(rrrM[1]):null,target=targetM?parseInt(targetM[1]):null;
      const yetTeam=body.match(new RegExp(`(${TEAMS.join('|')})[^\\n]{0,50}[Yy]et\\s+to\\s+[Bb]at`))?.[1]?.toUpperCase()||null;

      let battingTeam,bowlingTeam,score,wickets,overs,fScore=null,fWkts=null,fOvers=null,derivedTarget=target;

      if(s1&&s2){
        const o1=s1.overs?parseFloat(s1.overs):20, o2=s2.overs?parseFloat(s2.overs):20;
        if(yetTeam){bowlingTeam=yetTeam;battingTeam=yetTeam===team1?team2:team1;}
        else if(status==='FINISHED'&&wonM){battingTeam=wonM[1].toUpperCase();bowlingTeam=battingTeam===team1?team2:team1;}
        else if(status==='INNINGS BREAK'){
          const firstBatted=battingFirstTeam||(o1>=o2?team1:team2);
          battingTeam=firstBatted===team1?team2:team1;bowlingTeam=firstBatted;
        } else {battingTeam=o2<=o1?team2:team1;bowlingTeam=battingTeam===team1?team2:team1;}
        if(battingTeam===team2){fScore=s1.runs;fWkts=s1.wkts;fOvers=s1.overs||'20';score=s2.runs;wickets=s2.wkts;overs=s2.overs||'0.0';}
        else{fScore=s2.runs;fWkts=s2.wkts;fOvers=s2.overs||'20';score=s1.runs;wickets=s1.wkts;overs=s1.overs||'0.0';}
        if(!derivedTarget&&fScore)derivedTarget=parseInt(fScore)+1;
      } else if(s1||s2){
        const s=s1||s2;
        battingTeam=battingFirstTeam||(yetTeam?(yetTeam===team1?team2:team1):(s1?team1:team2));
        bowlingTeam=battingTeam===team1?team2:team1;
        score=s.runs;wickets=s.wkts;overs=s.overs||'0.0';
      } else if(['ABANDONED','RAIN DELAY','POSTPONED'].includes(status)){
        battingTeam=battingFirstTeam||team1;bowlingTeam=battingTeam===team1?team2:team1;score='0';wickets='0';overs='0.0';
      } else return null;

      // Batsmen
      const batsmen=[];
      Array.from(document.querySelectorAll('[class*="batsman"],[class*="batter"],[class*="batting-player"],[class*="striker"]')).slice(0,3).forEach(card=>{
        const ct=card.innerText?.trim()||'';
        const name=(card.querySelector('[class*="name"]')?.innerText||ct.split('\n')[0]).replace(/[*†✏🖊]/g,'').trim();
        if(!name||name.length<2||name.length>35)return;
        const rbM=ct.match(/(\d+)\s*\((\d+)\)/);
        if(!rbM)return;
        const runs=parseInt(rbM[1])||0,balls=parseInt(rbM[2])||0;
        batsmen.push({name,runs,balls,
          fours:parseInt(ct.match(/(\d+)\s*(?:×|x)?\s*4s?/i)?.[1])||0,
          sixes:parseInt(ct.match(/(\d+)\s*(?:×|x)?\s*6s?/i)?.[1])||0,
          sr:balls?((runs/balls)*100).toFixed(1):'0.0',
          onStrike:ct.includes('🖊')||ct.includes('*')});
      });
      if(batsmen.length<1){
        const bRx=/([A-Z][a-z]+(?:\s+[A-Z][a-z.]+){1,3})\s+(\d+)\s*\((\d+)\)/g;
        [...body.matchAll(bRx)].slice(0,3).forEach(m=>{
          const name=m[1].trim();if(name.length<2||name.length>35)return;
          const runs=parseInt(m[2])||0,balls=parseInt(m[3])||0;
          batsmen.push({name,runs,balls,fours:0,sixes:0,sr:balls?((runs/balls)*100).toFixed(1):'0.0',onStrike:body.includes(m[1]+'*')});
        });
      }

      // Bowler
      const bowlers=[];
      Array.from(document.querySelectorAll('[class*="bowler-card"],[class*="bowling-player"],[class*="current-bowler"]')).slice(0,2).forEach(card=>{
        const ct=card.innerText?.trim()||'';
        const name=(card.querySelector('[class*="name"]')?.innerText||ct.split('\n')[0]).replace(/†/g,'').trim();
        if(!name||name.length<2||name.length>35)return;
        const bM=ct.match(/(\d+)[–\-](\d+)\s*\((\d+\.?\d*)\)/);
        if(bM)bowlers.push({name,wickets:parseInt(bM[1]),runs:parseInt(bM[2]),overs:bM[3],maidens:0,economy:parseFloat(bM[3])?(parseInt(bM[2])/parseFloat(bM[3])).toFixed(1):'0.0'});
      });
      if(bowlers.length<1){
        const bwRx=/([A-Z][a-z]+(?:\s+[A-Z][a-z.]+){1,3})\s+(\d+)[–\-](\d+)\s*\((\d+\.?\d*)\)/g;
        [...body.matchAll(bwRx)].slice(0,2).forEach(m=>{
          const name=m[1].trim();if(name.length<2||name.length>35)return;
          bowlers.push({name,wickets:parseInt(m[2]),runs:parseInt(m[3]),overs:m[4],maidens:0,economy:parseFloat(m[4])?(parseInt(m[3])/parseFloat(m[4])).toFixed(1):'0.0'});
        });
      }

      // Last 6 balls
      const recent=[];
      const badges=Array.from(document.querySelectorAll('[class*="ball-badge"],[class*="ball-item"],[class*="over-ball"],[class*="ball-score"]'));
      if(badges.length>=3) badges.slice(-8).forEach(el=>{const t=el.innerText?.trim().toUpperCase().replace(/\s+/g,'');if(t&&t.length<=3&&/^[\dW·N]/.test(t)&&t!=='■')recent.push(t==='N'?'·':t);});
      if(recent.length<3){
        const overRx=/Over\s+\d+\s+((?:(?:\d|W|WD|NB|■)\s*){1,8})/g;
        [...body.matchAll(overRx)].slice(-2).forEach(om=>{om[1].trim().split(/\s+/).forEach(b=>{if(b==='■'||!b)return;if(/^[\dW]$/.test(b)||b==='WD'||b==='NB')recent.push(b.toUpperCase());});});
      }
      if(recent.length<3){
        body.split('\n').filter(l=>/^\d+\.\d+/.test(l.trim())||l.includes('IST')).slice(0,8).forEach(line=>{
          const lt=line.toLowerCase();let b='·';
          if(lt.includes(' out')||lt.includes('wicket'))b='W';
          else if(lt.includes(' six')||lt.includes('6!'))b='6';
          else if(lt.includes('four')||lt.includes('4!'))b='4';
          else if(lt.includes('wide'))b='WD';
          else if(lt.includes('no ball'))b='NB';
          else{const rm=lt.match(/\b([1-5])\s+run/);b=rm?rm[1]:'·';}
          recent.unshift(b);
        });recent.splice(6);
      }
      while(recent.length<6)recent.push('·');

      // Commentary
      const commentary=[];
      const parseComm=els=>els.forEach(el=>{
        const text=el.innerText?.trim();if(!text||text.length<10||text.length>500)return;
        const ut=text.toUpperCase();
        const type=ut.includes(' OUT')||ut.includes('WICKET')?'wicket':ut.includes('FOUR')||ut.includes(' SIX')?'boundary':'normal';
        const over=text.match(/^(\d+\.\d+)/)?.[1]||text.match(/(\d+\.\d+)\s*:/)?.[1]||'';
        if(!commentary.some(c=>c.text===text.substring(0,200)))commentary.push({over,text:text.substring(0,200),type,generated:false});
      });
      parseComm(Array.from(document.querySelectorAll('[class*="comm-item"],[class*="commentary-item"],[class*="feed-item"],[class*="update-item"]')).slice(0,12));
      if(commentary.length<3)parseComm(Array.from(document.querySelectorAll('p,li')).filter(el=>{const t=el.innerText?.trim()||'';return t.length>15&&t.length<500&&(t.includes('IST')||/^\d+\.\d+/.test(t));}).slice(0,10));

      // Win probability
      let winProbT1=50,winProbT2=50;
      for(const c of document.querySelectorAll('[class*="probability"],[class*="win-prob"],[class*="match-prob"]')){
        const t=c.innerText||'';const pcts=[...t.matchAll(/(\d{1,3})\s*%/g)].map(m=>parseInt(m[1]));
        if(pcts.length>=2&&Math.abs(pcts[0]+pcts[1]-100)<=5){const btp=t.toUpperCase().indexOf(battingTeam),bop=t.toUpperCase().indexOf(bowlingTeam);if(btp<bop){winProbT2=pcts[0];winProbT1=pcts[1];}else{winProbT1=pcts[0];winProbT2=pcts[1];}break;}
      }
      if(winProbT1===50){const p1M=body.match(new RegExp(`\\b${battingTeam}\\b[^%\\d]*(\\d{1,3})\\s*%`,'i')),p2M=body.match(new RegExp(`\\b${bowlingTeam}\\b[^%\\d]*(\\d{1,3})\\s*%`,'i'));if(p1M&&p2M){const p1=parseInt(p1M[1]),p2=parseInt(p2M[1]);if(Math.abs(p1+p2-100)<=5){winProbT2=p1;winProbT1=p2;}}}
      if(winProbT1===50&&rrr&&crr){const r=rrr/crr;winProbT2=r<0.75?78:r<0.9?66:r<1.0?55:r<1.1?47:r<1.3?38:r<1.6?28:16;winProbT1=100-winProbT2;}
      else if(winProbT1===50&&rrr){winProbT2=rrr<6?78:rrr<8?64:rrr<10?50:rrr<12?36:rrr<15?22:12;winProbT1=100-winProbT2;}
      else if(winProbT1===50&&status==='LIVE'&&!target){const proj=(parseInt(score)||0)/(parseFloat(overs)||1)*20;winProbT2=proj>185?62:proj>165?56:proj>145?50:proj>125?44:38;winProbT1=100-winProbT2;}
      if(status==='FINISHED'&&wonM){const w=wonM[1].toUpperCase();winProbT1=w===bowlingTeam?100:0;winProbT2=w===battingTeam?100:0;}
      if(['ABANDONED','POSTPONED'].includes(status)){winProbT1=50;winProbT2=50;}

      return {battingTeam,bowlingTeam,score:String(score||'0'),wickets:String(wickets||'0'),overs:String(overs||'0.0'),team1Score:fScore?String(fScore):null,team1Wickets:fWkts?String(fWkts):null,team1Overs:fOvers?String(fOvers):null,target:derivedTarget||null,crr,rrr,status,result,toss,winProbT1,winProbT2,recent:recent.slice(0,6),batsmen:batsmen.slice(0,3),bowlers:bowlers.slice(0,2),commentary:commentary.slice(0,12)};
    }, TEAMS, matchMeta.team1, matchMeta.team2);

    await page.close();
    if(!raw)return null;
    return buildResult(raw,'crex.com');
  } catch(err){await page.close().catch(()=>{});console.error('[crex]',err.message);return null;}
};

// ─────────────────────────────────────────────────────────────────────────────
// BROWSER SOURCE 3: Cricbuzz match page
// ─────────────────────────────────────────────────────────────────────────────
const scrapeCricbuzzMatchPage = async (browser, matchMeta) => {
  const page = await browser.newPage();
  try {
    await page.goto(matchMeta.cbUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(4000);
    const raw = await page.evaluate((TEAMS,t1,t2) => {
      const body=document.body?.innerText||'';if(body.length<200)return null;
      const upper=body.toUpperCase();let status='LIVE',result='';
      if(upper.includes('RAIN')&&(upper.includes('DELAY')||upper.includes('STOP')))status='RAIN DELAY';
      else if(upper.includes('ABANDONED')){status='ABANDONED';result='Match Abandoned';}
      else if(upper.includes('INNINGS BREAK'))status='INNINGS BREAK';
      const wonRx=new RegExp(`\\b(${TEAMS.join('|')})\\b\\s+won\\s+by\\s+([\\d]+\\s+(?:runs?|wickets?))`, 'i');
      const wonM=body.match(wonRx);
      if(wonM&&(wonM[1].toUpperCase()===t1||wonM[1].toUpperCase()===t2)){status='FINISHED';result=`${wonM[1].toUpperCase()} won by ${wonM[2]}`;}
      const tossEl=document.querySelector('.cb-toss-sts');
      let toss=tossEl?.innerText?.trim()||null,battingFirstTeam=null;
      const optM=body.match(/(KKR|MI|CSK|RCB|RR|PBKS|DC|GT|LSG|SRH)\s+(?:opt|chose|elected)\s+to\s+(bat|bowl|field)/i);
      if(optM){const tosser=optM[1].toUpperCase(),choice=optM[2].toLowerCase();battingFirstTeam=choice==='bat'?tosser:(tosser===t1?t2:t1);if(!toss)toss=`${tosser} chose to ${choice}`;}
      const ls=team=>{const m=body.match(new RegExp(`\\b${team}\\b[^\\d\\n]{0,20}(\\d{1,3})[/\\-](\\d{1,2})(?:[^\\d]*(\\d{1,2}\\.\\d))?`,'i'));return m&&parseInt(m[1])>=0?{runs:m[1],wkts:m[2],overs:m[3]||null}:null;};
      const s1=ls(t1),s2=ls(t2);
      const crrM=body.match(/CRR\s*:?\s*([\d.]+)/i),rrrM=body.match(/RRR\s*:?\s*([\d.]+)/i),targetM=body.match(/[Tt]arget\s*:?\s*(\d{2,3})/);
      const crr=crrM?parseFloat(crrM[1]):null,rrr=rrrM?parseFloat(rrrM[1]):null,target=targetM?parseInt(targetM[1]):null;
      const yetTeam=body.match(new RegExp(`(${TEAMS.join('|')})[^\\n]{0,50}[Yy]et\\s+to\\s+[Bb]at`))?.[1]?.toUpperCase()||null;
      let battingTeam=t2,bowlingTeam=t1,score,wickets,overs,fs=null,fw=null,fo=null,dT=target;
      if(s1&&s2){
        const o1=s1.overs?parseFloat(s1.overs):20,o2=s2.overs?parseFloat(s2.overs):20;
        if(yetTeam){bowlingTeam=yetTeam;battingTeam=yetTeam===t1?t2:t1;}
        else if(status==='FINISHED'&&wonM){battingTeam=wonM[1].toUpperCase();bowlingTeam=battingTeam===t1?t2:t1;}
        else if(status==='INNINGS BREAK'){const fb=battingFirstTeam||(o1>=o2?t1:t2);battingTeam=fb===t1?t2:t1;bowlingTeam=fb;}
        else{battingTeam=o2<=o1?t2:t1;bowlingTeam=battingTeam===t1?t2:t1;}
        if(battingTeam===t2){fs=s1.runs;fw=s1.wkts;fo=s1.overs||'20';score=s2.runs;wickets=s2.wkts;overs=s2.overs||'0.0';}
        else{fs=s2.runs;fw=s2.wkts;fo=s2.overs||'20';score=s1.runs;wickets=s1.wkts;overs=s1.overs||'0.0';}
        if(!dT&&fs)dT=parseInt(fs)+1;
      }else if(s1||s2){
        const s=s1||s2;battingTeam=battingFirstTeam||(yetTeam?(yetTeam===t1?t2:t1):(s1?t1:t2));bowlingTeam=battingTeam===t1?t2:t1;score=s.runs;wickets=s.wkts;overs=s.overs||'0.0';
      }else if(['ABANDONED','RAIN DELAY'].includes(status)){score='0';wickets='0';overs='0.0';}
      else return null;
      const batsmen=[],bowlers=[],recent=[],commentary=[];
      Array.from(document.querySelectorAll('.cb-min-bat-rw')).forEach(row=>{
        const cells=Array.from(row.querySelectorAll('.cb-col'));
        const nameEl=cells.find(c=>{const t=c.innerText?.trim();return t?.length>2&&!/^\d/.test(t)&&!['R','B','4s','6s','SR','Batter','M'].includes(t);});
        const name=nameEl?.innerText?.replace(/[*†(c)]+/g,'').trim();
        if(!name||name.length<2||name.length>35)return;
        const nums=cells.map(c=>c.innerText?.trim()).filter(t=>/^\d+\.?\d*$/.test(t)).map(Number);
        if(nums.length<2)return;
        batsmen.push({name,runs:nums[0]||0,balls:nums[1]||0,fours:nums[2]||0,sixes:nums[3]||0,sr:nums[1]?((nums[0]/nums[1])*100).toFixed(1):'0.0',onStrike:row.innerText?.includes('*')||false});
      });
      Array.from(document.querySelectorAll('.cb-min-fld-rw')).forEach(row=>{
        const cells=Array.from(row.querySelectorAll('.cb-col'));
        const nameEl=cells.find(c=>{const t=c.innerText?.trim();return t?.length>2&&!/^\d/.test(t)&&!['O','M','R','W','Eco','Bowler'].includes(t);});
        const name=nameEl?.innerText?.trim();if(!name||name.length<2||name.length>35)return;
        const nums=cells.map(c=>c.innerText?.trim()).filter(t=>/^\d+\.?\d*$/.test(t)).map(Number);
        if(nums.length<3)return;
        bowlers.push({name,overs:nums[0]?.toString()||'0',maidens:nums[1]||0,runs:nums[2]||0,wickets:nums[3]||0,economy:nums[0]?(nums[2]/nums[0]).toFixed(1):'0.0'});
      });
      Array.from(document.querySelectorAll('[class*="cb-col-90"]')).slice(0,8).forEach(el=>{
        const text=el.innerText?.trim()||'';if(!/^\d+\.\d+/.test(text))return;
        const lt=text.toLowerCase();let b='·';
        if(lt.includes(' out')||lt.includes('wicket'))b='W';else if(lt.includes('six')||lt.includes('6!'))b='6';
        else if(lt.includes('four')||lt.includes('4!'))b='4';else if(lt.includes('wide'))b='WD';
        else if(lt.includes('no ball'))b='NB';else{const rm=lt.match(/\b(\d)\s+run/);b=rm?rm[1]:'·';}
        recent.unshift(b);
      });
      recent.splice(6);while(recent.length<6)recent.push('·');
      Array.from(document.querySelectorAll('[class*="cb-col-90"]')).slice(0,12).forEach(el=>{
        const text=el.innerText?.trim();if(!text||text.length<8||text.length>300)return;
        const ut=text.toUpperCase();const type=ut.includes(' OUT')||ut.includes('WICKET')?'wicket':ut.includes('FOUR')||ut.includes(' SIX')?'boundary':'normal';
        const over=text.match(/^(\d+\.\d+)/)?.[1]||'';
        if(!commentary.some(c=>c.text===text.substring(0,150)))commentary.push({over,text:text.substring(0,150),type,generated:false});
      });
      let wP1=50,wP2=50;
      if(status==='FINISHED'&&wonM){const w=wonM[1].toUpperCase();wP1=w===bowlingTeam?100:0;wP2=w===battingTeam?100:0;}
      else if(rrr&&crr){const r=rrr/crr;wP2=r<0.75?78:r<0.9?66:r<1.0?55:r<1.1?47:r<1.3?38:28;wP1=100-wP2;}
      else if(rrr){wP2=rrr<6?78:rrr<8?64:rrr<10?50:rrr<12?36:20;wP1=100-wP2;}
      return {battingTeam,bowlingTeam,score:String(score||'0'),wickets:String(wickets||'0'),overs:String(overs||'0.0'),team1Score:fs?String(fs):null,team1Wickets:fw?String(fw):null,team1Overs:fo?String(fo):null,target:dT||null,crr,rrr,status,result,toss,winProbT1:wP1,winProbT2:wP2,recent,batsmen:batsmen.slice(0,3),bowlers:bowlers.slice(0,2),commentary:commentary.slice(0,10)};
    }, TEAMS, matchMeta.team1, matchMeta.team2);
    await page.close();
    if(!raw)return null;
    return buildResult(raw,'cricbuzz');
  } catch(err){await page.close().catch(()=>{});console.error('[CB page]',err.message);return null;}
};

// ─────────────────────────────────────────────────────────────────────────────
// BROWSER SOURCE 4: Google (known teams only — prevents stale results)
// ─────────────────────────────────────────────────────────────────────────────
const scrapeGoogle = async (browser, t1, t2) => {
  const page = await browser.newPage();
  try {
    const q = `${t1} vs ${t2} IPL 2026 live score`;
    await page.goto(`https://www.google.com/search?q=${encodeURIComponent(q)}&hl=en`, {waitUntil:'domcontentloaded',timeout:25000});
    await wait(3000);
    const raw = await page.evaluate((TEAMS,t1,t2) => {
      const ws=['.liveticker','.liveresults-sports-immersive__match-tile','.imso_mh__ma-cont','[jsname="ESiMyd"]','.imspo_mt__mtch-cont'];
      let widget=null;for(const s of ws){const el=document.querySelector(s);if(el?.innerText?.length>30){widget=el;break;}}
      if(!widget)widget=Array.from(document.querySelectorAll('div')).find(d=>{const t=d.innerText||'';return/\d{2,3}[\/\-]\d{1,2}/.test(t)&&t.length<4000&&t.length>40;})||null;
      const text=widget?.innerText?.trim()||'';if(!text)return null;
      // MUST contain BOTH teams — prevents stale match data
      if(!text.toUpperCase().includes(t1)||!text.toUpperCase().includes(t2))return null;

      const sW=[...text.matchAll(/(\d{2,3})\s*[\/\-]\s*(\d{1,2})\s*\(\s*(\d{1,2}\.?\d?)\s*\)/g)];
      const sN=[...text.matchAll(/(\d{2,3})\s*[\/\-]\s*(\d{1,2})(?!\s*[\(\d])/g)];
      const aS=sW.length>0?sW:sN;if(!aS.length)return null;

      // Also try to extract overs separately
      const oversM=text.match(/(\d{1,2}\.\d)\s*(?:ov|overs?)/i)||text.match(/(?:ov|overs?)\s*:?\s*(\d{1,2}\.\d)/i);
      const extractedOvers=oversM?.[1]||null;

      const upper=text.toUpperCase();let status='LIVE',result='';
      const wonRx=new RegExp(`\\b(${TEAMS.join('|')})\\b\\s+won\\s+by\\s+([\\d]+\\s+(?:runs?|wickets?))`, 'i');
      const wonM=text.match(wonRx);
      if(wonM&&(wonM[1].toUpperCase()===t1||wonM[1].toUpperCase()===t2)){status='FINISHED';result=`${wonM[1].toUpperCase()} won by ${wonM[2]}`;}
      else if(upper.includes('RAIN'))status='RAIN DELAY';
      else if(upper.includes('INNINGS BREAK'))status='INNINGS BREAK';

      const crrM=text.match(/CRR\s*:?\s*([\d.]+)/i),rrrM=text.match(/RRR\s*:?\s*([\d.]+)/i),targetM=text.match(/[Tt]arget[:\s]*(\d{2,3})/);
      const crr=crrM?parseFloat(crrM[1]):null,rrr=rrrM?parseFloat(rrrM[1]):null,tgt=targetM?parseInt(targetM[1]):null;

      const ls1=(()=>{const m=text.match(new RegExp(`\\b${t1}\\b[^\\d]{0,15}(\\d{1,3})[/\\-](\\d{1,2})(?:\\s*\\((\\d{1,2}\\.?\\d?)\\))?`,'i'));return m&&parseInt(m[1])>=0?{runs:m[1],wkts:m[2],overs:m[3]}:null;})();
      const ls2=(()=>{const m=text.match(new RegExp(`\\b${t2}\\b[^\\d]{0,15}(\\d{1,3})[/\\-](\\d{1,2})(?:\\s*\\((\\d{1,2}\\.?\\d?)\\))?`,'i'));return m&&parseInt(m[1])>=0?{runs:m[1],wkts:m[2],overs:m[3]}:null;})();

      const yetTeam=text.match(new RegExp(`(${TEAMS.join('|')})[^\\n]{0,50}[Yy]et\\s+to\\s+[Bb]at`))?.[1]?.toUpperCase()||null;
      let bT=t2,bowT=t1,score,wkts,overs,fS=null,fW=null,fO=null,dT=tgt;
      if(ls1&&ls2){
        const o1=ls1.overs?parseFloat(ls1.overs):20,o2=ls2.overs?parseFloat(ls2.overs):20;
        if(yetTeam){bT=yetTeam===t1?t2:t1;bowT=yetTeam;}
        else if(status==='FINISHED'&&wonM){bT=wonM[1].toUpperCase();bowT=bT===t1?t2:t1;}
        else{bT=o2<=o1?t2:t1;bowT=bT===t1?t2:t1;}
        if(bT===t2){fS=ls1.runs;fW=ls1.wkts;fO=ls1.overs||'20';score=ls2.runs;wkts=ls2.wkts;overs=ls2.overs||extractedOvers||'0.0';}
        else{fS=ls2.runs;fW=ls2.wkts;fO=ls2.overs||'20';score=ls1.runs;wkts=ls1.wkts;overs=ls1.overs||extractedOvers||'0.0';}
        if(!dT&&fS)dT=parseInt(fS)+1;
      } else {
        const s=aS[aS.length-1];score=s[1];wkts=s[2];overs=s[3]||extractedOvers||'0.0';
      }
      let wP1=50,wP2=50;
      const pm1=text.match(new RegExp(`\\b${bT}\\b[^%\\d]*(\\d{1,3})\\s*%`,'i')),pm2=text.match(new RegExp(`\\b${bowT}\\b[^%\\d]*(\\d{1,3})\\s*%`,'i'));
      if(pm1&&pm2){const p1=parseInt(pm1[1]),p2=parseInt(pm2[1]);if(Math.abs(p1+p2-100)<=5){wP2=p1;wP1=p2;}}
      if(wP1===50&&rrr){wP2=rrr<6?78:rrr<8?64:rrr<10?50:rrr<12?36:20;wP1=100-wP2;}
      if(status==='FINISHED'&&wonM){const w=wonM[1].toUpperCase();wP1=w===bowT?100:0;wP2=w===bT?100:0;}
      const recent=[];
      const seqM=text.match(/\b([0-6W]|WD|NB)\s+([0-6W]|WD|NB)\s+([0-6W]|WD|NB)\s+([0-6W]|WD|NB)\s+([0-6W]|WD|NB)\s+([0-6W]|WD|NB)\b/i);
      if(seqM){for(let i=1;i<=6;i++)recent.push(seqM[i].toUpperCase());}
      while(recent.length<6)recent.push('·');
      return {battingTeam:bT,bowlingTeam:bowT,score:score||'0',wickets:wkts||'0',overs:overs||'0.0',team1Score:fS||null,team1Wickets:fW||null,team1Overs:fO||null,target:dT||null,crr,rrr,status,result,toss:null,winProbT1:wP1,winProbT2:wP2,recent,batsmen:[],bowlers:[],commentary:[]};
    }, TEAMS, t1, t2);
    await page.close();
    if(!raw)return null;
    return buildResult(raw,'google');
  } catch(err){await page.close().catch(()=>{});console.error('[Google]',err.message);return null;}
};

const buildResult = (raw, source) => ({
  team1:{name:raw.bowlingTeam}, team2:{name:raw.battingTeam},
  score:raw.score, wickets:raw.wickets, overs:raw.overs,
  team1Score:raw.team1Score, team1Wickets:raw.team1Wickets, team1Overs:raw.team1Overs,
  target:raw.target, status:raw.status, result:raw.result, toss:raw.toss,
  winProb:raw.winProbT2, winProbT1:raw.winProbT1, winProbT2:raw.winProbT2,
  recent:raw.recent, batsmen:raw.batsmen, bowlers:raw.bowlers, commentary:raw.commentary,
  crr:raw.crr, rrr:raw.rrr, source,
});

// ─────────────────────────────────────────────────────────────────────────────
// STANDINGS + STATS — called every 12h
// HTTP-first: Cricbuzz JSON API → HTML fallback
// ─────────────────────────────────────────────────────────────────────────────
export const scrapeIPLStandingsAndStats = async () => {
  let pointsTable = null, orangeCap = null, purpleCap = null;
  let topBatsmen = [], topBowlers = [];

  // ── Try Cricbuzz JSON for standings (try multiple series IDs) ─────────────
  for (const sid of CB_SERIES_IDS) {
    try {
      const data = await httpGetJSON(`https://www.cricbuzz.com/api/cricket-series/${sid}/standings`);
      if (!data) continue;

      const rows = data?.pointsTable?.[0]?.pointsTableInfo
                || data?.pointsTableInfo
                || data?.standings || [];

      if (!Array.isArray(rows) || rows.length < 4) continue;

      const table = rows
        .map(r => ({
          team:   (r.teamSName || r.teamShortName || r.teamName || '').toUpperCase(),
          played: parseInt(r.matchesPlayed || r.played || 0),
          won:    parseInt(r.matchesWon    || r.won    || 0),
          lost:   parseInt(r.matchesLost   || r.lost   || 0),
          pts:    parseInt(r.points        || r.pts    || 0),
          nrr:    parseFloat(r.nrr         || 0).toFixed(3),
        }))
        .filter(t => TEAMS.includes(t.team))
        .sort((a, b) => b.pts - a.pts);

      if (table.length >= 4) {
        pointsTable = table;
        console.log(`📊 [CB JSON] Points table OK: ${sid} — ${table.length} teams`);
        break;
      }
    } catch(e) { console.log(`[standings sid=${sid}]`, e.message); }
  }

  // ── Try Cricbuzz JSON for stats ───────────────────────────────────────────
  for (const sid of CB_SERIES_IDS) {
    try {
      const [batting, bowling] = await Promise.all([
        httpGetJSON(`https://www.cricbuzz.com/api/cricket-series/${sid}/stats?statsType=mostRuns`),
        httpGetJSON(`https://www.cricbuzz.com/api/cricket-series/${sid}/stats?statsType=mostWickets`),
      ]);

      const parsePlayers = (data, type) => {
        const list = data?.statsDetails?.[0]?.playerStatsList
                  || data?.values?.[0]?.playerStats
                  || data?.statsList || data?.players || [];
        return (Array.isArray(list) ? list : []).slice(0, 10).map(p => ({
          name:    p.playerName || p.name || '',
          team:    (p.teamSName || '').toUpperCase(),
          runs:    type === 'bat'  ? parseInt(p.runs    || p.value || 0) : undefined,
          wickets: type === 'bowl' ? parseInt(p.wickets || p.value || 0) : undefined,
        })).filter(p => p.name.length > 2);
      };

      const bats  = parsePlayers(batting, 'bat').sort((a,b)=>(b.runs||0)-(a.runs||0));
      const bowls = parsePlayers(bowling, 'bowl').sort((a,b)=>(b.wickets||0)-(a.wickets||0));

      if (bats.length > 0 || bowls.length > 0) {
        topBatsmen = bats;
        topBowlers = bowls;
        orangeCap  = bats[0]  || null;
        purpleCap  = bowls[0] || null;
        console.log(`📊 [CB JSON] Stats OK: ${sid} — Orange: ${orangeCap?.name} | Purple: ${purpleCap?.name}`);
        break;
      }
    } catch(e) { console.log(`[stats sid=${sid}]`, e.message); }
  }

  // ── Browser fallback for whatever JSON missed ──────────────────────────────
  const needsBrowser = !pointsTable || pointsTable.length < 4 || !orangeCap;

  if (needsBrowser && CHROME_AVAILABLE) {
    let browser;
    try {
      browser = await puppeteer.launch(LAUNCH);
      const page = await browser.newPage();

      // Points table from Cricbuzz HTML
      if (!pointsTable || pointsTable.length < 4) {
        try {
          await page.goto('https://www.cricbuzz.com/cricket-series/9237/indian-premier-league-2026/points-table',
            { waitUntil: 'domcontentloaded', timeout: 20000 });
          await wait(3000);
          const table = await page.evaluate(TEAMS => {
            const rows = Array.from(document.querySelectorAll('.cb-srs-pnts tbody tr, .cb-srs-pnts tr'));
            const out = [];
            rows.forEach(row => {
              const cells = Array.from(row.querySelectorAll('td'));
              if (cells.length < 5) return;
              const txt  = cells[0]?.innerText?.trim().toUpperCase() || '';
              const team = TEAMS.find(t => txt.includes(t));
              if (!team) return;
              const nums = cells.slice(1).map(c => c.innerText.trim());
              const pts  = nums.find(n => /^\d+$/.test(n) && parseInt(n) <= 28);
              const nrr  = nums.find(n => /^[+\-]?\d+\.\d+$/.test(n));
              if (!pts) return;
              out.push({ team, played:parseInt(nums[0])||0, won:parseInt(nums[1])||0, lost:parseInt(nums[2])||0, pts:parseInt(pts)||0, nrr:nrr||'0.000' });
            });
            return out.length >= 4 ? out.sort((a,b)=>b.pts-a.pts) : null;
          }, TEAMS);
          if (table) { pointsTable = table; console.log(`📊 [CB HTML] Points table: ${table.length} teams`); }
        } catch(e) { console.log('[CB points HTML]', e.message); }
      }

      // Stats from Cricbuzz HTML stats page
      if (!orangeCap) {
        try {
          await page.goto('https://www.cricbuzz.com/cricket-series/9237/indian-premier-league-2026/stats',
            { waitUntil: 'domcontentloaded', timeout: 20000 });
          await wait(3000);
          const stats = await page.evaluate(() => {
            const body = document.body.innerText;
            const findTop = (label) => {
              const rows = Array.from(document.querySelectorAll('[class*="cb-col-50"],[class*="cb-statsarticle"] tr'));
              for (const row of rows) {
                const txt = row.innerText || '';
                const nameM = txt.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z.]+)+)/);
                const numM  = txt.match(/(\d{1,4})/g);
                if (nameM && numM) return { name: nameM[1].trim(), value: parseInt(numM[numM.length-1]) };
              }
              return null;
            };
            const runsM = body.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z.]+)+)\s+(\d{3,4})\s+(?:runs?)/i);
            const wktsM = body.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z.]+)+)\s+(\d{1,2})\s+(?:wickets?)/i);
            return {
              orangeCap: runsM ? { name: runsM[1].trim(), runs: parseInt(runsM[2]) } : null,
              purpleCap: wktsM ? { name: wktsM[1].trim(), wickets: parseInt(wktsM[2]) } : null,
            };
          });
          if (stats.orangeCap) orangeCap = stats.orangeCap;
          if (stats.purpleCap) purpleCap = stats.purpleCap;
        } catch(e) { /* non-critical */ }
      }

      await page.close();
      await browser.close();
    } catch(err) {
      if (browser) await browser.close();
    }
  }

  return {
    pointsTable: pointsTable || [],
    orangeCap:   orangeCap  || null,
    purpleCap:   purpleCap  || null,
    topBatsmen:  topBatsmen,
    topBowlers:  topBowlers,
    lastUpdated: new Date(),
    source: pointsTable ? 'cricbuzz' : 'fallback',
  };
};

export const scrapeIPLStandings = scrapeIPLStandingsAndStats;