/**
 * scheduler.js
 * All recurring background jobs.
 *
 * BUG FIXES in this version:
 *   Bug 2 — Stale score detection: sameScoreCount per slot.
 *   Bug 4 — INNINGS BREAK treated as finish: reset finishedConfirmations
 *            on ANY non-FINISHED status, not just 'LIVE'.
 *   Bug 5 — Double-header finish race: per-slot savedToDb flag guards
 *            MongoDB write so it only fires once per match.
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

// ─── Per-slot state ─────────────────────────────────────────────────────────
const slotState = {
  slot1: {
    consecutiveFails: 0, finishedConfirmations: 0, matchFinishedAt: null,
    lastLiveScore: null, lastKey: null,
    sameScoreCount: 0, lastScoreStr: null,   // Bug 2
    savedToDb: false,                         // Bug 5
  },
  slot2: {
    consecutiveFails: 0, finishedConfirmations: 0, matchFinishedAt: null,
    lastLiveScore: null, lastKey: null,
    sameScoreCount: 0, lastScoreStr: null,   // Bug 2
    savedToDb: false,                         // Bug 5
  },
};

// 6 polls × 40 s = 4 min of the same score before we flag a stall (Bug 2)
const STALE_SCORE_THRESHOLD = 6;

// Statuses that must NEVER count toward finishedConfirmations (Bug 4)
const NON_FINISH_STATUSES = new Set([
  'LIVE', 'INNINGS BREAK', 'RAIN DELAY', 'TIMEOUT',
  'DRINK BREAK', 'STRATEGIC TIMEOUT', 'SUPER OVER',
  'ABANDONED', 'POSTPONED',
]);

// ─── Standings update ────────────────────────────────────────────────────────
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
        pointsTable: computed,
        ...computedCaps,
        lastUpdated: new Date(),
        source: 'computed',
        matchesAccounted: COMPLETED_MATCHES.length,
      };
    }
  } catch (err) {
    console.error('❌ Standings update error:', err.message);
    standingsCache.data = {
      ...standingsCache.data,
      pointsTable: computed,
      lastUpdated: new Date(),
      source: 'computed',
    };
  }
};

// ─── Helper: reset slot to clean state ──────────────────────────────────────
const resetSlot = (s, reason, slotKey) => {
  console.log(`  [${slotKey}] 🔄 Reset: ${reason}`);
  s.matchFinishedAt      = null;
  s.finishedConfirmations = 0;
  s.lastLiveScore        = null;
  s.sameScoreCount       = 0;
  s.lastScoreStr         = null;
  s.savedToDb            = false;
};

// ─── Single slot processor ───────────────────────────────────────────────────
const processSlot = async (slotKey, data) => {
  const s = slotState[slotKey];

  // ── Nothing found for this slot ────────────────────────────────────────
  if (!data) {
    if (s.lastKey) {
      s.consecutiveFails++;
      if (s.consecutiveFails >= MAX_FAILS) {
        console.log(`⚠️  [${slotKey}] Max fails — auto-marking finished`);
        await markMatchFinished();
        s.matchFinishedAt = Date.now();
        s.finishedConfirmations = NEED_CONFIRM;
        s.lastKey = null;
      }
    }
    return;
  }

  // ── Check freeze ──────────────────────────────────────────────────────
  if (s.matchFinishedAt) {
    const elapsed = Date.now() - s.matchFinishedAt;
    if (elapsed < FREEZE_MS) {
      console.log(`  [${slotKey}] ❄️ Frozen — ${Math.ceil((FREEZE_MS - elapsed) / 60000)}min left`);
      return;
    }
    // Freeze expired
    s.lastKey = null;
    resetSlot(s, 'freeze expired', slotKey);
  }

  s.consecutiveFails = 0;
  const newKey = `${data.team1?.name}_${data.team2?.name}`;

  // New match started (either mid-freeze or between freeze and new match)
  if (s.lastKey && s.lastKey !== newKey) {
    resetSlot(s, `match changed ${s.lastKey} → ${newKey}`, slotKey);
  }

  s.lastKey = newKey;

  // ── Bug 2: Stale-score detection ─────────────────────────────────────
  // Fingerprint includes overs so all-dot overs (no run change) still advance.
  const scoreFingerprint = `${data.score}/${data.wickets}@${data.overs}`;

  if (scoreFingerprint === s.lastScoreStr) {
    s.sameScoreCount++;
    if (s.sameScoreCount >= STALE_SCORE_THRESHOLD &&
        ['LIVE', 'SUPER OVER'].includes(data.status)) {
      console.log(
        `  ⚠️  [${slotKey}] Stale score: "${scoreFingerprint}" for` +
        ` ${s.sameScoreCount} polls (~${Math.round(s.sameScoreCount * 40 / 60)}min).` +
        ` ESPN data may be frozen.`
      );
    }
  } else {
    s.sameScoreCount = 0;
    s.lastScoreStr   = scoreFingerprint;
  }

  // ── Bug 4: Reset finish counter on any non-FINISHED status ───────────
  // This prevents INNINGS BREAK / RAIN DELAY from silently accumulating
  // confirmations across the break.
  if (NON_FINISH_STATUSES.has(data.status) && s.finishedConfirmations > 0) {
    console.log(`  [${slotKey}] 🔄 Status="${data.status}" — resetting finish counter (was ${s.finishedConfirmations})`);
    s.finishedConfirmations = 0;
  }

  // ── Validate FINISHED ─────────────────────────────────────────────────
  if (data.status === 'FINISHED') {
    const winner = data.result?.match(/^([A-Z]{2,4})\s+won/i)?.[1]?.toUpperCase();
    if (!winner || (winner !== data.team1?.name && winner !== data.team2?.name)) {
      console.log(`  [${slotKey}] ⚠️ Invalid winner "${winner}" — treating as LIVE`);
      data.status = 'LIVE';
      data.result = '';
      s.finishedConfirmations = 0; // Bug 4: explicit reset after demotion
    }
    if (s.lastLiveScore && parseInt(s.lastLiveScore) > 100 && parseInt(data.score) < 30) {
      console.log(`  [${slotKey}] ⚠️ Score drop ${s.lastLiveScore}→${data.score}. Skipping.`);
      return;
    }
  }

  // ── FINISHED handler ──────────────────────────────────────────────────
  if (data.status === 'FINISHED') {
    s.finishedConfirmations++;
    console.log(`  [${slotKey}] 🏁 FINISHED ${s.finishedConfirmations}/${NEED_CONFIRM}: ${data.result}`);

    if (s.finishedConfirmations >= NEED_CONFIRM && !s.matchFinishedAt) {
      s.matchFinishedAt = Date.now();
      console.log(`  [${slotKey}] 🔒 Frozen for 20 min`);

      // Bug 5: per-slot savedToDb flag prevents duplicate writes on double-headers
      if (!s.savedToDb) {
        s.savedToDb = true;

        // Tier 1: MongoDB CompletedMatch (persistent across redeploys)
        try {
          const { saveCompletedMatch: saveToDB } = await import('../services/completedMatchService.js');
          await saveToDB(data);
          console.log(`  [${slotKey}] ✅ Saved to MongoDB CompletedMatch`);
        } catch (e) {
          console.error(`  [${slotKey}] ⚠️ CompletedMatch MongoDB save failed: ${e.message}`);
        }

        // Tier 2: JSON file (fast local reads, non-persistent across redeploys)
        try {
          saveCompletedMatch(data);
          console.log(`  [${slotKey}] ✅ Saved to seasonStore JSON`);
        } catch (e) {
          console.error(`  [${slotKey}] ⚠️ seasonStore JSON save failed: ${e.message}`);
        }
      } else {
        console.log(`  [${slotKey}] ℹ️ DB already saved this session — skipping duplicate write`);
      }
    }

    if (!data.commentary?.length) {
      data.commentary = [generateCommentary('FINISHED', {
        result: data.result, team1: data.team1?.name, team2: data.team2?.name,
      })].filter(Boolean);
    }

    await saveMatch({ ...data, slot: slotKey });
    return;
  }

  // ── LIVE / INNINGS BREAK / other in-progress statuses ────────────────
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

  await saveMatch({ ...data, slot: slotKey });
};

// ─── Main sync cycle ─────────────────────────────────────────────────────────
export const runLiveSyncAllSlots = async () => {
  const t = new Date().toLocaleTimeString();
  console.log(`\n[${t}] 🤖 Scraping all slots...`);

  // Global freeze check for backwards compat
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

// ─── Startup helpers ─────────────────────────────────────────────────────────
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
  setInterval(runLiveSyncAllSlots,      40_000);
  setInterval(updateStandingsAndStats, 12 * 60 * 60_000);
  console.log('⏰ Scheduler started (live: 40s, standings: 12h)');
};