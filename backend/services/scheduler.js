/**
 * scheduler.js
 * All recurring background jobs (live sync every 40s, standings every 12h).
 * Call startScheduler() once from index.js after the DB connects.
 *
 * Depends on:
 *   scraperService     — ESPN fetch + data mapping
 *   dbService          — MongoDB writes
 *   standingsCache     — in-memory standings/stats cache
 *   scraperState       — shared mutable scraper state
 *   matchDataEngine    — COMPLETED_MATCHES, calculatePointsTable, PLAYER_STATS
 *   generateCommentary — commentary fallback generator
 */

import { scrapeLiveMatch, scrapeIPLStandingsAndStats } from './scraperService.js';
import { saveMatch, getLatestMatch, markMatchFinished } from './dbService.js';
import scraperState, {
  FREEZE_MS, NEED_CONFIRM, MAX_FAILS,
} from '../utils/scraperState.js';
import standingsCache from '../utils/standingsCache.js';
import {
  COMPLETED_MATCHES,
  PLAYER_STATS,
  calculatePointsTable,
  getCapLeaders,
} from '../utils/matchDataEngine.js';
import {
  generateCommentary,
  generateOverCommentary,
} from '../utils/matchDataEngine.js';

// ─── Standings update ─────────────────────────────────────────────────────────

export const updateStandingsAndStats = async () => {
  const t = new Date().toLocaleTimeString();
  console.log(`\n[${t}] 📊 Updating standings & stats (12h cycle)...`);

  const computed     = calculatePointsTable(COMPLETED_MATCHES);
  const computedCaps = getCapLeaders(PLAYER_STATS);

  try {
    const scraped = await scrapeIPLStandingsAndStats();
    if (scraped) {
      standingsCache.data = {
        pointsTable:      computed,   // computed is always authoritative for accuracy
        orangeCap:        scraped.orangeCap  || computedCaps.orangeCap,
        purpleCap:        scraped.purpleCap  || computedCaps.purpleCap,
        topBatsmen:       scraped.topBatsmen?.length > 2 ? scraped.topBatsmen : computedCaps.topBatsmen,
        topBowlers:       scraped.topBowlers?.length > 2 ? scraped.topBowlers : computedCaps.topBowlers,
        lastUpdated:      new Date(),
        source:           'computed+scraped',
        matchesAccounted: COMPLETED_MATCHES.length,
      };
    } else {
      standingsCache.data = {
        pointsTable:      computed,
        ...computedCaps,
        lastUpdated:      new Date(),
        source:           'computed',
        matchesAccounted: COMPLETED_MATCHES.length,
      };
    }
  } catch (err) {
    console.error('❌ Standings update error:', err.message);
    standingsCache.data = {
      ...standingsCache.data,
      pointsTable:  computed,
      lastUpdated:  new Date(),
      source:       'computed',
    };
  }
};

// ─── Live sync ────────────────────────────────────────────────────────────────

export const runLiveSync = async () => {
  const t = new Date().toLocaleTimeString();
  const s = scraperState;

  // ── Freeze check ──────────────────────────────────────────────────────────
  if (s.matchFinishedAt) {
    const elapsed = Date.now() - s.matchFinishedAt;
    if (elapsed < FREEZE_MS) {
      console.log(`[${t}] ❄️  Frozen — ${Math.ceil((FREEZE_MS - elapsed) / 60000)}min left.`);
      return;
    }
    console.log(`[${t}] 🔓 Freeze expired. Ready for next match.`);
    s.matchFinishedAt       = null;
    s.lastKnownMatchKey     = null;
    s.finishedConfirmations = 0;
    s.lastLiveScore         = null;
  }

  console.log(`\n[${t}] 🤖 Scraping...`);

  try {
    const data = await scrapeLiveMatch();

    // ── No usable data returned ──────────────────────────────────────────
    if (!data?.score || data.score === '0') {
      const specialStatuses = ['ABANDONED', 'RAIN DELAY', 'POSTPONED'];
      if (data?.status && specialStatuses.includes(data.status)) {
        if (!data.commentary?.length) {
          const gen = generateCommentary(data.status, {
            team1: data.team1?.name,
            team2: data.team2?.name,
            result: data.result || '',
          });
          if (gen) data.commentary = [gen];
        }
        await saveMatch(data);
        return;
      }

      s.consecutiveFails++;
      if (s.consecutiveFails <= 3) {
        console.log(`⚠️  No data (fail ${s.consecutiveFails}/${MAX_FAILS}).`);
      }
      if (s.consecutiveFails >= MAX_FAILS) {
        const ex = await getLatestMatch();
        if (ex?.status === 'LIVE') {
          await markMatchFinished();
          s.matchFinishedAt       = Date.now();
          s.finishedConfirmations = NEED_CONFIRM;
          console.log('🏁 Auto-marked RECENTLY FINISHED after max fails.');
        }
      }
      return;
    }

    s.consecutiveFails = 0;
    const newKey = `${data.team1?.name}_${data.team2?.name}`;

    // ── New match detected ──────────────────────────────────────────────
    if (s.lastKnownMatchKey && s.lastKnownMatchKey !== newKey) {
      console.log(`🆕 Match changed: ${s.lastKnownMatchKey} → ${newKey}. Resetting state.`);
      s.matchFinishedAt       = null;
      s.finishedConfirmations = 0;
      s.lastLiveScore         = null;
    }

    // Break freeze early if a new match has started
    if (s.matchFinishedAt && s.lastKnownMatchKey && s.lastKnownMatchKey !== newKey) {
      console.log('🆕 New match during freeze — clearing freeze early.');
      s.matchFinishedAt       = null;
      s.finishedConfirmations = 0;
      s.lastLiveScore         = null;
    }

    s.lastKnownMatchKey = newKey;

    // ── Validate FINISHED status ────────────────────────────────────────
    if (data.status === 'FINISHED') {
      const winner = data.result?.match(/^([A-Z]{2,4})\s+won/i)?.[1]?.toUpperCase();
      if (!winner || (winner !== data.team1?.name && winner !== data.team2?.name)) {
        console.log(`⚠️  Invalid winner "${winner}" — treating as LIVE.`);
        data.status = 'LIVE';
        data.result = '';
      }
      // Guard against score drop (scraper picked up wrong match)
      if (s.lastLiveScore && parseInt(s.lastLiveScore) > 100 && parseInt(data.score) < 30) {
        console.log(`⚠️  Score drop ${s.lastLiveScore}→${data.score}. Skipping save.`);
        return;
      }
    }

    // ── Confirmed FINISHED ──────────────────────────────────────────────
    if (data.status === 'FINISHED') {
      s.finishedConfirmations++;
      console.log(`🏁 FINISHED ${s.finishedConfirmations}/${NEED_CONFIRM}: ${data.result}`);
      if (s.finishedConfirmations >= NEED_CONFIRM && !s.matchFinishedAt) {
        s.matchFinishedAt = Date.now();
        console.log('🔒 DB frozen for 20 min.');
      }
      if (!data.commentary?.length) {
        data.commentary = [
          generateCommentary('FINISHED', {
            result: data.result,
            team1:  data.team1?.name,
            team2:  data.team2?.name,
          }),
        ].filter(Boolean);
      }
      await saveMatch(data);
      return;
    }

    // ── Back to LIVE after false positive ──────────────────────────────
    if (s.finishedConfirmations > 0 && data.status === 'LIVE') {
      console.log('🔄 Back to LIVE — reset finish counter.');
      s.finishedConfirmations = 0;
    }

    if (data.score && parseInt(data.score) > 5) {
      s.lastLiveScore = data.score;
    }

    // ── Commentary fallback (generate if scraper returned none) ─────────
    const hasRealComm = (data.commentary || []).filter(c => !c.generated).length >= 2;
    if (!hasRealComm) {
      const ctx = {
        batterName:   data.batsmen?.[0]?.name || 'Batter',
        bowlerName:   data.bowlers?.[0]?.name || 'Bowler',
        overNum:      Math.floor(parseFloat(data.overs || 0)),
        target:       data.target,
        currentScore: parseInt(data.score || 0),
        status:       data.status,
        team1:        data.team1?.name,
        team2:        data.team2?.name,
        result:       data.result,
      };

      const specialStates = ['INNINGS BREAK', 'RAIN DELAY', 'ABANDONED', 'POSTPONED', 'SUPER OVER'];
      if (specialStates.includes(data.status)) {
        data.commentary = [generateCommentary(data.status, ctx)].filter(Boolean);
      } else if (data.recent?.some(b => b !== '·')) {
        const genComm  = generateOverCommentary(data.recent.filter(b => b !== '·'), ctx);
        const realComm = (data.commentary || []).filter(c => !c.generated);
        data.commentary = [...realComm, ...genComm].slice(0, 10);
      }
    }

    await saveMatch(data);

  } catch (err) {
    console.error('❌ Live sync error:', err.message);
  }
};

// ─── Startup helpers ──────────────────────────────────────────────────────────

/**
 * Restore freeze state from DB if server restarted mid-match.
 * Call once during startup before the first sync cycle.
 */
export const restoreStateFromDb = async () => {
  try {
    const ex = await getLatestMatch();
    if (ex?.status === 'FINISHED' || ex?.status === 'RECENTLY FINISHED') {
      const age = Date.now() - new Date(ex.lastUpdated).getTime();
      if (age < FREEZE_MS) {
        scraperState.matchFinishedAt       = Date.now() - age;
        scraperState.finishedConfirmations = NEED_CONFIRM;
        console.log('🔄 Resuming — existing FINISHED match. Freeze active.');
      }
    }
    if (ex) {
      scraperState.lastKnownMatchKey = `${ex.team1?.name}_${ex.team2?.name}`;
    }
  } catch {
    // Non-fatal — server just won't have freeze state on a cold start
  }
};

/**
 * Start all background intervals.
 * Call after DB connects and initial data is loaded.
 */
export const startScheduler = () => {
  setInterval(runLiveSync,             40_000);              // every 40s
  setInterval(updateStandingsAndStats, 12 * 60 * 60_000);   // every 12h
  console.log('⏰ Scheduler started (live: 40s, standings: 12h)');
};