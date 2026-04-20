/**
 * liveController.js
 * Route handlers for all live match, standings, and player stats endpoints.
 *
 * Architecture:
 *   GET /live-score       → MongoDB (live upsert, tiers 1+2)
 *   GET /latest-finished  → JSON file (tier 3: completed scorecards)
 *   GET /ipl-data         → standingsCache (in-memory, refreshed 12h)
 */

import { getAllMatches, getLatestMatch, getLatestFinishedMatch } from '../services/dbService.js';
import standingsCache from '../utils/standingsCache.js';
import {
  COMPLETED_MATCHES,
  PLAYER_STATS,
  getCapLeaders,
} from '../utils/matchDataEngine.js';
import { getLatestFinishedFromJson, getAllCompletedFromJson } from '../utils/seasonStore.js';

// ─── GET /api/v1/live-score ───────────────────────────────────────────────────
// Returns { slot1: Match|null, slot2: Match|null }
// slot1 = 3:30 PM match (earlier in the day)
// slot2 = 7:30 PM match (later in the day)
// Either can be null when no match is scheduled/live in that slot
export const getLiveScore = async (req, res) => {
  try {
    const docs = await getAllMatches();

    // No matches in DB at all
    if (!docs || docs.length === 0) {
      return res.json({
        slot1: null,
        slot2: null,
        _empty: true,
        status: 'FETCHING',
        message: 'Scraper warming up…',
        // Legacy compat: matches array
        matches: [],
      });
    }

    const now = Date.now();

    // Map each doc to its slot, adding a _stale flag
    const mapDoc = (d) => ({
      ...d.toObject(),
      _stale: (now - new Date(d.lastUpdated).getTime()) > 10 * 60 * 1000,
    });

    // Find docs by slot field; fall back to ordering (first = slot1, second = slot2)
    // so old documents without slot field still work
    const bySlot = { slot1: null, slot2: null };
    for (const d of docs) {
      const slotKey = d.slot === 'slot2' ? 'slot2' : 'slot1';
      // Only use the most recent doc for each slot
      if (!bySlot[slotKey] ||
          new Date(d.lastUpdated) > new Date(bySlot[slotKey].lastUpdated)) {
        bySlot[slotKey] = d;
      }
    }

    const slot1 = bySlot.slot1 ? mapDoc(bySlot.slot1) : null;
    const slot2 = bySlot.slot2 ? mapDoc(bySlot.slot2) : null;

    return res.json({
      slot1,
      slot2,
      // Legacy compat: matches array (keeps old frontend paths working)
      matches: docs.map(mapDoc),
      _stale: slot1?._stale || slot2?._stale || false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message, slot1: null, slot2: null, matches: [] });
  }
};

// ─── GET /api/v1/latest-finished ─────────────────────────────────────────────
// Priority: CompletedMatch MongoDB (persistent across redeploys)
//        → seasonStore JSON (fast, written during session)
//        → LiveMatch MongoDB fallback (in case of cold start)
export const getLatestFinished = async (req, res) => {
  try {
    // Tier 1 was previously a CompletedMatch collection, but it's not present.
    // Falling back directly to Tier 2 (seasonStore) and Tier 3 (LiveMatch).

    // Tier 2: seasonStore JSON (written during same uptime session)
    const jsonResult = getLatestFinishedFromJson();
    if (jsonResult) {
      return res.json({ match: jsonResult, source: 'json' });
    }

    // Tier 3: LiveMatch MongoDB fallback
    const mongoResult = await getLatestFinishedMatch();
    if (mongoResult) {
      return res.json({ match: mongoResult.toObject(), source: 'liveMatch' });
    }

    return res.json({ match: null, source: 'none' });
  } catch (err) {
    res.status(500).json({ error: err.message, match: null });
  }
};

// ─── GET /api/v1/commentary ───────────────────────────────────────────────────
export const getCommentary = async (req, res) => {
  try {
    const data = await getLatestMatch();
    res.json({ commentary: data?.commentary || [] });
  } catch {
    res.json({ commentary: [] });
  }
};

// ─── GET /api/v1/ipl-data ─────────────────────────────────────────────────────
export const getIplData = (req, res) => {
  res.json(standingsCache.data);
};

// ─── GET /api/v1/player-stats ─────────────────────────────────────────────────
export const getPlayerStats = (req, res) => {
  const caps = getCapLeaders(PLAYER_STATS);
  const c    = standingsCache.data;
  res.json({
    topBatsmen: c.topBatsmen?.length > 3 ? c.topBatsmen : caps.topBatsmen,
    topBowlers: c.topBowlers?.length > 3 ? c.topBowlers : caps.topBowlers,
    orangeCap:  c.orangeCap  ?? caps.orangeCap,
    purpleCap:  c.purpleCap  ?? caps.purpleCap,
  });
};

// ─── GET /api/v1/completed-matches ────────────────────────────────────────────
// Reads from JSON file (tier 3) for current season, falls back to COMPLETED_MATCHES
export const getCompletedMatches = (req, res) => {
  // Try JSON file first
  const fromJson = getAllCompletedFromJson();
  if (fromJson && fromJson.length > 0) {
    return res.json({
      completedIds: fromJson.map(m => m.matchId),
      results: fromJson,
      source: 'json',
    });
  }
  // Fallback to matchDataEngine in-memory store
  res.json({
    completedIds: COMPLETED_MATCHES.map(m => m.id),
    results: COMPLETED_MATCHES.map(m => ({
      id:      m.id,
      teamA:   m.teamA,
      teamB:   m.teamB,
      winner:  m.winner,
      result:  m.result,
      scoreA:  `${m.scoreA}/${m.wA} (${m.ovA})`,
      scoreB:  `${m.scoreB}/${m.wB} (${m.ovB})`,
      date:    m.date,
    })),
    source: 'memory',
  });
};

// ─── GET /api/v1/health ───────────────────────────────────────────────────────
import scraperState from '../utils/scraperState.js';

export const getHealth = (req, res) => {
  res.json({
    status:  'ok',
    time:    new Date(),
    frozen:  !!scraperState.matchFinishedAt,
    uptime:  Math.floor(process.uptime()),
  });
};