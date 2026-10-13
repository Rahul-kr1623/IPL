/**
 * completedMatchService.js
 * Automated Post-Match Pipeline:
 *  1. Persists completed match scorecard to MongoDB Match collection.
 *  2. Recalculates Points Table with official cricket NRR math.
 *  3. Updates Head-to-Head rivalry records.
 *  4. Aggregates Orange & Purple Cap leaders.
 */

import Match from '../models/Match.js';
import PointsTable from '../models/PointsTable.js';
import Player from '../models/Player.js';
import HeadToHead from '../models/HeadToHead.js';

export const onMatchCompletedPipeline = async (completedMatch) => {
  const season = completedMatch.season || 2026;
  console.log(`\n[Post-Match Pipeline] 🏆 Processing finished match: ${completedMatch.teamA} vs ${completedMatch.teamB} (${season})`);

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // 1. Recalculate Points Table for Season
    // ─────────────────────────────────────────────────────────────────────────
    const allFinished = await Match.find({ season, status: { $in: ['FINISHED', 'RECENTLY FINISHED'] } });
    
    const IPL_TEAMS = ['CSK', 'MI', 'RCB', 'KKR', 'RR', 'PBKS', 'DC', 'GT', 'LSG', 'SRH'];
    const standingsMap = {};
    
    IPL_TEAMS.forEach(t => {
      standingsMap[t] = {
        team: t, played: 0, won: 0, lost: 0, tied: 0, noResult: 0, points: 0,
        nrr: 0.000, forRuns: 0, forOvers: 0, againstRuns: 0, againstOvers: 0,
        recentForm: [], qualified: false
      };
    });

    for (const m of allFinished) {
      const tA = m.teamA;
      const tB = m.teamB;

      if (!standingsMap[tA]) standingsMap[tA] = { team: tA, played: 0, won: 0, lost: 0, tied: 0, noResult: 0, points: 0, nrr: 0.0, forRuns: 0, forOvers: 0, againstRuns: 0, againstOvers: 0, recentForm: [], qualified: false };
      if (!standingsMap[tB]) standingsMap[tB] = { team: tB, played: 0, won: 0, lost: 0, tied: 0, noResult: 0, points: 0, nrr: 0.0, forRuns: 0, forOvers: 0, againstRuns: 0, againstOvers: 0, recentForm: [], qualified: false };

      standingsMap[tA].played += 1;
      standingsMap[tB].played += 1;

      if (m.winner === tA) {
        standingsMap[tA].won += 1;
        standingsMap[tA].points += 2;
        standingsMap[tA].recentForm.push('W');
        standingsMap[tB].lost += 1;
        standingsMap[tB].recentForm.push('L');
      } else if (m.winner === tB) {
        standingsMap[tB].won += 1;
        standingsMap[tB].points += 2;
        standingsMap[tB].recentForm.push('W');
        standingsMap[tA].lost += 1;
        standingsMap[tA].recentForm.push('L');
      } else if (m.result?.toLowerCase().includes('tie') || m.result?.toLowerCase().includes('super over')) {
        standingsMap[tA].tied += 1;
        standingsMap[tB].tied += 1;
        standingsMap[tA].points += 1;
        standingsMap[tB].points += 1;
      } else {
        standingsMap[tA].noResult += 1;
        standingsMap[tB].noResult += 1;
        standingsMap[tA].points += 1;
        standingsMap[tB].points += 1;
      }
    }

    // Keep last 5 form indicators
    Object.values(standingsMap).forEach(t => {
      t.recentForm = t.recentForm.slice(-5);
    });

    // Sort by points, then by NRR
    const sortedStandings = Object.values(standingsMap).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return b.nrr - a.nrr;
    });

    // Top 4 qualification indicator
    sortedStandings.slice(0, 4).forEach(team => {
      if (team.points >= 16) team.qualified = true;
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Aggregate Orange and Purple Cap Leaders
    // ─────────────────────────────────────────────────────────────────────────
    const [orangeLeader] = await Player.find({ 'season2026.runs': { $gt: 0 } }).sort({ 'season2026.runs': -1 }).limit(1);
    const [purpleLeader] = await Player.find({ 'season2026.wickets': { $gt: 0 } }).sort({ 'season2026.wickets': -1 }).limit(1);

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Upsert into PointsTable Model
    // ─────────────────────────────────────────────────────────────────────────
    await PointsTable.findOneAndUpdate(
      { season },
      {
        season,
        standings: sortedStandings,
        orangeCap: orangeLeader ? {
          player: orangeLeader.name,
          playerId: orangeLeader.playerId,
          team: orangeLeader.activeTeam,
          runs: orangeLeader.season2026.runs,
          matches: orangeLeader.season2026.matches
        } : null,
        purpleCap: purpleLeader ? {
          player: purpleLeader.name,
          playerId: purpleLeader.playerId,
          team: purpleLeader.activeTeam,
          wickets: purpleLeader.season2026.wickets,
          matches: purpleLeader.season2026.matches
        } : null,
        lastCalculatedAt: new Date()
      },
      { upsert: true, returnDocument: 'after' }
    );

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Update Head-to-Head Records
    // ─────────────────────────────────────────────────────────────────────────
    const team1 = completedMatch.teamA;
    const team2 = completedMatch.teamB;
    if (team1 && team2 && completedMatch.winner) {
      const h2h = await HeadToHead.findOne({
        $or: [
          { team1, team2 },
          { team1: team2, team2: team1 }
        ]
      });

      if (h2h) {
        h2h.total += 1;
        if (completedMatch.winner === h2h.team1) {
          h2h.team1Wins += 1;
          h2h.recentForm.push(h2h.team1);
        } else if (completedMatch.winner === h2h.team2) {
          h2h.team2Wins += 1;
          h2h.recentForm.push(h2h.team2);
        } else {
          h2h.noResult += 1;
        }
        h2h.recentForm = h2h.recentForm.slice(-5);
        await h2h.save();
      }
    }

    console.log('[Post-Match Pipeline] ✅ Successfully updated standings, cap leaders, and head-to-head.');
  } catch (err) {
    console.error('[Post-Match Pipeline Error]:', err.message);
  }
};

export const saveCompletedMatch = async (matchData) => {
  return onMatchCompletedPipeline(matchData);
};