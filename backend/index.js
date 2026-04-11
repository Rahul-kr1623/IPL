import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import https from 'https'; // Required for Keep-Alive ping
import { scrapeLiveMatch, scrapeIPLStandingsAndStats } from './services/scraperService.js';
import LiveMatch from './models/LiveMatch.js';
import commentRoutes from './routes/comments.js';
import {
  COMPLETED_MATCHES, calculatePointsTable, POINTS_TABLE,
  PLAYER_STATS, getCapLeaders,
  generateCommentary, generateOverCommentary,
} from './utils/matchDataEngine.js';

dotenv.config();
const app  = express();
// Priority to process.env.PORT for Render deployment
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: (origin, cb) => cb(null, true), // allow all origins — restrict in prod
  credentials: true,
}));
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => { console.error('❌ MongoDB:', err.message); process.exit(1); });

// ─────────────────────────────────────────────────────────────────────────────
// CACHE
// ─────────────────────────────────────────────────────────────────────────────
const computedCaps = getCapLeaders(PLAYER_STATS);
let standingsCache = {
  pointsTable:      POINTS_TABLE,              // Computed (always reliable)
  orangeCap:        computedCaps.orangeCap,    // From seeded PLAYER_STATS
  purpleCap:        computedCaps.purpleCap,
  topBatsmen:       computedCaps.topBatsmen,
  topBowlers:       computedCaps.topBowlers,
  lastUpdated:      new Date(),
  source:           'computed',
  matchesAccounted: COMPLETED_MATCHES.length,
};

// ─────────────────────────────────────────────────────────────────────────────
// SCRAPER STATE
// ─────────────────────────────────────────────────────────────────────────────
let matchFinishedAt       = null;
let consecutiveFails      = 0;
let finishedConfirmations = 0;
let lastKnownMatchKey     = null;
let lastLiveScore         = null;

const FREEZE_MS    = 50 * 60 * 1000;   // 50 min freeze after FINISHED
const NEED_CONFIRM = 2;                  // 2 consecutive FINISHED readings
const MAX_FAILS    = 12;                 // auto-mark finished after 12 fails

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/v1/health', (req, res) =>
  res.json({ status:'ok', time:new Date(), freeze:!!matchFinishedAt, uptime:Math.floor(process.uptime()) })
);

app.get('/api/v1/live-score', async (req, res) => {
  try {
    const data = await LiveMatch.findOne().sort({ lastUpdated: -1 });
    if (!data) return res.json({ _empty:true, status:'FETCHING', message:'Scraper warming up…' });
    const age     = Date.now() - new Date(data.lastUpdated).getTime();
    const isStale = age > 10 * 60 * 1000;
    return res.json({ ...data.toObject(), _stale: isStale });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/v1/ipl-data', (req, res) => res.json(standingsCache));

app.get('/api/v1/commentary', async (req, res) => {
  try {
    const data = await LiveMatch.findOne().sort({ lastUpdated:-1 });
    res.json({ commentary: data?.commentary || [] });
  } catch { res.json({ commentary: [] }); }
});

app.get('/api/v1/player-stats', (req, res) => {
  const caps = getCapLeaders(PLAYER_STATS);
  res.json({
    topBatsmen: caps.topBatsmen,
    topBowlers: caps.topBowlers,
    orangeCap:  caps.orangeCap,
    purpleCap:  caps.purpleCap,
    ...(standingsCache.topBatsmen?.length > 3 ? { topBatsmen: standingsCache.topBatsmen } : {}),
    ...(standingsCache.topBowlers?.length > 3 ? { topBowlers: standingsCache.topBowlers } : {}),
    ...(standingsCache.orangeCap ? { orangeCap: standingsCache.orangeCap } : {}),
    ...(standingsCache.purpleCap ? { purpleCap: standingsCache.purpleCap } : {}),
  });
});

app.get('/api/v1/completed-matches', (req, res) => {
  res.json({
    completedIds: COMPLETED_MATCHES.map(m => m.id),
    results: COMPLETED_MATCHES.map(m => ({
      id: m.id, teamA: m.teamA, teamB: m.teamB,
      winner: m.winner, result: m.result,
      scoreA: `${m.scoreA}/${m.wA} (${m.ovA})`,
      scoreB: `${m.scoreB}/${m.wB} (${m.ovB})`,
      date: m.date,
    })),
  });
});

app.use('/api/comments', commentRoutes);

// ─────────────────────────────────────────────────────────────────────────────
// LIVE SYNC ENGINE — every 40 seconds
// ─────────────────────────────────────────────────────────────────────────────
const runLiveSync = async () => {
  const t = new Date().toLocaleTimeString();

  if (matchFinishedAt) {
    const elapsed = Date.now() - matchFinishedAt;
    if (elapsed < FREEZE_MS) {
      console.log(`[${t}] ❄️ Frozen — ${Math.ceil((FREEZE_MS-elapsed)/60000)}min left.`);
      return;
    }
    console.log(`[${t}] 🔓 Freeze expired. Ready for next match.`);
    matchFinishedAt=null; lastKnownMatchKey=null; finishedConfirmations=0; lastLiveScore=null;
  }

  console.log(`\n[${t}] 🤖 Scraping...`);

  try {
    const data = await scrapeLiveMatch();

    if (!data?.score || data.score === '0') {
      if (data?.status && ['ABANDONED','RAIN DELAY','POSTPONED'].includes(data.status)) {
        if (!data.commentary?.length) {
          const gen = generateCommentary(data.status, {
            team1:data.team1?.name, team2:data.team2?.name, result:data.result||''
          });
          if (gen) data.commentary = [gen];
        }
        await saveToDb(data);
        return;
      }

      consecutiveFails++;
      if (consecutiveFails <= 3) console.log(`⚠️ No data (fail ${consecutiveFails}/${MAX_FAILS}).`);

      if (consecutiveFails >= MAX_FAILS) {
        const ex = await LiveMatch.findOne().sort({ lastUpdated:-1 });
        if (ex?.status === 'LIVE') {
          await LiveMatch.updateMany({}, { $set:{ status:'RECENTLY FINISHED', lastUpdated:new Date() }});
          matchFinishedAt=Date.now(); finishedConfirmations=NEED_CONFIRM;
          console.log(`🏁 Auto-marked RECENTLY FINISHED.`);
        }
      }
      return;
    }

    consecutiveFails = 0;
    const newKey = `${data.team1?.name}_${data.team2?.name}`;

    if (lastKnownMatchKey && lastKnownMatchKey !== newKey) {
      console.log(`🆕 Match changed: ${lastKnownMatchKey} → ${newKey}. Resetting state.`);
      matchFinishedAt=null; finishedConfirmations=0; lastLiveScore=null;
    }
    lastKnownMatchKey = newKey;

    if (data.status === 'FINISHED') {
      const winner = data.result?.match(/^([A-Z]{2,4})\s+won/i)?.[1]?.toUpperCase();
      if (!winner || (winner !== data.team1?.name && winner !== data.team2?.name)) {
        console.log(`⚠️ Invalid winner "${winner}". Treating as LIVE.`);
        data.status = 'LIVE'; data.result = '';
      }
      if (lastLiveScore && parseInt(lastLiveScore) > 100 && parseInt(data.score) < 30) {
        console.log(`⚠️ Score drop ${lastLiveScore}→${data.score}. Skipping.`);
        return;
      }
    }

    if (data.status === 'FINISHED') {
      finishedConfirmations++;
      console.log(`🏁 FINISHED ${finishedConfirmations}/${NEED_CONFIRM}: ${data.result}`);
      if (finishedConfirmations >= NEED_CONFIRM && !matchFinishedAt) {
        matchFinishedAt = Date.now();
        console.log('🔒 DB frozen.');
      }
      if (!data.commentary?.length) {
        data.commentary = [generateCommentary('FINISHED', {
          result:data.result, team1:data.team1?.name, team2:data.team2?.name
        })].filter(Boolean);
      }
      await saveToDb(data);
      return;
    }

    if (finishedConfirmations > 0 && data.status === 'LIVE') {
      console.log('🔄 Back to LIVE — reset finish counter.'); finishedConfirmations=0;
    }
    if (data.score && parseInt(data.score) > 5) lastLiveScore = data.score;

    const hasRealComm = (data.commentary||[]).filter(c => !c.generated).length >= 2;
    if (!hasRealComm) {
      const ctx = {
        batterName:   data.batsmen?.[0]?.name || 'Batter',
        bowlerName:   data.bowlers?.[0]?.name || 'Bowler',
        overNum:      Math.floor(parseFloat(data.overs || 0)),
        target:       data.target,
        currentScore: parseInt(data.score || 0),
        status:       data.status,
        team1:        data.team1?.name,
        team2:        data.team2?.name,
        result:       data.result,
      };
      const specialStates = ['INNINGS BREAK','RAIN DELAY','ABANDONED','POSTPONED','SUPER OVER'];
      if (specialStates.includes(data.status)) {
        data.commentary = [generateCommentary(data.status, ctx)].filter(Boolean);
      } else if (data.recent?.some(b => b !== '·')) {
        const genComm  = generateOverCommentary(data.recent.filter(b => b !== '·'), ctx);
        const realComm = (data.commentary||[]).filter(c => !c.generated);
        data.commentary = [...realComm, ...genComm].slice(0, 10);
      }
    }

    await saveToDb(data);

  } catch (err) { console.error('❌ Sync error:', err.message); }
};

const saveToDb = async d => {
  await LiveMatch.deleteMany({});
  await new LiveMatch({
    team1:        d.team1,
    team2:        d.team2,
    score:        d.score        || '0',
    wickets:      d.wickets      || '0',
    overs:        d.overs        || '0.0',
    team1Score:   d.team1Score   || null,
    team1Wickets: d.team1Wickets || null,
    team1Overs:   d.team1Overs   || null,
    target:       d.target       || null,
    status:       d.status       || 'LIVE',
    result:       d.result       || '',
    toss:         d.toss         || null,
    winProb:      d.winProbT2    || 50,
    winProbT1:    d.winProbT1    || 50,
    winProbT2:    d.winProbT2    || 50,
    recent:       d.recent       || [],
    commentary:   d.commentary   || [],
    batsmen:      d.batsmen      || [],
    bowlers:      d.bowlers      || [],
    crr:          d.crr          || null,
    rrr:          d.rrr          || null,
    source:       d.source       || 'unknown',
    lastUpdated:  new Date(),
  }).save();
};

const updateStandingsAndStats = async () => {
  const t = new Date().toLocaleTimeString();
  console.log(`\n[${t}] 📊 Updating standings & stats (12h cycle)...`);
  const computed = calculatePointsTable(COMPLETED_MATCHES);

  try {
    const scraped = await scrapeIPLStandingsAndStats();
    if (scraped) {
      standingsCache = {
        pointsTable:      computed,
        orangeCap:        scraped.orangeCap  || computedCaps.orangeCap,
        purpleCap:        scraped.purpleCap  || computedCaps.purpleCap,
        topBatsmen:       scraped.topBatsmen?.length > 2 ? scraped.topBatsmen : computedCaps.topBatsmen,
        topBowlers:       scraped.topBowlers?.length > 2 ? scraped.topBowlers : computedCaps.topBowlers,
        lastUpdated:      new Date(),
        source:           'computed+crex',
        matchesAccounted: COMPLETED_MATCHES.length,
      };
    } else {
      standingsCache = {
        pointsTable:      computed,
        ...computedCaps,
        lastUpdated:      new Date(),
        source:           'computed',
        matchesAccounted: COMPLETED_MATCHES.length,
      };
    }
  } catch (err) {
    standingsCache = { ...standingsCache, pointsTable: computed, lastUpdated: new Date(), source: 'computed' };
  }
};

// 🚀 START SERVER
app.listen(PORT, async () => {
  console.log(`🚀 Server → http://localhost:${PORT}`);

  // --- KEEP ALIVE LOGIC FOR RENDER ---
  // Pings itself every 14 minutes to prevent the free tier from sleeping
  setInterval(() => {
    https.get(`https://ipl-2026-h136.onrender.com/api/v1/health`, (res) => {
      console.log(`[Keep-Alive] Ping sent to self. Status: ${res.statusCode}`);
    }).on('error', (err) => {
      console.error('[Keep-Alive] Ping failed:', err.message);
    });
  }, 14 * 60 * 1000);

  try {
    const ex = await LiveMatch.findOne().sort({ lastUpdated:-1 });
    if (ex?.status === 'FINISHED' || ex?.status === 'RECENTLY FINISHED') {
      const age = Date.now() - new Date(ex.lastUpdated).getTime();
      if (age < FREEZE_MS) {
        matchFinishedAt=Date.now()-age; finishedConfirmations=NEED_CONFIRM;
        console.log(`🔄 Resuming — existing FINISHED match. Freeze active.`);
      }
    }
    if (ex) lastKnownMatchKey = `${ex.team1?.name}_${ex.team2?.name}`;
  } catch {}

  await updateStandingsAndStats();
  await runLiveSync();

  setInterval(runLiveSync,             40_000); 
  setInterval(updateStandingsAndStats, 12*60*60_000);
});