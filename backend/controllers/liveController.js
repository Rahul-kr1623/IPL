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
import { scrapeLatestCompletedMatch, scrapeAllSlots } from '../services/scraperService.js';

// Simple in-memory cache of last known good slot data (survives MongoDB empty state)
const slotFallbackCache = { slot1: null, slot2: null, fetchedAt: 0 };
const SLOT_CACHE_MS = 50_000; // 50 seconds — slightly longer than the 40s poll

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

    // ── Filter out "dataless" docs: score=0, no target, no first-innings score ──
    // These are stale pre-match documents saved before the isDatalessLive fix.
    // They show as LIVE with 0/0 which misleads the frontend.
    const isDataless = (d) =>
      (d.score === '0' || d.score === 0 || !d.score) &&
      (!d.target || d.target === 'N/A') &&
      (!d.team1Score || d.team1Score === 'N/A') &&
      d.status !== 'UPCOMING';   // keep genuine UPCOMING docs (from new fix)

    const validDocs = docs.filter(d => !isDataless(d));
    // If all docs are dataless, still return them as UPCOMING (best effort)
    const docsToProcess = validDocs.length > 0 ? validDocs : docs.map(d => ({
      ...d, status: 'UPCOMING',
    }));

    const bySlot = { slot1: null, slot2: null };
    for (const d of docsToProcess) {
      const slotKey = d.slot === 'slot2' ? 'slot2' : 'slot1';
      if (!bySlot[slotKey] ||
        new Date(d.lastUpdated) > new Date(bySlot[slotKey]?.lastUpdated || 0)) {
        bySlot[slotKey] = d;
      }
    }

    let slot1 = bySlot.slot1 ? mapDoc(bySlot.slot1) : null;
    let slot2 = bySlot.slot2 ? mapDoc(bySlot.slot2) : null;

    if (slot1 && slot2 && slot1.matchId === slot2.matchId) slot1 = null;

    // ── Fallback: if any slot is empty, try live scraper then cache ──────
    // This handles the case where MongoDB has no valid document for a slot
    // (e.g. stale 0/0 docs were filtered out, or fresh deploy with empty DB).
    if (!slot1 || !slot2) {
      const cacheAge = Date.now() - slotFallbackCache.fetchedAt;
      if (cacheAge > SLOT_CACHE_MS) {
        // Cache stale — hit the scraper directly
        try {
          const fresh = await scrapeAllSlots();
          if (fresh.slot1) slotFallbackCache.slot1 = fresh.slot1;
          if (fresh.slot2) slotFallbackCache.slot2 = fresh.slot2;
          slotFallbackCache.fetchedAt = Date.now();
          console.log(`[getLiveScore] Direct scrape fallback: slot1=${fresh.slot1?.team1?.name || 'empty'} slot2=${fresh.slot2?.team1?.name || 'empty'}`);
        } catch (e) {
          console.log('[getLiveScore] Direct scrape fallback failed:', e.message);
        }
      }
      if (!slot1 && slotFallbackCache.slot1) slot1 = slotFallbackCache.slot1;
      if (!slot2 && slotFallbackCache.slot2) slot2 = slotFallbackCache.slot2;
    } else {
      // Good data — update cache
      slotFallbackCache.slot1 = slot1;
      slotFallbackCache.slot2 = slot2;
      slotFallbackCache.fetchedAt = Date.now();
    }

    return res.json({
      slot1, slot2,
      matches: [slot1, slot2].filter(Boolean),
      _stale: slot1?._stale || slot2?._stale || false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message, slot1: null, slot2: null, matches: [] });
  }
};

let latestFinishedCache = { data: null, fetchedAt: 0 };
const LATEST_FINISHED_CACHE_MS = 2 * 60 * 1000; // 2 minutes

// ─── GET /api/v1/latest-finished ─────────────────────────────────────────────
export const getLatestFinished = async (req, res) => {
  try {
    const age = Date.now() - latestFinishedCache.fetchedAt;
    
    if (age < LATEST_FINISHED_CACHE_MS && latestFinishedCache.data) {
      return res.json({ match: latestFinishedCache.data, source: 'espn-scraped' });
    }

    // Tier 1: Live ESPN scrape — most dynamic and accurate
    try {
      const scraped = await scrapeLatestCompletedMatch();
      if (scraped) {
        const result = { ...scraped, source: 'espn-scraped', _source: 'espn-scraped' };
        latestFinishedCache = { data: result, fetchedAt: Date.now() };
        return res.json({ match: result, source: 'espn-scraped' });
      }
    } catch (e) {
      console.log('[getLatestFinished] ESPN scrape failed:', e.message);
    }

    // Tier 2: JSON file written by scheduler on every FINISHED match
    const jsonResult = getLatestFinishedFromJson();
    if (jsonResult) return res.json({ match: jsonResult, source: 'json' });

    // Tier 3: MongoDB LiveMatch marked as FINISHED/RECENTLY FINISHED
    const mongoResult = await getLatestFinishedMatch();
    if (mongoResult) return res.json({ match: mongoResult.toObject(), source: 'liveMatch' });

    // Tier 4: Return null
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