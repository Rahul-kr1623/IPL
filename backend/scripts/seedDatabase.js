import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import Match from '../models/Match.js';
import Player from '../models/Player.js';
import Stadium from '../models/Stadium.js';
import PointsTable from '../models/PointsTable.js';
import HeadToHead from '../models/HeadToHead.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI not found in environment!');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB for seeding...');

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Seed Stadiums
  // ─────────────────────────────────────────────────────────────────────────────
  const stadiumsPath = path.join(DATA_DIR, 'global', 'stadiums.json');
  if (fs.existsSync(stadiumsPath)) {
    const raw = JSON.parse(fs.readFileSync(stadiumsPath, 'utf8'));
    const stadiums = raw.stadiums || [];
    const ops = stadiums.map(s => ({
      updateOne: {
        filter: { stadiumId: s.id },
        update: {
          $set: {
            stadiumId: s.id,
            name: s.name,
            city: s.city,
            state: s.state || '',
            country: s.country || 'India',
            capacity: s.capacity || 40000,
            homeTeam: s.homeTeam || '',
            pitchType: s.pitchType || 'Balanced',
            stats: {
              totalMatches: s.iplMatches || s.stats?.matchesPlayed || 0,
              avgFirstInningsScore: s.avgFirst || s.stats?.avgFirstInnings || 160,
              highestTotal: s.highScore || s.stats?.highestScore || '0/0',
              lowestTotal: s.lowScore || s.stats?.lowestScore || '0/0'
            }
          }
        },
        upsert: true
      }
    }));
    if (ops.length > 0) {
      await Stadium.bulkWrite(ops);
      console.log(`🏟️  Seeded ${ops.length} stadiums.`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Seed Head-to-Head
  // ─────────────────────────────────────────────────────────────────────────────
  const h2hPath = path.join(DATA_DIR, 'global', 'head_to_head.json');
  if (fs.existsSync(h2hPath)) {
    const raw = JSON.parse(fs.readFileSync(h2hPath, 'utf8'));
    const records = raw.records || [];
    const ops = records.map(r => ({
      updateOne: {
        filter: { team1: r.team1, team2: r.team2 },
        update: {
          $set: {
            team1: r.team1,
            team2: r.team2,
            team1Wins: r.team1Wins || 0,
            team2Wins: r.team2Wins || 0,
            total: r.total || 0,
            recentForm: r.recentForm || []
          }
        },
        upsert: true
      }
    }));
    if (ops.length > 0) {
      await HeadToHead.bulkWrite(ops);
      console.log(`⚔️  Seeded ${ops.length} head-to-head rivalry records.`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Seed Players Master
  // ─────────────────────────────────────────────────────────────────────────────
  const playersPath = path.join(DATA_DIR, 'global', 'players_master.json');
  if (fs.existsSync(playersPath)) {
    console.log('🔄 Parsing players_master.json (this may take a few seconds)...');
    const raw = JSON.parse(fs.readFileSync(playersPath, 'utf8'));
    const players = raw.players || [];
    
    // Chunk players into batches of 500 for fast bulk writes
    const chunkSize = 500;
    for (let i = 0; i < players.length; i += chunkSize) {
      const batch = players.slice(i, i + chunkSize);
      const ops = batch.map(p => ({
        updateOne: {
          filter: { playerId: `espn_${p.id}` },
          update: {
            $set: {
              playerId: `espn_${p.id}`,
              name: p.name,
              fullName: p.fullName || p.name,
              activeTeam: p.activeTeam || 'Unassigned',
              role: p.role?.trim() || 'Batter',
              battingStyle: p.battingStyle || 'Right hand Bat',
              bowlingStyle: p.bowlingStyle || 'Right arm Medium',
              careerBatting: {
                matches: p.careerBatting?.matches || 0,
                innings: p.careerBatting?.innings || 0,
                runs: p.careerBatting?.runs || 0,
                highestScore: String(p.careerBatting?.hs || '0'),
                average: p.careerBatting?.avg || 0,
                strikeRate: parseFloat(p.careerBatting?.sr) || 0,
                fifties: p.careerBatting?.fifties || 0,
                hundreds: p.careerBatting?.hundreds || 0
              },
              careerBowling: {
                matches: p.careerBowling?.matches || 0,
                innings: p.careerBowling?.innings || 0,
                balls: p.careerBowling?.balls || 0,
                runsConceded: p.careerBowling?.runs || 0,
                wickets: p.careerBowling?.wickets || 0,
                average: p.careerBowling?.avg || 0,
                economy: parseFloat(p.careerBowling?.eco) || 0
              }
            }
          },
          upsert: true
        }
      }));
      await Player.bulkWrite(ops);
    }
    console.log(`🏏 Seeded ${players.length} master players.`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Seed Historical Points Tables (2008 - 2026)
  // ─────────────────────────────────────────────────────────────────────────────
  const ptPath = path.join(DATA_DIR, 'global', 'points_tables.json');
  if (fs.existsSync(ptPath)) {
    const raw = JSON.parse(fs.readFileSync(ptPath, 'utf8'));
    for (const [yearStr, seasonObj] of Object.entries(raw)) {
      const year = parseInt(yearStr);
      const teams = (seasonObj.teams || []).map(t => ({
        team: t.team,
        played: t.played || 0,
        won: t.won || 0,
        lost: t.lost || 0,
        tied: t.tied || 0,
        noResult: t.nr || 0,
        points: t.points || t.pts || 0,
        nrr: parseFloat(t.nrr) || 0.0,
        qualified: (t.rank && t.rank <= 4) || false
      }));

      await PointsTable.findOneAndUpdate(
        { season: year },
        {
          season: year,
          standings: teams,
          lastCalculatedAt: new Date()
        },
        { upsert: true }
      );
    }
    console.log(`📊 Seeded points tables for all historical seasons.`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Seed Fixtures & Matches (2008 - 2026)
  // ─────────────────────────────────────────────────────────────────────────────
  const seasonsDir = path.join(DATA_DIR, 'seasons');
  if (fs.existsSync(seasonsDir)) {
    const years = fs.readdirSync(seasonsDir).filter(f => /^\d{4}$/.test(f));
    let totalMatchesSeeded = 0;

    for (const y of years) {
      const fixPath = path.join(seasonsDir, y, 'fixtures.json');
      if (!fs.existsSync(fixPath)) continue;

      const raw = JSON.parse(fs.readFileSync(fixPath, 'utf8'));
      if (!Array.isArray(raw)) continue;

      const yearNum = parseInt(y);
      const ops = raw.map(m => {
        const timeStr = m.time || '07:30 PM';
        const isAfternoon = timeStr.includes('03:30') || timeStr.includes('3:30');
        const slot = isAfternoon ? 'slot1' : 'slot2';
        const isCompleted = !!m.result || !!m.winner || yearNum < 2026;

        return {
          updateOne: {
            filter: { season: yearNum, matchNumber: m.id || m.matchNumber },
            update: {
              $set: {
                season: yearNum,
                matchNumber: m.id || m.matchNumber,
                matchTitle: `Match ${m.id || m.matchNumber}`,
                date: m.date ? new Date(m.date) : new Date(`${y}-04-01`),
                time: timeStr,
                slot,
                venue: m.venue || 'TBA',
                city: m.city || 'TBA',
                teamA: m.teamA,
                teamB: m.teamB,
                status: isCompleted ? 'FINISHED' : 'UPCOMING',
                toss: m.toss ? { text: m.toss } : null,
                result: m.result || null,
                winner: m.winner || null,
                scorecard: {
                  innings1: {
                    team: m.teamA,
                    total: m.scoreA || '—'
                  },
                  innings2: {
                    team: m.teamB,
                    total: m.scoreB || '—'
                  }
                }
              }
            },
            upsert: true
          }
        };
      });

      if (ops.length > 0) {
        await Match.bulkWrite(ops);
        totalMatchesSeeded += ops.length;
      }
    }
    console.log(`📅 Seeded ${totalMatchesSeeded} fixtures across all seasons.`);
  }

  console.log('🎉 Seeding pipeline successfully completed!');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seeding pipeline failed:', err);
  process.exit(1);
});
