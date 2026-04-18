/**
 * routes/debug.js
 * Debug routes — always registered, but in production require a secret header.
 * Mounted at /api/v1/debug in index.js.
 *
 * To hit debug routes in production, add header: X-Debug-Token: <DEBUG_SECRET>
 * Set DEBUG_SECRET in your .env. If unset, all debug routes are open (dev only).
 */

import express from 'express';
import {
  debugSources,
  debugScrapeNow,
  debugReset,
  debugClearFreeze,
  debugEspnDump,
} from '../controllers/debugController.js';

const router = express.Router();

// ─── Production guard ─────────────────────────────────────────────────────────
const guard = (req, res, next) => {
  const secret = process.env.DEBUG_SECRET;
  if (process.env.NODE_ENV !== 'production' || !secret) return next();
  if (req.headers['x-debug-token'] === secret) return next();
  res.status(403).json({ error: 'Forbidden — debug routes require X-Debug-Token header in production.' });
};

router.use(guard);

router.get('/sources',     debugSources);
router.get('/scrape-now',  debugScrapeNow);
router.get('/reset',       debugReset);
router.get('/clear-freeze', debugClearFreeze);
router.get('/espn-dump',   debugEspnDump);

export default router;