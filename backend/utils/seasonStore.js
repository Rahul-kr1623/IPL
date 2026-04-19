/**
 * seasonStore.js
 *
 * Handles writing completed match scorecards to JSON files in /data/seasons/.
 * Architecture: completed scorecards → JSON files (zero DB cost, fast reads, git-trackable)
 *
 * Format: backend/data/seasons/2026.json
 * {
 *   "season": "2026",
 *   "completedMatches": [
 *     {
 *       "matchId": "1529271",          // ESPN event ID
 *       "matchNumber": "Match 32",
 *       "date": "2026-04-19",
 *       "venue": "Eden Gardens",
 *       "team1": "KKR",              // batted first
 *       "team2": "RR",               // batted second / chased
 *       "team1Score": "167/8",
 *       "team1Overs": "20.0",
 *       "team2Score": "145/9",
 *       "team2Overs": "20.0",
 *       "target": 168,
 *       "result": "KKR won by 22 runs",
 *       "winner": "KKR",
 *       "toss": "KKR won the toss and elected to bat",
 *       "completedAt": "2026-04-19T18:15:00.000Z",
 *       "batsmen": [...],
 *       "bowlers": [...]
 *     }
 *   ]
 * }
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname }                                       from 'path';
import { fileURLToPath }                                       from 'url';

const __dir      = dirname(fileURLToPath(import.meta.url));
const SEASONS_DIR = join(__dir, '../data/seasons');

// ─── Ensure directory exists ──────────────────────────────────────────────────
if (!existsSync(SEASONS_DIR)) mkdirSync(SEASONS_DIR, { recursive: true });

// ─── Read/write helpers ───────────────────────────────────────────────────────
const seasonPath = (year) => join(SEASONS_DIR, `${year}.json`);

const readSeason = (year) => {
  const p = seasonPath(year);
  if (!existsSync(p)) return { season: String(year), completedMatches: [] };
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch { return { season: String(year), completedMatches: [] }; }
};

const writeSeason = (year, data) => {
  try { writeFileSync(seasonPath(year), JSON.stringify(data, null, 2), 'utf8'); }
  catch (e) { console.error(`[seasonStore] Write failed: ${e.message}`); }
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Save a completed match scorecard to the season JSON file.
 * Skips if the same espnId was already saved (idempotent).
 */
export const saveCompletedMatch = (matchData) => {
  const year = new Date().getFullYear();
  const season = readSeason(year);

  const espnId = matchData.espnId || matchData.source;
  if (!espnId) {
    console.log('[seasonStore] No espnId — skipping save');
    return;
  }

  // Idempotent: don't overwrite if already saved
  if (season.completedMatches.some(m => m.matchId === espnId)) {
    console.log(`[seasonStore] Match ${espnId} already saved — skipping`);
    return;
  }

  const dateStr = new Date().toISOString().split('T')[0];

  // Build result string from data
  const t1Score = matchData.team1Score
    ? `${matchData.team1Score}/${matchData.team1Wickets || ''}`.replace(/\/$/, '') + ` (${matchData.team1Overs || '20.0'})`
    : null;
  const t2Score = `${matchData.score}/${matchData.wickets} (${matchData.overs})`;

  // Extract winner from result string
  let winner = null;
  if (matchData.result) {
    const w = matchData.result.match(/^([A-Z]{2,4})\s+won/i);
    if (w) winner = w[1].toUpperCase();
  }

  const completed = {
    matchId:     espnId,
    matchNumber: matchData.matchNumber || null,
    matchTitle:  matchData.matchTitle  || null,
    date:        dateStr,
    venue:       matchData.venue       || null,
    team1:       matchData.team1?.name || null,
    team2:       matchData.team2?.name || null,
    team1Score:  t1Score,
    team2Score:  t2Score,
    target:      matchData.target      || null,
    result:      matchData.result      || '',
    winner,
    toss:        matchData.toss        || null,
    winProbT1:   matchData.winProbT1   || 50,
    winProbT2:   matchData.winProbT2   || 50,
    batsmen:     matchData.batsmen     || [],
    bowlers:     matchData.bowlers     || [],
    completedAt: new Date().toISOString(),
  };

  season.completedMatches.push(completed);
  writeSeason(year, season);
  console.log(`[seasonStore] ✅ Saved completed match: ${completed.team1} vs ${completed.team2} → ${SEASONS_DIR}/${year}.json`);
};

/**
 * Get the most recently completed match entry (for Box 3 on the homepage).
 */
export const getLatestFinishedFromJson = (year = new Date().getFullYear()) => {
  const season = readSeason(year);
  if (!season.completedMatches.length) {
    // Try previous year if current is empty
    if (year === new Date().getFullYear()) {
      const prev = readSeason(year - 1);
      return prev.completedMatches[prev.completedMatches.length - 1] || null;
    }
    return null;
  }
  return season.completedMatches[season.completedMatches.length - 1];
};

/**
 * Get all completed matches for a season (for Fixtures page).
 */
export const getAllCompletedFromJson = (year = new Date().getFullYear()) => {
  const season = readSeason(year);
  return season.completedMatches;
};