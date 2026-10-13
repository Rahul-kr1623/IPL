import express from 'express';
import Match from '../models/Match.js';
import Player from '../models/Player.js';
import Stadium from '../models/Stadium.js';
import PointsTable from '../models/PointsTable.js';
import HeadToHead from '../models/HeadToHead.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');

// Helper to fallback to JSON file if MongoDB is empty during migration
const fallbackJson = async (subPath) => {
  try {
    const filePath = path.join(dataDir, subPath);
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
};

// ─── GET /api/v1/data/players ──────────────────────────────────────────────────
router.get('/players', async (req, res) => {
  try {
    const { team, role, search } = req.query;
    const query = {};

    if (team) {
      query.currentTeam = team.toUpperCase();
    }
    if (role) {
      query.role = new RegExp(`^${role}$`, 'i');
    }
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { shortName: new RegExp(search, 'i') }
      ];
    }

    const players = await Player.find(query).lean();
    if (players && players.length > 0) {
      res.set('Cache-Control', 'public, max-age=60, s-maxage=300');
      return res.json(players);
    }

    // Fallback to JSON
    const fallback = await fallbackJson('global/players_master.json');
    if (fallback) {
      let filtered = fallback;
      if (team) filtered = filtered.filter(p => p.currentTeam === team.toUpperCase());
      if (role) filtered = filtered.filter(p => p.role?.toLowerCase() === role.toLowerCase());
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(p => p.name?.toLowerCase().includes(s) || p.shortName?.toLowerCase().includes(s));
      }
      return res.json(filtered);
    }

    res.json([]);
  } catch (error) {
    console.error('Error fetching players:', error);
    res.status(500).json({ error: 'Failed to load players data' });
  }
});

// ─── GET /api/v1/data/players/:id ──────────────────────────────────────────────
router.get('/players/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let player = await Player.findOne({
      $or: [
        { playerId: id },
        { shortName: new RegExp(`^${id}$`, 'i') },
        { name: new RegExp(`^${id}$`, 'i') }
      ]
    }).lean();

    if (!player && id.match(/^[0-9a-fA-F]{24}$/)) {
      player = await Player.findById(id).lean();
    }

    if (!player) {
      const fallback = await fallbackJson('global/players_master.json');
      if (fallback) {
        player = fallback.find(p => p.playerId === id || p.shortName?.toLowerCase() === id.toLowerCase() || p.name?.toLowerCase() === id.toLowerCase());
      }
    }

    if (!player) {
      return res.status(404).json({ error: `Player not found: ${id}` });
    }

    // Fetch recent match performances for this player
    const recentMatches = await Match.find({
      $or: [
        { 'scorecard.innings1.batting.name': new RegExp(player.name, 'i') },
        { 'scorecard.innings2.batting.name': new RegExp(player.name, 'i') },
        { 'scorecard.innings1.bowling.name': new RegExp(player.name, 'i') },
        { 'scorecard.innings2.bowling.name': new RegExp(player.name, 'i') }
      ]
    })
      .sort({ date: -1 })
      .limit(5)
      .lean();

    const matchHistory = recentMatches.map(m => {
      const allBatsmen = [
        ...(m.scorecard?.innings1?.batting || []),
        ...(m.scorecard?.innings2?.batting || [])
      ];
      const allBowlers = [
        ...(m.scorecard?.innings1?.bowling || []),
        ...(m.scorecard?.innings2?.bowling || [])
      ];

      const bat = allBatsmen.find(b => b.name && b.name.toLowerCase().includes(player.shortName?.toLowerCase() || player.name.toLowerCase()));
      const bowl = allBowlers.find(b => b.name && b.name.toLowerCase().includes(player.shortName?.toLowerCase() || player.name.toLowerCase()));

      return {
        matchId: m.matchId || m._id,
        opponent: m.teamA === player.currentTeam ? m.teamB : m.teamA,
        date: m.date,
        venue: m.venue,
        runs: bat?.runs ?? 0,
        balls: bat?.balls ?? 0,
        fours: bat?.fours ?? 0,
        sixes: bat?.sixes ?? 0,
        wickets: bowl?.wickets ?? 0,
        overs: bowl?.overs ?? 0,
        conceded: bowl?.runs ?? 0,
        result: m.result
      };
    });

    res.set('Cache-Control', 'public, max-age=30, s-maxage=60');
    res.json({
      ...player,
      matchHistory: matchHistory.length > 0 ? matchHistory : player.recentMatches || []
    });
  } catch (error) {
    console.error('Error fetching player by id:', error);
    res.status(500).json({ error: 'Failed to load player details' });
  }
});

// ─── GET /api/v1/data/stadiums ─────────────────────────────────────────────────
router.get('/stadiums', async (req, res) => {
  try {
    const stadiums = await Stadium.find().lean();
    if (stadiums && stadiums.length > 0) {
      res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
      return res.json(stadiums);
    }

    const fallback = await fallbackJson('global/stadiums.json');
    if (fallback) return res.json(fallback);

    res.json([]);
  } catch (error) {
    console.error('Error fetching stadiums:', error);
    res.status(500).json({ error: 'Failed to load stadiums data' });
  }
});

// ─── GET /api/v1/data/global/:file ─────────────────────────────────────────────
router.get('/global/:file', async (req, res) => {
  try {
    const { file } = req.params;
    const validFiles = ['awards', 'points_tables', 'head_to_head'];
    if (!validFiles.includes(file)) {
      return res.status(400).json({ error: 'Invalid global file type' });
    }

    if (file === 'head_to_head') {
      const h2h = await HeadToHead.find().lean();
      if (h2h && h2h.length > 0) {
        res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
        return res.json(h2h);
      }
    }

    if (file === 'points_tables') {
      const pts = await PointsTable.find().sort({ season: -1 }).lean();
      if (pts && pts.length > 0) {
        res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
        const formatted = {};
        pts.forEach(p => { formatted[p.season] = p.standings; });
        return res.json(formatted);
      }
    }

    // Fallback to JSON file
    const fallback = await fallbackJson(`global/${file}.json`);
    if (fallback) return res.json(fallback);

    res.json([]);
  } catch (error) {
    console.error(`Error reading ${req.params.file} data:`, error);
    res.status(500).json({ error: 'Failed to load global data' });
  }
});

// ─── GET /api/v1/data/season/:year/fixtures ────────────────────────────────────
router.get('/season/:year/fixtures', async (req, res) => {
  try {
    const season = parseInt(req.params.year, 10);
    const matches = await Match.find({ season })
      .sort({ matchNumber: 1, date: 1 })
      .lean();

    if (matches && matches.length > 0) {
      res.set('Cache-Control', season === 2026 ? 'public, max-age=15, s-maxage=30' : 'public, max-age=86400');
      return res.json(matches);
    }

    // Fallback to JSON
    const fallback = await fallbackJson(`seasons/${season}/fixtures.json`);
    if (fallback) return res.json(fallback);

    res.json([]);
  } catch (error) {
    console.error(`Error fetching fixtures for season ${req.params.year}:`, error);
    res.status(500).json({ error: 'Failed to load fixtures data' });
  }
});

// ─── GET /api/v1/data/season/:year/points_table ────────────────────────────────
router.get('/season/:year/points_table', async (req, res) => {
  try {
    const season = parseInt(req.params.year, 10);
    const pts = await PointsTable.findOne({ season }).lean();
    if (pts && pts.standings) {
      res.set('Cache-Control', season === 2026 ? 'public, max-age=15, s-maxage=30' : 'public, max-age=86400');
      return res.json(pts.standings);
    }

    const fallback = await fallbackJson(`seasons/${season}/points_table.json`);
    if (fallback) return res.json(fallback);

    res.json([]);
  } catch (error) {
    console.error(`Error fetching points table for season ${req.params.year}:`, error);
    res.status(500).json({ error: 'Failed to load points table data' });
  }
});

// ─── GET /api/v1/data/season/:year/team_squads ─────────────────────────────────
router.get('/season/:year/team_squads', async (req, res) => {
  try {
    const season = parseInt(req.params.year, 10);
    const players = await Player.find({ currentTeam: { $exists: true, $ne: '' } }).lean();

    if (players && players.length > 0) {
      const squads = {};
      players.forEach(p => {
        if (!squads[p.currentTeam]) squads[p.currentTeam] = [];
        squads[p.currentTeam].push(p);
      });
      res.set('Cache-Control', 'public, max-age=300, s-maxage=1800');
      return res.json(squads);
    }

    const fallback = await fallbackJson(`seasons/${season}/team_squads.json`);
    if (fallback) return res.json(fallback);

    res.json({});
  } catch (error) {
    console.error(`Error fetching squads for season ${req.params.year}:`, error);
    res.status(500).json({ error: 'Failed to load team squads data' });
  }
});

// ─── GET /api/v1/data/season/:year/quick-stats ─────────────────────────────────
router.get('/season/:year/quick-stats', async (req, res) => {
  try {
    const season = parseInt(req.params.year, 10) || 2026;
    const ptsDoc = await PointsTable.findOne({ season }).lean();
    const matches = await Match.find({ season, status: { $in: ['FINISHED', 'RECENTLY FINISHED'] } }).lean();

    let totalSixes = 0;
    let totalFours = 0;
    let highestTotal = { score: 0, team: '', opponent: '' };

    matches.forEach(m => {
      // Tally boundaries from innings batting
      const batsmen = [
        ...(m.scorecard?.innings1?.batting || []),
        ...(m.scorecard?.innings2?.batting || [])
      ];
      batsmen.forEach(b => {
        totalFours += (b.fours || 0);
        totalSixes += (b.sixes || 0);
      });

      if (m.scoreA > highestTotal.score) {
        highestTotal = { score: m.scoreA, team: m.teamA, opponent: m.teamB };
      }
      if (m.scoreB > highestTotal.score) {
        highestTotal = { score: m.scoreB, team: m.teamB, opponent: m.teamA };
      }
    });

    res.set('Cache-Control', 'public, max-age=30, s-maxage=60');
    res.json({
      season,
      matchesPlayed: matches.length,
      totalSixes,
      totalFours,
      highestTotal,
      orangeCap: ptsDoc?.orangeCap || null,
      purpleCap: ptsDoc?.purpleCap || null,
      topBatsmen: ptsDoc?.topBatsmen || [],
      topBowlers: ptsDoc?.topBowlers || []
    });
  } catch (error) {
    console.error('Error fetching quick stats:', error);
    res.status(500).json({ error: 'Failed to load quick stats' });
  }
});

// ─── Generic route for backwards compatibility ─────────────────────────────────
router.get('/season/:year/:type', async (req, res) => {
  const { year, type } = req.params;
  if (type === 'fixtures') return router.handle({ ...req, url: `/season/${year}/fixtures` }, res);
  if (type === 'points_table') return router.handle({ ...req, url: `/season/${year}/points_table` }, res);
  if (type === 'team_squads') return router.handle({ ...req, url: `/season/${year}/team_squads` }, res);
  res.status(400).json({ error: 'Invalid data type' });
});

export default router;
