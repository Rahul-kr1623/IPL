/**
 * scheduler.js
 * All recurring background jobs.
 *
 * Architecture (matching ESPNCricinfo/Cricbuzz pattern):
 *   Live in-play score  → MongoDB (single upsert per slot)       every 40s
 *   Completed scorecards → JSON files in /data/seasons/          once on FINISH
 *   Standings (12h)     → in-memory standingsCache
 *
 * runLiveSyncAllSlots() runs every 40 seconds and:
 *   1. Scrapes ESPN for ALL live IPL events (slot1 + slot2)
 *   2. Saves each slot to MongoDB
 *   3. On FINISHED: writes scorecard to /data/seasons/2026.json
 */

import { scrapeAllSlots, scrapeIPLStandingsAndStats } from './scraperService.js';
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
  generateCommentary,
  generateOverCommentary,
} from '../utils/matchDataEngine.js';
import { saveCompletedMatch } from '../utils/seasonStore.js';

// ─── Per-slot state ────────────────────────────────────────────────────────────
// We keep independent fail/finish counters for each slot so a 7:30 PM match
// finishing doesn't freeze the 3:30 PM slot's state.
const slotState = {
  slot1: { consecutiveFails: 0, finishedConfirmations: 0, matchFinishedAt: null, lastLiveScore: null, lastKey: null },
  slot2: { consecutiveFails: 0, finishedConfirmations: 0, matchFinishedAt: null, lastLiveScore: null, lastKey: null },
};

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
        pointsTable:      computed,
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

// ─── Single slot processor ────────────────────────────────────────────────────
/**
 * Process one slot's data through the state machine.
 * @param {string} slotKey  'slot1' | 'slot2'
 * @param {object|null} data  Scraped match data (null = nothing found)
 */
const processSlot = async (slotKey, data) => {
  const s = slotState[slotKey];

  // ── Nothing found for this slot ──────────────────────────────────────────
  if (!data) {
    // If this slot was live before and we've lost it, count as fail
    if (s.lastKey) {
      s.consecutiveFails++;
      if (s.consecutiveFails >= MAX_FAILS && s.lastKey) {
        console.log(`⚠️  [${slotKey}] Max fails — auto-marking finished`);
        await markMatchFinished();
        s.matchFinishedAt = Date.now();
        s.finishedConfirmations = NEED_CONFIRM;
        s.lastKey = null;
      }
    }
    return;
  }

  // ── Check freeze ─────────────────────────────────────────────────────────
  if (s.matchFinishedAt) {
    const elapsed = Date.now() - s.matchFinishedAt;
    if (elapsed < FREEZE_MS) {
      console.log(`  [${slotKey}] ❄️ Frozen — ${Math.ceil((FREEZE_MS - elapsed) / 60000)}min left`);
      return;
    }
    // Freeze expired
    s.matchFinishedAt = null;
    s.lastKey = null;
    s.finishedConfirmations = 0;
    s.lastLiveScore = null;
    console.log(`  [${slotKey}] 🔓 Freeze expired`);
  }

  s.consecutiveFails = 0;
  const newKey = `${data.team1?.name}_${data.team2?.name}`;

  // New match detected mid-freeze
  if (s.matchFinishedAt && s.lastKey && s.lastKey !== newKey) {
    console.log(`  [${slotKey}] 🆕 New match during freeze — clearing`);
    s.matchFinishedAt = null;
    s.finishedConfirmations = 0;
    s.lastLiveScore = null;
  }

  if (s.lastKey && s.lastKey !== newKey) {
    console.log(`  [${slotKey}] 🆕 Match changed: ${s.lastKey} → ${newKey}`);
    s.matchFinishedAt = null;
    s.finishedConfirmations = 0;
    s.lastLiveScore = null;
  }

  s.lastKey = newKey;

  // ── Validate FINISHED ────────────────────────────────────────────────────
  if (data.status === 'FINISHED') {
    const winner = data.result?.match(/^([A-Z]{2,4})\s+won/i)?.[1]?.toUpperCase();
    if (!winner || (winner !== data.team1?.name && winner !== data.team2?.name)) {
      console.log(`  [${slotKey}] ⚠️ Invalid winner "${winner}" — treating as LIVE`);
      data.status = 'LIVE';
      data.result = '';
    }
    if (s.lastLiveScore && parseInt(s.lastLiveScore) > 100 && parseInt(data.score) < 30) {
      console.log(`  [${slotKey}] ⚠️ Score drop ${s.lastLiveScore}→${data.score}. Skipping.`);
      return;
    }
  }

  // ── FINISHED handler ─────────────────────────────────────────────────────
  if (data.status === 'FINISHED') {
    s.finishedConfirmations++;
    console.log(`  [${slotKey}] 🏁 FINISHED ${s.finishedConfirmations}/${NEED_CONFIRM}: ${data.result}`);

    if (s.finishedConfirmations >= NEED_CONFIRM && !s.matchFinishedAt) {
      s.matchFinishedAt = Date.now();
      console.log(`  [${slotKey}] 🔒 Frozen for 20 min`);

      // ✅ Write to BOTH stores so data survives Render redeploys
      // Tier 1: MongoDB CompletedMatch (persistent)
      try {
        const { saveCompletedMatch: saveToDB } = await import('../services/completedMatchService.js');
        await saveToDB(data);
      } catch(e) {
        console.error(`  [${slotKey}] ⚠️ CompletedMatch MongoDB save failed: ${e.message}`);
      }
      // Tier 2: JSON file (fast local reads, non-persistent across redeploys)
      try {
        saveCompletedMatch(data);
      } catch(e) {
        console.error(`  [${slotKey}] ⚠️ seasonStore JSON save failed: ${e.message}`);
      }
    }

    if (!data.commentary?.length) {
      data.commentary = [generateCommentary('FINISHED', {
        result: data.result, team1: data.team1?.name, team2: data.team2?.name,
      })].filter(Boolean);
    }

    // Attach slot info and save to MongoDB
    await saveMatch({ ...data, slot: slotKey });
    return;
  }

  // ── LIVE / INNINGS BREAK etc. ─────────────────────────────────────────────
  if (s.finishedConfirmations > 0 && data.status === 'LIVE') {
    console.log(`  [${slotKey}] 🔄 Back to LIVE — reset finish counter`);
    s.finishedConfirmations = 0;
  }

  if (data.score && parseInt(data.score) > 5) {
    s.lastLiveScore = data.score;
  }

  // Commentary fallback
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

  // Save live data to MongoDB (architecture tier 1: real-time upsert)
  await saveMatch({ ...data, slot: slotKey });
};

// ─── Main sync cycle ──────────────────────────────────────────────────────────

export const runLiveSyncAllSlots = async () => {
  const t = new Date().toLocaleTimeString();
  console.log(`\n[${t}] 🤖 Scraping all slots...`);

  // Global freeze check for backwards compat (slot1 state mirrors old scraperState)
  const s = scraperState;
  if (s.matchFinishedAt) {
    const elapsed = Date.now() - s.matchFinishedAt;
    if (elapsed < FREEZE_MS) {
      console.log(`[${t}] ❄️ Global freeze — ${Math.ceil((FREEZE_MS - elapsed) / 60000)}min left`);
      return;
    }
    s.matchFinishedAt = null; s.lastKnownMatchKey = null;
    s.finishedConfirmations = 0; s.lastLiveScore = null;
  }

  try {
    const { slot1, slot2 } = await scrapeAllSlots();
    await Promise.allSettled([
      processSlot('slot1', slot1),
      processSlot('slot2', slot2),
    ]);
  } catch (err) {
    console.error('❌ Live sync error:', err.message);
  }
};

// Keep old export name for any code still importing it
export const runLiveSync = runLiveSyncAllSlots;

// ─── Startup helpers ──────────────────────────────────────────────────────────

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
    // Non-fatal
  }
};

export const startScheduler = () => {
  setInterval(runLiveSyncAllSlots,      40_000);             // every 40s
  setInterval(updateStandingsAndStats, 12 * 60 * 60_000);   // every 12h
  console.log('⏰ Scheduler started (live: 40s, standings: 12h)');
};