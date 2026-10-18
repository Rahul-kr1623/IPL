/**
 * dbService.js
 * Non-destructive MongoDB read/write operations for live and historical match data.
 */

import LiveMatch from '../models/LiveMatch.js';
import Match from '../models/Match.js';

export const saveMatch = async (d) => {
  if (!d) return null;

  const doc = {
    team1:          d.team1,
    team2:          d.team2,
    score:          String(d.score || '0'),
    wickets:        String(d.wickets || '0'),
    overs:          String(d.overs || '0.0'),
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
    source:         d.source         || 'espn-rest',
    espnId:         d.espnId         || d.espnEventId || null,
    venue:          d.venue          || null,
    matchNumber:    d.matchNumber    || null,
    matchTitle:     d.matchTitle     || null,
    currentInnings: d.currentInnings || 2,
    slot:           d.slot           || 'slot1',
    lastUpdated:    new Date(),
  };

  // 1. Safe atomic upsert in LiveMatch
  const filter = doc.espnId 
    ? { espnId: doc.espnId } 
    : { slot: doc.slot, 'team1.name': doc.team1?.name, 'team2.name': doc.team2?.name };

  const savedLive = await LiveMatch.findOneAndUpdate(
    filter,
    { $set: doc },
    { upsert: true, returnDocument: 'after' }
  );

  // 2. Also sync to unified Match collection
  if (d.team1?.name && d.team2?.name) {
    await Match.findOneAndUpdate(
      {
        season: 2026,
        $or: [
          { espnEventId: doc.espnId },
          { teamA: doc.team1.name, teamB: doc.team2.name },
          { teamA: doc.team2.name, teamB: doc.team1.name }
        ]
      },
      {
        $set: {
          slot: doc.slot,
          status: doc.status,
          result: doc.result,
          winner: d.winner || null,
          'live.score': parseInt(doc.score) || 0,
          'live.wickets': parseInt(doc.wickets) || 0,
          'live.overs': doc.overs,
          'live.target': doc.target,
          'live.crr': doc.crr,
          'live.rrr': doc.rrr,
          'live.lastSixBalls': doc.recent,
          'live.winProbTeamA': doc.winProbT1,
          'live.winProbTeamB': doc.winProbT2,
          'live.currentBatsmen': doc.batsmen,
          'live.currentBowlers': doc.bowlers,
          lastScrapedAt: new Date()
        }
      }
    );
  }

  return savedLive;
};

export const getAllMatches = async () => {
  // Returns all active live match documents (both slots)
  return LiveMatch.find().sort({ lastUpdated: -1 }).limit(4);
};

export const getLatestMatch = async () => {
  return LiveMatch.findOne().sort({ lastUpdated: -1 });
};

export const markMatchFinished = async () => {
  await LiveMatch.updateMany(
    {},
    { $set: { status: 'RECENTLY FINISHED', lastUpdated: new Date() } }
  );
};

export const getLatestFinishedMatch = async () => {
  // First check LiveMatch
  const lm = await LiveMatch.findOne({
    status: { $in: ['FINISHED', 'RECENTLY FINISHED'] }
  }).sort({ lastUpdated: -1 });
  if (lm) return lm;

  // Fallback to Match collection
  const mc = await Match.findOne({
    season: 2026,
    status: { $in: ['FINISHED', 'RECENTLY FINISHED'] }
  }).sort({ updatedAt: -1 });

  return mc || null;
};

export const clearAllMatches = async () => {
  return LiveMatch.deleteMany({});
};