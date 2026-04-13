/**
 * scraperService.js — DIAGNOSTIC + MULTI-SOURCE VERSION
 *
 * KEY CHANGES:
 * 1. Verbose HTTP logging — every request logged with response status + body preview
 * 2. cricbuzz-live.vercel.app as PRIMARY (Vercel proxy, never IP-blocked)
 * 3. ESPN correct IPL ID = 23694 (not 8039)
 * 4. ESPN personalized header endpoint as discovery
 * 5. Multiple fallback chains
 */

import https from 'https';
import http  from 'http';
import { existsSync } from 'fs';

const TEAMS = ['CSK','MI','RCB','KKR','RR','PBKS','DC','GT','LSG','SRH'];
const wait  = ms => new Promise(r => setTimeout(r, ms));
const ESPN_IPL_ID = '23694';

// Chrome detection
const CHROME_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : null,
].filter(Boolean);
const CHROME_PATH = CHROME_PATHS.find(p => { try { return existsSync(p); } catch { return false; } }) || null;
const CHROME_AVAILABLE = !!CHROME_PATH;

// ─── Verbose HTTP fetch ───────────────────────────────────────────────────────
const fetchRaw = (url, extraHeaders = {}, timeoutMs = 12000) => new Promise((resolve, reject) => {
  const lib = url.startsWith('https') ? https : http;
  const req = lib.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      'Accept': 'application/json, text/html, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      ...extraHeaders,
    },
    timeout: timeoutMs,
  }, res => {
    if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
      return fetchRaw(res.headers.location, extraHeaders, timeoutMs).then(resolve).catch(reject);
    }
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => resolve({ status: res.statusCode, body: data }));
  });
  req.on('error', reject);
  req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
});

const fetchJSON = async (url, extraHeaders = {}, label = '') => {
  const tag = label || url.substring(0, 55);
  try {
    const { status, body } = await fetchRaw(url, extraHeaders);
    if (status !== 200) {
      console.log(`  [HTTP ${status}] ${tag}`);
      return null;
    }
    if (!body || body.length < 5) {
      console.log(`  [EMPTY] ${tag}`);
      return null;
    }
    if (!body.trim().startsWith('{') && !body.trim().startsWith('[')) {
      console.log(`  [NOT JSON ${status}] ${tag} → ${body.substring(0, 80)}`);
      return null;
    }
    const parsed = JSON.parse(body);
    console.log(`  [OK ${status}] ${tag} (${body.length} bytes)`);
    return parsed;
  } catch(e) {
    console.log(`  [ERR] ${tag} → ${e.message}`);
    return null;
  }
};

// Team name resolver
const toTeam = (s = '') => {
  const u = s.toUpperCase();
  const direct = TEAMS.find(t => u === t);
  if (direct) return direct;
  const map = {
    'SUPER KINGS':'CSK','MUMBAI INDIANS':'MI','MUMBAI':'MI',
    'ROYAL CHALLENGERS':'RCB','CHALLENGERS':'RCB','BANGALORE':'RCB',
    'KNIGHT RIDERS':'KKR','KOLKATA':'KKR',
    'RAJASTHAN ROYALS':'RR','RAJASTHAN':'RR',
    'PUNJAB KINGS':'PBKS','PUNJAB':'PBKS','KINGS XI':'PBKS',
    'DELHI CAPITALS':'DC','DELHI':'DC',
    'GUJARAT TITANS':'GT','GUJARAT':'GT',
    'LUCKNOW SUPER GIANTS':'LSG','LUCKNOW':'LSG',
    'SUNRISERS':'SRH','HYDERABAD':'SRH','SUN RISERS':'SRH',
  };
  for (const [k,v] of Object.entries(map)) if (u.includes(k)) return v;
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE 1: cricbuzz-live.vercel.app
// Third-party Vercel proxy for Cricbuzz. Never IP-blocked.
// Returns: batsmen, bowler, liveScore, update
// ─────────────────────────────────────────────────────────────────────────────
const cbProxyFetch = async () => {
  console.log('[SRC1] cricbuzz-live.vercel.app...');

  const matchList = await fetchJSON(
    'https://cricbuzz-live.vercel.app/v1/matches',
    {},
    'CB-Proxy /v1/matches'
  );

  if (!matchList?.data?.matches) {
    console.log('  [SRC1] No matches array in response');
    return null;
  }

  const matches = matchList.data.matches;
  console.log(`  [SRC1] ${matches.length} total matches`);

  // Find IPL match
  let iplMatch = null;
  for (const m of matches) {
    const title = (m.title || m.teams?.map(t=>t.team||t).join(' ') || '').toUpperCase();
    console.log(`  [SRC1] Checking: "${m.title || m.id}" → ${title.substring(0, 60)}`);

    if (!title.includes('IPL') && !title.includes('PREMIER LEAGUE') && !title.includes('INDIAN PREMIER')) {
      // Also check if both teams are IPL teams
      const teamsInTitle = TEAMS.filter(t => title.includes(t));
      if (teamsInTitle.length < 2) continue;
    }

    iplMatch = m;
    break;
  }

  if (!iplMatch) {
    console.log('  [SRC1] No IPL match in list');
    return null;
  }

  const matchId = String(iplMatch.id || iplMatch.matchId || '');
  const title = (iplMatch.title || '').toUpperCase();
  const teams = TEAMS.filter(t => title.includes(t));

  if (!matchId) {
    console.log('  [SRC1] No match ID found');
    return null;
  }

  console.log(`  [SRC1] IPL match: "${iplMatch.title}" ID:${matchId}`);

  const scoreData = await fetchJSON(
    `https://cricbuzz-live.vercel.app/v1/score/${matchId}`,
    {},
    `CB-Proxy /v1/score/${matchId}`
  );

  if (!scoreData?.data) {
    console.log('  [SRC1] No score data');
    return null;
  }

  const d = scoreData.data;
  console.log(`  [SRC1] Score data keys: ${Object.keys(d).join(', ')}`);
  console.log(`  [SRC1] liveScore: "${d.liveScore}" | update: "${d.update}"`);

  // Parse live score "SRH 66/0 (4.1)" or "66/0 (4.1)"
  const liveStr = d.liveScore || '';
  let team1 = teams[0] || 'TBD', team2 = teams[1] || 'TBD';
  let battingTeam = team2, bowlingTeam = team1;
  let score = '0', wickets = '0', overs = '0.0';

  const fullScoreM = liveStr.match(/\b([A-Z]{2,4})\s+(\d+)[\/\-](\d+)\s*\(?([\d.]+)\)?/);
  const shortScoreM = liveStr.match(/(\d+)[\/\-](\d+)\s*\(?([\d.]+)\)?/);

  if (fullScoreM) {
    const scoringTeam = toTeam(fullScoreM[1]);
    if (scoringTeam && TEAMS.includes(scoringTeam)) {
      battingTeam = scoringTeam;
      bowlingTeam = battingTeam === team1 ? team2 : team1;
    }
    score = fullScoreM[2]; wickets = fullScoreM[3]; overs = fullScoreM[4] || '0.0';
  } else if (shortScoreM) {
    score = shortScoreM[1]; wickets = shortScoreM[2]; overs = shortScoreM[3] || '0.0';
  }

  // Status
  const update = (d.update || '').toUpperCase();
  let status = 'LIVE', result = '';
  if (update.includes('WON') || update.includes(' WIN')) {
    status = 'FINISHED'; result = d.update || '';
  } else if (update.includes('RAIN') || update.includes('HALT') || update.includes('DELAY') || update.includes('COVERS')) {
    status = 'RAIN DELAY';
  } else if (update.includes('INNINGS BREAK') || update.includes('BREAK')) {
    status = 'INNINGS BREAK';
  } else if (update.includes('STUMPS')) {
    status = 'INNINGS BREAK';
  }

  // Target from update text
  let target = null, team1Score = null;
  const needsM  = (d.update || '').match(/need[s]?\s+(\d+)\s+(?:more\s+)?runs?/i);
  const targetM = (d.update || '').match(/[Tt]arget[:\s]+(\d+)/i);
  if (targetM) {
    target = parseInt(targetM[1]);
    team1Score = String(target - 1);
  } else if (needsM) {
    target = parseInt(score) + parseInt(needsM[1]);
    team1Score = String(target - 1);
  }

  // Toss
  const tossM = (d.update || d.title || '').match(/(KKR|MI|CSK|RCB|RR|PBKS|DC|GT|LSG|SRH)\s+(?:opt(?:ed)?|chose|elected)\s+to\s+(bat|bowl)/i);
  const toss = tossM ? `${tossM[1].toUpperCase()} chose to ${tossM[2].toLowerCase()}` : null;

  // Batsmen — proxy gives: batsmanOne, batsmanOneRun "(18)(10)", batsmanOneSR
  const batsmen = [];

  const parseBatsmanRuns = (runStr) => {
    if (!runStr) return { runs: 0, balls: 0 };
    // Format can be: "18(10)" or "18 (10)" or just "18"
    const m = String(runStr).match(/(\d+)\s*\((\d+)\)/);
    if (m) return { runs: parseInt(m[1]), balls: parseInt(m[2]) };
    const n = String(runStr).match(/(\d+)/);
    return { runs: n ? parseInt(n[1]) : 0, balls: 0 };
  };

  if (d.batsmanOne && d.batsmanOne.length > 1) {
    const { runs, balls } = parseBatsmanRuns(d.batsmanOneRun);
    batsmen.push({
      name: d.batsmanOne, runs, balls,
      fours: 0, sixes: 0,
      sr: parseFloat(d.batsmanOneSR || (balls ? ((runs/balls)*100).toFixed(1) : '0.0')).toFixed(1),
      onStrike: true,
    });
  }
  if (d.batsmanTwo && d.batsmanTwo.length > 1) {
    const { runs, balls } = parseBatsmanRuns(d.batsmanTwoRun);
    batsmen.push({
      name: d.batsmanTwo, runs, balls,
      fours: 0, sixes: 0,
      sr: parseFloat(d.batsmanTwoSR || (balls ? ((runs/balls)*100).toFixed(1) : '0.0')).toFixed(1),
      onStrike: false,
    });
  }

  // Bowlers
  const bowlers = [];
  if (d.bowlerOne && d.bowlerOne.length > 1 && d.bowlerOne !== 'BOWLER') {
    bowlers.push({
      name: d.bowlerOne,
      overs:   String(d.bowlerOneOver ?? '0'),
      maidens: 0,
      runs:    parseInt(d.bowlerOneRun ?? 0),
      wickets: parseInt(d.bowlerOneWickets ?? 0),
      economy: String(d.bowlerOneEconomy || '0.0'),
    });
  }
  if (d.bowlerTwo && d.bowlerTwo.length > 1 && d.bowlerTwo !== 'BOWLER' && d.bowlerTwo !== 'O') {
    bowlers.push({
      name: d.bowlerTwo,
      overs:   String(d.bowlerTwoOver ?? '0'),
      maidens: 0,
      runs:    parseInt(d.bowlerTwoRun ?? 0),
      wickets: parseInt(d.bowlerTwoWicket ?? d.bowlerTwoWickets ?? 0),
      economy: String(d.bowlerTwoEconomy || '0.0'),
    });
  }

  // Win probability from CRR
  const crr = parseFloat(d.runRate || d.currentRunRate || 0) || null;
  let winProbT1 = 50, winProbT2 = 50;
  if (status === 'LIVE' && target && crr && parseFloat(overs) > 0) {
    const ovDone = parseFloat(overs);
    const runsLeft = target - parseInt(score);
    const ballsLeft = Math.max((20 - ovDone) * 6, 1);
    const rrr = (runsLeft / ballsLeft) * 6;
    const r = rrr / crr;
    winProbT2 = r < 0.75 ? 78 : r < 0.9 ? 66 : r < 1.0 ? 55 : r < 1.1 ? 46 : r < 1.3 ? 37 : r < 1.6 ? 28 : 16;
    winProbT1 = 100 - winProbT2;
  } else if (status === 'LIVE' && crr && !target) {
    const proj = crr * 20;
    winProbT2 = proj > 185 ? 62 : proj > 165 ? 56 : proj > 145 ? 50 : proj > 125 ? 44 : 38;
    winProbT1 = 100 - winProbT2;
  }
  if (status === 'FINISHED') {
    const w = result.toUpperCase();
    if (w.includes(battingTeam)) { winProbT2 = 100; winProbT1 = 0; }
    else { winProbT1 = 100; winProbT2 = 0; }
  }

  console.log(`  ✅ [SRC1 CB-Proxy] ${bowlingTeam} vs ${battingTeam} | ${score}/${wickets} (${overs}) | ${status}`);
  if (batsmen.length) console.log(`     🏏 ${batsmen.map(b=>`${b.name}${b.onStrike?'*':''}: ${b.runs}(${b.balls})`).join(', ')}`);
  if (bowlers.length) console.log(`     🎯 ${bowlers.map(b=>`${b.name}: ${b.wickets}/${b.runs}`).join(', ')}`);

  return {
    team1: { name: bowlingTeam }, team2: { name: battingTeam },
    score, wickets, overs,
    team1Score: team1Score || null, team1Wickets: null, team1Overs: null,
    target: target || null, status, result, toss,
    winProb: winProbT2, winProbT1, winProbT2,
    recent: ['·','·','·','·','·','·'],
    batsmen, bowlers, commentary: [],
    crr, rrr: null,
    source: 'cricbuzz-proxy',
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE 2: ESPN Cricinfo (correct ID 23694 for IPL)
// ─────────────────────────────────────────────────────────────────────────────
const espnFetch = async () => {
  console.log('[SRC2] ESPN Cricinfo (ID=23694)...');

  // Method A: Personalized header
  const headerData = await fetchJSON(
    'https://site.api.espn.com/apis/personalized/v2/scoreboard/header?sport=cricket&region=in&tz=Asia/Calcutta',
    {},
    'ESPN personalized header'
  );

  let espnId = null, team1 = null, team2 = null;

  if (headerData) {
    const sports = headerData?.sports || [];
    outer: for (const sport of sports) {
      for (const league of (sport?.leagues || [])) {
        for (const ev of (league?.events || [])) {
          const comps = ev?.competitors || [];
          const t1 = toTeam(comps[0]?.displayName || comps[0]?.abbreviation || '');
          const t2 = toTeam(comps[1]?.displayName || comps[1]?.abbreviation || '');
          if (!t1 || !t2 || !TEAMS.includes(t1) || !TEAMS.includes(t2)) continue;
          if ((ev.status || '').toUpperCase() === 'PRE') continue;
          espnId = ev.id || String(ev.uid || '').split('~e:')[1];
          team1 = t1; team2 = t2;
          console.log(`  [SRC2] ESPN header: ${t1} vs ${t2} ID:${espnId}`);
          break outer;
        }
      }
    }
  }

  // Method B: Scoreboard
  if (!espnId) {
    const sbData = await fetchJSON(
      `https://site.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_ID}/scoreboard`,
      {},
      `ESPN scoreboard/${ESPN_IPL_ID}`
    );
    if (sbData?.events) {
      for (const ev of sbData.events) {
        const comp = ev?.competitions?.[0];
        const t1 = toTeam(comp?.competitors?.[0]?.team?.displayName || '');
        const t2 = toTeam(comp?.competitors?.[1]?.team?.displayName || '');
        if (!t1 || !t2 || !TEAMS.includes(t1) || !TEAMS.includes(t2)) continue;
        if (ev?.status?.type?.name === 'STATUS_SCHEDULED') continue;
        espnId = ev.id; team1 = t1; team2 = t2;
        console.log(`  [SRC2] ESPN scoreboard: ${t1} vs ${t2} ID:${espnId}`);
        break;
      }
    }
  }

  if (!espnId) { console.log('  [SRC2] No ESPN match found'); return null; }

  // Get full summary
  const summary = await fetchJSON(
    `https://site.web.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_ID}/summary?contentorigin=espn&event=${espnId}&lang=en&region=in`,
    {},
    `ESPN summary/${espnId}`
  );

  if (!summary) { console.log('  [SRC2] No ESPN summary'); return null; }

  const header = summary?.header?.competitions?.[0];
  const gpkg   = summary?.gamepackageJSON;
  const sc     = gpkg?.scorecard || {};
  const inningsArr = Object.values(sc);

  // Status
  const statusDetail = (header?.status?.type?.detail || '').toUpperCase();
  const statusName   = (header?.status?.type?.name   || '').toUpperCase();
  let status = 'LIVE', result = '';
  if (statusDetail.includes('RAIN') || statusDetail.includes('HALT')) status = 'RAIN DELAY';
  else if (statusDetail.includes('BREAK') || statusDetail.includes('INNINGS')) status = 'INNINGS BREAK';
  else if (statusName.includes('FINAL') || header?.status?.type?.completed) status = 'FINISHED';
  if (status === 'FINISHED') result = (header?.notes?.[0]?.headline || statusDetail || '');

  // Toss
  const tossNote = (header?.notes||[]).find(n=>(n.headline||'').toLowerCase().includes('toss')||(n.headline||'').toLowerCase().includes('chose'));
  const toss = tossNote?.headline || null;

  // Current innings
  let score='0', wickets='0', overs='0.0', battingTeam=team2, bowlingTeam=team1;
  let team1Score=null, team1Wickets=null, team1Overs=null, target=null;

  if (inningsArr.length > 0) {
    const cur = inningsArr[inningsArr.length - 1];
    const curTeamStr = cur?.team?.displayName || cur?.team?.abbreviation || '';
    const curTeam = toTeam(curTeamStr);
    if (curTeam && TEAMS.includes(curTeam)) {
      battingTeam = curTeam; bowlingTeam = battingTeam === team1 ? team2 : team1;
    }
    score   = String(cur?.runs    ?? '0');
    wickets = String(cur?.wickets ?? '0');
    overs   = String(cur?.overs   ?? '0.0');
    if (inningsArr.length > 1) {
      const prev = inningsArr[inningsArr.length - 2];
      team1Score   = String(prev?.runs    ?? '');
      team1Wickets = String(prev?.wickets ?? '');
      team1Overs   = String(prev?.overs   ?? '');
      if (prev?.runs != null) target = parseInt(prev.runs) + 1;
    }
  }

  // Batsmen
  const batsmen = (gpkg?.batterBoxScores || [])
    .filter(b => b.active !== false)
    .slice(0, 3)
    .map(b => {
      const stats = {}; (b.stats||[]).forEach(s=>{stats[s.name]=s.displayValue??s.value;});
      return { name:b.athlete?.displayName||'', runs:parseInt(stats.runs||0), balls:parseInt(stats.balls||0),
               fours:parseInt(stats.fours||0), sixes:parseInt(stats.sixes||0),
               sr:parseFloat(stats.strikeRate||0).toFixed(1), onStrike:!!b.active };
    }).filter(b=>b.name);

  // Bowlers
  const bowlers = (gpkg?.bowlerBoxScores || [])
    .slice(-2)
    .map(b => {
      const stats = {}; (b.stats||[]).forEach(s=>{stats[s.name]=s.displayValue??s.value;});
      return { name:b.athlete?.displayName||'', overs:String(stats.overs||'0'), maidens:parseInt(stats.maidens||0),
               runs:parseInt(stats.runs||0), wickets:parseInt(stats.wickets||0),
               economy:parseFloat(stats.economy||0).toFixed(1) };
    }).filter(b=>b.name);

  // Recent + commentary from plays
  const recent = ['·','·','·','·','·','·'];
  (gpkg?.plays||[]).slice(-6).forEach((p,i)=>{
    const d=(p.text||'').toLowerCase(); let b='·';
    if(d.includes('wicket')||d.includes(' out'))b='W';
    else if(d.includes('six'))b='6';
    else if(d.includes('four')||d.includes('boundary'))b='4';
    else if(d.includes('wide'))b='WD'; else if(d.includes('no ball'))b='NB';
    else{const m=d.match(/(\d)\s+run/);b=m?m[1]:'·';}
    recent[i]=b;
  });

  const commentary = (gpkg?.plays||[]).slice(0,10).map(p=>{
    const text=p.text||''; if(!text||text.length<5) return null;
    const ut=text.toUpperCase();
    return { over:String(p.period?.number||''), text:text.substring(0,200),
             type:ut.includes('WICKET')||ut.includes(' OUT')?'wicket':ut.includes('FOUR')||ut.includes('SIX')?'boundary':'normal',
             generated:false };
  }).filter(Boolean);

  const crr=parseFloat(gpkg?.currentRunRate||0)||null;
  const rrr=parseFloat(gpkg?.requiredRunRate||0)||null;
  let winProbT1=50, winProbT2=50;
  if(rrr&&crr){const r=rrr/crr;winProbT2=r<0.75?78:r<0.9?66:r<1.0?55:r<1.1?46:r<1.3?37:r<1.6?28:16;winProbT1=100-winProbT2;}
  else if(crr&&!target){const p=crr*20;winProbT2=p>185?62:p>165?56:p>145?50:p>125?44:38;winProbT1=100-winProbT2;}
  if(status==='FINISHED'){const w=result.toUpperCase();if(w.includes(battingTeam)){winProbT2=100;winProbT1=0;}else{winProbT1=100;winProbT2=0;}}

  console.log(`  ✅ [SRC2 ESPN] ${bowlingTeam} vs ${battingTeam} | ${score}/${wickets} (${overs}) | ${status}`);

  return {
    team1:{name:bowlingTeam}, team2:{name:battingTeam},
    score, wickets, overs,
    team1Score:team1Score||null, team1Wickets:team1Wickets||null, team1Overs:team1Overs||null,
    target:target||null, status, result, toss,
    winProb:winProbT2, winProbT1, winProbT2,
    recent, batsmen, bowlers, commentary,
    crr, rrr, source:'espn',
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE 3: Cricbuzz direct JSON
// ─────────────────────────────────────────────────────────────────────────────
const cbDirectFetch = async () => {
  console.log('[SRC3] Cricbuzz direct JSON...');
  const cbH = { 'Referer':'https://www.cricbuzz.com/', 'X-Requested-With':'XMLHttpRequest' };

  const list = await fetchJSON('https://www.cricbuzz.com/api/cricket-match/live-scores', cbH, 'CB live-scores');
  if (!list) { console.log('  [SRC3] Cricbuzz blocked or empty'); return null; }

  const allMatches = [];
  for (const s of (list.matchDetails||[])) allMatches.push(...(s?.matchDetailsMap?.match||[]));
  for (const t of (list.typeMatches ||[])) for (const sm of (t.seriesMatches||[])) allMatches.push(...(sm?.seriesAdWrapper?.matches||sm?.matches||[]));
  if (list.matches) allMatches.push(...list.matches);

  console.log(`  [SRC3] ${allMatches.length} matches to check`);
  let matchMeta = null;
  for (const m of allMatches) {
    const info = m?.matchInfo || m;
    const sn = (info?.seriesName||'').toUpperCase();
    if (!sn.includes('IPL') && !sn.includes('PREMIER LEAGUE')) continue;
    if ((info?.state||'').toUpperCase()==='PREVIEW') continue;
    const t1 = toTeam(info?.team1?.teamSName||info?.team1?.teamName||'');
    const t2 = toTeam(info?.team2?.teamSName||info?.team2?.teamName||'');
    const mid = String(info?.matchId||'');
    if (!mid||!t1||!t2) continue;
    matchMeta = { matchId:mid, team1:t1, team2:t2, t1Id:info?.team1?.teamId, t2Id:info?.team2?.teamId };
    console.log(`  [SRC3] Found: ${t1} vs ${t2} ID:${mid}`);
    break;
  }
  if (!matchMeta) { console.log('  [SRC3] No IPL match'); return null; }

  const { matchId:mid, team1, team2, t1Id, t2Id } = matchMeta;
  const cbMH = { ...cbH, 'Referer':`https://www.cricbuzz.com/live-cricket-scores/${mid}/` };
  const [miniR, commR, scR] = await Promise.allSettled([
    fetchJSON(`https://www.cricbuzz.com/api/cricket-match/${mid}/miniscore`, cbMH, `CB miniscore/${mid}`),
    fetchJSON(`https://www.cricbuzz.com/api/cricket-match/${mid}/commentary/1`, cbMH, `CB commentary/${mid}`),
    fetchJSON(`https://www.cricbuzz.com/api/cricket-scorecard/${mid}`, cbMH, `CB scorecard/${mid}`),
  ]);
  const mini=miniR.status==='fulfilled'?miniR.value:null;
  const comm=commR.status==='fulfilled'?commR.value:null;
  const sc  =scR.status  ==='fulfilled'?scR.value  :null;

  if (!mini) { console.log('  [SRC3] Miniscore blocked'); return null; }

  const ms = mini?.minScore || mini?.miniscore || mini;
  if (!ms || typeof ms !== 'object') { console.log('  [SRC3] Bad miniscore structure'); return null; }

  const rawSt = (ms?.status || mini?.matchHeader?.status || '').toLowerCase();
  if (rawSt.includes('yet to begin')||rawSt.includes('preview')) { console.log('  [SRC3] Match not started'); return null; }

  let status='LIVE', result='';
  if(rawSt.includes('rain')||rawSt.includes('delay'))status='RAIN DELAY';
  else if(rawSt.includes('break'))status='INNINGS BREAK';
  else if(rawSt.includes('super over'))status='SUPER OVER';
  else if(rawSt.includes('abandon')){status='ABANDONED';result='Match Abandoned';}
  else if(rawSt.includes('won')||rawSt.includes('complete')||rawSt.includes('finish')){status='FINISHED';result=mini?.matchHeader?.status||rawSt;}

  const tDec=(mini?.matchHeader?.tossResults?.decision||'').toLowerCase();
  const tWId=mini?.matchHeader?.tossResults?.tossWinnerId;
  const toss=tDec&&tWId?`${tWId===t1Id?team1:team2} chose to ${tDec}`:null;

  const btId=ms?.battingTeamId||ms?.batTeam?.teamId;
  let battingTeam=team2,bowlingTeam=team1;
  if(btId){battingTeam=btId===t1Id?team1:team2;bowlingTeam=battingTeam===team1?team2:team1;}

  const batScore=ms?.batTeam?.teamScore||{};
  const bowlScore=ms?.bowlTeam?.teamScore||{};
  let score=String(ms?.score??batScore?.runs??'0');
  let wickets=String(ms?.wickets??batScore?.wickets??'0');
  let overs=String(ms?.overs??batScore?.overs??'0.0');
  if(/^\d{3,}$/.test(overs)){const b=parseInt(overs);overs=`${Math.floor(b/6)}.${b%6}`;}

  let team1Score=null,team1Wickets=null,team1Overs=null,target=null;
  const innL=ms?.matchScoreDetails?.inningsScoreList||[];
  if(innL.length>=2){const p=innL[0];team1Score=String(p.score??'');team1Wickets=String(p.wickets??'');team1Overs=String(p.overs??'');target=parseInt(p.score??0)+1;}
  else if(!team1Score&&bowlScore.runs!=null){team1Score=String(bowlScore.runs??'');team1Wickets=String(bowlScore.wickets??'');team1Overs=String(bowlScore.overs??'');if(team1Score)target=parseInt(team1Score)+1;}
  if(!target&&ms?.target)target=parseInt(ms.target);

  const crr=parseFloat(ms?.currentRunRate||0)||null;
  const rrr=parseFloat(ms?.requiredRunRate||0)||null;

  let batsmen=(ms?.batsman||[]).filter(Boolean).slice(0,3).map(b=>({name:b.batName||b.name||'',runs:parseInt(b.batRuns??0),balls:parseInt(b.batBalls??0),fours:parseInt(b.batFours??0),sixes:parseInt(b.batSixes??0),sr:parseFloat(b.batStrikeRate??0).toFixed(1),onStrike:b.isStriker??false})).filter(b=>b.name);
  let bowlers=(ms?.bowler?(Array.isArray(ms.bowler)?ms.bowler:[ms.bowler]):[]).filter(Boolean).slice(0,2).map(b=>({name:b.bowlName||b.name||'',overs:String(b.bowlOvs??'0'),maidens:parseInt(b.bowlMaidens??0),runs:parseInt(b.bowlRuns??0),wickets:parseInt(b.bowlWkts??0),economy:parseFloat(b.bowlEcon??0).toFixed(1)})).filter(b=>b.name);

  if(batsmen.length===0&&sc?.scoreCard){const cur=sc.scoreCard[sc.scoreCard.length-1];if(cur){const bM=cur.batTeamDetails?.batsmenData||{};Object.values(bM).filter(b=>!b.outDesc||b.outDesc.trim()==='').slice(0,3).forEach(b=>{batsmen.push({name:b.batName||'',runs:parseInt(b.runs??0),balls:parseInt(b.balls??0),fours:parseInt(b.fours??0),sixes:parseInt(b.sixes??0),sr:parseFloat(b.strikeRate??0).toFixed(1),onStrike:b.isStriker??false});});if(!bowlers.length){const bwM=cur.bowlTeamDetails?.bowlersData||{};Object.values(bwM).filter(b=>parseFloat(b.overs||0)>0).slice(-2).forEach(b=>{bowlers.push({name:b.bowlName||'',overs:String(b.overs??'0'),maidens:parseInt(b.maidens??0),runs:parseInt(b.runs??0),wickets:parseInt(b.wickets??0),economy:parseFloat(b.economy??0).toFixed(1)});});}}}

  const recentStr=ms?.recentOvsStats||ms?.lastFewOvers||'';
  let recent=[];
  if(recentStr)recent=recentStr.replace(/\|/g,' ').trim().split(/\s+/).map(b=>{const u=b.toUpperCase();if(!u||u==='.'||u==='·')return'·';if(u==='W')return'W';if(u==='WD')return'WD';if(u.startsWith('NB'))return'NB';if(/^\d+$/.test(u))return u==='0'?'·':u;return'·';}).slice(-6);
  while(recent.length<6)recent.push('·');

  const commentary=[];
  (comm?.commentary?.commentaryList||comm?.commentaryList||[]).slice(0,10).forEach(c=>{const text=c.commText||'';if(!text||text.length<5)return;const ut=text.toUpperCase();commentary.push({over:c.overNumber!=null?`${c.overNumber}.${c.ballNumber??''}`:'',text:text.substring(0,200),type:ut.includes('WICKET')||ut.includes(' OUT')?'wicket':ut.includes('FOUR')||ut.includes('SIX')?'boundary':'normal',generated:false});});

  let winProbT1=50,winProbT2=50;
  if(rrr&&crr){const r=rrr/crr;winProbT2=r<0.75?78:r<0.9?66:r<1.0?55:r<1.1?46:r<1.3?37:r<1.6?28:16;winProbT1=100-winProbT2;}
  else if(rrr){winProbT2=rrr<6?78:rrr<8?64:rrr<10?50:rrr<12?36:rrr<15?22:12;winProbT1=100-winProbT2;}
  if(status==='FINISHED'){const w=result.toUpperCase();if(w.includes(battingTeam)){winProbT2=100;winProbT1=0;}else{winProbT1=100;winProbT2=0;}}

  console.log(`  ✅ [SRC3 CB-Direct] ${bowlingTeam} vs ${battingTeam} | ${score}/${wickets} (${overs}) | ${status}`);

  return {team1:{name:bowlingTeam},team2:{name:battingTeam},score,wickets,overs,team1Score,team1Wickets,team1Overs,target:target||null,status,result,toss,winProb:winProbT2,winProbT1,winProbT2,recent:recent.slice(0,6),batsmen:batsmen.slice(0,3),bowlers:bowlers.slice(0,2),commentary:commentary.slice(0,10),crr,rrr,source:'cricbuzz-api'};
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export const scrapeLiveMatch = async () => {
  console.log('━━━ [Scraper] Starting fetch cycle ━━━');

  // Source 1: CB Proxy
  try {
    const r = await cbProxyFetch();
    if (r) { console.log('━━━ [Scraper] Done via CB-Proxy ━━━'); return { ...r, lastUpdated: new Date() }; }
  } catch(e) { console.log('[SRC1 fatal]', e.message); }

  // Source 2: ESPN
  try {
    const r = await espnFetch();
    if (r) { console.log('━━━ [Scraper] Done via ESPN ━━━'); return { ...r, lastUpdated: new Date() }; }
  } catch(e) { console.log('[SRC2 fatal]', e.message); }

  // Source 3: CB Direct
  try {
    const r = await cbDirectFetch();
    if (r) { console.log('━━━ [Scraper] Done via CB-Direct ━━━'); return { ...r, lastUpdated: new Date() }; }
  } catch(e) { console.log('[SRC3 fatal]', e.message); }

  // Source 4: Browser fallback
  if (!CHROME_AVAILABLE) {
    console.log('━━━ [Scraper] All HTTP sources failed. No Chrome. ━━━');
    return null;
  }
  console.log('[SRC4] Browser fallback...');
  return await browserFallback();
};

// Browser fallback (local dev)
let _pptr = null;
const getPptr = async () => {
  if (_pptr) return _pptr;
  try { _pptr = (await import('puppeteer-core')).default; return _pptr; } catch {}
  try { _pptr = (await import('puppeteer')).default; return _pptr; } catch {}
  return null;
};

const browserFallback = async () => {
  const pptr = await getPptr(); if (!pptr) return null;
  let browser;
  try {
    browser = await pptr.launch({ executablePath: CHROME_PATH, headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process'] });
    const matchPage = await browser.newPage();
    await matchPage.goto('https://www.cricbuzz.com/cricket-match/live-scores',{waitUntil:'domcontentloaded',timeout:30000});
    await wait(3000);
    const mm = await matchPage.evaluate(TEAMS => {
      const links=Array.from(document.querySelectorAll('a[href*="/live-cricket-scores/"]'));
      const seen=new Set(),cands=[];
      for(const a of links){const href=a.getAttribute('href')||'',hu=href.toUpperCase();if(seen.has(href))continue;if(!hu.includes('IPL')&&!hu.includes('INDIAN-PREMIER'))continue;const idM=href.match(/\/live-cricket-scores\/(\d+)\//);if(!idM)continue;const t=TEAMS.filter(t=>hu.includes(`-${t}-`)||hu.includes(`/${t}-`)||hu.endsWith(`-${t}`));if(t.length<2)continue;seen.add(href);const card=a.closest('[class*="cb-col"]')||a.parentElement;const hint=card?.querySelector('.cb-text-live')?'LIVE':card?.querySelector('.cb-text-complete,.cb-text-stumps')?'FINISHED':'UPCOMING';cands.push({matchId:idM[1],cbUrl:'https://www.cricbuzz.com'+href,team1:t[0],team2:t[1],statusHint:hint,priority:hint==='LIVE'?0:hint==='FINISHED'?1:2});}cands.sort((a,b)=>a.priority-b.priority);return cands[0]||null;
    },TEAMS);
    await matchPage.close();
    if (!mm) { await browser.close(); return null; }

    // Try crex.com first (best browser data — batsmen, bowler, balls)
    try {
      const crexPage = await browser.newPage();
      await crexPage.goto('https://crex.com/', {waitUntil:'domcontentloaded',timeout:20000});
      await wait(2500);
      let crexUrl = await crexPage.evaluate((t1,t2,T) => {
        for (const l of document.querySelectorAll('a[href]')) {
          const h=l.href||'',hu=h.toUpperCase(),hl=h.toLowerCase();
          if (!hl.includes('cricket-live-score')&&!hl.includes('scorecard')) continue;
          const f=T.filter(t=>hu.includes(`-${t}-`)||hu.includes(`/${t}-`));
          if (f.includes(t1)&&f.includes(t2)) return h;
        }
        return null;
      }, mm.team1, mm.team2, TEAMS);

      if (!crexUrl) {
        await crexPage.goto('https://crex.com/fixtures',{waitUntil:'domcontentloaded',timeout:15000});
        await wait(2000);
        crexUrl = await crexPage.evaluate((t1,t2,T) => {
          for (const l of document.querySelectorAll('a[href]')) {
            const h=l.href||'',hu=h.toUpperCase();
            const f=T.filter(t=>hu.includes(`-${t}-`)||hu.includes(`/${t}-`));
            if (f.includes(t1)&&f.includes(t2)) return h;
          }
          return null;
        }, mm.team1, mm.team2, TEAMS);
      }

      if (crexUrl) {
        await crexPage.goto(crexUrl,{waitUntil:'networkidle2',timeout:30000});
        await wait(5000);
        const crexRaw = await crexPage.evaluate((T,t1,t2) => {
          const body=document.body?.innerText||'';
          if (body.length<100||body.includes('YET TO BEGIN')) return null;
          let team1=t1,team2=t2;
          const vsM=(document.title+' '+(document.querySelector('h1,h2')?.innerText||'')).toUpperCase().match(/\b([A-Z]{2,4})\s+VS?\s+([A-Z]{2,4})\b/);
          if(vsM&&T.includes(vsM[1])&&T.includes(vsM[2])){team1=vsM[1];team2=vsM[2];}
          const tossM=body.match(/(KKR|MI|CSK|RCB|RR|PBKS|DC|GT|LSG|SRH)\s+(?:opt(?:ed)?|chose|elected)\s+to\s+(bat|bowl|field)/i);
          let toss=null,bft=null;
          if(tossM){const to=tossM[1].toUpperCase(),ch=tossM[2].toLowerCase();bft=ch==='bat'?to:(to===team1?team2:team1);toss=`${to} chose to ${ch}`;}
          const upper=body.toUpperCase();let status='LIVE',result='';
          if(upper.includes('RAIN DELAY')||upper.includes('COVERS ON'))status='RAIN DELAY';
          else if(upper.includes('ABANDONED')){status='ABANDONED';result='Match Abandoned';}
          else if(upper.includes('INNINGS BREAK')||upper.includes('INNS BREAK'))status='INNINGS BREAK';
          const wonRx=new RegExp(`\\b(${T.join('|')})\\b\\s+won\\s+by\\s+([\\d]+\\s+(?:runs?|wickets?))`, 'i');
          const wonM=body.match(wonRx);
          if(wonM&&(wonM[1].toUpperCase()===team1||wonM[1].toUpperCase()===team2)){status='FINISHED';result=`${wonM[1].toUpperCase()} won by ${wonM[2]}`;}
          const sRx=t=>{for(const rx of[new RegExp(`\\b${t}\\b[^\\n]{0,25}(\\d{1,3})[\\-/](\\d{1,2})[^\\d\\n]{0,15}(\\d{1,2}\\.\\d)`,'i'),new RegExp(`(\\d{1,3})[\\-/](\\d{1,2})[^\\d\\n]{0,15}(\\d{1,2}\\.\\d)[^\\n]{0,25}\\b${t}\\b`,'i'),new RegExp(`\\b${t}\\b[^\\n]{0,25}(\\d{1,3})[\\-/](\\d{1,2})`,'i')]){const m=body.match(rx);if(m&&parseInt(m[1])>=0)return{runs:m[1],wkts:m[2],overs:m[3]||null};}return null;};
          const s1=sRx(team1),s2=sRx(team2);
          const crrM=body.match(/CRR\s*:?\s*([\d.]+)/i),rrrM=body.match(/(?:RRR|Req\s*RR)\s*:?\s*([\d.]+)/i),tgtM=body.match(/[Tt]arget\s*:?\s*(\d{2,3})/);
          const crr=crrM?parseFloat(crrM[1]):null,rrr=rrrM?parseFloat(rrrM[1]):null,target=tgtM?parseInt(tgtM[1]):null;
          const yetTeam=body.match(new RegExp(`(${T.join('|')})[^\\n]{0,50}[Yy]et\\s+to\\s+[Bb]at`))?.[1]?.toUpperCase()||null;
          let bT,bowT,score,wickets,overs,fS=null,fW=null,fO=null,dT=target;
          if(s1&&s2){const o1=s1.overs?parseFloat(s1.overs):20,o2=s2.overs?parseFloat(s2.overs):20;if(yetTeam){bowT=yetTeam;bT=yetTeam===team1?team2:team1;}else if(status==='FINISHED'&&wonM){bT=wonM[1].toUpperCase();bowT=bT===team1?team2:team1;}else if(status==='INNINGS BREAK'){const fb=bft||(o1>=o2?team1:team2);bT=fb===team1?team2:team1;bowT=fb;}else{bT=o2<=o1?team2:team1;bowT=bT===team1?team2:team1;}if(bT===team2){fS=s1.runs;fW=s1.wkts;fO=s1.overs||'20';score=s2.runs;wickets=s2.wkts;overs=s2.overs||'0.0';}else{fS=s2.runs;fW=s2.wkts;fO=s2.overs||'20';score=s1.runs;wickets=s1.wkts;overs=s1.overs||'0.0';}if(!dT&&fS)dT=parseInt(fS)+1;}else if(s1||s2){const s=s1||s2;bT=bft||(yetTeam?(yetTeam===team1?team2:team1):(s1?team1:team2));bowT=bT===team1?team2:team1;score=s.runs;wickets=s.wkts;overs=s.overs||'0.0';}else return null;
          const batsmen=[];
          Array.from(document.querySelectorAll('[class*="batsman"],[class*="batter"],[class*="batting-player"],[class*="striker"]')).slice(0,3).forEach(card=>{const ct=card.innerText?.trim()||'';const name=(card.querySelector('[class*="name"]')?.innerText||ct.split('\n')[0]).replace(/[*†✏🖊]/g,'').trim();if(!name||name.length<2||name.length>35)return;const rbM=ct.match(/(\d+)\s*\((\d+)\)/);if(!rbM)return;const runs=parseInt(rbM[1])||0,balls=parseInt(rbM[2])||0;batsmen.push({name,runs,balls,fours:0,sixes:0,sr:balls?((runs/balls)*100).toFixed(1):'0.0',onStrike:ct.includes('🖊')||ct.includes('*')});});
          if(!batsmen.length){const bRx=/([A-Z][a-z]+(?:\s+[A-Z][a-z.]+){1,3})\s+(\d+)\s*\((\d+)\)/g;[...body.matchAll(bRx)].slice(0,3).forEach(m=>{if(m[1].length<2||m[1].length>35)return;const runs=parseInt(m[2])||0,balls=parseInt(m[3])||0;batsmen.push({name:m[1].trim(),runs,balls,fours:0,sixes:0,sr:balls?((runs/balls)*100).toFixed(1):'0.0',onStrike:body.includes(m[1]+'*')});});}
          const bowlers=[];
          Array.from(document.querySelectorAll('[class*="bowler-card"],[class*="bowling-player"],[class*="current-bowler"]')).slice(0,2).forEach(card=>{const ct=card.innerText?.trim()||'';const name=(card.querySelector('[class*="name"]')?.innerText||ct.split('\n')[0]).replace(/†/g,'').trim();if(!name||name.length<2||name.length>35)return;const bM=ct.match(/(\d+)[–\-](\d+)\s*\((\d+\.?\d*)\)/);if(bM)bowlers.push({name,wickets:parseInt(bM[1]),runs:parseInt(bM[2]),overs:bM[3],maidens:0,economy:parseFloat(bM[3])?(parseInt(bM[2])/parseFloat(bM[3])).toFixed(1):'0.0'});});
          if(!bowlers.length){const bwRx=/([A-Z][a-z]+(?:\s+[A-Z][a-z.]+){1,3})\s+(\d+)[–\-](\d+)\s*\((\d+\.?\d*)\)/g;[...body.matchAll(bwRx)].slice(0,2).forEach(m=>{if(m[1].length<2||m[1].length>35)return;bowlers.push({name:m[1].trim(),wickets:parseInt(m[2]),runs:parseInt(m[3]),overs:m[4],maidens:0,economy:parseFloat(m[4])?(parseInt(m[3])/parseFloat(m[4])).toFixed(1):'0.0'});});}
          const recent=[];const badges=Array.from(document.querySelectorAll('[class*="ball-badge"],[class*="ball-item"],[class*="over-ball"],[class*="ball-score"]'));if(badges.length>=3)badges.slice(-8).forEach(el=>{const t=el.innerText?.trim().toUpperCase().replace(/\s+/g,'');if(t&&t.length<=3&&/^[\dW·N]/.test(t)&&t!=='■')recent.push(t==='N'?'·':t);});if(recent.length<3){const overRx=/Over\s+\d+\s+((?:(?:\d|W|WD|NB|■)\s*){1,8})/g;[...body.matchAll(overRx)].slice(-2).forEach(om=>{om[1].trim().split(/\s+/).forEach(b=>{if(b==='■'||!b)return;if(/^[\dW]$/.test(b)||b==='WD'||b==='NB')recent.push(b.toUpperCase());});});}while(recent.length<6)recent.push('·');
          const commentary=[];const pC=els=>els.forEach(el=>{const text=el.innerText?.trim();if(!text||text.length<10||text.length>500)return;const ut=text.toUpperCase();const type=ut.includes(' OUT')||ut.includes('WICKET')?'wicket':ut.includes('FOUR')||ut.includes(' SIX')?'boundary':'normal';const over=text.match(/^(\d+\.\d+)/)?.[1]||text.match(/(\d+\.\d+)\s*:/)?.[1]||'';if(!commentary.some(c=>c.text===text.substring(0,200)))commentary.push({over,text:text.substring(0,200),type,generated:false});});pC(Array.from(document.querySelectorAll('[class*="comm-item"],[class*="commentary-item"],[class*="feed-item"],[class*="update-item"]')).slice(0,12));
          let wP1=50,wP2=50;if(rrr&&crr){const r=rrr/crr;wP2=r<0.75?78:r<0.9?66:r<1.0?55:r<1.1?47:r<1.3?38:r<1.6?28:16;wP1=100-wP2;}else if(rrr){wP2=rrr<6?78:rrr<8?64:rrr<10?50:rrr<12?36:rrr<15?22:12;wP1=100-wP2;}if(status==='FINISHED'&&wonM){const w=wonM[1].toUpperCase();wP1=w===bowT?100:0;wP2=w===bT?100:0;}
          return{battingTeam:bT,bowlingTeam:bowT,score:String(score||'0'),wickets:String(wickets||'0'),overs:String(overs||'0.0'),team1Score:fS?String(fS):null,team1Wickets:fW?String(fW):null,team1Overs:fO?String(fO):null,target:dT||null,crr,rrr,status,result,toss,winProbT1:wP1,winProbT2:wP2,recent:recent.slice(0,6),batsmen:batsmen.slice(0,3),bowlers:bowlers.slice(0,2),commentary:commentary.slice(0,12)};
        }, TEAMS, mm.team1, mm.team2);
        await crexPage.close();
        if (crexRaw) {
          console.log(`  ✅ [SRC4 crex.com] ${crexRaw.bowlingTeam} vs ${crexRaw.battingTeam} | ${crexRaw.score}/${crexRaw.wickets} (${crexRaw.overs}) | ${crexRaw.status}`);
          await browser.close();
          return { team1:{name:crexRaw.bowlingTeam}, team2:{name:crexRaw.battingTeam}, score:crexRaw.score, wickets:crexRaw.wickets, overs:crexRaw.overs, team1Score:crexRaw.team1Score, team1Wickets:crexRaw.team1Wickets, team1Overs:crexRaw.team1Overs, target:crexRaw.target||null, status:crexRaw.status, result:crexRaw.result, toss:crexRaw.toss, winProb:crexRaw.winProbT2, winProbT1:crexRaw.winProbT1, winProbT2:crexRaw.winProbT2, recent:crexRaw.recent, batsmen:crexRaw.batsmen, bowlers:crexRaw.bowlers, commentary:crexRaw.commentary, crr:crexRaw.crr, rrr:crexRaw.rrr, source:'crex.com', lastUpdated:new Date() };
        }
      }
      await crexPage.close().catch(()=>{});
    } catch(e) { console.log('[SRC4 crex error]', e.message); }

    // Quick Google scrape with known teams
    const googlePage = await browser.newPage();
    await googlePage.goto(`https://www.google.com/search?q=${encodeURIComponent(`${mm.team1} vs ${mm.team2} IPL 2026 live score`)}&hl=en`,{waitUntil:'domcontentloaded',timeout:25000});
    await wait(3000);
    const graw = await googlePage.evaluate((T,t1,t2) => {
      const ws=['.liveticker','.liveresults-sports-immersive__match-tile','.imso_mh__ma-cont','[jsname="ESiMyd"]','.imspo_mt__mtch-cont'];
      let widget=null;for(const s of ws){const el=document.querySelector(s);if(el?.innerText?.length>30){widget=el;break;}}
      const text=widget?.innerText?.trim()||'';if(!text||!text.toUpperCase().includes(t1)||!text.toUpperCase().includes(t2))return null;
      const sW=[...text.matchAll(/(\d{2,3})\s*[\/\-]\s*(\d{1,2})\s*\(\s*(\d{1,2}\.?\d?)\s*\)/g)];
      const sN=[...text.matchAll(/(\d{2,3})\s*[\/\-]\s*(\d{1,2})(?!\s*[\(\d])/g)];
      const aS=sW.length>0?sW:sN;if(!aS.length)return null;
      const sm=aS[aS.length-1];
      const upper=text.toUpperCase();let status='LIVE',result='';
      const wonRx=new RegExp(`\\b(${T.join('|')})\\b\\s+won\\s+by\\s+([\\d]+\\s+(?:runs?|wickets?))`, 'i');
      const wonM=text.match(wonRx);if(wonM){status='FINISHED';result=`${wonM[1].toUpperCase()} won by ${wonM[2]}`;}
      else if(upper.includes('RAIN'))status='RAIN DELAY';else if(upper.includes('INNINGS BREAK'))status='INNINGS BREAK';
      const crrM=text.match(/CRR\s*:?\s*([\d.]+)/i),rrrM=text.match(/RRR\s*:?\s*([\d.]+)/i),tgtM=text.match(/[Tt]arget[:\s]*(\d{2,3})/);
      const oM=text.match(/(\d{1,2}\.\d)\s*(?:ov|overs?)/i);
      return{score:sm[1],wickets:sm[2],overs:sm[3]||oM?.[1]||'0.0',status,result,crr:crrM?parseFloat(crrM[1]):null,rrr:rrrM?parseFloat(rrrM[1]):null,target:tgtM?parseInt(tgtM[1]):null};
    },TEAMS,mm.team1,mm.team2);
    await googlePage.close(); await browser.close();
    if (!graw) return null;
    let wP1=50,wP2=50;if(graw.rrr&&graw.crr){const r=graw.rrr/graw.crr;wP2=r<0.75?78:r<0.9?66:r<1.0?55:r<1.1?46:r<1.3?37:r<1.6?28:16;wP1=100-wP2;}
    console.log(`  ✅ [SRC4 Google] ${mm.team1} vs ${mm.team2} | ${graw.score}/${graw.wickets} (${graw.overs}) | ${graw.status}`);
    return{team1:{name:mm.team1},team2:{name:mm.team2},score:graw.score,wickets:graw.wickets,overs:graw.overs,team1Score:null,team1Wickets:null,team1Overs:null,target:graw.target||null,status:graw.status,result:graw.result,toss:null,winProb:wP2,winProbT1:wP1,winProbT2:wP2,recent:['·','·','·','·','·','·'],batsmen:[],bowlers:[],commentary:[],crr:graw.crr,rrr:graw.rrr,source:'google',lastUpdated:new Date()};
  } catch(e){if(browser)await browser.close();console.error('[SRC4 fatal]',e.message);return null;}
};

// ─────────────────────────────────────────────────────────────────────────────
// STANDINGS + STATS
// ─────────────────────────────────────────────────────────────────────────────
export const scrapeIPLStandingsAndStats = async () => {
  console.log('[Standings] Fetching...');
  let pointsTable=null, orangeCap=null, purpleCap=null, topBatsmen=[], topBowlers=[];

  // ESPN standings
  try {
    const data = await fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/cricket/${ESPN_IPL_ID}/standings`,{},'ESPN standings');
    const entries = data?.children?.[0]?.standings?.entries || data?.standings?.entries || [];
    if (entries.length >= 4) {
      const table = entries.map(e=>{const team=toTeam(e.team?.displayName||e.team?.abbreviation||'');if(!TEAMS.includes(team))return null;const stats={};(e.stats||[]).forEach(s=>{stats[s.name||s.abbreviation]=s.value??s.displayValue;});return{team,played:parseInt(stats.gamesPlayed||stats.GP||0),won:parseInt(stats.wins||stats.W||0),lost:parseInt(stats.losses||stats.L||0),pts:parseInt(stats.points||stats.PTS||0),nrr:parseFloat(stats.netRunRate||stats.NRR||0).toFixed(3)};}).filter(Boolean).sort((a,b)=>b.pts-a.pts);
      if(table.length>=4){pointsTable=table;console.log(`  [Standings] ESPN: ${table.length} teams`);}
    }
  } catch(e){console.log('[Standings ESPN]',e.message);}

  // Cricbuzz standings
  if (!pointsTable) {
    for (const sid of ['9237','9241','9300','9350','9280']) {
      try {
        const data=await fetchJSON(`https://www.cricbuzz.com/api/cricket-series/${sid}/standings`,{},'CB standings '+sid);
        const rows=data?.pointsTable?.[0]?.pointsTableInfo||data?.pointsTableInfo||[];
        if(!Array.isArray(rows)||rows.length<4)continue;
        const table=rows.map(r=>({team:toTeam(r.teamSName||r.teamName||'')||'',played:parseInt(r.matchesPlayed||0),won:parseInt(r.matchesWon||0),lost:parseInt(r.matchesLost||0),pts:parseInt(r.points||0),nrr:parseFloat(r.nrr||0).toFixed(3)})).filter(t=>TEAMS.includes(t.team)).sort((a,b)=>b.pts-a.pts);
        if(table.length>=4){pointsTable=table;console.log(`  [Standings] CB sid=${sid}: ${table.length} teams`);break;}
      } catch(e){/*try next*/}
    }
  }

  // Cricbuzz stats
  for (const sid of ['9237','9241','9300','9350','9280']) {
    if(topBatsmen.length>0&&topBowlers.length>0)break;
    try {
      const [bat,bowl]=await Promise.all([
        fetchJSON(`https://www.cricbuzz.com/api/cricket-series/${sid}/stats?statsType=mostRuns`,{},'CB mostRuns '+sid),
        fetchJSON(`https://www.cricbuzz.com/api/cricket-series/${sid}/stats?statsType=mostWickets`,{},'CB mostWickets '+sid),
      ]);
      const parseP=(d,type)=>{const list=d?.statsDetails?.[0]?.playerStatsList||d?.values?.[0]?.playerStats||d?.statsList||d?.values||[];return(Array.isArray(list)?list:[]).slice(0,10).map(p=>({name:p.playerName||p.name||'',team:(p.teamSName||'').toUpperCase(),runs:type==='bat'?parseInt(p.runs||p.value||0):undefined,wickets:type==='bowl'?parseInt(p.wickets||p.value||0):undefined})).filter(p=>p.name.length>2);};
      const bats=parseP(bat,'bat').sort((a,b)=>(b.runs||0)-(a.runs||0));
      const bowls=parseP(bowl,'bowl').sort((a,b)=>(b.wickets||0)-(a.wickets||0));
      if(bats.length||bowls.length){if(!topBatsmen.length){topBatsmen=bats;orangeCap=bats[0]||null;}if(!topBowlers.length){topBowlers=bowls;purpleCap=bowls[0]||null;}console.log(`  [Stats] CB sid=${sid}: Orange:${orangeCap?.name} Purple:${purpleCap?.name}`);break;}
    } catch(e){/*try next*/}
  }

  return { pointsTable:pointsTable||[], orangeCap, purpleCap, topBatsmen, topBowlers, lastUpdated:new Date(), source:pointsTable?'cricbuzz':'fallback' };
};

export const scrapeIPLStandings = scrapeIPLStandingsAndStats;