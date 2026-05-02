/**
 * routes/live.js
 * All live match, standings, and player stats routes.
 * Mounted at /api/v1 in index.js.
 */

import express from 'express';
import {
  getLiveScore,
  getLatestFinished,
  getCommentary,
  getIplData,
  getPlayerStats,
  getCompletedMatches,
  getHealth,
  getMatchIntelHandler,
} from '../controllers/liveController.js';

const router = express.Router();

router.get('/health',            getHealth);
router.get('/live-score',        getLiveScore);
router.get('/latest-finished',   getLatestFinished);
router.get('/commentary',        getCommentary);
router.get('/ipl-data',          getIplData);
router.get('/player-stats',      getPlayerStats);
router.get('/completed-matches', getCompletedMatches);
router.get('/match-intel',       getMatchIntelHandler);  // Gemini AI match analysis

export default router;