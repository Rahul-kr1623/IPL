import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import csv from 'csv-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const archiveDir = path.join(__dirname, '../../../archive (1)');
const backendDataDir = path.join(__dirname, '../data');

const TEAM_MAP = {
  'Chennai Super Kings': 'CSK',
  'Mumbai Indians': 'MI',
  'Royal Challengers Bangalore': 'RCB',
  'Royal Challengers Bengaluru': 'RCB',
  'Kolkata Knight Riders': 'KKR',
  'Rajasthan Royals': 'RR',
  'Sunrisers Hyderabad': 'SRH',
  'Deccan Chargers': 'DC',
  'Delhi Daredevils': 'DC',
  'Delhi Capitals': 'DC',
  'Kings XI Punjab': 'PBKS',
  'Punjab Kings': 'PBKS',
  'Gujarat Titans': 'GT',
  'Gujarat Lions': 'GL',
  'Lucknow Super Giants': 'LSG',
  'Rising Pune Supergiant': 'RPS',
  'Rising Pune Supergiants': 'RPS',
  'Pune Warriors': 'PWI',
  'Kochi Tuskers Kerala': 'KTK'
};

const processSeason = (year) => {
  return new Promise((resolve, reject) => {
    const csvPath = path.join(archiveDir, `ipl_matches_${year}.csv`);
    if (!fs.existsSync(csvPath)) {
      console.log(`Skipping ${year} - File not found: ${csvPath}`);
      return resolve();
    }

    const fixtures = [];
    const pointsMap = {};
    const squadsMap = {};

    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => {
        const team1 = TEAM_MAP[row.team1] || row.team1;
        const team2 = TEAM_MAP[row.team2] || row.team2;
        const winner = TEAM_MAP[row.winner] || row.winner;

        // 1. Fixtures
        fixtures.push({
          id: fixtures.length + 1,
          date: row.date,
          venue: row.venue,
          city: row.city,
          teamA: team1,
          teamB: team2,
          toss: `${TEAM_MAP[row.toss_winner] || row.toss_winner} won toss, elected to ${row.toss_decision}`,
          result: row.result_type === 'complete' ? `${winner} won by ${row.win_by_runs > 0 ? row.win_by_runs + ' runs' : row.win_by_wickets + ' wickets'}` : row.result_type,
          winner: winner,
          scoreA: `${row.team1_runs}/${row.team1_wickets}`,
          scoreB: `${row.team2_runs}/${row.team2_wickets}`
        });

        // 2. Points Table aggregation
        if (!pointsMap[team1]) pointsMap[team1] = { team: team1, played: 0, won: 0, lost: 0, points: 0, nrr: 0 };
        if (!pointsMap[team2]) pointsMap[team2] = { team: team2, played: 0, won: 0, lost: 0, points: 0, nrr: 0 };

        if (row.result_type === 'complete') {
          pointsMap[team1].played++;
          pointsMap[team2].played++;
          if (winner === team1) {
            pointsMap[team1].won++;
            pointsMap[team1].points += 2;
            pointsMap[team2].lost++;
          } else if (winner === team2) {
            pointsMap[team2].won++;
            pointsMap[team2].points += 2;
            pointsMap[team1].lost++;
          }
        } else if (row.result_type === 'tie' || row.result_type === 'no result') {
          pointsMap[team1].played++;
          pointsMap[team2].played++;
          pointsMap[team1].points += 1;
          pointsMap[team2].points += 1;
        }

        // 3. Squads aggregation
        const parsePlayers = (playersStr, team) => {
          if (!playersStr) return;
          const pList = playersStr.split(',').map(p => p.trim());
          if (!squadsMap[team]) squadsMap[team] = new Set();
          pList.forEach(p => squadsMap[team].add(p));
        };
        parsePlayers(row.team1_players, team1);
        parsePlayers(row.team2_players, team2);
      })
      .on('end', () => {
        // Prepare Season directory
        const seasonDir = path.join(backendDataDir, 'seasons', String(year));
        if (!fs.existsSync(seasonDir)) fs.mkdirSync(seasonDir, { recursive: true });

        // Save Fixtures
        fs.writeFileSync(path.join(seasonDir, 'fixtures.json'), JSON.stringify(fixtures, null, 2));

        // Save Points Table (sorted by points)
        const pointsArray = Object.values(pointsMap).sort((a, b) => b.points - a.points);
        fs.writeFileSync(path.join(seasonDir, 'points_table.json'), JSON.stringify(pointsArray, null, 2));

        // Save Squads
        const finalSquads = {};
        for (const [team, playerSet] of Object.entries(squadsMap)) {
          finalSquads[team] = Array.from(playerSet).map(name => ({ name, role: 'Unknown' })); // Assigning dummy roles for now
        }
        fs.writeFileSync(path.join(seasonDir, 'team_squads.json'), JSON.stringify({ lastUpdated: new Date().toISOString(), squads: finalSquads }, null, 2));

        console.log(`✅ Processed season ${year}`);
        resolve();
      })
      .on('error', reject);
  });
};

const run = async () => {
  console.log('🚀 Starting Kaggle Data Migration...');
  
  // Ensure global dir exists
  const globalDir = path.join(backendDataDir, 'global');
  if (!fs.existsSync(globalDir)) fs.mkdirSync(globalDir, { recursive: true });

  for (let year = 2008; year <= 2026; year++) {
    await processSeason(year);
  }
  
  console.log('🎉 Migration Complete!');
};

run();
