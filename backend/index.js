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

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { initGameServer } from './game/gameServer.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import https from 'https';

import liveRoutes from './routes/live.js';
import debugRoutes from './routes/debug.js';
import commentRoutes from './routes/comments.js';
import dataRoutes from './routes/data.js';

import {
  runLiveSync,
  updateStandingsAndStats,
  restoreStateFromDb,
  startScheduler,
} from './services/scheduler.js';

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

app.use('/api/v1', liveRoutes);
app.use('/api/v1/debug', debugRoutes);
app.use('/api/v1/data', dataRoutes);
app.use('/api/comments', commentRoutes);

// ─────────────────────────────────────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅ MongoDB connected');

    const httpServer = createServer(app);
    initGameServer(httpServer);

    httpServer.listen(PORT, async () => {
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