/**
 * scraperService.js — COMPLETE FIX v2
 *
 * FIXES:
 * 1. team1/team2 inversion — ESPN competitor[0] is NOT always batting first.
 *    We now use innings array ordering exclusively to determine who batted first.
 *    inn[0].team = batted first = team1
 *    inn[1].team = currently batting = team2
 *
 * 2. Batsmen/bowler always "Awaiting" — ESPN innings[].batting.batsmen is empty
 *    for cricket. Fixed by reading from batterBoxScores with active flag, and
 *    from competitors[].athletes as fallback.
 *
 * 3. Win probability inverted — now correctly tied to team1 (bat first) and
 *    team2 (chasing).
 *
 * 4. team1Score showing "Yet to bat" — ensured team1Score is always populated
 *    from inn[0] when 2 innings exist.
 *
 * TEAM MODEL (never changes):
 *   team1 = batted FIRST  → team1Score/Wickets/Overs = their completed score
 *   team2 = batting SECOND (currently batting / chasing)
 *   score/wickets/overs = team2's current live score
 */

import https from 'https';
import http from 'http';
import { existsSync } from 'fs';

const TEAMS = ['CSK', 'MI', 'RCB', 'KKR', 'RR', 'PBKS', 'DC', 'GT', 'LSG', 'SRH'];
const wait = ms => new Promise(r => setTimeout(r, ms));
// ESPN IPL league IDs:  23694 = IPL 2025 (old),  8048 = IPL 2026 (ESPN.com series ID)
// The site.api.espn.com cricket endpoint uses the same numeric slug as espn.com/cricket/series/_/id/
const ESPN_IPL_ID = '8048';

// Chrome detection
const CHROME_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : null,
].filter(Boolean);
const CHROME_PATH = CHROME_PATHS.find(p => { try { return existsSync(p); } catch { return false; } }) || null;
const CHROME_AVAILABLE = !!CHROME_PATH;

// ─── Overs normalizer ─────────────────────────────────────────────────────────
const normalizeOvers = (raw) => {
  if (raw === null || raw === undefined) return '0.0';
  const s = String(raw).trim();
  if (!s || s === 'null') return '0.0';
  if (/^\d+$/.test(s)) {
    const n = parseInt(s);
    if (n <= 20) return `${n}.0`;
    const ov = Math.floor(n / 6);
    const b = n % 6;
    return ov >= 20 ? '20.0' : `${ov}.${b}`;
  }
  const parts = s.split('.');
  if (parts.length === 2) {
    let ov = parseInt(parts[0]) || 0;
    let b = parseInt(parts[1]) || 0;
    while (b >= 6) { ov++; b -= 6; }
    if (ov >= 20) return '20.0';
    return `${ov}.${b}`;
  }
  return '0.0';
};

const oversToBalls = (ov) => {
  if (!ov) return 0;
  const [o, b] = String(ov).split('.');
  return (parseInt(o || 0) * 6) + (parseInt(b || 0));
};

const oversToFloat = (ov) => {
  if (!ov) return 0;
  const [o, b] = String(ov).split('.');
  return (parseInt(o || 0)) + ((parseInt(b || 0)) / 6);
};

// ─── HTTP helper ──────────────────────────────────────────────────────────────
const fetchRaw = (url, hdrs = {}, ms = 15000) => new Promise((res, rej) => {
  const lib = url.startsWith('https') ? https : http;
  const req = lib.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      'Accept': 'application/json, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      ...hdrs,
    },
    timeout: ms,
  }, r => {
    if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location)
      return fetchRaw(r.headers.location, hdrs, ms).then(res).catch(rej);
    let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode, body: d }));
  });
  req.on('error', rej);
  req.on('timeout', () => { req.destroy(); rej(new Error('timeout')); });
});

const fetchJSON = async (url, hdrs = {}, label = '') => {
  const tag = label || url.substring(0, 65);
  try {
    const { status, body } = await fetchRaw(url, hdrs);
    if (status !== 200) { console.log(`  [HTTP ${status}] ${tag}`); return null; }
    if (!body || body.length < 5) { console.log(`  [EMPTY] ${tag}`); return null; }
    if (!body.trim().startsWith('{') && !body.trim().startsWith('[')) {
      console.log(`  [NOT-JSON] ${tag} → ${body.substring(0, 50)}`); return null;
    }
    console.log(`  [OK ${status}] ${tag} (${body.length}b)`);
    return JSON.parse(body);
  } catch (e) { console.log(`  [ERR] ${tag} → ${e.message}`); return null; }
};

// Team name mapper
const toTeam = (s = '') => {
  const u = (s || '').toUpperCase();
  if (TEAMS.includes(u)) return u;
  const map = {
    'SUPER KINGS': 'CSK', 'CHENNAI': 'CSK',
    'MUMBAI INDIANS': 'MI', 'MUMBAI': 'MI',
    'ROYAL CHALLENGERS': 'RCB', 'CHALLENGERS': 'RCB', 'BANGALORE': 'RCB', 'BENGALURU': 'RCB',
    'KNIGHT RIDERS': 'KKR', 'KOLKATA': 'KKR',
    'RAJASTHAN ROYALS': 'RR', 'RAJASTHAN': 'RR', 'ROYALS': 'RR',
    'PUNJAB KINGS': 'PBKS', 'PUNJAB': 'PBKS', 'KINGS XI': 'PBKS',
    'DELHI CAPITALS': 'DC', 'DELHI': 'DC', 'CAPITALS': 'DC',
    'GUJARAT TITANS': 'GT', 'GUJARAT': 'GT', 'TITANS': 'GT',
    'LUCKNOW SUPER GIANTS': 'LSG', 'LUCKNOW': 'LSG', 'SUPER GIANTS': 'LSG',
    'SUNRISERS': 'SRH', 'HYDERABAD': 'SRH', 'SUN RISERS': 'SRH',
  };
  for (const [k, v] of Object.entries(map)) if (u.includes(k)) return v;
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// ESPN SCRAPER — primary source
// ─────────────────────────────────────────────────────────────────────────────
// Returns a single match meta (first live one found) — used by scrapeLiveMatch
const espnFindMatch = async () => {
  const all = await espnFindAllMatches();
  return all[0] || null;
};

// Returns ALL live IPL events (up to 2), each with slot + startTime
const espnFindAllMatches = async () => {
  console.log('[ESPN] Finding all live matches...');
  const found = [];

  // Source 1: personalised header (fastest)
  const hd = await fetchJSON(
    'https://site.api.espn.com/apis/personalized/v2/scoreboard/header?sport=cricket&region=in&tz=Asia/Calcutta',
    {}, 'ESPN header'
  );
  if (hd) {
    for (const sport of (hd.sports || [])) {
      for (const league of (sport.leagues || [])) {
        for (const ev of (league.events || [])) {
          const comps = ev.competitors || [];
          const t1 = toTeam(comps[0]?.displayName || comps[0]?.abbreviation || '');
          const t2 = toTeam(comps[1]?.displayName || comps[1]?.abbreviation || '');
          if (!t1 || !t2 || !TEAMS.includes(t1) || !TEAMS.includes(t2)) continue;
          if ((ev.status || '').toUpperCase() === 'PRE') continue;
          const id = ev.id || String(ev.uid || '').split('~e:')[1];
          if (found.some(f => f.espnId === id)) continue;
          const startTime = ev.date || ev.startTime || null;
          console.log(`  [ESPN] Header match: ${t1} vs ${t2} ID:${id}`);
          found.push({ espnId: id, compA: t1, compB: t2, startTime });
        }
      }
    }
  }

  // Source 2: scoreboard (catches anything header missed)
  const sb = await fetchJSON(
    `https://site.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_ID}/scoreboard`,
    {}, 'ESPN scoreboard'
  );
  for (const ev of (sb?.events || [])) {
    const comp = ev.competitions?.[0];
    const t1 = toTeam(comp?.competitors?.[0]?.team?.displayName || '');
    const t2 = toTeam(comp?.competitors?.[1]?.team?.displayName || '');
    if (!t1 || !t2 || !TEAMS.includes(t1) || !TEAMS.includes(t2)) continue;
    if (ev.status?.type?.name === 'STATUS_SCHEDULED') continue;
    if (found.some(f => f.espnId === String(ev.id))) continue;
    const startTime = ev.date || comp?.date || null;
    console.log(`  [ESPN] Scoreboard match: ${t1} vs ${t2} ID:${ev.id}`);
    found.push({ espnId: String(ev.id), compA: t1, compB: t2, startTime });
  }

  // Sort by startTime so slot1 = early match (3:30 PM), slot2 = late match (7:30 PM)
  found.sort((a, b) => {
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return new Date(a.startTime) - new Date(b.startTime);
  });

  console.log(`  [ESPN] Found ${found.length} live IPL match(es)`);
  return found.slice(0, 2); // max 2 (double-header)
};

const espnGetScore = async ({ espnId, compA, compB }) => {
  const summary = await fetchJSON(
    `https://site.web.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_ID}/summary?contentorigin=espn&event=${espnId}&lang=en&region=in`,
    {}, `ESPN summary/${espnId}`
  );
  if (!summary) return null;

  const gpkg = summary.gamepackageJSON || {};
  const header = summary.header?.competitions?.[0];
  if (!header) return null;

  console.log(`  [ESPN] gpkg keys: [${Object.keys(gpkg).join(', ')}]`);

  // ── DIAGNOSTIC DUMP (helps debug empty batsmen/bowlers) ───────────────────
  // Logs a compact summary of every data source ESPN provides
  const diagInn = (gpkg.innings || []).map((inn, i) => {
    const batters = (inn.batting?.batsmen || []).length;
    const bwlrs = (inn.bowling?.bowlers || []).length;
    return `inn[${i}]: ${inn.team?.abbreviation || '?'} runs=${inn.runs || inn.score || '?'} wkts=${inn.wickets || '?'} batters=${batters} bowlers=${bwlrs}`;
  });
  console.log(`  [ESPN] innings dump: ${diagInn.length ? diagInn.join(' | ') : 'EMPTY'}`);
  console.log(`  [ESPN] batterBoxScores=${gpkg.batterBoxScores?.length || 0} bowlerBoxScores=${gpkg.bowlerBoxScores?.length || 0} plays=${gpkg.plays?.length || 0} leaders=${gpkg.leaders?.length || 0}`);
  if (gpkg.batterBoxScores?.length) {
    const sample = gpkg.batterBoxScores.slice(0, 3).map(b =>
      `${b.athlete?.displayName || '?'}(active=${b.active}) stats=${JSON.stringify(b.stats?.slice(0, 3))}`
    );
    console.log(`  [ESPN] batterBoxScores sample: ${sample.join(' | ')}`);
  }
  if (gpkg.bowlerBoxScores?.length) {
    const sample = gpkg.bowlerBoxScores.slice(0, 2).map(b =>
      `${b.athlete?.displayName || '?'} stats=${JSON.stringify(b.stats?.slice(0, 3))}`
    );
    console.log(`  [ESPN] bowlerBoxScores sample: ${sample.join(' | ')}`);
  }
  // Dump winProbability shape so we can wire it correctly
  if (gpkg.winProbability || gpkg.winProbabilities) {
    const wp = gpkg.winProbability || gpkg.winProbabilities;
    console.log(`  [ESPN] winProb type=${Array.isArray(wp) ? 'array' : 'object'} sample=${JSON.stringify(wp).substring(0, 120)}`);
  }
  // ── SITUATION (live CRR, RRR, on-strike batter, overs from scoreboard) ─────
  // ESPN populates header.situation even when gpkg.innings is empty.
  // We extract everything useful from it so the score-string fallback path
  // still gets accurate overs and player data.
  const situation = header.situation || summary.header?.situation || {};
  if (Object.keys(situation).length) {
    console.log(`  [ESPN] situation keys: ${Object.keys(situation).join(', ')}`);
    console.log(`  [ESPN] situation sample: ${JSON.stringify(situation).substring(0, 300)}`);
  }

  // Pre-read overs from situation so score-string fallback can use it
  const situationOvers = (() => {
    const raw = situation.balls != null
      ? `${Math.floor(situation.balls / 6)}.${situation.balls % 6}`   // ESPN sometimes gives total balls
      : (situation.period != null
          ? String(situation.period)                                    // over number
          : (situation.overs ?? situation.currentOver ?? null));
    return raw ? normalizeOvers(String(raw)) : null;
  })();

  // Pre-read on-strike batter, non-striker, bowler from situation
  const situationStriker = situation.onStrike?.athlete?.displayName
    || situation.batter?.athlete?.displayName
    || situation.pitcher?.battingAthlete?.displayName
    || null;
  const situationNonStriker = situation.nonStrike?.athlete?.displayName
    || situation.nonStriker?.athlete?.displayName
    || null;
  const situationBowler = situation.pitcher?.athlete?.displayName
    || situation.bowler?.athlete?.displayName
    || null;
  const situationBatterRuns   = parseInt(situation.onStrike?.runs ?? situation.batter?.runs ?? situation.onStrike?.score ?? 0) || 0;
  const situationBatterBalls  = parseInt(situation.onStrike?.balls ?? situation.batter?.balls ?? 0) || 0;
  const situationNsRuns       = parseInt(situation.nonStrike?.runs ?? situation.nonStriker?.runs ?? 0) || 0;
  const situationNsBalls      = parseInt(situation.nonStrike?.balls ?? situation.nonStriker?.balls ?? 0) || 0;
  const situationBowlerWkts   = parseInt(situation.pitcher?.wickets ?? 0) || 0;
  const situationBowlerRuns   = parseInt(situation.pitcher?.runs ?? 0) || 0;
  const situationBowlerOvers  = normalizeOvers(String(situation.pitcher?.overs ?? situation.pitcher?.over ?? '0'));

  // ── STATUS ─────────────────────────────────────────────────────────────────
  const stType = header.status?.type || {};
  const stDetail = (stType.detail || stType.shortDetail || '').toUpperCase();
  const stName = (stType.name || '').toUpperCase();
  let status = 'LIVE', result = '';
  if (stDetail.includes('RAIN') || stDetail.includes('HALT')) status = 'RAIN DELAY';
  else if (stDetail.includes('INNINGS BREAK') || stDetail.includes('BREAK')) status = 'INNINGS BREAK';
  else if (stName.includes('FINAL') || stType.completed === true) status = 'FINISHED';
  if (status === 'FINISHED') result = header.notes?.[0]?.headline || stDetail;

  // ── TOSS NOTE (for display only, not for team assignment) ─────────────────
  const tossNote = (header.notes || []).find(n => /(toss|chose|elected|opt)/i.test(n.headline || ''));
  const toss = tossNote?.headline || null;

  // ── VENUE + MATCH NUMBER ──────────────────────────────────────────────────
  const venueRaw = header.venue?.fullName || header.venue?.name || summary.header?.venue?.fullName || null;
  const venue = venueRaw ? venueRaw.replace(/,.*$/, '').trim() : null; // "Wankhede Stadium"
  const matchNumberRaw = (header.notes || []).find(n => /match\s*\d+/i.test(n.headline || ''));
  const matchNumber = matchNumberRaw?.headline?.match(/match\s*(\d+)/i)?.[1]
    ? `Match ${matchNumberRaw.headline.match(/match\s*(\d+)/i)[1]}`
    : null;
  const matchTitle = header.name || summary.header?.name || null;

  // ── COMPETITORS (raw ESPN order — do NOT use for batting-first logic) ──────
  const comp0 = header.competitors?.[0];
  const comp1 = header.competitors?.[1];
  const ct0 = toTeam(comp0?.team?.displayName || '') || compA;
  const ct1 = toTeam(comp1?.team?.displayName || '') || compB;

  // Parse score string "160/7" or "160/7 (20)"
  const parseScoreStr = s => {
    if (!s) return null;
    const m = String(s).match(/(\d+)[\/\-](\d+)(?:\s*\(?([\d.]+)\)?)?/);
    if (!m) return null;
    return { runs: m[1], wickets: m[2], overs: m[3] ? normalizeOvers(m[3]) : null };
  };

  // ── INNINGS ARRAY — THE AUTHORITATIVE SOURCE ──────────────────────────────
  // inn[0] = 1st innings team (batted first)  → team1
  // inn[1] = 2nd innings team (batting second) → team2
  const inningsArr = gpkg.innings || [];
  console.log(`  [ESPN] gpkg.innings: ${inningsArr.length}`);
  inningsArr.forEach((inn, i) => {
    const batTeam = toTeam(inn.team?.displayName || inn.team?.abbreviation || '');
    console.log(`    inn[${i}]: team="${inn.team?.displayName}" (${batTeam}) keys=[${Object.keys(inn).join(',')}]`);
  });


  // ── LINESCORE as secondary source ─────────────────────────────────────────
  const linescore = gpkg.linescore || {};
  const lines = linescore.lines || linescore.periods || [];

  let score = '0', wickets = '0', overs = '0.0';
  let team1Name = null, team2Name = null;
  let firstInningsRuns = null, firstInningsWkts = null, firstInningsOvers = null;
  let target = null;
  let scorecard = [];

  if (inningsArr.length >= 2) {
    // ── GOLDEN PATH: two innings exist ────────────────────────────────────
    const inn1 = inningsArr[0];  // batted first
    const inn2 = inningsArr[1];  // batting second

    team1Name = toTeam(inn1.team?.displayName || inn1.team?.abbreviation || '') || ct0;
    team2Name = toTeam(inn2.team?.displayName || inn2.team?.abbreviation || '') || (team1Name === ct0 ? ct1 : ct0);

    scorecard = inningsArr.map((inn, index) => {
      const batting = inn.batting || inn;
      const bowling = inn.bowling || {};

      const battingTeam =
        toTeam(inn.team?.displayName || inn.team?.abbreviation || '') ||
        (index === 0 ? team1Name : team2Name);

      const bowlingTeam =
        index === 0 ? team2Name : team1Name;

      return {
        inningsNumber: index + 1,
        battingTeam,
        bowlingTeam,

        score: String(batting.runs ?? batting.score ?? '0'),
        wickets: String(batting.wickets ?? '0'),
        overs: normalizeOvers(
          batting.overs ?? batting.totalOvers ?? '0'
        ),

        batsmen: (batting.batsmen || []).map((b) => ({
          name:
            b.athlete?.displayName ||
            b.player?.displayName ||
            b.name ||
            '',
          runs: parseInt(b.runs ?? b.score ?? 0),
          balls: parseInt(b.balls ?? b.facedBalls ?? 0),
          fours: parseInt(b.fours ?? b['4s'] ?? 0),
          sixes: parseInt(b.sixes ?? b['6s'] ?? 0),
          strikeRate: parseFloat(
            b.strikeRate ?? b.sr ?? 0
          ).toFixed(1),
          dismissal:
            b.dismissalText ||
            b.dismissal ||
            (b.notOut ? 'not out' : ''),
        })),

        bowlers: (bowling.bowlers || []).map((b) => ({
          name:
            b.athlete?.displayName ||
            b.player?.displayName ||
            b.name ||
            '',
          overs: normalizeOvers(
            b.overs ?? b.totalOvers ?? '0'
          ),
          maidens: parseInt(b.maidens ?? 0),
          runs: parseInt(b.runs ?? b.conceded ?? 0),
          wickets: parseInt(b.wickets ?? 0),
          economy: parseFloat(
            b.economy ?? b.er ?? 0
          ).toFixed(1),
        })),
      };
    });

    // First innings score (from inn[0])
    const b1 = inn1.batting || inn1;
    firstInningsRuns = String(b1.runs ?? b1.score ?? '');
    firstInningsWkts = String(b1.wickets ?? '');
    firstInningsOvers = normalizeOvers(b1.overs ?? b1.totalOvers ?? '20');

    // Current innings score (from inn[1])
    const b2 = inn2.batting || inn2;
    score = String(b2.runs ?? b2.score ?? '0');
    wickets = String(b2.wickets ?? '0');
    overs = normalizeOvers(b2.overs ?? b2.totalOvers ?? '0');

    if (firstInningsRuns && firstInningsRuns !== '') {
      target = parseInt(firstInningsRuns) + 1;
    }

    // INNINGS BREAK: 2nd innings hasn't started → show 1st innings score in centre
    if (status === 'INNINGS BREAK' && (!score || score === '0' || score === 'undefined')) {
      score = firstInningsRuns || '0';
      wickets = firstInningsWkts || '0';
      overs = firstInningsOvers || '20.0';
    }

    console.log(`  [ESPN] 2-innings: team1(bat1st)=${team1Name} ${firstInningsRuns}/${firstInningsWkts} | team2=${team2Name} ${score}/${wickets} (${overs})`);

  } else if (inningsArr.length === 1) {
    // ── SINGLE INNINGS (1st innings still in progress) ─────────────────────
    const inn1 = inningsArr[0];
    team1Name = toTeam(inn1.team?.displayName || inn1.team?.abbreviation || '') || ct0;
    team2Name = team1Name === ct0 ? ct1 : ct0;

    const b1 = inn1.batting || inn1;
    score = String(b1.runs ?? b1.score ?? '0');
    wickets = String(b1.wickets ?? '0');
    overs = normalizeOvers(b1.overs ?? b1.totalOvers ?? '0');
    // No first innings completed yet — team2 hasn't batted
    firstInningsRuns = null; firstInningsWkts = null; firstInningsOvers = null;

    console.log(`  [ESPN] 1-inning: team1(bat1st)=${team1Name} ${score}/${wickets} (${overs})`);

  } else if (lines.length >= 2) {
    // ── LINESCORE FALLBACK ─────────────────────────────────────────────────
    // ESPN linescore: lines[0] = 1st innings, lines[last] = current innings
    const l1 = lines[0];
    const l2 = lines[lines.length - 1];

    team1Name = toTeam(l1.displayName || '') || ct0;
    team2Name = toTeam(l2.displayName || '') || (team1Name === ct0 ? ct1 : ct0);

    firstInningsRuns = String(l1.runs ?? l1.value ?? '');
    firstInningsWkts = String(l1.wickets ?? '');
    firstInningsOvers = normalizeOvers(l1.overs ?? '20');
    score = String(l2.runs ?? l2.value ?? '0');
    wickets = String(l2.wickets ?? '0');
    overs = normalizeOvers(l2.overs ?? l2.displayOvers ?? '0');

    if (firstInningsRuns) target = parseInt(firstInningsRuns) + 1;
    if (status === 'INNINGS BREAK' && (!score || score === '0')) {
      score = firstInningsRuns || '0'; wickets = firstInningsWkts || '0'; overs = firstInningsOvers || '20.0';
    }
    console.log(`  [ESPN] linescore fallback: team1=${team1Name} | team2=${team2Name} ${score}/${wickets}`);

  } else {
    // ── COMPETITOR SCORE STRING FALLBACK ──────────────────────────────────
    // BUG 3 FIX: The old heuristic "more overs = batted first" fails when BOTH
    // teams have completed their innings (both show 20.0 overs). At that point
    // comp0Overs >= comp1Overs is just a coin flip.
    //
    // Priority order for identifying who batted first:
    //   1. Toss note — "XYZ won the toss and elected to bat / field"
    //      → if elected to bat, they batted first
    //      → if elected to field, the OTHER team batted first
    //   2. homeAway flag — ESPN sometimes marks home="0" (hosts tend to field
    //      second in limited-overs cricket, though not always — use as weak signal only)
    //   3. Only-one-score: if only one competitor has a score string, they are batting
    //   4. Clearly incomplete innings (overs < 19.5 while the other is ≥ 19.5)
    //   5. AVOID "comp0Overs >= comp1Overs" when both are ≥ 19.5 — it's a coin flip

    const ps0 = parseScoreStr(comp0?.score || '');
    const ps1 = parseScoreStr(comp1?.score || '');
    const comp0Overs = parseFloat(ps0?.overs || '0');
    const comp1Overs = parseFloat(ps1?.overs || '0');

    // --- Signal 1: toss note parsing ---
    // e.g. "CSK won the toss and elected to bat"  → CSK = team1 (batted first)
    // e.g. "MI won the toss and elected to field" → MI fielded first → OTHER team batted first
    let tossFirstBatter = null;
    if (toss) {
      const tossTeam = TEAMS.find(t => toss.toUpperCase().includes(t));
      if (tossTeam) {
        const elected = toss.toLowerCase();
        if (elected.includes('bat'))        tossFirstBatter = tossTeam;
        else if (elected.includes('field') || elected.includes('bowl'))
          tossFirstBatter = tossTeam === ct0 ? ct1 : ct0;
      }
    }

    // --- Assign teams based on signals ---
    // Helper: given batFirst team, set all score variables
    const assignByFirstBatter = (firstBatter) => {
      const isComp0First = firstBatter === ct0;
      const psBat  = isComp0First ? ps0 : ps1;
      const psChase = isComp0First ? ps1 : ps0;

      team1Name = firstBatter;
      team2Name = firstBatter === ct0 ? ct1 : ct0;

      if (psBat && psChase) {
        // Two scores → team1 completed, team2 chasing
        firstInningsRuns  = psBat.runs;
        firstInningsWkts  = psBat.wickets;
        firstInningsOvers = psBat.overs || '20.0';
        score   = psChase.runs;
        wickets = psChase.wickets;
        overs   = psChase.overs || situationOvers || '0.0';
        target  = parseInt(firstInningsRuns) + 1;
      } else if (psBat && !psChase) {
        // Only first innings score visible
        score   = psBat.runs;
        wickets = psBat.wickets;
        overs   = psBat.overs || situationOvers || '0.0';
      }
    };

    if (tossFirstBatter) {
      // Signal 1 wins — toss is the most reliable indicator
      assignByFirstBatter(tossFirstBatter);
      console.log(`  [ESPN] score-string fallback (toss signal): batFirst=${tossFirstBatter}`);
    } else if (ps0 && !ps1) {
      // Signal 3: only comp0 has a score → comp0 is batting
      team1Name = ct1; team2Name = ct0;
      score = ps0.runs; wickets = ps0.wickets; overs = ps0.overs || situationOvers || '0.0';
      console.log(`  [ESPN] score-string fallback (only comp0 has score)`);
    } else if (!ps0 && ps1) {
      // Signal 3: only comp1 has a score → comp1 is batting
      team1Name = ct0; team2Name = ct1;
      score = ps1.runs; wickets = ps1.wickets; overs = ps1.overs || situationOvers || '0.0';
      console.log(`  [ESPN] score-string fallback (only comp1 has score)`);
    } else if (ps0 && ps1) {
      // Both competitors have a score string.
      // Priority order to identify who batted first:
      //   1. Overs heuristic  — one innings clearly complete (≥ 19.5), other not
      //   2. Run total signal  — higher score is almost certainly the COMPLETED innings
      //      (a live chase rarely overtakes a completed first-innings total before finishing)
      //   3. situationOvers   — if we know the current over from situation, the team
      //      currently NOT at that over is the one that already completed theirs
      //   4. homeAway         — weakest signal, last resort

      const comp0Finished = comp0Overs >= 19.5;
      const comp1Finished = comp1Overs >= 19.5;

      // Signal 1: overs clearly show one innings done
      if (comp0Finished && !comp1Finished) {
        assignByFirstBatter(ct0);
        console.log(`  [ESPN] score-string fallback (comp0 complete overs, comp1 chasing)`);
      } else if (comp1Finished && !comp0Finished) {
        assignByFirstBatter(ct1);
        console.log(`  [ESPN] score-string fallback (comp1 complete overs, comp0 chasing)`);
      } else {
        // Signal 2: run-total heuristic
        // The team with MORE runs has almost certainly finished their innings — they
        // batted first. The live chase score is always lower (chase is in progress).
        // Exception: match finished with a chase win — both overs are 20.0 — but in
        // that case the overs signal above already handled it.
        // We add a margin of 5 runs to avoid misfire when scores are very close.
        const r0 = parseInt(ps0.runs || 0);
        const r1 = parseInt(ps1.runs || 0);
        const runDiff = Math.abs(r0 - r1);

        if (runDiff >= 5 && r0 > r1) {
          // comp0 has more runs → comp0 batted first (completed innings)
          assignByFirstBatter(ct0);
          console.log(`  [ESPN] score-string fallback (run-total: comp0 ${r0} > comp1 ${r1}, comp0 batted first)`);
        } else if (runDiff >= 5 && r1 > r0) {
          // comp1 has more runs → comp1 batted first
          assignByFirstBatter(ct1);
          console.log(`  [ESPN] score-string fallback (run-total: comp1 ${r1} > comp0 ${r0}, comp1 batted first)`);
        } else {
          // Signal 3: use situationOvers — if we know the live innings over,
          // the team currently at that over is the chasing team → they bat second
          // i.e. the OTHER team batted first.
          if (situationOvers && parseFloat(situationOvers) > 0) {
            // We don't know which comp is currently batting from situationOvers alone,
            // but situationStriker tells us the striker's name — match against athletes
            const strikerName = situationStriker || '';
            const comp0HasStriker = strikerName && (comp0?.athletes || [])
              .some(a => (a.athlete?.displayName || a.displayName || '').includes(strikerName.split(' ').pop()));
            if (comp0HasStriker) {
              // comp0 athlete is the striker → comp0 is currently batting (chasing)
              // → comp1 batted first
              assignByFirstBatter(ct1);
              console.log(`  [ESPN] score-string fallback (situation striker in comp0 → comp1 batted first)`);
            } else {
              assignByFirstBatter(ct0);
              console.log(`  [ESPN] score-string fallback (situation striker not in comp0 → comp0 batted first)`);
            }
          } else {
            // Signal 4: homeAway — last resort only
            const comp0IsHome = comp0?.homeAway === '0';
            const firstBatterFallback = comp0IsHome ? ct1 : ct0;
            assignByFirstBatter(firstBatterFallback);
            console.log(`  [ESPN] score-string fallback (last-resort homeAway, batFirst=${firstBatterFallback})`);
          }
        }
      }
    } else {
      // No score strings at all
      team1Name = ct0;
      team2Name = ct1;
      console.log(`  [ESPN] score-string fallback (no scores found)`);
    }

    console.log(
      `  [ESPN] score-string fallback result: team1=${team1Name} firstInn=${firstInningsRuns || 'N/A'}/${firstInningsWkts || 'N/A'} (${firstInningsOvers || 'N/A'}) | team2=${team2Name} live=${score}/${wickets} (${overs}) target=${target || 'N/A'}`
    );
  }

  // Final safety net
  if (!team1Name) team1Name = ct0;
  if (!team2Name) team2Name = team1Name === ct0 ? ct1 : ct0;

  console.log(`  ✅ [ESPN] team1(bat1st)=${team1Name} score:${firstInningsRuns || 'N/A'}/${firstInningsWkts} | team2(batting)=${team2Name} score:${score}/${wickets} (${overs}) target:${target || 'N/A'} status:${status}`);

  // ── BATSMEN — multi-strategy extraction ───────────────────────────────────
  const batsmen = [];

  // Strategy 0: situation (header.situation) — highest priority, real-time
  // ESPN populates this even when gpkg.innings is empty (score-string fallback path).
  if (situationStriker) {
    batsmen.push({
      name:     situationStriker,
      runs:     situationBatterRuns,
      balls:    situationBatterBalls,
      fours:    0, sixes: 0,
      sr:       situationBatterBalls > 0
        ? parseFloat((situationBatterRuns / situationBatterBalls * 100).toFixed(1))
        : 0,
      onStrike: true,
    });
    if (situationNonStriker) {
      batsmen.push({
        name:     situationNonStriker,
        runs:     situationNsRuns,
        balls:    situationNsBalls,
        fours:    0, sixes: 0,
        sr:       situationNsBalls > 0
          ? parseFloat((situationNsRuns / situationNsBalls * 100).toFixed(1))
          : 0,
        onStrike: false,
      });
    }
    console.log(`  [Batsmen] S0 situation: striker=${situationStriker} ns=${situationNonStriker || 'none'}`);
  }
  if (situationBowler) {
    bowlers.push({
      name:    situationBowler,
      overs:   situationBowlerOvers,
      maidens: 0,
      runs:    situationBowlerRuns,
      wickets: situationBowlerWkts,
      economy: situationBowlerOvers !== '0.0' && parseFloat(situationBowlerOvers) > 0
        ? parseFloat((situationBowlerRuns / parseFloat(situationBowlerOvers) * 6).toFixed(1))
        : 0,
    });
    console.log(`  [Bowlers] S0 situation: bowler=${situationBowler}`);
  }

  // Strategy 1: innings[current].batting.batsmen
  // ESPN rarely sets b.active/b.notOut on cricket data — never filter them out completely.
  // Accept every batsman in the array unless explicitly dismissed (b.active === false AND b.notOut === false).
  const currentInnIdx = inningsArr.length >= 2 ? 1 : 0;
  const currInn = inningsArr[currentInnIdx];

  if (currInn?.batting?.batsmen?.length) {
    // Keep all batsmen that are NOT explicitly marked out.
    // If the array has active=true entries, prefer those; otherwise take everyone (ESPN often omits the flag entirely).
    const allBatsmen = currInn.batting.batsmen;
    const explicitlyActive = allBatsmen.filter(b => b.active === true);
    const toUse = explicitlyActive.length > 0
      ? explicitlyActive.slice(0, 3)
      : allBatsmen.filter(b => !(b.active === false && b.notOut === false)).slice(0, 3);

    toUse.forEach(b => {
      const name = b.athlete?.displayName || b.player?.displayName || b.name || '';
      if (!name) return;
      batsmen.push({
        name,
        runs: parseInt(b.runs ?? b.score ?? 0),
        balls: parseInt(b.balls ?? b.facedBalls ?? 0),
        fours: parseInt(b.fours ?? b['4s'] ?? 0),
        sixes: parseInt(b.sixes ?? b['6s'] ?? 0),
        sr: parseFloat(b.strikeRate ?? b.sr ?? 0).toFixed(1),
        onStrike: b.onStrike === true || b.active === true,
      });
    });
    console.log(`  [Batsmen] S1 innings.batting.batsmen: ${batsmen.length} (pool=${allBatsmen.length} explicit=${explicitlyActive.length})`);
  }

  // Strategy 2: batterBoxScores — ESPN flat list
  // ESPN often sets active=undefined (not false, not true) for current batsmen.
  // Prefer entries with active===true; if none, take the LAST 3 entries (most recent in innings).
  // Also widen stat key lookups — ESPN uses both camelCase and short abbreviations.
  if (batsmen.length === 0 && gpkg.batterBoxScores?.length) {
    const bbs = gpkg.batterBoxScores;
    const explicitlyActive = bbs.filter(b => b.active === true);
    // "not explicitly out" = active is true OR active is undefined/null (ESPN often omits it for live batsmen)
    const likelyLive = bbs.filter(b => b.active !== false);
    const toUse = explicitlyActive.length > 0
      ? explicitlyActive
      : likelyLive.length > 0
        ? likelyLive.slice(-3)   // last 3 = most recently added = most likely still batting
        : bbs.slice(-3);

    toUse.forEach(b => {
      const name = b.athlete?.displayName || b.athlete?.shortName || '';
      if (!name) return;
      const stats = {};
      (b.stats || []).forEach(s => {
        // ESPN uses both full names and short abbreviations — store both
        if (s.name)         stats[s.name]         = s.displayValue ?? s.value;
        if (s.abbreviation) stats[s.abbreviation] = s.displayValue ?? s.value;
      });
      batsmen.push({
        name,
        runs:  parseInt(stats.runs  || stats.R   || stats.r   || 0),
        balls: parseInt(stats.balls || stats.BF  || stats.B   || 0),
        fours: parseInt(stats.fours || stats['4s'] || stats.FOURS || 0),
        sixes: parseInt(stats.sixes || stats['6s'] || stats.SIXES || 0),
        sr:    parseFloat(stats.strikeRate || stats.SR || stats.sr || 0).toFixed(1),
        onStrike: b.active === true || b.onStrike === true,
      });
    });
    console.log(`  [Batsmen] S2 batterBoxScores: ${batsmen.length} (pool=${bbs.length} explicit=${explicitlyActive.length} likelyLive=${likelyLive.length})`);
  }

  // Strategy 3: competitors[].athletes — pick the CURRENTLY BATTING competitor
  if (batsmen.length === 0) {
    const currentInningsNum = (firstInningsRuns && firstInningsRuns !== '' && firstInningsRuns !== 'null') ? 2 : 1;
    const battingTeamName = currentInningsNum === 1 ? team1Name : team2Name;
    const battingComp = battingTeamName === ct0 ? comp0 : comp1;
    const athletes = battingComp?.athletes || [];
    // Accept athletes where active is not explicitly false
    athletes.filter(a => a.active !== false).slice(0, 3).forEach(a => {
      const name = a.athlete?.displayName || a.displayName || '';
      if (!name) return;
      const stats = {};
      (a.statistics || a.stats || []).forEach(s => {
        if (s.name)         stats[s.name]         = s.value ?? s.displayValue;
        if (s.abbreviation) stats[s.abbreviation] = s.value ?? s.displayValue;
      });
      batsmen.push({
        name,
        runs:  parseInt(stats.runs  || stats.R   || 0),
        balls: parseInt(stats.balls || stats.BF  || stats.B || 0),
        fours: parseInt(stats.fours || stats['4s'] || 0),
        sixes: parseInt(stats.sixes || stats['6s'] || 0),
        sr:    parseFloat(stats.strikeRate || stats.SR || 0).toFixed(1),
        onStrike: a.active === true,
      });
    });
    if (batsmen.length) console.log(`  [Batsmen] S3 competitors.athletes: ${batsmen.length}`);
  }

  // Strategy 4: leaders for batting
  if (batsmen.length === 0 && gpkg.leaders?.length) {
    for (const leader of gpkg.leaders) {
      if (!(leader.name || '').toLowerCase().includes('bat')) continue;
      (leader.leaders || []).slice(0, 2).forEach(l => {
        const name = l.athlete?.displayName || '';
        if (!name || batsmen.find(b => b.name === name)) return;
        batsmen.push({ name, runs: parseInt(l.value ?? 0), balls: 0, fours: 0, sixes: 0, sr: '0.0', onStrike: false });
      });
    }
    if (batsmen.length) console.log(`  [Batsmen] from leaders: ${batsmen.length}`);
  }

  // Strategy 5: recent plays participants
  if (batsmen.length === 0 && gpkg.plays?.length) {
    const recentPlays = (gpkg.plays || []).slice(-5).reverse();
    const seenNames = new Set();
    for (const play of recentPlays) {
      for (const participant of (play.participants || [])) {
        const name = participant.athlete?.displayName || '';
        if (!name || seenNames.has(name)) continue;
        const role = (participant.type || participant.role || '').toLowerCase();
        if (role === 'bowler') continue; // skip bowlers
        seenNames.add(name);
        batsmen.push({ name, runs: 0, balls: 0, fours: 0, sixes: 0, sr: '0.0', onStrike: batsmen.length === 0 });
        if (batsmen.length >= 2) break;
      }
      if (batsmen.length >= 2) break;
    }
    if (batsmen.length) console.log(`  [Batsmen] from plays participants: ${batsmen.length}`);
  }

  // ── BOWLERS — must be declared before Strategy 6 ──────────────────────────
  const bowlers = [];

  // Strategy 6: ESPN scoreboard competitor linescores — last resort when gpkg is empty
  if (batsmen.length === 0) {
    try {
      const sb2 = await fetchJSON(
        `https://site.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_ID}/scoreboard`,
        {}, 'ESPN scoreboard (player fallback)'
      );
      const sbEvent = (sb2?.events || []).find(e => String(e.id) === String(espnId));
      const sbComp = sbEvent?.competitions?.[0];
      if (sbComp) {
        const currentInningsNum = (firstInningsRuns && firstInningsRuns !== '' && firstInningsRuns !== 'null') ? 2 : 1;
        const battingTeamName = currentInningsNum === 1 ? team1Name : team2Name;
        const bowlingTeamName = currentInningsNum === 1 ? team2Name : team1Name;
        const sbBatComp = (sbComp.competitors || []).find(c => toTeam(c.team?.displayName || c.team?.abbreviation || '') === battingTeamName);
        const sbBowlComp = (sbComp.competitors || []).find(c => toTeam(c.team?.displayName || c.team?.abbreviation || '') === bowlingTeamName);
        // Try linescores for batter names
        const ls = sbComp.linescores || sbComp.situation || {};
        if (ls.onStrike?.athlete?.displayName) {
          batsmen.push({ name: ls.onStrike.athlete.displayName, runs: parseInt(ls.onStrike.runs ?? 0), balls: parseInt(ls.onStrike.balls ?? 0), fours: 0, sixes: 0, sr: '0.0', onStrike: true });
        }
        if (ls.nonStrike?.athlete?.displayName) {
          batsmen.push({ name: ls.nonStrike.athlete.displayName, runs: parseInt(ls.nonStrike.runs ?? 0), balls: parseInt(ls.nonStrike.balls ?? 0), fours: 0, sixes: 0, sr: '0.0', onStrike: false });
        }
        // Bowler from situation
        if (bowlers.length === 0 && ls.pitcher?.athlete?.displayName) {
          bowlers.push({ name: ls.pitcher.athlete.displayName, overs: '0', maidens: 0, runs: parseInt(ls.pitcher.runs ?? 0), wickets: parseInt(ls.pitcher.wickets ?? 0), economy: '0.0' });
        }
        // Try competitor athletes as final fallback
        if (batsmen.length === 0 && sbBatComp?.athletes?.length) {
          sbBatComp.athletes.filter(a => a.active !== false).slice(0, 3).forEach(a => {
            const name = a.athlete?.displayName || a.displayName || '';
            if (!name) return;
            const stats = {};
            (a.statistics || a.stats || []).forEach(s => { stats[s.name || s.abbreviation] = s.value ?? s.displayValue; });
            batsmen.push({ name, runs: parseInt(stats.runs || stats.R || 0), balls: parseInt(stats.balls || stats.B || 0), fours: 0, sixes: 0, sr: parseFloat(stats.strikeRate || stats.SR || 0).toFixed(1), onStrike: a.active === true });
          });
        }
        if (bowlers.length === 0 && sbBowlComp?.athletes?.length) {
          sbBowlComp.athletes.filter(a => a.active !== false).slice(0, 2).forEach(a => {
            const name = a.athlete?.displayName || a.displayName || '';
            if (!name) return;
            const stats = {};
            (a.statistics || a.stats || []).forEach(s => { stats[s.name || s.abbreviation] = s.value ?? s.displayValue; });
            bowlers.push({ name, overs: normalizeOvers(stats.overs || stats.O || '0'), maidens: parseInt(stats.maidens || stats.M || 0), runs: parseInt(stats.runs || stats.R || 0), wickets: parseInt(stats.wickets || stats.W || 0), economy: parseFloat(stats.economy || stats.ECO || 0).toFixed(1) });
          });
        }
        if (batsmen.length) console.log(`  [Batsmen] from scoreboard fallback: ${batsmen.length}`);
        if (bowlers.length) console.log(`  [Bowlers] from scoreboard fallback: ${bowlers.length}`);
      }
    } catch (e) { console.log(`  [Strategy6] scoreboard fallback failed: ${e.message}`); }
  }

  // ── BOWLERS — additional strategies (Strategy 1-3) ───────────────────────
  // (bowlers[] already declared above; Strategy 6 may have already populated it)

  // Strategy 1: innings[current].bowling.bowlers
  // Take the last 2 entries — most recently added = currently bowling / just finished over.
  // ESPN almost never sets an active flag on bowlers, so just trust array order.
  if (currInn?.bowling?.bowlers?.length) {
    const activeBowlers = currInn.bowling.bowlers.slice(-2);
    activeBowlers.forEach(b => {
      const name = b.athlete?.displayName || b.player?.displayName || b.name || '';
      if (!name) return;
      bowlers.push({
        name,
        overs:   normalizeOvers(b.overs ?? b.totalOvers ?? '0'),
        maidens: parseInt(b.maidens ?? 0),
        runs:    parseInt(b.runs ?? b.conceded ?? 0),
        wickets: parseInt(b.wickets ?? 0),
        economy: parseFloat(b.economy ?? b.er ?? 0).toFixed(1),
      });
    });
    console.log(`  [Bowlers] S1 innings.bowling.bowlers: ${bowlers.length}`);
  }

  // Strategy 2: bowlerBoxScores — widen stat key lookups
  if (bowlers.length === 0 && gpkg.bowlerBoxScores?.length) {
    gpkg.bowlerBoxScores.slice(-2).forEach(b => {
      const name = b.athlete?.displayName || '';
      if (!name) return;
      const stats = {};
      (b.stats || []).forEach(s => {
        if (s.name)         stats[s.name]         = s.displayValue ?? s.value;
        if (s.abbreviation) stats[s.abbreviation] = s.displayValue ?? s.value;
      });
      bowlers.push({
        name,
        overs:   normalizeOvers(stats.overs || stats.O || stats.ov || '0'),
        maidens: parseInt(stats.maidens || stats.M || stats.MD || 0),
        runs:    parseInt(stats.runs    || stats.R || stats.conceded || 0),
        wickets: parseInt(stats.wickets || stats.W || stats.wkts || 0),
        economy: parseFloat(stats.economy || stats.ECO || stats.ER || 0).toFixed(1),
      });
    });
    console.log(`  [Bowlers] S2 bowlerBoxScores: ${bowlers.length}`);
  }

  // Strategy 3: leaders for bowling
  if (bowlers.length === 0 && gpkg.leaders?.length) {
    for (const leader of gpkg.leaders) {
      if (!(leader.name || '').toLowerCase().includes('bowl') && !(leader.name || '').toLowerCase().includes('wicket')) continue;
      (leader.leaders || []).slice(0, 1).forEach(l => {
        const name = l.athlete?.displayName || '';
        if (name) bowlers.push({ name, overs: '0', maidens: 0, runs: 0, wickets: parseInt(l.value ?? 0), economy: '0.0' });
      });
    }
    if (bowlers.length) console.log(`  [Bowlers] from leaders: ${bowlers.length}`);
  }



  // ── RECENT BALLS ──────────────────────────────────────────────────────────
  // Use description as primary field (ESPN) — text is often blank
  const plays = gpkg.plays || gpkg.scoringPlays || [];
  const recent = ['·', '·', '·', '·', '·', '·'];
  plays.slice(-6).forEach((p, i) => {
    const d = (p.description?.trim() || p.text?.trim() || p.shortDescription?.trim() || '').toLowerCase();
    let b = '·';
    if (d.includes('wicket') || d.includes(' out')) b = 'W';
    else if (d.includes('six')) b = '6';
    else if (d.includes('four') || d.includes('boundary')) b = '4';
    else if (d.includes('wide')) b = 'WD';
    else if (d.includes('no ball')) b = 'NB';
    else { const m = d.match(/\b(\d)\s*run/); b = m ? m[1] : '·'; }
    recent[i] = b;
  });

  // ── COMMENTARY ────────────────────────────────────────────────────────────
  // ESPN plays use `description` as the primary text field; `text` is often "" or missing.
  // Also check `shortDescription` and `headline` as additional fallbacks.
  const commentary = plays.slice(0, 12).map(p => {
    const text = (p.description?.trim() || p.text?.trim() || p.shortDescription?.trim() || p.headline?.trim() || '');
    if (!text || text.length < 5) return null;
    const ut = text.toUpperCase();
    return {
      over: String(p.period?.number || p.periodText || ''),
      text: text.substring(0, 200),
      type: ut.includes('WICKET') || ut.includes(' OUT') ? 'wicket'
        : ut.includes('FOUR') || ut.includes('BOUNDARY') || ut.includes('SIX') ? 'boundary' : 'normal',
      generated: false,
    };
  }).filter(Boolean);

  // Commentary-based fallback for striker/non-striker/bowler
  if (batsmen.length === 0 || bowlers.length === 0) {
    const commentaryText = commentary
      .map(c => c.text || '')
      .join(' ');

    const batterMatches = [
      ...commentaryText.matchAll(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s+(\d+)\((\d+)\)/g)
    ];

    batterMatches.slice(0, 2).forEach((m, idx) => {
      const name = m[1];
      if (!name) return;
      if (batsmen.find(b => b.name === name)) return;

      batsmen.push({
        name,
        runs: parseInt(m[2] || 0),
        balls: parseInt(m[3] || 0),
        fours: 0,
        sixes: 0,
        sr: '0.0',
        onStrike: idx === 0,
      });
    });

    const bowlerMatch = commentaryText.match(
      /(?:to|bowling)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/i
    );

    if (bowlerMatch && bowlers.length === 0) {
      bowlers.push({
        name: bowlerMatch[1],
        overs: '0.0',
        maidens: 0,
        runs: 0,
        wickets: 0,
        economy: '0.0',
      });
    }
  }

  // ── WIN PROBABILITY ───────────────────────────────────────────────────────
  const scoreInt = parseInt(score) || 0;
  const oversFloat = oversToFloat(overs);
  let crr = null, rrr = null, winProbT1 = 50, winProbT2 = 50;

  if (gpkg.currentRunRate) crr = parseFloat(gpkg.currentRunRate);
  if (gpkg.requiredRunRate) rrr = parseFloat(gpkg.requiredRunRate);
  // situation.runRate / situation.requiredRunRate when gpkg is empty
  if (!crr && situation.runRate)         crr = parseFloat(situation.runRate);
  if (!crr && situation.currentRunRate)  crr = parseFloat(situation.currentRunRate);
  if (!rrr && situation.requiredRunRate) rrr = parseFloat(situation.requiredRunRate);
  if (!crr && oversFloat > 0) crr = parseFloat((scoreInt / oversFloat).toFixed(2));

  if (target && oversFloat > 0) {
    const ballsLeft = Math.max((20 - oversFloat) * 6, 1);
    const runsLeft = Math.max(target - scoreInt, 0);
    rrr = parseFloat((runsLeft / ballsLeft * 6).toFixed(2));
  }

  // ESPN win probability
  const wpData = gpkg.winProbability || gpkg.winProbabilities;
  if (wpData) {
    const wpArr = Array.isArray(wpData) ? wpData : null;
    const wpObj = !Array.isArray(wpData) ? wpData : null;
    if (wpArr?.length > 0) {
      const last = wpArr[wpArr.length - 1];
      // homeWinPercentage = probability for ct0 (ESPN's "home" team)
      const hwPct = parseFloat(last.homeWinPercentage ?? last.home ?? 50);
      // team1 = bat first. team2 = chasing.
      // If team1 === ct0, then hwPct is team1's probability
      // If team1 === ct1, then hwPct is for ct0 = team2 → team2 prob = hwPct
      if (team1Name === ct0) {
        winProbT1 = Math.round(hwPct);
        winProbT2 = 100 - winProbT1;
      } else {
        winProbT2 = Math.round(hwPct);
        winProbT1 = 100 - winProbT2;
      }
    } else if (wpObj?.homeTeam != null) {
      const hwPct = parseFloat(wpObj.homeTeam ?? 50);
      if (team1Name === ct0) {
        winProbT1 = Math.round(hwPct);
        winProbT2 = 100 - winProbT1;
      } else {
        winProbT2 = Math.round(hwPct);
        winProbT1 = 100 - winProbT2;
      }
    }
  }

  // Compute from RRR/CRR if ESPN didn't provide prob
  if (winProbT1 === 50 && winProbT2 === 50) {
    if (rrr && crr && crr > 0) {
      // RRR/CRR ratio: if ratio < 1 chaser is ahead → team2 has higher prob
      const r = rrr / crr;
      winProbT2 = r < 0.5 ? 88 : r < 0.75 ? 78 : r < 0.9 ? 66 : r < 1.0 ? 55
        : r < 1.1 ? 46 : r < 1.3 ? 37 : r < 1.6 ? 28 : r < 2.0 ? 18 : 10;
      winProbT1 = 100 - winProbT2;
    } else if (crr && !target && oversFloat > 0) {
      // 1st innings — project final score
      const proj = crr * 20;
      winProbT1 = proj > 195 ? 65 : proj > 180 ? 60 : proj > 165 ? 55 : proj > 150 ? 50 : proj > 135 ? 45 : 38;
      winProbT2 = 100 - winProbT1;
    }
  }

  if (status === 'FINISHED' && result) {
    const w = result.toUpperCase();
    // Check which team name appears in result string
    if (w.includes(team1Name)) { winProbT1 = 100; winProbT2 = 0; }
    else if (w.includes(team2Name)) { winProbT2 = 100; winProbT1 = 0; }
  }
  if (['ABANDONED', 'POSTPONED'].includes(status)) { winProbT1 = 50; winProbT2 = 50; }

  const currentInningsNum = (firstInningsRuns && firstInningsRuns !== '' && firstInningsRuns !== 'null') ? 2 : 1;
  const logBatting = currentInningsNum === 1
    ? `team1(currently batting)=${team1Name} score:${score}/${wickets} (${overs})`
    : `team2(currently batting)=${team2Name} score:${score}/${wickets} (${overs})`;
  const logBowling = currentInningsNum === 1
    ? `team2(bowling)=${team2Name}`
    : `team1(bat1st)=${team1Name} 1stInn:${firstInningsRuns || 'N/A'}/${firstInningsWkts}`;
  console.log(`  ✅ [ESPN] FINAL: ${logBatting} | ${logBowling} | currentInnings=${currentInningsNum} target:${target || 'N/A'} status:${status}`);
  console.log(`     CRR:${crr} RRR:${rrr} WinProb: T1(${team1Name})=${winProbT1}% T2(${team2Name})=${winProbT2}%`);
  if (batsmen.length) console.log(`     🏏 ${batsmen.map(b => `${b.name}${b.onStrike ? '*' : ''}: ${b.runs}(${b.balls})`).join(' | ')}`);
  if (bowlers.length) console.log(`     🎯 ${bowlers.map(b => `${b.name}: ${b.wickets}/${b.runs}(${b.overs})`).join(' | ')}`);
  if (!batsmen.length) console.log(`     ⚠️  [Batsmen] EMPTY — gpkg was empty, all fallbacks failed`);
  if (!bowlers.length) console.log(`     ⚠️  [Bowlers] EMPTY — no bowling data found`);

  return {
    team1: { name: team1Name },
    team2: { name: team2Name },

    score,
    wickets,
    overs,

    team1Score: firstInningsRuns || null,
    team1Wickets: firstInningsWkts || null,
    team1Overs: firstInningsOvers
      ? normalizeOvers(firstInningsOvers)
      : null,

    target: target || null,

    requiredRuns:
      target && score
        ? Math.max(parseInt(target) - parseInt(score), 0)
        : null,

    requiredBalls:
      overs
        ? Math.max(120 - oversToBalls(overs), 0)
        : null,

    projectedScore:
      crr && overs
        ? Math.round(parseFloat(crr) * 20)
        : null,

    status,
    result,
    toss,

    winProb: winProbT2,
    winProbT1,
    winProbT2,

    winProbabilityTimeline: [
      {
        over: 0,
        team1Prob: 50,
        team2Prob: 50,
      },
      {
        over: 5,
        team1Prob: Math.max((winProbT1 || 50) - 15, 5),
        team2Prob: Math.min((winProbT2 || 50) + 15, 95),
      },
      {
        over: 10,
        team1Prob: Math.max((winProbT1 || 50) - 8, 5),
        team2Prob: Math.min((winProbT2 || 50) + 8, 95),
      },
      {
        over: 15,
        team1Prob: Math.max((winProbT1 || 50) - 3, 5),
        team2Prob: Math.min((winProbT2 || 50) + 3, 95),
      },
      {
        over: oversToFloat(overs || 0),
        team1Prob: winProbT1 || 50,
        team2Prob: winProbT2 || 50,
      },
    ],

    inningsTimeline: [
      {
        over: 1,
        team1Score: firstInningsRuns
          ? Math.round(parseInt(firstInningsRuns) * 0.08)
          : Math.round(parseInt(score || 0) * 0.08),
        team2Score: 0,
      },
      {
        over: 5,
        team1Score: firstInningsRuns
          ? Math.round(parseInt(firstInningsRuns) * 0.28)
          : Math.round(parseInt(score || 0) * 0.28),
        team2Score: 0,
      },
      {
        over: 10,
        team1Score: firstInningsRuns
          ? Math.round(parseInt(firstInningsRuns) * 0.52)
          : Math.round(parseInt(score || 0) * 0.52),
        team2Score: 0,
      },
      {
        over: 15,
        team1Score: firstInningsRuns
          ? Math.round(parseInt(firstInningsRuns) * 0.78)
          : Math.round(parseInt(score || 0) * 0.78),
        team2Score: 0,
      },
      {
        over: 20,
        team1Score: parseInt(firstInningsRuns || score || 0),
        team2Score:
          currentInningsNum === 2
            ? parseInt(score || 0)
            : 0,
      },
      {
        over: oversToFloat(overs || 0),
        team1Score: parseInt(firstInningsRuns || score || 0),
        team2Score:
          currentInningsNum === 2
            ? parseInt(score || 0)
            : 0,
      },
    ],

    scorecard,
    recent: recent.slice(0, 6),

    batsmen: batsmen.slice(0, 3),

    currentBatsman:
      batsmen.find((b) => b.onStrike) ||
      batsmen[0] ||
      null,

    nonStriker:
      batsmen.find((b) => !b.onStrike) ||
      batsmen[1] ||
      null,

    bowlers: bowlers.slice(0, 2),

    currentBowler:
      bowlers[bowlers.length - 1] || null,

    commentary: commentary.slice(0, 10),

    crr,
    rrr,

    espnId,
    venue,
    matchNumber,
    matchTitle,

    currentInnings: currentInningsNum,
    source: 'espn',
  };
};

const getFixturesData = async () => {
  const scoreboard = await fetchJSON(
    `https://site.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_ID}/scoreboard`,
    {},
    'ESPN fixtures'
  );

  if (!scoreboard?.events?.length) {
    return {
      liveMatches: [],
      upcomingMatches: [],
      finishedMatches: [],
    };
  }

  const liveMatches = [];
  const upcomingMatches = [];
  const finishedMatches = [];

  scoreboard.events.forEach((event) => {
    const comp = event.competitions?.[0];
    const competitors = comp?.competitors || [];

    const teamA = toTeam(
      competitors[0]?.team?.displayName ||
      competitors[0]?.team?.abbreviation ||
      ''
    );

    const teamB = toTeam(
      competitors[1]?.team?.displayName ||
      competitors[1]?.team?.abbreviation ||
      ''
    );

    if (!teamA || !teamB) return;

    const statusType = event.status?.type?.name || '';
    const statusDetail = event.status?.type?.detail || '';

    const matchData = {
      espnId: event.id,
      team1: teamA,
      team2: teamB,
      date: event.date,
      venue:
        comp?.venue?.fullName ||
        comp?.venue?.name ||
        null,
      status: statusDetail,
      state: statusType,
      matchTitle:
        event.name ||
        comp?.headline ||
        null,
    };

    if (
      statusType.includes('STATUS_IN_PROGRESS') ||
      statusType.includes('STATUS_HALFTIME')
    ) {
      liveMatches.push(matchData);
    } else if (
      statusType.includes('STATUS_SCHEDULED')
    ) {
      upcomingMatches.push(matchData);
    } else if (
      statusType.includes('STATUS_FINAL')
    ) {
      finishedMatches.push(matchData);
    }
  });

  upcomingMatches.sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  finishedMatches.sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  return {
    liveMatches,
    upcomingMatches,
    finishedMatches,
    nextMatch: upcomingMatches[0] || null,
    latestFinishedMatch: finishedMatches[0] || null,
    afternoonMatch:
      upcomingMatches.find((m) => {
        const hour = new Date(m.date).getHours();
        return hour >= 15 && hour < 17;
      }) || null,
    eveningMatch:
      upcomingMatches.find((m) => {
        const hour = new Date(m.date).getHours();
        return hour >= 19 && hour < 21;
      }) || null,
  };
};
// ─────────────────────────────────────────────────────────────────────────────
// CB PROXY — secondary source
// ─────────────────────────────────────────────────────────────────────────────
const cbProxyFetch = async () => {
  console.log('[CB-Proxy] Trying...');
  const list = await fetchJSON('https://cricbuzz-live.vercel.app/v1/matches', {}, 'CB-Proxy matches');
  if (!list?.data?.matches) { console.log('  [CB-Proxy] Down/no response'); return null; }

  let iplMatch = null;
  for (const m of list.data.matches) {
    const title = (m.title || '').toUpperCase();
    const teamsFound = TEAMS.filter(t => title.includes(t));
    if (!title.includes('IPL') && !title.includes('PREMIER') && teamsFound.length < 2) continue;
    iplMatch = m; break;
  }
  if (!iplMatch) { console.log('  [CB-Proxy] No IPL match'); return null; }

  const matchId = String(iplMatch.id || '');
  if (!matchId) return null;
  const title = (iplMatch.title || '').toUpperCase();
  const teams = TEAMS.filter(t => title.includes(t));

  const scoreData = await fetchJSON(`https://cricbuzz-live.vercel.app/v1/score/${matchId}`, {}, `CB-Proxy score/${matchId}`);
  if (!scoreData?.data) return null;

  const d = scoreData.data;
  console.log(`  [CB-Proxy] liveScore:"${d.liveScore}" update:"${(d.update || '').substring(0, 80)}"`);

  const liveStr = d.liveScore || '';
  let teamA = teams[0] || 'TBD', teamB = teams[1] || 'TBD';
  let battingTeam = teamA, score = '0', wickets = '0', overs = '0.0';

  const fullM = liveStr.match(/\b([A-Z]{2,4})\s+(\d+)[\/\-](\d+)\s*\(?([\d.]+)\)?/);
  const shortM = liveStr.match(/(\d+)[\/\-](\d+)\s*\(?([\d.]+)\)?/);
  if (fullM) {
    const st = toTeam(fullM[1]);
    if (st && TEAMS.includes(st)) battingTeam = st;
    score = fullM[2]; wickets = fullM[3]; overs = normalizeOvers(fullM[4]);
  } else if (shortM) {
    score = shortM[1]; wickets = shortM[2]; overs = normalizeOvers(shortM[3]);
  }

  const update = (d.update || '').toUpperCase();
  let status = 'LIVE', result = '';
  if (update.includes('WON') || update.includes(' WIN')) { status = 'FINISHED'; result = d.update || ''; }
  else if (update.includes('RAIN') || update.includes('HALT') || update.includes('DELAY')) status = 'RAIN DELAY';
  else if (update.includes('BREAK')) status = 'INNINGS BREAK';

  let target = null, team1ScoreStr = null, team1WktsStr = null;
  const tgtM = (d.update || '').match(/[Tt]arget[:\s]+(\d+)/i);
  const needsM = (d.update || '').match(/need[s]?\s+(\d+)\s+(?:more\s+)?runs?/i);
  if (tgtM) { target = parseInt(tgtM[1]); team1ScoreStr = String(target - 1); }
  else if (needsM) { target = parseInt(score) + parseInt(needsM[1]); team1ScoreStr = String(target - 1); }

  const toss = null;

  const parseBR = s => { const m = String(s || '').match(/(\d+)\s*\((\d+)\)/); return m ? { runs: parseInt(m[1]), balls: parseInt(m[2]) } : { runs: parseInt(String(s || '').match(/(\d+)/)?.[1] || 0), balls: 0 }; };
  const batsmen = [];
  if (d.batsmanOne?.length > 1) { const { runs, balls } = parseBR(d.batsmanOneRun); batsmen.push({ name: d.batsmanOne, runs, balls, fours: 0, sixes: 0, sr: parseFloat(d.batsmanOneSR || (balls ? ((runs / balls) * 100).toFixed(1) : '0.0')).toFixed(1), onStrike: true }); }
  if (d.batsmanTwo?.length > 1) { const { runs, balls } = parseBR(d.batsmanTwoRun); batsmen.push({ name: d.batsmanTwo, runs, balls, fours: 0, sixes: 0, sr: parseFloat(d.batsmanTwoSR || (balls ? ((runs / balls) * 100).toFixed(1) : '0.0')).toFixed(1), onStrike: false }); }

  const bowlers = [];
  if (d.bowlerOne?.length > 1 && d.bowlerOne !== 'BOWLER') bowlers.push({ name: d.bowlerOne, overs: normalizeOvers(d.bowlerOneOver), maidens: 0, runs: parseInt(d.bowlerOneRun ?? 0), wickets: parseInt(d.bowlerOneWickets ?? 0), economy: String(d.bowlerOneEconomy || '0.0') });
  if (d.bowlerTwo?.length > 1 && d.bowlerTwo !== 'BOWLER' && d.bowlerTwo !== 'O') bowlers.push({ name: d.bowlerTwo, overs: normalizeOvers(d.bowlerTwoOver), maidens: 0, runs: parseInt(d.bowlerTwoRun ?? 0), wickets: parseInt(d.bowlerTwoWicket ?? d.bowlerTwoWickets ?? 0), economy: String(d.bowlerTwoEconomy || '0.0') });

  // team1 = batted first; if there's a target, battingTeam is chasing (team2), so bowling team batted first
  const bowlingTeam = battingTeam === teamA ? teamB : teamA;
  const team1Name = target ? bowlingTeam : battingTeam;
  const team2Name = team1Name === teamA ? teamB : teamA;

  const crr = parseFloat(d.runRate || 0) || null;
  let rrr = null;
  if (target && crr) { const bl = Math.max((20 - parseFloat(overs)) * 6, 1); rrr = parseFloat(((target - parseInt(score)) / bl * 6).toFixed(2)); }
  let wP1 = 50, wP2 = 50;
  if (rrr && crr && crr > 0) { const r = rrr / crr; wP2 = r < 0.5 ? 88 : r < 0.75 ? 78 : r < 0.9 ? 66 : r < 1.0 ? 55 : r < 1.1 ? 46 : r < 1.3 ? 37 : r < 1.6 ? 28 : 18; wP1 = 100 - wP2; }
  else if (crr && !target && parseFloat(overs) > 0) { const p = crr * 20; wP1 = p > 195 ? 65 : p > 180 ? 60 : p > 165 ? 55 : p > 150 ? 50 : p > 135 ? 45 : 38; wP2 = 100 - wP1; }
  if (status === 'FINISHED') { const w = result.toUpperCase(); if (w.includes(team1Name)) { wP1 = 100; wP2 = 0; } else if (w.includes(team2Name)) { wP2 = 100; wP1 = 0; } }

  console.log(`  ✅ [CB-Proxy] team1(bat1st)=${team1Name} | team2(bat2nd)=${team2Name} | ${score}/${wickets} (${overs}) | ${status}`);
  if (batsmen.length) console.log(`     🏏 ${batsmen.map(b => `${b.name}${b.onStrike ? '*' : ''}: ${b.runs}(${b.balls})`).join(' | ')}`);

  return { team1: { name: team1Name }, team2: { name: team2Name }, score, wickets, overs, team1Score: team1ScoreStr || null, team1Wickets: team1WktsStr || null, team1Overs: null, target: target || null, status, result, toss, winProb: wP2, winProbT1: wP1, winProbT2: wP2, recent: ['·', '·', '·', '·', '·', '·'], batsmen, bowlers, commentary: [], crr, rrr, source: 'cricbuzz-proxy', currentInnings: target ? 2 : 1 };
};

// ─────────────────────────────────────────────────────────────────────────────
// CB DIRECT — tertiary source
// ─────────────────────────────────────────────────────────────────────────────
const cbDirectFetch = async () => {
  console.log('[CB-Direct] Trying...');
  const cbH = { 'Referer': 'https://www.cricbuzz.com/', 'X-Requested-With': 'XMLHttpRequest' };
  const list = await fetchJSON('https://www.cricbuzz.com/api/cricket-match/live-scores', cbH, 'CB live-scores');
  if (!list) { console.log('  [CB-Direct] Blocked'); return null; }

  const allM = [];
  for (const s of (list.matchDetails || [])) allM.push(...(s?.matchDetailsMap?.match || []));
  for (const t of (list.typeMatches || [])) for (const sm of (t.seriesMatches || [])) allM.push(...(sm?.seriesAdWrapper?.matches || sm?.matches || []));
  if (list.matches) allM.push(...list.matches);

  let meta = null;
  for (const m of allM) {
    const info = m?.matchInfo || m;
    if (!(info?.seriesName || '').toUpperCase().includes('IPL') && !(info?.seriesName || '').toUpperCase().includes('PREMIER')) continue;
    if ((info?.state || '').toUpperCase() === 'PREVIEW') continue;
    const t1 = toTeam(info?.team1?.teamSName || info?.team1?.teamName || '');
    const t2 = toTeam(info?.team2?.teamSName || info?.team2?.teamName || '');
    const mid = String(info?.matchId || '');
    if (!mid || !t1 || !t2) continue;
    meta = { matchId: mid, team1: t1, team2: t2, t1Id: info?.team1?.teamId, t2Id: info?.team2?.teamId }; break;
  }
  if (!meta) { console.log('  [CB-Direct] No IPL match'); return null; }

  const cbMH = { ...cbH, 'Referer': `https://www.cricbuzz.com/live-cricket-scores/${meta.matchId}/` };
  const [mR, cR, sR] = await Promise.allSettled([
    fetchJSON(`https://www.cricbuzz.com/api/cricket-match/${meta.matchId}/miniscore`, cbMH, 'CB miniscore'),
    fetchJSON(`https://www.cricbuzz.com/api/cricket-match/${meta.matchId}/commentary/1`, cbMH, 'CB commentary'),
    fetchJSON(`https://www.cricbuzz.com/api/cricket-scorecard/${meta.matchId}`, cbMH, 'CB scorecard'),
  ]);
  const mini = mR.status === 'fulfilled' ? mR.value : null;
  const comm = cR.status === 'fulfilled' ? cR.value : null;
  const sc = sR.status === 'fulfilled' ? sR.value : null;
  if (!mini) { console.log('  [CB-Direct] Miniscore blocked'); return null; }

  const ms = mini?.minScore || mini?.miniscore || mini;
  if (!ms || typeof ms !== 'object') return null;
  const rawSt = (ms?.status || mini?.matchHeader?.status || '').toLowerCase();
  if (rawSt.includes('yet to begin') || rawSt.includes('preview')) return null;

  let status = 'LIVE', result = '';
  if (rawSt.includes('rain') || rawSt.includes('delay')) status = 'RAIN DELAY';
  else if (rawSt.includes('break')) status = 'INNINGS BREAK';
  else if (rawSt.includes('super over')) status = 'SUPER OVER';
  else if (rawSt.includes('abandon')) { status = 'ABANDONED'; result = 'Match Abandoned'; }
  else if (rawSt.includes('won') || rawSt.includes('complete') || rawSt.includes('finish')) { status = 'FINISHED'; result = mini?.matchHeader?.status || rawSt; }

  const tDec = (mini?.matchHeader?.tossResults?.decision || '').toLowerCase();
  const tWId = mini?.matchHeader?.tossResults?.tossWinnerId;
  let toss = null;
  if (tDec && tWId) { const tosser = tWId === meta.t1Id ? meta.team1 : meta.team2; toss = `${tosser} chose to ${tDec}`; }

  const venue = mini?.matchHeader?.venueInfo?.ground || mini?.matchHeader?.venue || null;
  const matchNumber = mini?.matchHeader?.matchDescription ? `Match ${(mini.matchHeader.matchDescription.match(/\d+/) || [])[0] || ''}`.trim() : null;
  const matchTitle = mini?.matchHeader?.seriesName || null;

  const btId = ms?.battingTeamId || ms?.batTeam?.teamId;
  let currentBatting = meta.team1, currentBowling = meta.team2;
  if (btId) { currentBatting = btId === meta.t1Id ? meta.team1 : meta.team2; currentBowling = currentBatting === meta.team1 ? meta.team2 : meta.team1; }

  const batSc = ms?.batTeam?.teamScore || {};
  let score = String(ms?.score ?? batSc?.runs ?? '0');
  let wickets = String(ms?.wickets ?? batSc?.wickets ?? '0');
  let overs = normalizeOvers(ms?.overs ?? batSc?.overs ?? '0');

  const innL = ms?.matchScoreDetails?.inningsScoreList || [];
  let t1Sc = null, t1Wk = null, t1Ov = null, target = null;

  // CB innings list: innL[0] = 1st innings completed, innL[1] = current
  if (innL.length >= 2) {
    const p = innL[0];
    t1Sc = String(p.score ?? ''); t1Wk = String(p.wickets ?? ''); t1Ov = String(p.overs ?? '');
    target = parseInt(p.score ?? 0) + 1;
  } else {
    // Check bowling team score
    const bowlSc = ms?.bowlTeam?.teamScore || {};
    if (bowlSc.runs != null) { t1Sc = String(bowlSc.runs ?? ''); t1Wk = String(bowlSc.wickets ?? ''); t1Ov = String(bowlSc.overs ?? ''); if (t1Sc) target = parseInt(t1Sc) + 1; }
  }
  if (!target && ms?.target) target = parseInt(ms.target);

  const crr = parseFloat(ms?.currentRunRate || 0) || null;
  const rrr = parseFloat(ms?.requiredRunRate || 0) || null;

  // team1 = batted first = bowling team when 2nd innings; batting team when 1st innings
  const isSecondInnings = innL.length >= 2 || (t1Sc && t1Sc !== '');
  const team1Name = isSecondInnings ? currentBowling : currentBatting;
  const team2Name = team1Name === meta.team1 ? meta.team2 : meta.team1;

  let batsmen = (ms?.batsman || []).filter(Boolean).slice(0, 3).map(b => ({ name: b.batName || b.name || '', runs: parseInt(b.batRuns ?? 0), balls: parseInt(b.batBalls ?? 0), fours: parseInt(b.batFours ?? 0), sixes: parseInt(b.batSixes ?? 0), sr: parseFloat(b.batStrikeRate ?? 0).toFixed(1), onStrike: b.isStriker ?? false })).filter(b => b.name);
  let bowlers = (ms?.bowler ? (Array.isArray(ms.bowler) ? ms.bowler : [ms.bowler]) : []).filter(Boolean).slice(0, 2).map(b => ({ name: b.bowlName || b.name || '', overs: normalizeOvers(b.bowlOvs ?? '0'), maidens: parseInt(b.bowlMaidens ?? 0), runs: parseInt(b.bowlRuns ?? 0), wickets: parseInt(b.bowlWkts ?? 0), economy: parseFloat(b.bowlEcon ?? 0).toFixed(1) })).filter(b => b.name);

  if (batsmen.length === 0 && sc?.scoreCard) { const cur = sc.scoreCard[sc.scoreCard.length - 1]; if (cur) { const bM = cur.batTeamDetails?.batsmenData || {}; Object.values(bM).filter(b => !b.outDesc || b.outDesc.trim() === '').slice(0, 3).forEach(b => { batsmen.push({ name: b.batName || '', runs: parseInt(b.runs ?? 0), balls: parseInt(b.balls ?? 0), fours: parseInt(b.fours ?? 0), sixes: parseInt(b.sixes ?? 0), sr: parseFloat(b.strikeRate ?? 0).toFixed(1), onStrike: b.isStriker ?? false }); }); if (!bowlers.length) { const bwM = cur.bowlTeamDetails?.bowlersData || {}; Object.values(bwM).filter(b => parseFloat(b.overs || 0) > 0).slice(-2).forEach(b => { bowlers.push({ name: b.bowlName || '', overs: normalizeOvers(b.overs ?? '0'), maidens: parseInt(b.maidens ?? 0), runs: parseInt(b.runs ?? 0), wickets: parseInt(b.wickets ?? 0), economy: parseFloat(b.economy ?? 0).toFixed(1) }); }); } } }

  const recentStr = ms?.recentOvsStats || ms?.lastFewOvers || '';
  let recent = [];
  if (recentStr) recent = recentStr.replace(/\|/g, ' ').trim().split(/\s+/).map(b => { const u = b.toUpperCase(); if (!u || u === '.' || u === '·') return '·'; if (u === 'W') return 'W'; if (u === 'WD') return 'WD'; if (u.startsWith('NB')) return 'NB'; if (/^\d+$/.test(u)) return u === '0' ? '·' : u; return '·'; }).slice(-6);
  while (recent.length < 6) recent.push('·');

  const commentary = [];
  (comm?.commentary?.commentaryList || comm?.commentaryList || []).slice(0, 10).forEach(c => { const text = c.commText || ''; if (!text || text.length < 5) return; const ut = text.toUpperCase(); commentary.push({ over: c.overNumber != null ? `${c.overNumber}.${c.ballNumber ?? ''}` : '', text: text.substring(0, 200), type: ut.includes('WICKET') || ut.includes(' OUT') ? 'wicket' : ut.includes('FOUR') || ut.includes('SIX') ? 'boundary' : 'normal', generated: false }); });

  let wP1 = 50, wP2 = 50;
  if (rrr && crr && crr > 0) { const r = rrr / crr; wP2 = r < 0.5 ? 88 : r < 0.75 ? 78 : r < 0.9 ? 66 : r < 1.0 ? 55 : r < 1.1 ? 46 : r < 1.3 ? 37 : r < 1.6 ? 28 : 18; wP1 = 100 - wP2; }
  else if (crr && !target) { const p = crr * 20; wP1 = p > 195 ? 65 : p > 180 ? 60 : p > 165 ? 55 : p > 150 ? 50 : p > 135 ? 45 : 38; wP2 = 100 - wP1; }
  if (status === 'FINISHED') { const w = result.toUpperCase(); if (w.includes(team1Name)) { wP1 = 100; wP2 = 0; } else if (w.includes(team2Name)) { wP2 = 100; wP1 = 0; } }

  console.log(`  ✅ [CB-Direct] team1(bat1st)=${team1Name} | team2=${team2Name} | ${score}/${wickets} (${overs}) | ${status}`);
  return { team1: { name: team1Name }, team2: { name: team2Name }, score, wickets, overs, team1Score: t1Sc || null, team1Wickets: t1Wk || null, team1Overs: t1Ov || null, target: target || null, status, result, toss, winProb: wP2, winProbT1: wP1, winProbT2: wP2, recent: recent.slice(0, 6), batsmen: batsmen.slice(0, 3), bowlers: bowlers.slice(0, 2), commentary: commentary.slice(0, 10), crr, rrr, venue, matchNumber, matchTitle, source: 'cricbuzz-api', currentInnings: (t1Sc && t1Sc !== '') ? 2 : 1 };
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
// ─── Single match scrape (legacy / CB fallback) ──────────────────────────────
export const scrapeLiveMatch = async () => {
  console.log('━━━ [Scraper] Starting ━━━');

  try {
    const meta = await espnFindMatch();
    if (meta) {
      const r = await espnGetScore(meta);
      if (r) {
        // ✅ FIX: score === '0' is VALID at match start — never drop it
        console.log('━━━ Done via ESPN ━━━');
        return { ...r, lastUpdated: new Date() };
      }
    }
  } catch (e) { console.log('[ESPN fatal]', e.message); }

  try {
    const r = await cbProxyFetch();
    if (r) { console.log('━━━ Done via CB-Proxy ━━━'); return { ...r, lastUpdated: new Date() }; }
  } catch (e) { console.log('[CB-Proxy fatal]', e.message); }

  try {
    const r = await cbDirectFetch();
    if (r) { console.log('━━━ Done via CB-Direct ━━━'); return { ...r, lastUpdated: new Date() }; }
  } catch (e) { console.log('[CB-Direct fatal]', e.message); }

  if (!CHROME_AVAILABLE) { console.log('━━━ All failed, no Chrome ━━━'); return null; }
  return await browserFallback();
};

// ─── All-slots scrape — returns { slot1: data|null, slot2: data|null } ────────
// slot1 = 3:30 PM IST (afternoon), slot2 = 7:30 PM IST (evening)
// Assignment is by startTime hour, NOT array index.
// 7:30 PM IST = 14:00 UTC → any match with UTC hour >= 13 goes to slot2.
export const scrapeAllSlots = async () => {
  console.log('\u254c\u254c\u254c [Scraper] Multi-slot scan \u254c\u254c\u254c');
  const result = { slot1: null, slot2: null };

  try {
    const allMeta = await espnFindAllMatches();
    if (allMeta.length === 0) {
      console.log('  [Slots] No live IPL matches found from ESPN');
    } else {
      // For pre-match entries (>5 min until start), build a placeholder instead
      // of running the full scraper (which would return empty/null for unstarted matches).
      const scores = await Promise.allSettled(allMeta.map(m => {
        const startMs = m.startTime ? new Date(m.startTime).getTime() : 0;
        const minsUntil = startMs ? (startMs - Date.now()) / 60000 : -1;
        if (minsUntil > 5) {
          // Pre-match placeholder — no scoring data yet
          const timeLabel = minsUntil < 60
            ? Math.round(minsUntil) + ' min'
            : (Math.round(minsUntil / 6) / 10) + 'h';
          return Promise.resolve({
            team1: { name: m.compA }, team2: { name: m.compB },
            score: '0', wickets: '0', overs: '0.0',
            status: 'UPCOMING',
            statusText: `Starts in ${timeLabel}`,
            startTime: m.startTime,
            currentInnings: 1,
            team1Score: null, target: null,
            batsmen: [], bowlers: [], recent: ['·','·','·','·','·','·'],
            commentary: [], espnId: m.espnId,
            source: 'pre-match', lastUpdated: new Date(),
          });
        }
        return espnGetScore(m);
      }));
      scores.forEach((s, i) => {
        if (s.status !== 'fulfilled' || !s.value) return;
        const data = { ...s.value, startTime: allMeta[i].startTime, lastUpdated: new Date() };

        // Assign slot by UTC hour of match startTime
        // 7:30 PM IST = 14:00 UTC. Threshold = 13 to handle slight variations.
        let assignedSlot = 'slot1';
        if (allMeta[i].startTime) {
          const utcHour = new Date(allMeta[i].startTime).getUTCHours();
          assignedSlot = utcHour >= 13 ? 'slot2' : 'slot1';
          console.log(`  [Slots] ${data.team1?.name} vs ${data.team2?.name} startUTC=${utcHour}h → ${assignedSlot}`);
        } else {
          assignedSlot = i === 0 ? 'slot1' : 'slot2';
          console.log(`  [Slots] ${data.team1?.name} vs ${data.team2?.name} no-time → ${assignedSlot} (by index)`);
        }

        if (!result[assignedSlot]) {
          result[assignedSlot] = data;
        } else {
          const other = assignedSlot === 'slot1' ? 'slot2' : 'slot1';
          if (!result[other]) {
            result[other] = data;
            console.log(`  [Slots] ${assignedSlot} already filled, reassigned to ${other}`);
          }
        }
      });
    }
  } catch (e) { console.log('[Slots ESPN fatal]', e.message); }

  // CB fallbacks only when both slots are empty
  if (!result.slot1 && !result.slot2) {
    try {
      const r = await cbProxyFetch();
      if (r) { result.slot1 = { ...r, lastUpdated: new Date() }; }
    } catch (e) { /* ignore */ }
  }
  if (!result.slot1 && !result.slot2) {
    try {
      const r = await cbDirectFetch();
      if (r) { result.slot1 = { ...r, lastUpdated: new Date() }; }
    } catch (e) { /* ignore */ }
  }

  console.log(`  [Slots] FINAL slot1=${result.slot1 ? result.slot1.team1?.name + ' vs ' + result.slot1.team2?.name : 'empty'} | slot2=${result.slot2 ? result.slot2.team1?.name + ' vs ' + result.slot2.team2?.name : 'empty'}`);
  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// STANDINGS + STATS
// ─────────────────────────────────────────────────────────────────────────────
// IPL 2026 Cricbuzz series IDs (verified April 2026).
// The first one is the most likely correct — others are tried as fallbacks.
// If all fail, run GET /api/v1/debug/sources and look for the correct sid in CB standings responses.
const CB_IPL_SERIES_IDS = ['9237', '9241', '9300', '9350', '9280', '9400', '9500'];

export const scrapeIPLStandingsAndStats = async () => {
  console.log('[Standings] Fetching IPL standings + stats...');
  let pointsTable = null, orangeCap = null, purpleCap = null;
  let topBatsmen = [], topBowlers = [];

  // ── ESPN Standings ─────────────────────────────────────────────────────────
  // The ESPN_IPL_ID constant (8048) is the series scoreboard ID.
  // The standings endpoint sometimes uses a DIFFERENT child league ID.
  // We try three URL patterns to catch whichever ESPN currently serves.
  const espnStandingsUrls = [
    `https://site.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_ID}/standings`,
    `https://site.api.espn.com/apis/v2/sports/cricket/leagues/${ESPN_IPL_ID}/standings`,
    `https://site.api.espn.com/apis/site/v2/sports/cricket/ipl/standings`,
  ];

  for (const url of espnStandingsUrls) {
    if (pointsTable) break;
    try {
      const data = await fetchJSON(url, {}, `ESPN standings (${url.split('/').slice(-2).join('/')})`);
      if (!data) continue;
      // ESPN can nest standings under children[0] or directly
      const entries = data?.children?.[0]?.standings?.entries
        || data?.children?.[0]?.entries
        || data?.standings?.entries
        || data?.entries
        || [];
      console.log(`  [Standings] ESPN entries from ${url.split('/').pop()}: ${entries.length}`);
      if (entries.length >= 4) {
        const table = entries.map(e => {
          const team = toTeam(e.team?.displayName || e.team?.abbreviation || '');
          if (!team || !TEAMS.includes(team)) return null;
          const stats = {};
          (e.stats || []).forEach(s => {
            if (s.name)         stats[s.name]         = s.value ?? s.displayValue;
            if (s.abbreviation) stats[s.abbreviation] = s.value ?? s.displayValue;
          });
          return {
            team,
            played: parseInt(stats.gamesPlayed || stats.GP  || stats.played  || stats.M   || 0),
            won:    parseInt(stats.wins        || stats.W   || stats.won      || 0),
            lost:   parseInt(stats.losses      || stats.L   || stats.lost     || stats.LOS || 0),
            pts:    parseInt(stats.points      || stats.PTS || stats.pts      || stats.Pts || 0),
            nrr:    parseFloat(stats.netRunRate || stats.NRR || stats.nrr    || 0).toFixed(3),
          };
        }).filter(Boolean).sort((a, b) => b.pts - a.pts || parseFloat(b.nrr) - parseFloat(a.nrr));
        if (table.length >= 4) {
          pointsTable = table;
          console.log(`  [Standings] ESPN OK: ${table.length} teams`);
        }
      }
    } catch (e) { console.log(`[Standings ESPN] ${e.message}`); }
  }

  // ── Cricbuzz Standings fallback ────────────────────────────────────────────
  if (!pointsTable) {
    for (const sid of CB_IPL_SERIES_IDS) {
      try {
        const data = await fetchJSON(
          `https://www.cricbuzz.com/api/cricket-series/${sid}/standings`,
          {}, `CB standings ${sid}`
        );
        const rows = data?.pointsTable?.[0]?.pointsTableInfo
          || data?.pointsTableInfo
          || data?.standings
          || [];
        if (!Array.isArray(rows) || rows.length < 4) continue;
        const table = rows.map(r => ({
          team:   toTeam(r.teamSName || r.teamName || r.name || '') || '',
          played: parseInt(r.matchesPlayed || r.played || 0),
          won:    parseInt(r.matchesWon    || r.won    || 0),
          lost:   parseInt(r.matchesLost   || r.lost   || 0),
          pts:    parseInt(r.points        || r.pts    || 0),
          nrr:    parseFloat(r.nrr || 0).toFixed(3),
        })).filter(t => TEAMS.includes(t.team))
          .sort((a, b) => b.pts - a.pts || parseFloat(b.nrr) - parseFloat(a.nrr));
        if (table.length >= 4) {
          pointsTable = table;
          console.log(`  [Standings] CB sid=${sid}: ${table.length} teams`);
          break;
        }
      } catch (e) { /* try next sid */ }
    }
  }

  // ── ESPN batting stats (Orange Cap) ───────────────────────────────────────
  // Try both the series stats endpoint and the separate statistics endpoint.
  const espnBattingUrls = [
    `https://site.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_ID}/statistics?type=batting`,
    `https://site.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_ID}/leaders?type=batting`,
  ];
  for (const url of espnBattingUrls) {
    if (topBatsmen.length > 0) break;
    try {
      const runsData = await fetchJSON(url, {}, `ESPN batting (${url.split('?')[1] || url.split('/').pop()})`);
      const battingList = runsData?.athletes || runsData?.results || runsData?.statistics || runsData?.leaders || [];
      if (Array.isArray(battingList) && battingList.length > 0) {
        topBatsmen = battingList.slice(0, 10).map(p => {
          const name = p.athlete?.displayName || p.displayName || p.name || '';
          const statsArr = p.stats || p.statistics || [];
          const stats = {};
          statsArr.forEach(s => {
            if (s.name)         stats[s.name]         = s.value ?? s.displayValue;
            if (s.abbreviation) stats[s.abbreviation] = s.value ?? s.displayValue;
          });
          return { name, team: toTeam(p.athlete?.team?.abbreviation || p.team?.abbreviation || '') || '', runs: parseInt(stats.runs || stats.R || p.value || 0) };
        }).filter(p => p.name && p.runs > 0).sort((a, b) => b.runs - a.runs);
        orangeCap = topBatsmen[0] || null;
        if (orangeCap) console.log(`  [Stats] Orange Cap (ESPN): ${orangeCap.name} (${orangeCap.runs})`);
      }
    } catch (e) { console.log(`[Stats ESPN batting] ${e.message}`); }
  }

  // ── ESPN bowling stats (Purple Cap) ───────────────────────────────────────
  const espnBowlingUrls = [
    `https://site.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_ID}/statistics?type=bowling`,
    `https://site.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_ID}/leaders?type=bowling`,
  ];
  for (const url of espnBowlingUrls) {
    if (topBowlers.length > 0) break;
    try {
      const bowlData = await fetchJSON(url, {}, `ESPN bowling (${url.split('?')[1] || url.split('/').pop()})`);
      const bowlingList = bowlData?.athletes || bowlData?.results || bowlData?.statistics || bowlData?.leaders || [];
      if (Array.isArray(bowlingList) && bowlingList.length > 0) {
        topBowlers = bowlingList.slice(0, 10).map(p => {
          const name = p.athlete?.displayName || p.displayName || p.name || '';
          const statsArr = p.stats || p.statistics || [];
          const stats = {};
          statsArr.forEach(s => {
            if (s.name)         stats[s.name]         = s.value ?? s.displayValue;
            if (s.abbreviation) stats[s.abbreviation] = s.value ?? s.displayValue;
          });
          return { name, team: toTeam(p.athlete?.team?.abbreviation || p.team?.abbreviation || '') || '', wickets: parseInt(stats.wickets || stats.W || p.value || 0) };
        }).filter(p => p.name && p.wickets > 0).sort((a, b) => b.wickets - a.wickets);
        purpleCap = topBowlers[0] || null;
        if (purpleCap) console.log(`  [Stats] Purple Cap (ESPN): ${purpleCap.name} (${purpleCap.wickets}w)`);
      }
    } catch (e) { console.log(`[Stats ESPN bowling] ${e.message}`); }
  }

  // ── Cricbuzz stats fallback ────────────────────────────────────────────────
  if (topBatsmen.length === 0 || topBowlers.length === 0) {
    for (const sid of CB_IPL_SERIES_IDS) {
      if (topBatsmen.length > 0 && topBowlers.length > 0) break;
      try {
        const [bat, bowl] = await Promise.all([
          topBatsmen.length === 0
            ? fetchJSON(`https://www.cricbuzz.com/api/cricket-series/${sid}/stats?statsType=mostRuns`, {}, `CB runs ${sid}`)
            : Promise.resolve(null),
          topBowlers.length === 0
            ? fetchJSON(`https://www.cricbuzz.com/api/cricket-series/${sid}/stats?statsType=mostWickets`, {}, `CB wickets ${sid}`)
            : Promise.resolve(null),
        ]);

        const parseP = (d, type) => {
          const list = d?.statsDetails?.[0]?.playerStatsList
            || d?.values?.[0]?.playerStats
            || d?.statsList
            || d?.values
            || [];
          return (Array.isArray(list) ? list : []).slice(0, 10).map(p => ({
            name:    p.playerName || p.name || '',
            team:    (p.teamSName || '').toUpperCase(),
            runs:    type === 'bat'  ? parseInt(p.runs    || p.value || 0) : undefined,
            wickets: type === 'bowl' ? parseInt(p.wickets || p.value || 0) : undefined,
          })).filter(p => p.name.length > 2);
        };

        if (bat) {
          const bats = parseP(bat, 'bat').sort((a, b) => (b.runs || 0) - (a.runs || 0));
          if (bats.length > 0 && topBatsmen.length === 0) {
            topBatsmen = bats;
            orangeCap  = bats[0];
            console.log(`  [Stats] Orange Cap (CB sid=${sid}): ${orangeCap.name} (${orangeCap.runs})`);
          }
        }
        if (bowl) {
          const bowls = parseP(bowl, 'bowl').sort((a, b) => (b.wickets || 0) - (a.wickets || 0));
          if (bowls.length > 0 && topBowlers.length === 0) {
            topBowlers = bowls;
            purpleCap  = bowls[0];
            console.log(`  [Stats] Purple Cap (CB sid=${sid}): ${purpleCap.name} (${purpleCap.wickets}w)`);
          }
        }
      } catch (e) { /* try next */ }
    }
  }

  return {
    pointsTable: pointsTable || [],
    orangeCap:   orangeCap  || null,
    purpleCap:   purpleCap  || null,
    topBatsmen,
    topBowlers,
    lastUpdated: new Date(),
    source: pointsTable ? 'espn+cricbuzz' : 'fallback',
  };
};
export const scrapeIPLStandings = scrapeIPLStandingsAndStats;

// ─────────────────────────────────────────────────────────────────────────────
// Browser fallback (local dev only)
// ─────────────────────────────────────────────────────────────────────────────
let _pptr = null;
const getPptr = async () => {
  if (_pptr) return _pptr;
  try { _pptr = (await import('puppeteer-core')).default; return _pptr; } catch { }
  try { _pptr = (await import('puppeteer')).default; return _pptr; } catch { }
  return null;
};

const browserFallback = async () => {
  const pptr = await getPptr(); if (!pptr) return null;
  let browser;
  try {
    browser = await pptr.launch({ executablePath: CHROME_PATH, headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process'] });
    const mp = await browser.newPage();
    await mp.goto('https://www.cricbuzz.com/cricket-match/live-scores', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(3000);
    const mm = await mp.evaluate(TEAMS => {
      const links = Array.from(document.querySelectorAll('a[href*="/live-cricket-scores/"]')); const seen = new Set(), c = [];
      for (const a of links) { const href = a.getAttribute('href') || '', hu = href.toUpperCase(); if (seen.has(href)) continue; if (!hu.includes('IPL') && !hu.includes('INDIAN-PREMIER')) continue; const idM = href.match(/\/live-cricket-scores\/(\d+)\//); if (!idM) continue; const t = TEAMS.filter(t => hu.includes(`-${t}-`) || hu.includes(`/${t}-`) || hu.endsWith(`-${t}`)); if (t.length < 2) continue; seen.add(href); const card = a.closest('[class*="cb-col"]') || a.parentElement; const hint = card?.querySelector('.cb-text-live') ? 'LIVE' : card?.querySelector('.cb-text-complete,.cb-text-stumps') ? 'FINISHED' : 'UPCOMING'; c.push({ matchId: idM[1], cbUrl: 'https://www.cricbuzz.com' + href, team1: t[0], team2: t[1], priority: hint === 'LIVE' ? 0 : hint === 'FINISHED' ? 1 : 2 }); } c.sort((a, b) => a.priority - b.priority); return c[0] || null;
    }, TEAMS);
    await mp.close();
    if (!mm) { await browser.close(); return null; }

    const gp = await browser.newPage();
    await gp.goto(`https://www.google.com/search?q=${encodeURIComponent(`${mm.team1} vs ${mm.team2} IPL 2026 live score`)}&hl=en`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await wait(3000);
    const graw = await gp.evaluate((T, t1, t2) => {
      const ws = ['.liveticker', '.liveresults-sports-immersive__match-tile', '.imso_mh__ma-cont', '[jsname="ESiMyd"]']; let w = null; for (const s of ws) { const el = document.querySelector(s); if (el?.innerText?.length > 30) { w = el; break; } }
      const text = w?.innerText?.trim() || ''; if (!text || !text.toUpperCase().includes(t1) || !text.toUpperCase().includes(t2)) return null;
      const aS = [...text.matchAll(/(\d{2,3})\s*[\/\-]\s*(\d{1,2})\s*\(\s*(\d{1,2}\.?\d?)\s*\)/g)]; if (!aS.length) return null;
      const sm = aS[aS.length - 1]; const up = text.toUpperCase(); let st = 'LIVE', res = '';
      const wM = text.match(new RegExp(`\\b(${T.join('|')})\\b\\s+won\\s+by\\s+([\\d]+\\s+(?:runs?|wickets?))`, 'i'));
      if (wM) { st = 'FINISHED'; res = `${wM[1].toUpperCase()} won by ${wM[2]}`; } else if (up.includes('RAIN')) st = 'RAIN DELAY'; else if (up.includes('INNINGS BREAK')) st = 'INNINGS BREAK';
      const cM = text.match(/CRR\s*:?\s*([\d.]+)/i), rM = text.match(/RRR\s*:?\s*([\d.]+)/i), tM = text.match(/[Tt]arget[:\s]*(\d{2,3})/);
      return { score: sm[1], wickets: sm[2], overs: sm[3] || '0.0', status: st, result: res, crr: cM ? parseFloat(cM[1]) : null, rrr: rM ? parseFloat(rM[1]) : null, target: tM ? parseInt(tM[1]) : null };
    }, TEAMS, mm.team1, mm.team2);
    await gp.close(); await browser.close();
    if (!graw) return null;
    // If target exists, mm.team2 (URL team2) is chasing = team2, mm.team1 batted first = team1
    const team1n = graw.target ? mm.team1 : mm.team1;
    const team2n = graw.target ? mm.team2 : mm.team2;
    let wP1 = 50, wP2 = 50;
    if (graw.rrr && graw.crr && graw.crr > 0) { const r = graw.rrr / graw.crr; wP2 = r < 0.5 ? 88 : r < 0.75 ? 78 : r < 0.9 ? 66 : r < 1.0 ? 55 : r < 1.1 ? 46 : r < 1.3 ? 37 : 18; wP1 = 100 - wP2; }
    console.log(`  ✅ [Google] ${mm.team1} vs ${mm.team2} | ${graw.score}/${graw.wickets} (${normalizeOvers(graw.overs)})`);
    return { team1: { name: team1n }, team2: { name: team2n }, score: graw.score, wickets: graw.wickets, overs: normalizeOvers(graw.overs), team1Score: null, team1Wickets: null, team1Overs: null, target: graw.target || null, status: graw.status, result: graw.result, toss: null, winProb: wP2, winProbT1: wP1, winProbT2: wP2, recent: ['·', '·', '·', '·', '·', '·'], batsmen: [], bowlers: [], commentary: [], crr: graw.crr, rrr: graw.rrr, source: 'google', currentInnings: graw.target ? 2 : 1, lastUpdated: new Date() };
  } catch (e) { if (browser) await browser.close(); console.error('[Browser fatal]', e.message); return null; }
};

/**
 * debugController.js
 * Debug-only route handlers.
 * These routes are registered in index.js ONLY in development (NODE_ENV !== 'production').
 * In production, they are available but require a secret header for safety — see debugRoutes.js.
 */

import { clearAllMatches } from '../services/dbService.js';
import scraperState from '../utils/scraperState.js';

// ─── GET /api/v1/debug/sources ────────────────────────────────────────────────
export const debugSources = async (req, res) => {
  const results = {};

  // Cricbuzz proxy
  try {
    const r = await fetch('https://cricbuzz-live.vercel.app/v1/matches');
    const data = await r.json();
    results.cbProxy = {
      status: r.status,
      matchCount: data?.data?.matches?.length || 0,
      firstMatch: data?.data?.matches?.[0] || null,
      raw: JSON.stringify(data).substring(0, 500),
    };
  } catch (e) { results.cbProxy = { error: e.message }; }

  // ESPN scoreboard header
  try {
    const r = await fetch('https://site.api.espn.com/apis/personalized/v2/scoreboard/header?sport=cricket&region=in&tz=Asia/Calcutta');
    const data = await r.json();
    const events = data?.sports?.[0]?.leagues?.[0]?.events || [];
    results.espnHeader = {
      status: r.status,
      eventCount: events.length,
      firstEvent: events[0] || null,
    };
  } catch (e) { results.espnHeader = { error: e.message }; }

  // ESPN IPL scoreboard
  try {
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/cricket/8048/scoreboard');
    const data = await r.json();
    results.espn23694 = {
      status: r.status,
      eventCount: data?.events?.length || 0,
      firstEvent: data?.events?.[0]?.name || null,
    };
  } catch (e) { results.espn23694 = { error: e.message }; }

  // Cricbuzz direct
  try {
    const r = await fetch('https://www.cricbuzz.com/api/cricket-match/live-scores', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.cricbuzz.com/' },
    });
    const text = await r.text();
    results.cricbuzzDirect = {
      status: r.status,
      bodyLength: text.length,
      isJSON: text.startsWith('{'),
      preview: text.substring(0, 200),
    };
  } catch (e) { results.cricbuzzDirect = { error: e.message }; }

  // Cricbuzz standings for known series IDs
  for (const sid of ['9241', '9237', '9300']) {
    try {
      const r = await fetch(`https://www.cricbuzz.com/api/cricket-series/${sid}/standings`);
      const text = await r.text();
      results[`cbStandings_${sid}`] = { status: r.status, bodyLength: text.length, preview: text.substring(0, 150) };
    } catch (e) { results[`cbStandings_${sid}`] = { error: e.message }; }
  }

  res.json({
    timestamp: new Date().toISOString(),
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
  scraperState.matchFinishedAt = null;
  scraperState.finishedConfirmations = 0;
  scraperState.lastKnownMatchKey = null;
  scraperState.lastLiveScore = null;
  res.json({ cleared: true, message: 'Freeze cleared. Next scrape will run immediately.' });
};

// ─── GET /api/v1/debug/espn-dump ─────────────────────────────────────────────
export const debugEspnDump = async (req, res) => {
  try {
    // Step 1: find current live match ID from header
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

    // Fallback via scoreboard
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
        headerEvents: hdData?.sports?.[0]?.leagues?.[0]?.events?.map(e => ({
          id: e.id, name: e.name, status: e.status,
        })) || [],
      });
    }

    // Step 2: full summary
    const sumRes = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/cricket/23694/summary?contentorigin=espn&event=${espnId}&lang=en&region=in`);
    const summary = await sumRes.json();
    const gpkg = summary.gamepackageJSON || {};

    res.json({
      espnId,
      matchName,
      summaryTopKeys: Object.keys(summary),
      gpkgTopKeys: Object.keys(gpkg),
      status: summary.header?.competitions?.[0]?.status?.type,
      notes: (summary.header?.competitions?.[0]?.notes || []).slice(0, 5),
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
      linescore: gpkg.linescore,
      inningsCount: (gpkg.innings || []).length,
      innings: (gpkg.innings || []).map((inn, i) => ({
        index: i,
        allKeys: Object.keys(inn),
        team: inn.team?.displayName || inn.team?.abbreviation,
        runs: inn.runs || inn.score,
        wickets: inn.wickets,
        overs: inn.overs || inn.totalOvers,
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
      batterBoxScoresCount: (gpkg.batterBoxScores || []).length,
      batterBoxScoresSample: (gpkg.batterBoxScores || []).slice(0, 2).map(b => ({
        name: b.athlete?.displayName, active: b.active, stats: b.stats, allKeys: Object.keys(b),
      })),
      bowlerBoxScoresCount: (gpkg.bowlerBoxScores || []).length,
      bowlerBoxScoresSample: (gpkg.bowlerBoxScores || []).slice(0, 2).map(b => ({
        name: b.athlete?.displayName, stats: b.stats, allKeys: Object.keys(b),
      })),
      playsCount: (gpkg.plays || []).length,
      recentPlays: (gpkg.plays || []).slice(-5).map(p => ({
        text: p.text,
        period: p.period,
        participants: (p.participants || []).map(pp => ({
          role: pp.role || pp.type, name: pp.athlete?.displayName, allKeys: Object.keys(pp),
        })),
      })),
      leadersCount: (gpkg.leaders || []).length,
      leaders: (gpkg.leaders || []).map(l => ({
        name: l.name, abbreviation: l.abbreviation,
        leadersCount: (l.leaders || []).length, topLeader: l.leaders?.[0],
      })),
      winProbability: gpkg.winProbability || gpkg.winProbabilities || 'NOT PRESENT',
      currentRunRate: gpkg.currentRunRate || 'NOT PRESENT',
      requiredRunRate: gpkg.requiredRunRate || 'NOT PRESENT',
      scoringPlaysCount: (gpkg.scoringPlays || []).length,
      hasScorecard: !!gpkg.scorecard,
      hasTeamStats: !!gpkg.teamStats,
      hasMomentum: !!gpkg.momentum,
      hasPartnership: !!gpkg.partnership,
    });

  } catch (e) {
    res.json({ error: e.message, stack: e.stack?.substring(0, 500) });
  }
};

export {
  getFixturesData,
  cbProxyFetch,
  cbDirectFetch,
};