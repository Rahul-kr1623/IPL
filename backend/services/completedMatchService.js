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
 * Idempotent — skips if the same espnId already exists.
 * @param {object} matchData - Live match data from scraper/scheduler
 */
export const saveCompletedMatch = async (matchData) => {
  const espnId = matchData.espnId || matchData.source || null;

  if (!espnId) {
    console.log('[completedMatchService] No espnId — skipping MongoDB save');
    return null;
  }

  // Check for duplicate
  const existing = await CompletedMatch.findOne({ espnId }).lean();
  if (existing) {
    console.log(`[completedMatchService] Match ${espnId} already in MongoDB — skipping`);
    return existing;
  }

  const dateStr = new Date().toISOString().split('T')[0];

  // Build score strings
  const t1Score = matchData.team1Score
    ? `${matchData.team1Score}${matchData.team1Wickets ? '/' + matchData.team1Wickets : ''} (${matchData.team1Overs || '20.0'})`.replace(/\/+\s*\(/, ' (')
    : null;
  const t2Score = `${matchData.score}/${matchData.wickets} (${matchData.overs})`;

  // Extract winner from result string
  let winner = null;
  if (matchData.result) {
    const w = matchData.result.match(/^([A-Z]{2,4})\s+won/i);
    if (w) winner = w[1].toUpperCase();
  }

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
 */
export const getLatestCompletedMatch = async () => {
  return CompletedMatch.findOne().sort({ completedAt: -1 }).lean();
};

/**
 * Get all completed matches for a season from MongoDB.
 */
export const getAllCompletedMatches = async () => {
  return CompletedMatch.find().sort({ completedAt: 1 }).lean();
};

export default CompletedMatch;
