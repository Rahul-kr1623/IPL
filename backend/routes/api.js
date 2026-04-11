import express from 'express';
import { getSmartMatchData } from '../controllers/matchController.js';

const router = express.Router();

// The robust Smart Refresh endpoint combining Cache, RapidAPI, and Gemini
router.get('/live-score', getSmartMatchData);

export default router;
