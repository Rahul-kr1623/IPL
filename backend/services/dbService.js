/**
 * dbService.js
 * All MongoDB read/write operations for live match data.
 * Import this from controllers and the scheduler — never write Mongoose calls
 * directly in routes or index.js.
 */

import LiveMatch from '../models/LiveMatch.js';

/**
 * Save a scraped match object to MongoDB.
 * Clears previous documents first (single-document collection pattern).
 * @param {Object} d - Scraped/mapped match data
 */
export const saveMatch = async (d) => {
  await LiveMatch.deleteMany({});
  await new LiveMatch({
    team1:          d.team1,
    team2:          d.team2,
    score:          d.score          || '0',
    wickets:        d.wickets        || '0',
    overs:          d.overs          || '0.0',
    team1Score:     d.team1Score     || null,
    team1Wickets:   d.team1Wickets   || null,
    team1Overs:     d.team1Overs     || null,
    target:         d.target         || null,
    status:         d.status         || 'LIVE',
    result:         d.result         || '',
    toss:           d.toss           || null,
    winProb:        d.winProbT2      || 50,
    winProbT1:      d.winProbT1      || 50,
    winProbT2:      d.winProbT2      || 50,
    recent:         d.recent         || [],
    commentary:     d.commentary     || [],
    batsmen:        d.batsmen        || [],
    bowlers:        d.bowlers        || [],
    crr:            d.crr            || null,
    rrr:            d.rrr            || null,
    source:         d.source         || 'unknown',
    espnId:         d.espnId         || null,
    currentInnings: d.currentInnings || 2,
    lastUpdated:    new Date(),
  }).save();
};

/**
 * Get the most recently updated live match document.
 * @returns {Object|null} Mongoose document or null
 */
export const getLatestMatch = async () => {
  return LiveMatch.findOne().sort({ lastUpdated: -1 });
};

/**
 * Mark the current live match as RECENTLY FINISHED.
 * Used when the scraper hits MAX_FAILS consecutive nulls.
 */
export const markMatchFinished = async () => {
  await LiveMatch.updateMany(
    {},
    { $set: { status: 'RECENTLY FINISHED', lastUpdated: new Date() } }
  );
};

/**
 * Delete all live match documents (for debug/reset).
 * @returns {number} Count of deleted documents
 */
export const clearAllMatches = async () => {
  const result = await LiveMatch.deleteMany({});
  return result.deletedCount;
};