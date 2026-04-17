import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import https from 'https';
import { scrapeLiveMatch, scrapeIPLStandingsAndStats } from './services/scraperService.js';
import LiveMatch from './models/LiveMatch.js';
import commentRoutes from './routes/comments.js';
import {
  COMPLETED_MATCHES, calculatePointsTable, POINTS_TABLE,
  PLAYER_STATS, getCapLeaders,
  generateCommentary, generateOverCommentary,
} from './utils/matchDataEngine.js';

dotenv.config();
const app = express();

// ─────────────────────────────────────────────────────────────────────────────
// DEBUG ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// Test all data sources — visit /api/v1/debug/sources
app.get('/api/v1/debug/sources', async (req, res) => {
  const results = {};
  try {
    const r = await fetch('https://cricbuzz-live.vercel.app/v1/matches');
    const data = await r.json();
    results.cbProxy = { status: r.status, matchCount: data?.data?.matches?.length || 0, firstMatch: data?.data?.matches?.[0] || null, raw: JSON.stringify(data).substring(0, 500) };
  } catch(e) { results.cbProxy = { error: e.message }; }
  try {
    const r = await fetch('https://site.api.espn.com/apis/personalized/v2/scoreboard/header?sport=cricket&region=in&tz=Asia/Calcutta');
    const data = await r.json();
    const events = data?.sports?.[0]?.leagues?.[0]?.events || [];
    results.espnHeader = { status: r.status, eventCount: events.length, firstEvent: events[0] || null };
  } catch(e) { results.espnHeader = { error: e.message }; }
  try {
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/cricket/23694/scoreboard');
    const data = await r.json();
    results.espn23694 = { status: r.status, eventCount: data?.events?.length || 0, firstEvent: data?.events?.[0]?.name || null };
  } catch(e) { results.espn23694 = { error: e.message }; }
  try {
    const r = await fetch('https://www.cricbuzz.com/api/cricket-match/live-scores', { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.cricbuzz.com/' } });
    const text = await r.text();
    results.cricbuzzDirect = { status: r.status, bodyLength: text.length, isJSON: text.startsWith('{'), preview: text.substring(0, 200) };
  } catch(e) { results.cricbuzzDirect = { error: e.message }; }
  for (const sid of ['9241', '9237', '9300']) {
    try {
      const r = await fetch(`https://www.cricbuzz.com/api/cricket-series/${sid}/standings`);
      const text = await r.text();
      results[`cbStandings_${sid}`] = { status: r.status, bodyLength: text.length, preview: text.substring(0, 150) };
    } catch(e) { results[`cbStandings_${sid}`] = { error: e.message }; }
  }
  res.json({ timestamp: new Date().toISOString(), serverTime: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), results });
});

// Run a live scrape immediately — visit /api/v1/debug/scrape-now
app.get('/api/v1/debug/scrape-now', async (req, res) => {
  try {
    const result = await scrapeLiveMatch();
    res.json({ success: !!result, result, timestamp: new Date().toISOString() });
  } catch(e) { res.json({ success: false, error: e.message }); }
});

// Clear MongoDB — visit /api/v1/debug/reset
app.get('/api/v1/debug/reset', async (req, res) => {
  try {
    const deleted = await LiveMatch.deleteMany({});
    res.json({ cleared: true, deleted: deleted.deletedCount, message: 'DB cleared. Next scrape cycle will fetch fresh data.' });
  } catch(e) { res.json({ error: e.message }); }
});

// Clear freeze lock — visit /api/v1/debug/clear-freeze
app.get('/api/v1/debug/clear-freeze', (req, res) => {
  matchFinishedAt = null;
  finishedConfirmations = 0;
  lastKnownMatchKey = null;
  lastLiveScore = null;
  res.json({ cleared: true, message: 'Freeze cleared. Next scrape will run immediately.' });
});

// ─── ESPN RAW JSON DUMP ───────────────────────────────────────────────────────
// THE MOST IMPORTANT DEBUG ROUTE — use this DURING a live match to see
// exactly which JSON fields ESPN populates with batsmen/bowler/innings data.
// Visit: /api/v1/debug/espn-dump
app.get('/api/v1/debug/espn-dump', async (req, res) => {
  try {
    // Step 1: Find current live match ID
    const hdRes = await fetch('https://site.api.espn.com/apis/personalized/v2/scoreboard/header?sport=cricket&region=in&tz=Asia/Calcutta');
    const hdData = await hdRes.json();

    let espnId = null, matchName = null;
    for (const sport of (hdData.sports || [])) {
      for (const league of (sport.leagues || [])) {
        for (const ev of (league.events || [])) {
          if ((ev.status || '').toUpperCase() !== 'PRE') {
            espnId = ev.id || String(ev.uid || '').split('~e:')[1];
            matchName = ev.name || ev.shortName;
            break;
          }
        }
        if (espnId) break;
      }
      if (espnId) break;
    }

    // Also try scoreboard if header missed it
    if (!espnId) {
      const sbRes = await fetch('https://site.api.espn.com/apis/site/v2/sports/cricket/23694/scoreboard');
      const sbData = await sbRes.json();
      for (const ev of (sbData.events || [])) {
        if (ev.status?.type?.name !== 'STATUS_SCHEDULED') {
          espnId = ev.id;
          matchName = ev.name;
          break;
        }
      }
    }

    if (!espnId) {
      return res.json({
        error: 'No live match found right now. Try during a match.',
        headerEvents: hdData?.sports?.[0]?.leagues?.[0]?.events?.map(e => ({ id: e.id, name: e.name, status: e.status })) || [],
      });
    }

    // Step 2: Fetch full summary
    const sumRes = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/cricket/23694/summary?contentorigin=espn&event=${espnId}&lang=en&region=in`);
    const summary = await sumRes.json();
    const gpkg = summary.gamepackageJSON || {};

    // Step 3: Return full structured dump
    res.json({
      espnId,
      matchName,
      // ── Top-level structure ──────────────────────────────────────────────
      summaryTopKeys: Object.keys(summary),
      gpkgTopKeys:    Object.keys(gpkg),

      // ── Match status ─────────────────────────────────────────────────────
      status: summary.header?.competitions?.[0]?.status?.type,
      notes:  (summary.header?.competitions?.[0]?.notes || []).slice(0, 5),

      // ── Competitors (score strings live here) ────────────────────────────
      competitors: (summary.header?.competitions?.[0]?.competitors || []).map(c => ({
        team: c.team?.displayName,
        score: c.score,
        homeAway: c.homeAway,
        winner: c.winner,
        linescoresCount: (c.linescores || []).length,
        linescores: (c.linescores || []).slice(0, 5),
        athletesCount: (c.athletes || []).length,
        sampleAthlete: c.athletes?.[0],
      })),

      // ── Linescore (innings breakdown) ────────────────────────────────────
      linescore: gpkg.linescore,

      // ── Innings array (most complete — should have batsmen/bowlers) ───────
      inningsCount: (gpkg.innings || []).length,
      innings: (gpkg.innings || []).map((inn, i) => ({
        index: i,
        allKeys: Object.keys(inn),
        team: inn.team?.displayName || inn.team?.abbreviation,
        runs: inn.runs || inn.score,
        wickets: inn.wickets,
        overs: inn.overs || inn.totalOvers,
        // Batting details
        battingKeys: inn.batting ? Object.keys(inn.batting) : null,
        batsmenCount: (inn.batting?.batsmen || []).length,
        sampleBatsman: inn.batting?.batsmen?.[0],
        allBatsmen: (inn.batting?.batsmen || []).slice(0, 4).map(b => ({
          name: b.athlete?.displayName || b.name,
          runs: b.runs || b.score,
          balls: b.balls || b.facedBalls,
          fours: b.fours,
          sixes: b.sixes,
          sr: b.strikeRate || b.sr,
          active: b.active,
          onStrike: b.onStrike,
          allKeys: Object.keys(b),
        })),
        // Bowling details
        bowlingKeys: inn.bowling ? Object.keys(inn.bowling) : null,
        bowlersCount: (inn.bowling?.bowlers || []).length,
        allBowlers: (inn.bowling?.bowlers || []).slice(0, 3).map(b => ({
          name: b.athlete?.displayName || b.name,
          wickets: b.wickets,
          runs: b.runs || b.conceded,
          overs: b.overs || b.totalOvers,
          economy: b.economy || b.er,
          allKeys: Object.keys(b),
        })),
      })),

      // ── Box scores (batsmen/bowlers in separate arrays) ───────────────────
      batterBoxScoresCount:  (gpkg.batterBoxScores || []).length,
      batterBoxScoresSample: (gpkg.batterBoxScores || []).slice(0, 2).map(b => ({
        name:   b.athlete?.displayName,
        active: b.active,
        stats:  b.stats,
        allKeys: Object.keys(b),
      })),
      bowlerBoxScoresCount:  (gpkg.bowlerBoxScores || []).length,
      bowlerBoxScoresSample: (gpkg.bowlerBoxScores || []).slice(0, 2).map(b => ({
        name:   b.athlete?.displayName,
        stats:  b.stats,
        allKeys: Object.keys(b),
      })),

      // ── Plays (ball-by-ball, participants might have batsmen) ─────────────
      playsCount: (gpkg.plays || []).length,
      recentPlays: (gpkg.plays || []).slice(-5).map(p => ({
        text: p.text,
        period: p.period,
        participants: (p.participants || []).map(pp => ({
          role: pp.role || pp.type,
          name: pp.athlete?.displayName,
          allKeys: Object.keys(pp),
        })),
      })),

      // ── Leaders (sometimes has top batter/bowler of the innings) ──────────
      leadersCount: (gpkg.leaders || []).length,
      leaders: (gpkg.leaders || []).map(l => ({
        name: l.name,
        abbreviation: l.abbreviation,
        leadersCount: (l.leaders || []).length,
        topLeader: l.leaders?.[0],
      })),

      // ── Win probability + run rates ───────────────────────────────────────
      winProbability:  gpkg.winProbability || gpkg.winProbabilities || 'NOT PRESENT',
      currentRunRate:  gpkg.currentRunRate  || 'NOT PRESENT',
      requiredRunRate: gpkg.requiredRunRate  || 'NOT PRESENT',

      // ── Any other interesting keys in gpkg ─────────────────────────────────
      scoringPlaysCount: (gpkg.scoringPlays || []).length,
      hasScorecard:      !!gpkg.scorecard,
      hasTeamStats:      !!gpkg.teamStats,
      hasMomentum:       !!gpkg.momentum,
      hasPartnership:    !!gpkg.partnership,
    });

  } catch(e) {
    res.json({ error: e.message, stack: e.stack?.substring(0, 500) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SERVER SETUP
// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: (origin, cb) => cb(null, true), credentials: true }));
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => { console.error('❌ MongoDB:', err.message); process.exit(1); });

// ─────────────────────────────────────────────────────────────────────────────
// CACHE
// ─────────────────────────────────────────────────────────────────────────────
const computedCaps = getCapLeaders(PLAYER_STATS);
let standingsCache = {
  pointsTable:      POINTS_TABLE,
  orangeCap:        computedCaps.orangeCap,
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
let matchFinishedAt      = null;
let consecutiveFails     = 0;
let finishedConfirmations = 0;
let lastKnownMatchKey    = null;
let lastLiveScore        = null;

const FREEZE_MS   = 20 * 60 * 1000; // 20 min freeze after FINISHED
const NEED_CONFIRM = 2;              // 2 consecutive FINISHED readings before freezing
const MAX_FAILS    = 12;             // auto-mark finished after 12 consecutive null scrapes

// ─────────────────────────────────────────────────────────────────────────────
// API ROUTES
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/v1/health', (req, res) =>
  res.json({ status: 'ok', time: new Date(), freeze: !!matchFinishedAt, uptime: Math.floor(process.uptime()) })
);

app.get('/api/v1/live-score', async (req, res) => {
  try {
    const data = await LiveMatch.findOne().sort({ lastUpdated: -1 });
    if (!data) return res.json({ _empty: true, status: 'FETCHING', message: 'Scraper warming up…' });
    const age = Date.now() - new Date(data.lastUpdated).getTime();
    return res.json({ ...data.toObject(), _stale: age > 10 * 60 * 1000 });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/v1/ipl-data',   (req, res) => res.json(standingsCache));

app.get('/api/v1/commentary', async (req, res) => {
  try {
    const data = await LiveMatch.findOne().sort({ lastUpdated: -1 });
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
    ...(standingsCache.orangeCap  ? { orangeCap: standingsCache.orangeCap }  : {}),
    ...(standingsCache.purpleCap  ? { purpleCap: standingsCache.purpleCap }  : {}),
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
// LIVE SYNC ENGINE — runs every 40 seconds
// ─────────────────────────────────────────────────────────────────────────────
const runLiveSync = async () => {
  const t = new Date().toLocaleTimeString();

  // Handle freeze state
  if (matchFinishedAt) {
    const elapsed = Date.now() - matchFinishedAt;
    if (elapsed < FREEZE_MS) {
      console.log(`[${t}] ❄️ Frozen — ${Math.ceil((FREEZE_MS - elapsed) / 60000)}min left.`);
      return;
    }
    console.log(`[${t}] 🔓 Freeze expired. Ready for next match.`);
    matchFinishedAt = null; lastKnownMatchKey = null; finishedConfirmations = 0; lastLiveScore = null;
  }

  console.log(`\n[${t}] 🤖 Scraping...`);

  try {
    const data = await scrapeLiveMatch();

    // No data returned
    if (!data?.score || data.score === '0') {
      // Special statuses with score 0 are valid — save them
      if (data?.status && ['ABANDONED', 'RAIN DELAY', 'POSTPONED'].includes(data.status)) {
        if (!data.commentary?.length) {
          const gen = generateCommentary(data.status, { team1: data.team1?.name, team2: data.team2?.name, result: data.result || '' });
          if (gen) data.commentary = [gen];
        }
        await saveToDb(data);
        return;
      }
      consecutiveFails++;
      if (consecutiveFails <= 3) console.log(`⚠️ No data (fail ${consecutiveFails}/${MAX_FAILS}).`);
      if (consecutiveFails >= MAX_FAILS) {
        const ex = await LiveMatch.findOne().sort({ lastUpdated: -1 });
        if (ex?.status === 'LIVE') {
          await LiveMatch.updateMany({}, { $set: { status: 'RECENTLY FINISHED', lastUpdated: new Date() } });
          matchFinishedAt = Date.now(); finishedConfirmations = NEED_CONFIRM;
          console.log('🏁 Auto-marked RECENTLY FINISHED.');
        }
      }
      return;
    }

    consecutiveFails = 0;
    const newKey = `${data.team1?.name}_${data.team2?.name}`;

    // New match detected — reset state
    if (lastKnownMatchKey && lastKnownMatchKey !== newKey) {
      console.log(`🆕 Match changed: ${lastKnownMatchKey} → ${newKey}. Resetting state.`);
      matchFinishedAt = null; finishedConfirmations = 0; lastLiveScore = null;
    }

    // New match detected during freeze — break the freeze
    if (matchFinishedAt && lastKnownMatchKey && lastKnownMatchKey !== newKey) {
      console.log('🆕 New match during freeze — clearing freeze.');
      matchFinishedAt = null; finishedConfirmations = 0; lastLiveScore = null;
    }

    lastKnownMatchKey = newKey;

    // Validate FINISHED state
    if (data.status === 'FINISHED') {
      const winner = data.result?.match(/^([A-Z]{2,4})\s+won/i)?.[1]?.toUpperCase();
      if (!winner || (winner !== data.team1?.name && winner !== data.team2?.name)) {
        console.log(`⚠️ Invalid winner "${winner}" — treating as LIVE.`);
        data.status = 'LIVE'; data.result = '';
      }
      // Guard against score dropping (e.g. scraper picks up wrong match)
      if (lastLiveScore && parseInt(lastLiveScore) > 100 && parseInt(data.score) < 30) {
        console.log(`⚠️ Score drop ${lastLiveScore}→${data.score}. Skipping.`);
        return;
      }
    }

    // Handle confirmed FINISHED
    if (data.status === 'FINISHED') {
      finishedConfirmations++;
      console.log(`🏁 FINISHED ${finishedConfirmations}/${NEED_CONFIRM}: ${data.result}`);
      if (finishedConfirmations >= NEED_CONFIRM && !matchFinishedAt) {
        matchFinishedAt = Date.now();
        console.log('🔒 DB frozen.');
      }
      if (!data.commentary?.length) {
        data.commentary = [generateCommentary('FINISHED', { result: data.result, team1: data.team1?.name, team2: data.team2?.name })].filter(Boolean);
      }
      await saveToDb(data);
      return;
    }

    // Back to LIVE after false finish detection
    if (finishedConfirmations > 0 && data.status === 'LIVE') {
      console.log('🔄 Back to LIVE — reset finish counter.'); finishedConfirmations = 0;
    }

    if (data.score && parseInt(data.score) > 5) lastLiveScore = data.score;

    // Generate commentary if none from scraper
    const hasRealComm = (data.commentary || []).filter(c => !c.generated).length >= 2;
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
      const specialStates = ['INNINGS BREAK', 'RAIN DELAY', 'ABANDONED', 'POSTPONED', 'SUPER OVER'];
      if (specialStates.includes(data.status)) {
        data.commentary = [generateCommentary(data.status, ctx)].filter(Boolean);
      } else if (data.recent?.some(b => b !== '·')) {
        const genComm  = generateOverCommentary(data.recent.filter(b => b !== '·'), ctx);
        const realComm = (data.commentary || []).filter(c => !c.generated);
        data.commentary = [...realComm, ...genComm].slice(0, 10);
      }
    }

    await saveToDb(data);

  } catch(err) { console.error('❌ Sync error:', err.message); }
};

/**
 * index.js — saveToDb() patch
 *
 * In your existing saveToDb() function, add ONE line after espnId:
 *
 *   espnId:         d.espnId         || null,
 *   currentInnings: d.currentInnings || 2,    // ← ADD THIS LINE
 *
 * The full saveToDb() should look like this:
 */

const saveToDb = async d => {
  await LiveMatch.deleteMany({});
  await new LiveMatch({
    team1:          d.team1,
    team2:          d.team2,
    score:          d.score          || '0',
    wickets:        d.wickets        || '0',
    overs:          d.overs          || '0.0',
    team1Score:     d.team1Score     || null,
    team1Wickets:   d.team1Wickets   || null,
    team1Overs:     d.team1Overs     || null,
    target:         d.target         || null,
    status:         d.status         || 'LIVE',
    result:         d.result         || '',
    toss:           d.toss           || null,
    winProb:        d.winProbT2      || 50,
    winProbT1:      d.winProbT1      || 50,
    winProbT2:      d.winProbT2      || 50,
    recent:         d.recent         || [],
    commentary:     d.commentary     || [],
    batsmen:        d.batsmen        || [],
    bowlers:        d.bowlers        || [],
    crr:            d.crr            || null,
    rrr:            d.rrr            || null,
    source:         d.source         || 'unknown',
    espnId:         d.espnId         || null,
    currentInnings: d.currentInnings || 2,   // 1 = team1 batting, 2 = team2 batting
    lastUpdated:    new Date(),
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
        pointsTable:      computed,  // Always use computed for accuracy
        orangeCap:        scraped.orangeCap  || computedCaps.orangeCap,
        purpleCap:        scraped.purpleCap  || computedCaps.purpleCap,
        topBatsmen:       scraped.topBatsmen?.length > 2 ? scraped.topBatsmen : computedCaps.topBatsmen,
        topBowlers:       scraped.topBowlers?.length > 2 ? scraped.topBowlers : computedCaps.topBowlers,
        lastUpdated:      new Date(),
        source:           'computed+scraped',
        matchesAccounted: COMPLETED_MATCHES.length,
      };
    } else {
      standingsCache = { pointsTable: computed, ...computedCaps, lastUpdated: new Date(), source: 'computed', matchesAccounted: COMPLETED_MATCHES.length };
    }
  } catch(err) {
    standingsCache = { ...standingsCache, pointsTable: computed, lastUpdated: new Date(), source: 'computed' };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`🚀 Server → http://localhost:${PORT}`);

  // Keep Render free tier awake — ping self every 14 minutes
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL || 'https://ipl-2026-h136.onrender.com';
  if (process.env.NODE_ENV === 'production') {
    setInterval(() => {
      https.get(`${RENDER_URL}/api/v1/health`, res => {
        console.log(`[Keep-alive] ${res.statusCode} at ${new Date().toLocaleTimeString()}`);
      }).on('error', err => console.error('[Keep-alive] Failed:', err.message));
    }, 14 * 60 * 1000);
    console.log(`[Keep-alive] Self-ping enabled → ${RENDER_URL}`);
  }

  // Restore freeze state from DB if server restarted mid-match
  try {
    const ex = await LiveMatch.findOne().sort({ lastUpdated: -1 });
    if (ex?.status === 'FINISHED' || ex?.status === 'RECENTLY FINISHED') {
      const age = Date.now() - new Date(ex.lastUpdated).getTime();
      if (age < FREEZE_MS) {
        matchFinishedAt = Date.now() - age;
        finishedConfirmations = NEED_CONFIRM;
        console.log('🔄 Resuming — existing FINISHED match. Freeze active.');
      }
    }
    if (ex) lastKnownMatchKey = `${ex.team1?.name}_${ex.team2?.name}`;
  } catch { }

  // Initial data load
  await updateStandingsAndStats();
  await runLiveSync();

  // Start cycles
  setInterval(runLiveSync,            40_000);           // every 40s
  setInterval(updateStandingsAndStats, 12 * 60 * 60_000); // every 12h
});