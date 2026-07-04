import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');

// GET /api/v1/data/players
router.get('/players', async (req, res) => {
  try {
    const filePath = path.join(dataDir, 'global', 'players_master.json');
    const data = await fs.readFile(filePath, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Error reading players data:', error);
    res.status(500).json({ error: 'Failed to load players data' });
  }
});

// GET /api/v1/data/stadiums
router.get('/stadiums', async (req, res) => {
  try {
    const filePath = path.join(dataDir, 'global', 'stadiums.json');
    const data = await fs.readFile(filePath, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Error reading stadiums data:', error);
    res.status(500).json({ error: 'Failed to load stadiums data' });
  }
});

// GET /api/v1/data/global/:file
router.get('/global/:file', async (req, res) => {
  try {
    const { file } = req.params;
    const validFiles = ['awards', 'points_tables', 'head_to_head'];
    if (!validFiles.includes(file)) {
      return res.status(400).json({ error: 'Invalid global file type' });
    }
    const filePath = path.join(dataDir, 'global', `${file}.json`);
    const data = await fs.readFile(filePath, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error(`Error reading ${req.params.file} data:`, error);
    res.status(500).json({ error: 'Failed to load global data' });
  }
});

// GET /api/v1/data/season/:year/:type
// Valid types: fixtures, points_table, team_squads
router.get('/season/:year/:type', async (req, res) => {
  try {
    const { year, type } = req.params;
    const validTypes = ['fixtures', 'points_table', 'team_squads'];
    
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid data type' });
    }

    const filePath = path.join(dataDir, 'seasons', year, `${type}.json`);
    const data = await fs.readFile(filePath, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error) {
    // If file doesn't exist for a specific year, return empty data or 404
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: `Data not found for year ${req.params.year} and type ${req.params.type}` });
    }
    console.error(`Error reading ${req.params.type} data:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
