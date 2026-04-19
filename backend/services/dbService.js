/**
 * dbService.js
 * All MongoDB read/write operations for live match data.
 *
 * Double-header support: we store UP TO 2 live match documents simultaneously.
 * Each document is keyed by espnId so they never overwrite each other.
 * When a new espnId comes in that doesn't exist, we add it.
 * When an espnId we already have comes in, we update it in-place.
 * We never store more than 2 documents (purge oldest finished ones if needed).
 */

import LiveMatch from '../models/LiveMatch.js';

/**
 * Save a scraped match to MongoDB.
 * Upserts by espnId so double-headers store as two separate documents.
 * Falls back to deleteMany+insert if espnId is null (legacy behaviour).
 */
export const saveMatch = async (d) => {
  const doc = {
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
    venue:          d.venue          || null,
    matchNumber:    d.matchNumber    || null,
    matchTitle:     d.matchTitle     || null,
    currentInnings: d.currentInnings || 2,
    slot:           d.slot           || 'slot1',  // 'slot1' = 3:30 PM, 'slot2' = 7:30 PM
    lastUpdated:    new Date(),
  };

  if (d.espnId) {
    // Upsert by espnId — safe for double headers (each slot has its own doc)
    await LiveMatch.findOneAndUpdate(
      { espnId: d.espnId },
      { $set: doc },
      { upsert: true, new: true }
    );
    // Keep at most 3 documents: 2 active slots + 1 recently finished shown as Box 3
    const count = await LiveMatch.countDocuments();
    if (count > 3) {
      const oldest = await LiveMatch.findOne({ status: { $in: ['FINISHED', 'RECENTLY FINISHED'] } })
        .sort({ lastUpdated: 1 });
      if (oldest) await LiveMatch.deleteOne({ _id: oldest._id });
    }
  } else {
    // Legacy fallback: single-doc collection
    await LiveMatch.deleteMany({});
    await new LiveMatch(doc).save();
  }
};

/**
 * Get all current live match documents, sorted newest first.
 * Returns an array — will have 2 items on double-header days.
 */
export const getAllMatches = async () => {
  return LiveMatch.find().sort({ lastUpdated: -1 }).limit(2);
};

/**
 * Get only the most recently updated live match document.
 */
export const getLatestMatch = async () => {
  return LiveMatch.findOne().sort({ lastUpdated: -1 });
};

/**
 * Mark all current live matches as RECENTLY FINISHED.
 */
export const markMatchFinished = async () => {
  await LiveMatch.updateMany(
    {},
    { $set: { status: 'RECENTLY FINISHED', lastUpdated: new Date() } }
  );
};

/**
 * Get the most recently FINISHED match document from MongoDB.
 * Used for Box 3 on the homepage ("Latest Result").
 */
export const getLatestFinishedMatch = async () => {
  return LiveMatch.findOne(
    { status: { $in: ['FINISHED', 'RECENTLY FINISHED'] } }
  ).sort({ lastUpdated: -1 });
};

/**
 * Delete all live match documents (debug/reset).
 */
export const clearAllMatches = async () => {
  const result = await LiveMatch.deleteMany({});
  return result.deletedCount;
};