/**
 * completedMatchService.js
 * Persists completed match scorecards to MongoDB so they survive redeployments.
 *
 * The scheduler dynamically imports this and calls saveCompletedMatch(data)
 * when a match is confirmed FINISHED.
 *
 * Schema: CompletedMatch — one document per match, keyed by espnId.
 * Falls back silently if MongoDB is unavailable (seasonStore JSON is the backup).
 */

import mongoose from 'mongoose';

// ─── Schema ───────────────────────────────────────────────────────────────────
const CompletedMatchSchema = new mongoose.Schema({
  espnId:      { type: String, unique: true, sparse: true },
  matchId:     { type: String },
  matchNumber: { type: String, default: null },
  matchTitle:  { type: String, default: null },
  date:        { type: String },
  venue:       { type: String, default: null },
  team1:       { type: String },
  team2:       { type: String },
  team1Score:  { type: String, default: null },
  team2Score:  { type: String, default: null },
  target:      { type: Number, default: null },
  result:      { type: String, default: '' },
  winner:      { type: String, default: null },
  toss:        { type: String, default: null },
  winProbT1:   { type: Number, default: 50 },
  winProbT2:   { type: Number, default: 50 },
  batsmen:     { type: Array,  default: [] },
  bowlers:     { type: Array,  default: [] },
  completedAt: { type: Date,   default: Date.now },
}, { timestamps: true });

// Use mongoose.models to avoid model re-registration on hot reloads
const CompletedMatch = mongoose.models.CompletedMatch
  || mongoose.model('CompletedMatch', CompletedMatchSchema);

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Save a completed match scorecard to MongoDB.
 * Idempotent — skips silently if the same espnId already exists.
 *
 * @param {object} matchData - Live match data object from scraper/scheduler
 * @returns {Promise<object|null>} Saved or existing MongoDB document, or null on skip
 */
export const saveCompletedMatch = async (matchData) => {
  const espnId = matchData.espnId || matchData.source || null;

  if (!espnId) {
    console.log('[completedMatchService] No espnId on matchData — skipping MongoDB save');
    return null;
  }

  // Idempotency check — don't double-save the same match
  const existing = await CompletedMatch.findOne({ espnId }).lean();
  if (existing) {
    console.log(`[completedMatchService] Match ${espnId} already in MongoDB — skipping`);
    return existing;
  }

  const dateStr = new Date().toISOString().split('T')[0];

  // ── Build score strings ────────────────────────────────────────────────────
  // team1 batted first — score came from firstInningsRuns in scraper
  const t1Score = matchData.team1Score
    ? `${matchData.team1Score}${matchData.team1Wickets ? '/' + matchData.team1Wickets : ''} (${matchData.team1Overs || '20.0'})`
        .replace(/\/+\s*\(/, ' (')   // normalise "192/10 (20)" → "192 (20)" when all out
    : null;

  // team2 batted second — score is the live score at end of match
  const t2Score = `${matchData.score}/${matchData.wickets} (${matchData.overs})`;

  // ── Extract winner from result string ──────────────────────────────────────
  // e.g. "CSK won by 5 wickets" → "CSK"
  let winner = null;
  if (matchData.result) {
    const w = matchData.result.match(/^([A-Z]{2,4})\s+won/i);
    if (w) winner = w[1].toUpperCase();
  }

  // ── Build and save document ────────────────────────────────────────────────
  const doc = new CompletedMatch({
    espnId,
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
    winProbT1:   matchData.winProbT1   ?? 50,
    winProbT2:   matchData.winProbT2   ?? 50,
    batsmen:     matchData.batsmen     || [],
    bowlers:     matchData.bowlers     || [],
    completedAt: new Date(),
  });

  await doc.save();
  console.log(`[completedMatchService] ✅ Saved to MongoDB: ${doc.team1} vs ${doc.team2} (${espnId})`);
  return doc;
};

/**
 * Get the most recently completed match from MongoDB.
 * Used by liveController to serve the "last result" card on the frontend.
 *
 * @returns {Promise<object|null>}
 */
export const getLatestCompletedMatch = async () => {
  return CompletedMatch.findOne().sort({ completedAt: -1 }).lean();
};

/**
 * Get all completed matches for the current season from MongoDB,
 * sorted chronologically (oldest first).
 *
 * @returns {Promise<object[]>}
 */
export const getAllCompletedMatches = async () => {
  return CompletedMatch.find().sort({ completedAt: 1 }).lean();
};

/**
 * Get a single completed match by its ESPN match ID.
 *
 * @param {string} espnId
 * @returns {Promise<object|null>}
 */
export const getCompletedMatchById = async (espnId) => {
  return CompletedMatch.findOne({ espnId }).lean();
};

/**
 * Delete all completed match records — use only for dev/reset purposes.
 * Called by debugController when the user hits /api/v1/debug/reset.
 *
 * @returns {Promise<object>} Mongoose deleteMany result
 */
export const clearAllCompletedMatches = async () => {
  const result = await CompletedMatch.deleteMany({});
  console.log(`[completedMatchService] 🗑️  Cleared ${result.deletedCount} completed match records`);
  return result;
};

export default CompletedMatch;