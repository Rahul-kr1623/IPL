/**
 * liveController.js
 * Route handlers for all live match, standings, and player stats endpoints.
 *
 * Every handler:
 *   - reads from dbService (MongoDB) or standingsCache (in-memory)
 *   - never calls scrapeLiveMatch() directly (that's the scheduler's job)
 *   - returns plain JSON — no logic beyond formatting
 */

import { getLatestMatch, getAllMatches } from '../services/dbService.js';
import standingsCache from '../utils/standingsCache.js';
import {
  COMPLETED_MATCHES,
  PLAYER_STATS,
  getCapLeaders,
} from '../utils/matchDataEngine.js';

// ─── GET /api/v1/live-score ───────────────────────────────────────────────────
// Returns { matches: [...] } — always an array.
// On normal days: 1 item. On double-header days: 2 items.
// Frontend checks matches.length to decide single vs dual card layout.
export const getLiveScore = async (req, res) => {
  try {
    const docs = await getAllMatches();
    if (!docs || docs.length === 0) {
      return res.json({
        _empty: true,
        status: 'FETCHING',
        message: 'Scraper warming up…',
        matches: [],
      });
    }
    const age0 = Date.now() - new Date(docs[0].lastUpdated).getTime();
    const matches = docs.map(d => ({
      ...d.toObject(),
      _stale: (Date.now() - new Date(d.lastUpdated).getTime()) > 10 * 60 * 1000,
    }));
    return res.json({ matches, _stale: age0 > 10 * 60 * 1000 });
  } catch (err) {
    res.status(500).json({ error: err.message, matches: [] });
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
// Returns full standings cache: points table, cap holders, top batsmen/bowlers.
// Used by PointsTable page, Stats page, and sidebar widgets.
export const getIplData = (req, res) => {
  res.json(standingsCache.data);
};

// ─── GET /api/v1/player-stats ─────────────────────────────────────────────────
// Prefers scraped data from standingsCache if it has enough entries,
// falls back to the computed stats from matchDataEngine.
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
// Used by Fixtures page to know which matches are finished.
export const getCompletedMatches = (req, res) => {
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