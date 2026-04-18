/**
 * debugController.js
 * Debug-only route handlers.
 * These routes are registered in index.js ONLY in development (NODE_ENV !== 'production').
 * In production, they are available but require a secret header for safety — see debugRoutes.js.
 */

import { scrapeLiveMatch } from '../services/scraperService.js';
import { clearAllMatches } from '../services/dbService.js';
import scraperState from '../utils/scraperState.js';

// ─── GET /api/v1/debug/sources ────────────────────────────────────────────────
export const debugSources = async (req, res) => {
  const results = {};

  // Cricbuzz proxy
  try {
    const r    = await fetch('https://cricbuzz-live.vercel.app/v1/matches');
    const data = await r.json();
    results.cbProxy = {
      status:     r.status,
      matchCount: data?.data?.matches?.length || 0,
      firstMatch: data?.data?.matches?.[0] || null,
      raw:        JSON.stringify(data).substring(0, 500),
    };
  } catch (e) { results.cbProxy = { error: e.message }; }

  // ESPN scoreboard header
  try {
    const r    = await fetch('https://site.api.espn.com/apis/personalized/v2/scoreboard/header?sport=cricket&region=in&tz=Asia/Calcutta');
    const data = await r.json();
    const events = data?.sports?.[0]?.leagues?.[0]?.events || [];
    results.espnHeader = {
      status:     r.status,
      eventCount: events.length,
      firstEvent: events[0] || null,
    };
  } catch (e) { results.espnHeader = { error: e.message }; }

  // ESPN IPL scoreboard
  try {
    const r    = await fetch('https://site.api.espn.com/apis/site/v2/sports/cricket/23694/scoreboard');
    const data = await r.json();
    results.espn23694 = {
      status:     r.status,
      eventCount: data?.events?.length || 0,
      firstEvent: data?.events?.[0]?.name || null,
    };
  } catch (e) { results.espn23694 = { error: e.message }; }

  // Cricbuzz direct
  try {
    const r    = await fetch('https://www.cricbuzz.com/api/cricket-match/live-scores', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.cricbuzz.com/' },
    });
    const text = await r.text();
    results.cricbuzzDirect = {
      status:     r.status,
      bodyLength: text.length,
      isJSON:     text.startsWith('{'),
      preview:    text.substring(0, 200),
    };
  } catch (e) { results.cricbuzzDirect = { error: e.message }; }

  // Cricbuzz standings for known series IDs
  for (const sid of ['9241', '9237', '9300']) {
    try {
      const r    = await fetch(`https://www.cricbuzz.com/api/cricket-series/${sid}/standings`);
      const text = await r.text();
      results[`cbStandings_${sid}`] = { status: r.status, bodyLength: text.length, preview: text.substring(0, 150) };
    } catch (e) { results[`cbStandings_${sid}`] = { error: e.message }; }
  }

  res.json({
    timestamp:  new Date().toISOString(),
    serverTime: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    results,
  });
};

// ─── GET /api/v1/debug/scrape-now ─────────────────────────────────────────────
export const debugScrapeNow = async (req, res) => {
  try {
    const result = await scrapeLiveMatch();
    res.json({ success: !!result, result, timestamp: new Date().toISOString() });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
};

// ─── GET /api/v1/debug/reset ──────────────────────────────────────────────────
export const debugReset = async (req, res) => {
  try {
    const deleted = await clearAllMatches();
    res.json({
      cleared: true,
      deleted,
      message: 'DB cleared. Next scrape cycle will fetch fresh data.',
    });
  } catch (e) {
    res.json({ error: e.message });
  }
};

// ─── GET /api/v1/debug/clear-freeze ──────────────────────────────────────────
export const debugClearFreeze = (req, res) => {
  scraperState.matchFinishedAt       = null;
  scraperState.finishedConfirmations = 0;
  scraperState.lastKnownMatchKey     = null;
  scraperState.lastLiveScore         = null;
  res.json({ cleared: true, message: 'Freeze cleared. Next scrape will run immediately.' });
};

// ─── GET /api/v1/debug/espn-dump ─────────────────────────────────────────────
export const debugEspnDump = async (req, res) => {
  try {
    // Step 1: find current live match ID from header
    const hdRes  = await fetch('https://site.api.espn.com/apis/personalized/v2/scoreboard/header?sport=cricket&region=in&tz=Asia/Calcutta');
    const hdData = await hdRes.json();

    let espnId = null, matchName = null;
    for (const sport of (hdData.sports || [])) {
      for (const league of (sport.leagues || [])) {
        for (const ev of (league.events || [])) {
          if ((ev.status || '').toUpperCase() !== 'PRE') {
            espnId    = ev.id || String(ev.uid || '').split('~e:')[1];
            matchName = ev.name || ev.shortName;
            break;
          }
        }
        if (espnId) break;
      }
      if (espnId) break;
    }

    // Fallback via scoreboard
    if (!espnId) {
      const sbRes  = await fetch('https://site.api.espn.com/apis/site/v2/sports/cricket/23694/scoreboard');
      const sbData = await sbRes.json();
      for (const ev of (sbData.events || [])) {
        if (ev.status?.type?.name !== 'STATUS_SCHEDULED') {
          espnId    = ev.id;
          matchName = ev.name;
          break;
        }
      }
    }

    if (!espnId) {
      return res.json({
        error:        'No live match found right now. Try during a match.',
        headerEvents: hdData?.sports?.[0]?.leagues?.[0]?.events?.map(e => ({
          id: e.id, name: e.name, status: e.status,
        })) || [],
      });
    }

    // Step 2: full summary
    const sumRes  = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/cricket/23694/summary?contentorigin=espn&event=${espnId}&lang=en&region=in`);
    const summary = await sumRes.json();
    const gpkg    = summary.gamepackageJSON || {};

    res.json({
      espnId,
      matchName,
      summaryTopKeys: Object.keys(summary),
      gpkgTopKeys:    Object.keys(gpkg),
      status:         summary.header?.competitions?.[0]?.status?.type,
      notes:          (summary.header?.competitions?.[0]?.notes || []).slice(0, 5),
      competitors: (summary.header?.competitions?.[0]?.competitors || []).map(c => ({
        team:           c.team?.displayName,
        score:          c.score,
        homeAway:       c.homeAway,
        winner:         c.winner,
        linescoresCount: (c.linescores || []).length,
        linescores:     (c.linescores || []).slice(0, 5),
        athletesCount:  (c.athletes || []).length,
        sampleAthlete:  c.athletes?.[0],
      })),
      linescore:       gpkg.linescore,
      inningsCount:    (gpkg.innings || []).length,
      innings: (gpkg.innings || []).map((inn, i) => ({
        index:      i,
        allKeys:    Object.keys(inn),
        team:       inn.team?.displayName || inn.team?.abbreviation,
        runs:       inn.runs || inn.score,
        wickets:    inn.wickets,
        overs:      inn.overs || inn.totalOvers,
        battingKeys:   inn.batting ? Object.keys(inn.batting) : null,
        batsmenCount:  (inn.batting?.batsmen || []).length,
        sampleBatsman: inn.batting?.batsmen?.[0],
        allBatsmen: (inn.batting?.batsmen || []).slice(0, 4).map(b => ({
          name:    b.athlete?.displayName || b.name,
          runs:    b.runs || b.score,
          balls:   b.balls || b.facedBalls,
          fours:   b.fours,
          sixes:   b.sixes,
          sr:      b.strikeRate || b.sr,
          active:  b.active,
          onStrike: b.onStrike,
          allKeys: Object.keys(b),
        })),
        bowlingKeys:  inn.bowling ? Object.keys(inn.bowling) : null,
        bowlersCount: (inn.bowling?.bowlers || []).length,
        allBowlers: (inn.bowling?.bowlers || []).slice(0, 3).map(b => ({
          name:    b.athlete?.displayName || b.name,
          wickets: b.wickets,
          runs:    b.runs || b.conceded,
          overs:   b.overs || b.totalOvers,
          economy: b.economy || b.er,
          allKeys: Object.keys(b),
        })),
      })),
      batterBoxScoresCount:  (gpkg.batterBoxScores || []).length,
      batterBoxScoresSample: (gpkg.batterBoxScores || []).slice(0, 2).map(b => ({
        name: b.athlete?.displayName, active: b.active, stats: b.stats, allKeys: Object.keys(b),
      })),
      bowlerBoxScoresCount:  (gpkg.bowlerBoxScores || []).length,
      bowlerBoxScoresSample: (gpkg.bowlerBoxScores || []).slice(0, 2).map(b => ({
        name: b.athlete?.displayName, stats: b.stats, allKeys: Object.keys(b),
      })),
      playsCount:  (gpkg.plays || []).length,
      recentPlays: (gpkg.plays || []).slice(-5).map(p => ({
        text:         p.text,
        period:       p.period,
        participants: (p.participants || []).map(pp => ({
          role: pp.role || pp.type, name: pp.athlete?.displayName, allKeys: Object.keys(pp),
        })),
      })),
      leadersCount: (gpkg.leaders || []).length,
      leaders: (gpkg.leaders || []).map(l => ({
        name: l.name, abbreviation: l.abbreviation,
        leadersCount: (l.leaders || []).length, topLeader: l.leaders?.[0],
      })),
      winProbability:  gpkg.winProbability  || gpkg.winProbabilities || 'NOT PRESENT',
      currentRunRate:  gpkg.currentRunRate  || 'NOT PRESENT',
      requiredRunRate: gpkg.requiredRunRate  || 'NOT PRESENT',
      scoringPlaysCount: (gpkg.scoringPlays || []).length,
      hasScorecard:      !!gpkg.scorecard,
      hasTeamStats:      !!gpkg.teamStats,
      hasMomentum:       !!gpkg.momentum,
      hasPartnership:    !!gpkg.partnership,
    });

  } catch (e) {
    res.json({ error: e.message, stack: e.stack?.substring(0, 500) });
  }
};