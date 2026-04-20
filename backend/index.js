/**
 * index.js — IPL Universe Backend Entry Point
 *
 * Responsibilities (and ONLY these):
 *   1. Express app setup (CORS, JSON parser)
 *   2. MongoDB connection
 *   3. Mount API routes
 *   4. Start HTTP server
 *   5. Kick off background scheduler
 *   6. Keep-alive self-ping for Render free tier
 *
 * Everything else lives in:
 *   controllers/  — route handlers
 *   services/     — scraping, DB writes, scheduler
 *   routes/       — Express routers
 *   utils/        — shared state, data engine, cache
 */

import express    from 'express';
import cors       from 'cors';
import dotenv     from 'dotenv';
import mongoose   from 'mongoose';
import https      from 'https';

import liveRoutes    from './routes/live.js';
import debugRoutes   from './routes/debug.js';
import commentRoutes from './routes/comments.js';

import {
  runLiveSync,
  updateStandingsAndStats,
  restoreStateFromDb,
  startScheduler,
} from './services/scheduler.js';
import { loadCompletedMatches } from './services/completedMatchService.js';

dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// Express setup
// ─────────────────────────────────────────────────────────────────────────────

const app = express();

app.use(cors({ origin: (origin, cb) => cb(null, true), credentials: true }));
app.use(express.json());

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

app.use('/api/v1',        liveRoutes);
app.use('/api/v1/debug',  debugRoutes);
app.use('/api/comments',  commentRoutes);

// ─────────────────────────────────────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅ MongoDB connected');

    app.listen(PORT, async () => {
      console.log(`🚀 Server → http://localhost:${PORT}`);

      // Keep Render free tier awake — ping /api/v1/health every 14 minutes
      if (process.env.NODE_ENV === 'production') {
        const RENDER_URL = process.env.RENDER_EXTERNAL_URL || 'https://ipl-2026-h136.onrender.com';
        setInterval(() => {
          https
            .get(`${RENDER_URL}/api/v1/health`, res => {
              console.log(`[Keep-alive] ${res.statusCode} at ${new Date().toLocaleTimeString()}`);
            })
            .on('error', err => console.error('[Keep-alive] Failed:', err.message));
        }, 14 * 60 * 1000);
        console.log(`[Keep-alive] Self-ping enabled → ${RENDER_URL}`);
      }

      // Restore freeze state in case server restarted mid-match
      await restoreStateFromDb();

      // Load+seed completed matches (hardcoded → MongoDB, then DB → in-memory cache)
      await loadCompletedMatches();

      // Seed CompletedMatch MongoDB from hardcoded list if collection is empty
      try {
        const CompletedMatch = (await import('./models/CompletedMatch.js')).default;
        const { COMPLETED_MATCHES } = await import('./utils/matchDataEngine.js');
        const existing = await CompletedMatch.countDocuments();
        if (existing < COMPLETED_MATCHES.length) {
          console.log(`[Seed] CompletedMatch has ${existing} docs, hardcoded has ${COMPLETED_MATCHES.length} — seeding...`);
          for (const m of COMPLETED_MATCHES) {
            const key = `hardcoded_${m.id}`;
            await CompletedMatch.updateOne(
              { matchKey: key },
              { $setOnInsert: {
                matchKey:    key,
                teamA:       m.teamA,
                teamB:       m.teamB,
                winner:      m.winner,
                result:      m.result,
                scoreA:      m.scoreA,
                wA:          m.wA,
                ovA:         String(m.ovA),
                scoreB:      m.scoreB,
                wB:          m.wB,
                ovB:         String(m.ovB),
                date:        m.date,
                finishedAt:  new Date(`${m.date} 20:00:00 UTC+5:30`),
              }},
              { upsert: true }
            );
          }
          console.log(`[Seed] Seeded ${COMPLETED_MATCHES.length} completed matches into MongoDB`);
        } else {
          console.log(`[Seed] CompletedMatch already has ${existing} docs — skipping seed`);
        }
      } catch(e) {
        console.error('[Seed] CompletedMatch seed error:', e.message);
      }

      // Load initial standings cache
      await updateStandingsAndStats();

      // First live scrape immediately
      await runLiveSync();

      // Start recurring background cycles
      startScheduler();
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });