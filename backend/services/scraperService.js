/**
 * scraperService.js — High-Performance Pure ESPN REST Edge Scraper
 *
 * Eliminates:
 *  - Puppeteer / Headless Chrome (Prevents 512MB RAM server crashes)
 *  - Dead Vercel proxies and broken web scrapers
 *
 * Targets:
 *  - ESPN Edge REST Scoreboard: site.api.espn.com/apis/site/v2/sports/cricket/{LEAGUE_ID}/scoreboard
 *  - ESPN Edge Cricket Header: site.api.espn.com/apis/personalized/v2/scoreboard/header?sport=cricket&region=in
 */

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/cricket';
const ESPN_HEADER = 'https://site.api.espn.com/apis/personalized/v2/scoreboard/header?sport=cricket&region=in&tz=Asia/Calcutta';
const ESPN_LEAGUE_ID = process.env.ESPN_LEAGUE_ID || '8048'; // ESPN Tournament Series ID

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache'
};

const fetchJson = async (url, ms = 8000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Normalizes overs string (e.g. 19.6 -> 20.0, 15 -> 15.0)
 */
export const normalizeOvers = (raw) => {
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

/**
 * Parses raw ESPN event JSON into our Match model format
 */
export const parseEspnEvent = (ev) => {
  if (!ev) return null;
  const comp = ev.competitions?.[0] || {};
  const competitors = comp?.competitors || [];

  const team1Raw = competitors[0] || {};
  const team2Raw = competitors[1] || {};

  const t1Name = team1Raw.team?.abbreviation || team1Raw.team?.name || 'TBA';
  const t2Name = team2Raw.team?.abbreviation || team2Raw.team?.name || 'TBA';

  const statusName = (ev.status?.type?.name || 'UPCOMING').toUpperCase();
  const statusState = ev.status?.type?.state || 'pre'; // 'pre', 'in', 'post'

  let mappedStatus = 'UPCOMING';
  if (statusState === 'in') mappedStatus = 'LIVE';
  if (statusState === 'post') mappedStatus = 'FINISHED';
  if (statusName.includes('RAIN') || statusName.includes('DELAY')) mappedStatus = 'RAIN DELAY';
  if (statusName.includes('BREAK')) mappedStatus = 'INNINGS BREAK';
  if (statusName.includes('SUPER OVER')) mappedStatus = 'SUPER OVER';

  const liveInnings = comp?.innings || [];
  const currentInn = liveInnings[liveInnings.length - 1] || null;
  const firstInn = liveInnings[0] || null;

  const score = currentInn?.runs != null ? currentInn.runs : (competitors.find(c => c.isBatting)?.score || '0');
  const wickets = currentInn?.wickets != null ? currentInn.wickets : 0;
  const overs = normalizeOvers(currentInn?.overs ?? 0);

  // Situation data (win probabilities, targets, active batsmen/bowlers)
  const situation = comp?.situation || {};
  const currentBatsmen = (situation.batterBoxScores || []).slice(0, 2).map(b => ({
    name: b.athlete?.shortName || b.athlete?.displayName || 'Batter',
    playerId: b.athlete?.id ? `espn_${b.athlete.id}` : null,
    runs: b.runs || 0,
    balls: b.balls || 0,
    fours: b.fours || 0,
    sixes: b.sixes || 0,
    sr: b.strikeRate ? String(b.strikeRate) : '0.0',
    onStrike: b.active ?? false
  }));

  const currentBowlers = (situation.bowlerBoxScores || []).slice(0, 1).map(bw => ({
    name: bw.athlete?.shortName || bw.athlete?.displayName || 'Bowler',
    playerId: bw.athlete?.id ? `espn_${bw.athlete.id}` : null,
    overs: normalizeOvers(bw.overs || 0),
    maidens: bw.maidens || 0,
    runs: bw.runs || 0,
    wickets: bw.wickets || 0,
    economy: bw.economy ? String(bw.economy) : '0.00'
  }));

  const recent = situation.recentBalls || ['·', '·', '·', '·', '·', '·'];

  return {
    espnId: String(ev.id),
    espnEventId: String(ev.id),
    matchTitle: ev.name || `${t1Name} vs ${t2Name}`,
    matchNumber: ev.shortName || null,
    startTime: ev.date,
    venue: comp?.venue?.fullName || 'TBA',
    city: comp?.venue?.address?.city || 'TBA',
    team1: { name: t1Name },
    team2: { name: t2Name },
    teamA: t1Name,
    teamB: t2Name,
    status: mappedStatus,
    toss: comp?.toss ? comp.toss : null,
    score: String(score),
    wickets: String(wickets),
    overs,
    team1Score: firstInn && liveInnings.length > 1 ? `${firstInn.runs}/${firstInn.wickets}` : null,
    team1Wickets: firstInn && liveInnings.length > 1 ? firstInn.wickets : null,
    team1Overs: firstInn && liveInnings.length > 1 ? normalizeOvers(firstInn.overs) : null,
    target: situation.target || null,
    crr: situation.currentRunRate || null,
    rrr: situation.requiredRunRate || null,
    recent: recent.slice(-6),
    batsmen: currentBatsmen,
    bowlers: currentBowlers,
    winProbT1: situation.winProbability?.homeWinPercentage || 50,
    winProbT2: situation.winProbability?.awayWinPercentage || 50,
    result: comp?.status?.type?.detail || null,
    winner: comp?.winner ? (comp.winner === team1Raw.id ? t1Name : t2Name) : null,
    currentInnings: liveInnings.length > 1 ? 2 : 1
  };
};

/**
 * Discovers and parses all IPL matches currently in ESPN feed
 */
export const fetchEspnLiveMatches = async () => {
  try {
    const data = await fetchJson(`${ESPN_BASE}/${ESPN_LEAGUE_ID}/scoreboard`);
    const events = data?.events || [];
    return events.map(parseEspnEvent).filter(Boolean);
  } catch (err) {
    try {
      const header = await fetchJson(ESPN_HEADER);
      const leagues = header?.sports?.[0]?.leagues || [];
      const ipl = leagues.find(l =>
        l.slug?.includes('ipl') ||
        l.name?.toLowerCase().includes('indian premier league') ||
        l.id === ESPN_LEAGUE_ID
      );
      return (ipl?.events || []).map(parseEspnEvent).filter(Boolean);
    } catch (e) {
      console.warn('[ScraperService] All ESPN fetches failed:', e.message);
      return [];
    }
  }
};

export const espnFindAllMatches = fetchEspnLiveMatches;

/**
 * Scrapes all match slots (Slot 1 = 3:30 PM, Slot 2 = 7:30 PM)
 */
export const scrapeAllSlots = async () => {
  const matches = await fetchEspnLiveMatches();
  const res = { slot1: null, slot2: null };

  for (const m of matches) {
    const startHourUTC = m.startTime ? new Date(m.startTime).getUTCHours() : 14;
    if (startHourUTC < 12) {
      res.slot1 = m;
    } else {
      res.slot2 = m;
    }
  }
  return res;
};

/**
 * Scrapes single active live match
 */
export const scrapeLiveMatch = async () => {
  const { slot1, slot2 } = await scrapeAllSlots();
  if (slot1?.status === 'LIVE') return slot1;
  if (slot2?.status === 'LIVE') return slot2;
  return slot1 || slot2 || null;
};

/**
 * Fetches latest finished match scorecard
 */
export const scrapeLatestCompletedMatch = async () => {
  const matches = await fetchEspnLiveMatches();
  const finished = matches.filter(m => m.status === 'FINISHED');
  if (finished.length > 0) {
    return finished[finished.length - 1];
  }
  return null;
};

/**
 * Standings and stats
 */
export const scrapeIPLStandingsAndStats = async () => {
  try {
    const data = await fetchJson(`${ESPN_BASE}/${ESPN_LEAGUE_ID}/standings`);
    return data || null;
  } catch {
    return null;
  }
};

export const debugSources = async (req, res) => {
  try {
    const data = await fetchEspnLiveMatches();
    res.json({ status: 'ok', count: data.length, matches: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};