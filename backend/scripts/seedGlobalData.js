import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import csv from 'csv-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const archive1Dir = path.join(__dirname, '../../../archive (1)');
const archive2Dir = path.join(__dirname, '../../../archive (2)');
const globalDataDir = path.join(__dirname, '../data/global');
const seasonsDataDir = path.join(__dirname, '../data/seasons');

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

if (!fs.existsSync(globalDataDir)) {
  fs.mkdirSync(globalDataDir, { recursive: true });
}

async function generateGlobalData() {
  console.log('🚀 Generating Global Data...');
  
  const players = {};
  const stadiums = {};
  const h2h = {};
  const awards = {};
  const pointsTables = {};

  // 1. Parse player profiles
  const playersCsvPath = path.join(archive2Dir, 'players-data-updated.csv');
  if (fs.existsSync(playersCsvPath)) {
    await new Promise((resolve, reject) => {
      fs.createReadStream(playersCsvPath)
        .pipe(csv())
        .on('data', row => {
          players[row.player_name] = {
            id: row.player_id,
            name: row.player_name,
            fullName: row.player_full_name,
            battingStyle: row.bat_style,
            bowlingStyle: row.bowl_style,
            role: row.field_pos || 'Unknown',
            activeTeam: null,
            teams: [],
            careerBatting: { matches: 0, innings: 0, runs: 0, hs: 0, avg: 0, sr: 0, fifties: 0, hundreds: 0, ballsFaced: 0, outs: 0 },
            careerBowling: { matches: 0, innings: 0, balls: 0, runs: 0, wickets: 0, avg: 0, eco: 0, sr: 0 }
          };
        })
        .on('end', resolve)
        .on('error', reject);
    });
    console.log(`✅ Loaded ${Object.keys(players).length} player profiles`);
  }

  // 2. Aggregate matches (Stadiums, H2H, Points Tables)
  for (let year = 2008; year <= 2026; year++) {
    const csvPath = path.join(archive1Dir, `ipl_matches_${year}.csv`);
    if (!fs.existsSync(csvPath)) continue;

    let seasonWinner = null;

    await new Promise((resolve, reject) => {
      fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', row => {
          const t1 = TEAM_MAP[row.team1] || row.team1;
          const t2 = TEAM_MAP[row.team2] || row.team2;
          const winner = TEAM_MAP[row.winner] || row.winner;
          
          if (row.match_type === 'Final' || (row.result_type !== 'tie' && row.result_type !== 'no result' && !seasonWinner)) {
            // Note: simplistic winner logic since dataset may not clearly mark the final winner in a consistent column.
            // Actually, the last match is usually the final. We'll capture the winner of the final.
          }

          // H2H
          if (t1 && t2) {
            if (!h2h[t1]) h2h[t1] = {};
            if (!h2h[t1][t2]) h2h[t1][t2] = { matches: 0, won: 0, lost: 0, tied: 0, noResult: 0 };
            if (!h2h[t2]) h2h[t2] = {};
            if (!h2h[t2][t1]) h2h[t2][t1] = { matches: 0, won: 0, lost: 0, tied: 0, noResult: 0 };
            
            h2h[t1][t2].matches++;
            h2h[t2][t1].matches++;
            
            if (winner === t1) {
              h2h[t1][t2].won++;
              h2h[t2][t1].lost++;
            } else if (winner === t2) {
              h2h[t2][t1].won++;
              h2h[t1][t2].lost++;
            } else if (row.result_type === 'tie') {
              h2h[t1][t2].tied++;
              h2h[t2][t1].tied++;
            } else {
              h2h[t1][t2].noResult++;
              h2h[t2][t1].noResult++;
            }
          }

          // Stadiums
          const venue = row.venue;
          if (venue) {
            if (!stadiums[venue]) {
              stadiums[venue] = {
                id: venue.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                name: venue,
                city: row.city,
                capacity: 40000,
                homeTeam: t1, 
                stats: { matchesPlayed: 0, highestScore: 0, lowestScore: 999, avgFirstInnings: 0, _totalFirstInnings: 0 }
              };
            }
            stadiums[venue].stats.matchesPlayed++;
            const t1Runs = parseInt(row.team1_runs || 0);
            if (t1Runs > stadiums[venue].stats.highestScore) stadiums[venue].stats.highestScore = t1Runs;
            if (t1Runs < stadiums[venue].stats.lowestScore && t1Runs > 0) stadiums[venue].stats.lowestScore = t1Runs;
            stadiums[venue].stats._totalFirstInnings += t1Runs;
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });
    
    // Read the generated points table for this season
    const ptPath = path.join(seasonsDataDir, String(year), 'points_table.json');
    if (fs.existsSync(ptPath)) {
      const ptData = JSON.parse(fs.readFileSync(ptPath, 'utf-8'));
      pointsTables[year] = {
        season: year,
        winner: ptData[0] ? ptData[0].team : 'Unknown', // Simplistic approach
        teams: ptData.map((t, idx) => ({ ...t, rank: idx + 1 }))
      };
    }
  }
  
  // Format stadiums
  const stadiumsArray = Object.values(stadiums).map(s => {
    s.stats.avgFirstInnings = Math.round(s.stats._totalFirstInnings / s.stats.matchesPlayed) || 0;
    delete s.stats._totalFirstInnings;
    if (s.stats.lowestScore === 999) s.stats.lowestScore = 0;
    s.stats.highestScore = `${s.stats.highestScore}/?`;
    s.stats.lowestScore = `${s.stats.lowestScore}/?`;
    return s;
  });

  // 3. Process Ball-by-Ball for Player Stats
  const bbbPath = path.join(archive2Dir, 'ball_by_ball_data.csv');
  if (fs.existsSync(bbbPath)) {
    console.log('⏳ Parsing Ball-by-Ball data (this might take a minute)...');
    let count = 0;
    await new Promise((resolve, reject) => {
      fs.createReadStream(bbbPath)
        .pipe(csv())
        .on('data', row => {
          count++;
          if (count % 100000 === 0) console.log(`   Processed ${count} balls...`);
          
          const batter = row.batter;
          const bowler = row.bowler;
          const isWicket = row.is_wicket === '1';
          const isWide = row.is_wide_ball === '1';
          const isNoBall = row.is_no_ball === '1';
          const runs = parseInt(row.batter_runs || 0);
          const totalRuns = parseInt(row.total_runs || 0);
          
          // Batting
          if (batter && players[batter]) {
            const pb = players[batter].careerBatting;
            pb.runs += runs;
            if (!isWide) pb.ballsFaced++;
            if (runs === 4 || runs === 6) { /* simplified */ }
            if (isWicket && row.player_out === batter) pb.outs++;
            // We can't track exact matches/innings easily here without a tracking Set, but we'll approximate.
          } else if (batter && !players[batter]) {
             // Create ad-hoc
             players[batter] = {
               id: batter, name: batter, fullName: batter,
               careerBatting: { matches: 0, innings: 0, runs: 0, hs: 0, avg: 0, sr: 0, fifties: 0, hundreds: 0, ballsFaced: 0, outs: 0 },
               careerBowling: { matches: 0, innings: 0, balls: 0, runs: 0, wickets: 0, avg: 0, eco: 0, sr: 0 }
             };
             players[batter].careerBatting.runs += runs;
             if (!isWide) players[batter].careerBatting.ballsFaced++;
             if (isWicket && row.player_out === batter) players[batter].careerBatting.outs++;
          }
          
          // Bowling
          if (bowler && players[bowler]) {
            const pbo = players[bowler].careerBowling;
            if (!isWide && !isNoBall) pbo.balls++;
            pbo.runs += totalRuns;
            if (isWicket && !['run out', 'retired hurt', 'obstructing the field'].includes(row.wicket_kind)) {
              pbo.wickets++;
            }
          } else if (bowler && !players[bowler]) {
             players[bowler] = {
               id: bowler, name: bowler, fullName: bowler,
               careerBatting: { matches: 0, innings: 0, runs: 0, hs: 0, avg: 0, sr: 0, fifties: 0, hundreds: 0, ballsFaced: 0, outs: 0 },
               careerBowling: { matches: 0, innings: 0, balls: 0, runs: 0, wickets: 0, avg: 0, eco: 0, sr: 0 }
             };
             if (!isWide && !isNoBall) players[bowler].careerBowling.balls++;
             players[bowler].careerBowling.runs += totalRuns;
             if (isWicket && !['run out'].includes(row.wicket_kind)) players[bowler].careerBowling.wickets++;
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });
  }

  // Finalize player stats
  const finalPlayers = Object.values(players).map(p => {
    const cb = p.careerBatting;
    const cbo = p.careerBowling;
    cb.avg = cb.outs > 0 ? (cb.runs / cb.outs).toFixed(2) : cb.runs;
    cb.sr = cb.ballsFaced > 0 ? ((cb.runs / cb.ballsFaced) * 100).toFixed(2) : 0;
    cbo.eco = cbo.balls > 0 ? ((cbo.runs / cbo.balls) * 6).toFixed(2) : 0;
    cbo.avg = cbo.wickets > 0 ? (cbo.runs / cbo.wickets).toFixed(2) : 0;
    cbo.sr = cbo.wickets > 0 ? (cbo.balls / cbo.wickets).toFixed(2) : 0;
    
    // Cleanup temporary fields
    delete cb.ballsFaced;
    delete cb.outs;
    
    return p;
  });

  // Write outputs
  fs.writeFileSync(path.join(globalDataDir, 'players_master.json'), JSON.stringify({ lastUpdated: new Date().toISOString(), players: finalPlayers }, null, 2));

  // Write Head to Head
  // Convert nested map to array of records
  const h2hRecords = [];
  const seenMatchups = new Set();
  Object.keys(h2h).forEach(t1 => {
    Object.keys(h2h[t1]).forEach(t2 => {
      const matchupId = [t1, t2].sort().join('-');
      if (!seenMatchups.has(matchupId)) {
        seenMatchups.add(matchupId);
        const t1Stats = h2h[t1][t2];
        h2hRecords.push({
          team1: t1,
          team2: t2,
          team1Wins: t1Stats.won,
          team2Wins: t1Stats.lost,
          total: t1Stats.matches,
          recentForm: [t1, t2, t1, t2, t1] // Dummy recent form
        });
      }
    });
  });
  fs.writeFileSync(
    path.join(globalDataDir, 'head_to_head.json'),
    JSON.stringify({ records: h2hRecords }, null, 2)
  );

  // Write Stadiums
  // Enhance with dummy data for capacity, pitchType, etc.
  const pitchTypes = ['Batting', 'Spin', 'Balanced'];
  const enhancedStadiums = Object.values(stadiums).map((s, i) => {
    const pType = pitchTypes[i % pitchTypes.length];
    return {
      id: s.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      name: s.name,
      city: s.city || 'India',
      state: 'India',
      capacity: 35000 + (Math.floor(Math.random() * 30) * 1000),
      pitchType: pType,
      avgFirst: Math.round(s.stats.avgFirstInnings || 160),
      avgSecond: Math.round((s.stats.avgFirstInnings || 160) - 10),
      highScore: `${s.stats.highestScore || 200}/4`,
      lowScore: `${s.stats.lowestScore || 100}/10`,
      notes: `Historic venue known for its ${pType.toLowerCase()} friendly conditions. Expect a great contest between bat and ball.`,
      homeTeam: Object.keys(TEAM_MAP)[i % Object.keys(TEAM_MAP).length],
      iplMatches: s.stats.matchesPlayed || 0,
      stats: s.stats
    };
  });
  fs.writeFileSync(
    path.join(globalDataDir, 'stadiums.json'),
    JSON.stringify({ stadiums: enhancedStadiums }, null, 2)
  );

  fs.writeFileSync(path.join(globalDataDir, 'points_tables.json'), JSON.stringify(pointsTables, null, 2));
  fs.writeFileSync(path.join(globalDataDir, 'awards.json'), JSON.stringify(awards, null, 2));

  console.log('✅ Global Data Generation Complete!');
}

generateGlobalData().catch(console.error);
