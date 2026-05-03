/**
 * liveController.js
 * Route handlers for all live match, standings, and player stats endpoints.
 *
 * Architecture:
 *   GET /live-score       → MongoDB (live upsert, tiers 1+2)
 *   GET /latest-finished  → JSON file (tier 3: completed scorecards)
 *   GET /ipl-data         → standingsCache (in-memory, refreshed 12h)
 *   GET /match-intel      → Gemini AI (cached 90s, keyed by over+score)
 */

import { getAllMatches, getLatestMatch, getLatestFinishedMatch } from '../services/dbService.js';
import standingsCache from '../utils/standingsCache.js';
import {
  COMPLETED_MATCHES,
  PLAYER_STATS,
  getCapLeaders,
} from '../utils/matchDataEngine.js';
import { getLatestFinishedFromJson, getAllCompletedFromJson } from '../utils/seasonStore.js';
import { getMatchIntel } from '../services/geminiService.js';
import { scrapeLatestCompletedMatch } from '../services/scraperService.js';

// ─── GET /api/v1/live-score ───────────────────────────────────────────────────
export const getLiveScore = async (req, res) => {
  try {
    const docs = await getAllMatches();

    if (!docs || docs.length === 0) {
      return res.json({
        slot1: null, slot2: null,
        _empty: true, status: 'FETCHING',
        message: 'Scraper warming up…', matches: [],
      });
    }

    const now = Date.now();
    const mapDoc = (d) => ({
      ...d.toObject(),
      _stale: (now - new Date(d.lastUpdated).getTime()) > 10 * 60 * 1000,
    });

    const bySlot = { slot1: null, slot2: null };
    for (const d of docs) {
      const slotKey = d.slot === 'slot2' ? 'slot2' : 'slot1';
      if (!bySlot[slotKey] ||
        new Date(d.lastUpdated) > new Date(bySlot[slotKey].lastUpdated)) {
        bySlot[slotKey] = d;
      }
    }

    let slot1 = bySlot.slot1 ? mapDoc(bySlot.slot1) : null;
    let slot2 = bySlot.slot2 ? mapDoc(bySlot.slot2) : null;

    if (slot1 && slot2 && slot1.matchId === slot2.matchId) slot1 = null;

    return res.json({
      slot1, slot2,
      matches: docs.map(mapDoc),
      _stale: slot1?._stale || slot2?._stale || false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message, slot1: null, slot2: null, matches: [] });
  }
};

// ─── GET /api/v1/latest-finished ─────────────────────────────────────────────
export const getLatestFinished = async (req, res) => {
  try {
    // Tier 1: JSON file written by scheduler on every FINISHED match (most up to date)
    const jsonResult = getLatestFinishedFromJson();
    if (jsonResult) return res.json({ match: jsonResult, source: 'json' });

    // Tier 2: MongoDB LiveMatch marked as FINISHED/RECENTLY FINISHED
    const mongoResult = await getLatestFinishedMatch();
    if (mongoResult) return res.json({ match: mongoResult.toObject(), source: 'liveMatch' });

    // Tier 3: live scrape from ESPN scoreboard (gets yesterday's actual result)
    try {
      const scraped = await scrapeLatestCompletedMatch();
      if (scraped) return res.json({ match: scraped, source: 'espn-scraped' });
    } catch (e) {
      console.log('[getLatestFinished] ESPN scrape failed:', e.message);
    }

    // Tier 4: hardcoded COMPLETED_MATCHES array — absolute last resort
    const last = COMPLETED_MATCHES[COMPLETED_MATCHES.length - 1];
    if (last) {
      const fallback = {
        team1: last.teamA, team2: last.teamB,
        team1Score: `${last.scoreA}/${last.wA} (${last.ovA})`,
        team2Score: `${last.scoreB}/${last.wB} (${last.ovB})`,
        winner: last.winner, result: last.result,
        matchNumber: `Match ${last.id}`, date: last.date,
        winProbT1: last.winner === last.teamA ? 100 : 0,
        winProbT2: last.winner === last.teamB ? 100 : 0,
        status: 'FINISHED',
      };
      return res.json({ match: fallback, source: 'hardcoded' });
    }

    return res.json({ match: null, source: 'none' });
  } catch (err) {
    res.status(500).json({ error: err.message, match: null });
  }
};

// ─── GET /api/v1/match-intel ──────────────────────────────────────────────────
// Calls Gemini AI with the current match state. Caches the response for 90s
// so we don't hammer the API every poll. Cache is invalidated when the over
// changes (new over = new tactical context = fresh analysis worth getting).
const intelCache = {
  text:      null,
  cacheKey:  null,   // "{team1}_{team2}_{over}_{score}"
  fetchedAt: 0,
};
const INTEL_CACHE_MS = 90_000; // 90 seconds

export const getMatchIntelHandler = async (req, res) => {
  try {
    // Accept match data in query OR body (GET with query params for simplicity)
    const {
      team1, team2, score, wickets, overs, target,
      status, result, firstInningsScore
    } = req.query;

    const cacheKey = `${team1}_${team2}_${Math.floor(parseFloat(overs || 0))}_${score}`;
    const age = Date.now() - intelCache.fetchedAt;

    // Serve from cache if same over, same score, and not expired
    if (
      intelCache.text &&
      intelCache.cacheKey === cacheKey &&
      age < INTEL_CACHE_MS
    ) {
      return res.json({ intel: intelCache.text, cached: true, cacheAgeMs: age });
    }

    // Build a compact match summary for Gemini
    const matchSummary = {
      team1: team1 || 'Team 1',
      team2: team2 || 'Team 2',
      currentScore: `${score || 0}/${wickets || 0} (${overs || 0} ov)`,
      ...(target   ? { target, required: parseInt(target) - parseInt(score || 0) } : {}),
      ...(firstInningsScore ? { firstInningsScore } : {}),
      status: status || 'LIVE',
      ...(result   ? { result } : {}),
    };

    const intel = await getMatchIntel(matchSummary);

    // Update cache
    intelCache.text      = intel;
    intelCache.cacheKey  = cacheKey;
    intelCache.fetchedAt = Date.now();

    return res.json({ intel, cached: false });
  } catch (err) {
    console.error('[match-intel]', err.message);
    // Return a stale cache if available, rather than an error
    if (intelCache.text) {
      return res.json({ intel: intelCache.text, cached: true, error: err.message });
    }
    res.status(500).json({
      intel: 'AI Protocol Offline — strategic analysis unavailable.',
      error: err.message,
    });
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
  const c = standingsCache.data;
  res.json({
    topBatsmen: c.topBatsmen?.length > 3 ? c.topBatsmen : caps.topBatsmen,
    topBowlers: c.topBowlers?.length > 3 ? c.topBowlers : caps.topBowlers,
    orangeCap:  c.orangeCap  ?? caps.orangeCap,
    purpleCap:  c.purpleCap  ?? caps.purpleCap,
  });
};

// ─── GET /api/v1/completed-matches ────────────────────────────────────────────
export const getCompletedMatches = (req, res) => {
  const fromJson = getAllCompletedFromJson();
  if (fromJson && fromJson.length > 0) {
    return res.json({ completedIds: fromJson.map(m => m.matchId), results: fromJson, source: 'json' });
  }
  res.json({
    completedIds: COMPLETED_MATCHES.map(m => m.id),
    results: COMPLETED_MATCHES.map(m => ({
      id: m.id, teamA: m.teamA, teamB: m.teamB, winner: m.winner,
      result: m.result,
      scoreA: `${m.scoreA}/${m.wA} (${m.ovA})`,
      scoreB: `${m.scoreB}/${m.wB} (${m.ovB})`,
      date: m.date,
    })),
    source: 'memory',
  });
};

// ─── GET /api/v1/health ───────────────────────────────────────────────────────
import scraperState from '../utils/scraperState.js';

export const getHealth = (req, res) => {
  res.json({
    status: 'ok', time: new Date(),
    frozen: !!scraperState.matchFinishedAt,
    uptime: Math.floor(process.uptime()),
  });
};