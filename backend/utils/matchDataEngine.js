/**
 * matchDataEngine.js
 * Self-sustaining data engine — points table, player stats, commentary.
 * IMPORTANT: Add each completed match to COMPLETED_MATCHES immediately after it ends.
 */

const parseOvers = (o) => {
  if (!o) return 20;
  const s = String(o).split('.');
  return parseInt(s[0]) + (parseInt(s[1]||0)/6);
};

// ─── COMPLETED MATCHES ────────────────────────────────────────────────────────
// The single source of truth for points table and NRR.
// Add a new entry here right after each match ends.
// winner: null = no-result/abandoned, 'tie' for tie
export const COMPLETED_MATCHES = [
  { id:1,  teamA:'RCB',  teamB:'SRH',  winner:'SRH',
    scoreA:163,wA:8, ovA:'20',  scoreB:164,wB:4, ovB:'18.3',
    result:'SRH won by 6 wickets', date:'28 MAR 2026' },
  { id:2,  teamA:'MI',   teamB:'KKR',  winner:'MI',
    scoreA:189,wA:5, ovA:'20',  scoreB:181,wB:9, ovB:'20',
    result:'MI won by 8 runs',    date:'29 MAR 2026' },
  { id:3,  teamA:'RR',   teamB:'CSK',  winner:'CSK',
    scoreA:172,wA:6, ovA:'20',  scoreB:173,wB:6, ovB:'19.4',
    result:'CSK won by 4 wickets',date:'30 MAR 2026' },
  { id:4,  teamA:'PBKS', teamB:'GT',   winner:'GT',
    scoreA:198,wA:5, ovA:'20',  scoreB:180,wB:8, ovB:'20',
    result:'GT won by 18 runs',   date:'31 MAR 2026' },
  { id:5,  teamA:'LSG',  teamB:'DC',   winner:'DC',
    scoreA:155,wA:9, ovA:'20',  scoreB:156,wB:5, ovB:'18.2',
    result:'DC won by 5 wickets', date:'01 APR 2026' },
  { id:6,  teamA:'KKR',  teamB:'SRH',  winner:'SRH',
    scoreA:226,wA:8, ovA:'20',  scoreB:161,wB:10,ovB:'18.3',
    result:'SRH won by 65 runs',  date:'02 APR 2026' },
  { id:7,  teamA:'CSK',  teamB:'PBKS', winner:'CSK',
    scoreA:201,wA:4, ovA:'20',  scoreB:175,wB:8, ovB:'20',
    result:'CSK won by 26 runs',  date:'03 APR 2026' },
  { id:8,  teamA:'DC',   teamB:'MI',   winner:'DC',
    scoreA:169,wA:6, ovA:'20',  scoreB:158,wB:8, ovB:'20',
    result:'DC won by 11 runs',   date:'04 APR 2026' },
  { id:9,  teamA:'GT',   teamB:'RR',   winner:'RR',
    scoreA:210,wA:6, ovA:'20',  scoreB:211,wB:6, ovB:'19.3',
    result:'RR won by 4 wickets', date:'04 APR 2026' },
  { id:10, teamA:'SRH',  teamB:'LSG',  winner:'SRH',
    scoreA:186,wA:5, ovA:'20',  scoreB:178,wB:8, ovB:'20',
    result:'SRH won by 8 runs',   date:'05 APR 2026' },
  { id:11, teamA:'RCB',  teamB:'CSK',  winner:'RCB',
    scoreA:172,wA:7, ovA:'20',  scoreB:163,wB:9, ovB:'19.4',
    result:'RCB won by 9 runs',   date:'05 APR 2026' },
  // ── ADD NEW MATCHES HERE ──
  // { id:12, teamA:'KKR', teamB:'PBKS', winner:'???', ... }
];

// ─── POINTS TABLE CALCULATOR ──────────────────────────────────────────────────
export const calculatePointsTable = (matches = COMPLETED_MATCHES) => {
  const TEAMS = ['CSK','MI','RCB','KKR','RR','PBKS','DC','GT','LSG','SRH'];
  const t = {};
  TEAMS.forEach(team => {
    t[team] = {
      team, played:0, won:0, lost:0, noResult:0, tied:0, pts:0,
      runsScored:0, ballsFaced:0, runsConceded:0, ballsBowled:0,
      nrr:0, form:[],
    };
  });

  matches.forEach(m => {
    if (!t[m.teamA] || !t[m.teamB]) return;
    const rA = parseInt(m.scoreA)||0, rB = parseInt(m.scoreB)||0;
    // Use actual balls faced — if all out before 20 overs, use 120 balls
    const bA = m.wA >= 10 ? 120 : Math.round(parseOvers(m.ovA)*6);
    const bB = m.wB >= 10 ? 120 : Math.round(parseOvers(m.ovB)*6);

    t[m.teamA].played++; t[m.teamB].played++;
    t[m.teamA].runsScored+=rA; t[m.teamA].ballsFaced+=bA;
    t[m.teamA].runsConceded+=rB; t[m.teamA].ballsBowled+=bB;
    t[m.teamB].runsScored+=rB; t[m.teamB].ballsFaced+=bB;
    t[m.teamB].runsConceded+=rA; t[m.teamB].ballsBowled+=bA;

    if (!m.winner || m.winner==='no_result') {
      t[m.teamA].noResult++; t[m.teamA].pts+=1; t[m.teamA].form.push('N');
      t[m.teamB].noResult++; t[m.teamB].pts+=1; t[m.teamB].form.push('N');
    } else if (m.winner==='tie') {
      t[m.teamA].tied++; t[m.teamA].pts+=1; t[m.teamA].form.push('T');
      t[m.teamB].tied++; t[m.teamB].pts+=1; t[m.teamB].form.push('T');
    } else if (m.winner===m.teamA) {
      t[m.teamA].won++; t[m.teamA].pts+=2; t[m.teamA].form.push('W');
      t[m.teamB].lost++; t[m.teamB].form.push('L');
    } else if (m.winner===m.teamB) {
      t[m.teamB].won++; t[m.teamB].pts+=2; t[m.teamB].form.push('W');
      t[m.teamA].lost++; t[m.teamA].form.push('L');
    }
  });

  TEAMS.forEach(team => {
    const r = t[team];
    if (r.ballsFaced>0 && r.ballsBowled>0) {
      r.nrr = parseFloat(((r.runsScored/r.ballsFaced*6) - (r.runsConceded/r.ballsBowled*6)).toFixed(3));
    }
    r.form = r.form.slice(-5);
  });

  return Object.values(t).sort((a,b) => b.pts!==a.pts ? b.pts-a.pts : b.nrr-a.nrr);
};

export const POINTS_TABLE = calculatePointsTable();

// Quick lookup: is match X completed?
export const isMatchCompleted = (id) => COMPLETED_MATCHES.some(m => m.id === id);
export const getMatchResult    = (teamA, teamB) =>
  COMPLETED_MATCHES.find(m => (m.teamA===teamA&&m.teamB===teamB)||(m.teamA===teamB&&m.teamB===teamA));

// ─── PLAYER STATS ─────────────────────────────────────────────────────────────
// Current IPL 2026 stats (update after each match)
export const PLAYER_STATS = {
  'V. Kohli':          { team:'RCB',  matches:11, runs:432, balls:278, fours:44, sixes:14, wickets:0,  rc:0,   ob:0   },
  'Travis Head':       { team:'SRH',  matches:11, runs:398, balls:218, fours:38, sixes:22, wickets:0,  rc:0,   ob:0   },
  'Abhishek Sharma':   { team:'SRH',  matches:11, runs:356, balls:194, fours:32, sixes:18, wickets:0,  rc:0,   ob:0   },
  'Y. Jaiswal':        { team:'RR',   matches:11, runs:342, balls:208, fours:36, sixes:16, wickets:0,  rc:0,   ob:0   },
  'R. Gaikwad':        { team:'CSK',  matches:9,  runs:318, balls:214, fours:32, sixes:10, wickets:0,  rc:0,   ob:0   },
  'Prabhsimran S.':    { team:'PBKS', matches:11, runs:298, balls:188, fours:28, sixes:14, wickets:0,  rc:0,   ob:0   },
  'P. Salt':           { team:'KKR',  matches:10, runs:276, balls:174, fours:26, sixes:14, wickets:0,  rc:0,   ob:0   },
  'S. Gil':            { team:'GT',   matches:10, runs:264, balls:162, fours:24, sixes:12, wickets:0,  rc:0,   ob:0   },
  'D. Warner':         { team:'DC',   matches:10, runs:252, balls:168, fours:26, sixes:10, wickets:0,  rc:0,   ob:0   },
  'J. Buttler':        { team:'RR',   matches:11, runs:248, balls:162, fours:24, sixes:12, wickets:0,  rc:0,   ob:0   },
  'J. Bumrah':         { team:'MI',   matches:10, runs:6,   balls:8,   fours:0,  sixes:0,  wickets:16, rc:196, ob:360 },
  'P. Cummins':        { team:'SRH',  matches:11, runs:8,   balls:12,  fours:0,  sixes:0,  wickets:15, rc:218, ob:396 },
  'Arshdeep S.':       { team:'PBKS', matches:11, runs:4,   balls:6,   fours:0,  sixes:0,  wickets:14, rc:234, ob:396 },
  'Matheesha P.':      { team:'CSK',  matches:10, runs:2,   balls:4,   fours:0,  sixes:0,  wickets:13, rc:208, ob:360 },
  'Kuldeep Yadav':     { team:'DC',   matches:10, runs:6,   balls:8,   fours:0,  sixes:0,  wickets:13, rc:194, ob:360 },
  'Harshal Patel':     { team:'SRH',  matches:11, runs:2,   balls:3,   fours:0,  sixes:0,  wickets:12, rc:238, ob:396 },
  'Axar Patel':        { team:'DC',   matches:10, runs:52,  balls:34,  fours:4,  sixes:2,  wickets:11, rc:178, ob:360 },
  'M. Siraj':          { team:'RCB',  matches:11, runs:4,   balls:6,   fours:0,  sixes:0,  wickets:11, rc:226, ob:396 },
};

export const updatePlayerStats = (existing, batsmen, bowlers, team) => {
  const stats = { ...existing };
  (batsmen||[]).forEach(b => {
    if (!b.name||b.runs===undefined) return;
    if (!stats[b.name]) stats[b.name]={ team, matches:0, runs:0, balls:0, fours:0, sixes:0, wickets:0, rc:0, ob:0 };
    const s = stats[b.name];
    s.matches++; s.runs+=b.runs||0; s.balls+=b.balls||0; s.fours+=b.fours||0; s.sixes+=b.sixes||0; s.team=team;
  });
  (bowlers||[]).forEach(b => {
    if (!b.name) return;
    if (!stats[b.name]) stats[b.name]={ team, matches:0, runs:0, balls:0, fours:0, sixes:0, wickets:0, rc:0, ob:0 };
    const s = stats[b.name];
    s.wickets+=b.wickets||0; s.rc+=b.runs||0; s.ob+=Math.round(parseOvers(b.overs)*6); s.team=team;
  });
  return stats;
};

export const getCapLeaders = (stats = PLAYER_STATS) => {
  const batters = Object.entries(stats)
    .filter(([,s]) => (s.runs||0)>0)
    .sort((a,b) => b[1].runs-a[1].runs)
    .slice(0,10)
    .map(([name,s]) => ({
      name, team:s.team, runs:s.runs, balls:s.balls,
      sr: s.balls ? ((s.runs/s.balls)*100).toFixed(1) : '0',
      fours:s.fours||0, sixes:s.sixes||0,
    }));

  const bowlers = Object.entries(stats)
    .filter(([,s]) => (s.wickets||0)>0)
    .sort((a,b) => b[1].wickets-a[1].wickets || (a[1].rc/Math.max(a[1].ob,1))-(b[1].rc/Math.max(b[1].ob,1)))
    .slice(0,10)
    .map(([name,s]) => ({
      name, team:s.team, wickets:s.wickets,
      economy: s.ob ? ((s.rc/(s.ob/6))).toFixed(2) : '0',
    }));

  return { orangeCap:batters[0]||null, purpleCap:bowlers[0]||null, topBatsmen:batters, topBowlers:bowlers };
};

// ─── COMMENTARY GENERATOR ─────────────────────────────────────────────────────
const C = {
  W:  [(b,bl,o)=>`OUT! ${b} departs. ${bl} gets the crucial wicket in over ${o}!`,
       (b,bl)  =>`Gone! ${b} walks back. ${bl} pumped up — big wicket!`,
       (b,bl)  =>`${bl} strikes! ${b} is out. The fielding side erupts!`,
       (b,bl)  =>`What a delivery from ${bl}! ${b} had no answer. OUT!`,
       (b,bl)  =>`${b} gone for a fine knock. ${bl} celebrates!`],
  '6':[(b)=>`MAXIMUM! ${b} launches it into the stands! Crowd on feet!`,
       (b)=>`SIX! ${b} gets under it and smashes it miles!`,
       (b)=>`${b} doesn't hold back — straight over the bowler! SIX!`,
       (b)=>`Into orbit! ${b} playing with pure authority!`,
       (b)=>`${b} deposits that one into the second tier!`],
  '4':[(b)=>`FOUR! ${b} pierces the gap perfectly. Timing on the button.`,
       (b)=>`Boundary! ${b} drives through covers. Textbook T20.`,
       (b)=>`${b} pulls hard square — races to the fence. FOUR!`,
       (b)=>`Whipped off the pads by ${b}. Four more. Beautiful!`,
       (b)=>`${b} stays back and cuts it — FOUR through point!`],
  '2':[(b)=>`Two runs. ${b} rotating the strike well.`,
       (b)=>`Quick two from ${b}. Good cricket.`],
  '1':[(b,bl)=>`Single. ${b} works it to fine-leg. ${bl} keeping it tight.`,
       (b)   =>`${b} nudges it — one run, strike retained.`,
       (b,bl)=>`Good bowling from ${bl}. Only a single for ${b}.`],
  '0':[(b,bl)=>`DOT! ${bl} beats ${b} all ends up. Excellent!`,
       (b,bl)=>`Beaten! ${b} misses. ${bl} nods approvingly.`,
       (b,bl)=>`Beautiful line from ${bl}. Dot ball. Pressure building.`,
       (b,bl)=>`${b} defends solidly. No run. ${bl} economical.`],
  WD: [(bl)=>`WIDE! ${bl} strays down leg. Extra. Costly.`,
       (bl)=>`That's a wide from ${bl}. Will be disappointed.`],
  NB: [(bl)=>`NO BALL! ${bl} overstepped. FREE HIT coming up!`,
       (bl)=>`No ball from ${bl}! Free hit next ball!`],
  INNINGS_BREAK: [
    (t1,sc,t2)=>`Innings break! ${t1} post ${sc}. ${t2} now need to chase this down.`,
    (t1,sc,t2)=>`End of 1st innings. ${t1} set ${sc}. ${t2} have their task cut out.`],
  RAIN_DELAY: [
    ()=>'Play stopped due to rain. Covers out. DLS could come into play.',
    ()=>'Rain interruption! Players off field. We await news on resumption.',
    ()=>'Wet outfield. No play possible right now. Fans wait patiently.'],
  ABANDONED: [
    (t1,t2)=>`Match between ${t1} and ${t2} called off. Both teams share a point.`,
    (t1,t2)=>`Unfortunately, ${t1} vs ${t2} is abandoned. 1 point each.`],
  SUPER_OVER: [
    (t1,t2)=>`SUPER OVER! ${t1} and ${t2} are tied! Ultimate drama!`,
    (t1,t2)=>`What drama! We need a Super Over between ${t1} and ${t2}!`],
  FINISHED: [
    (w,r)=>`GAME OVER! ${r}. Brilliant cricket from ${w}!`,
    (w,r)=>`${r}! ${w} take the points. What a game!`,
    (w,r)=>`${r}! Celebrations in the ${w} dressing room!`],
};

const pick = (arr) => arr[Math.floor(Math.random()*arr.length)];

export const generateCommentary = (ball, ctx={}) => {
  const { batterName='Batter', bowlerName='Bowler', over='0.0',
          team1='Team 1', team2='Team 2', result='', status='LIVE' } = ctx;
  const b = String(ball).toUpperCase().trim();
  let text='', type='normal';

  try {
    if      (b==='W')             { text=pick(C.W)(batterName,bowlerName,over); type='wicket'; }
    else if (b==='6')             { text=pick(C['6'])(batterName); type='boundary'; }
    else if (b==='4')             { text=pick(C['4'])(batterName); type='boundary'; }
    else if (b==='2'||b==='3')    { text=pick(C['2'])(batterName); }
    else if (b==='1')             { text=pick(C['1'])(batterName,bowlerName); }
    else if (b==='0'||b==='·')    { text=pick(C['0'])(batterName,bowlerName); }
    else if (b==='WD')            { text=pick(C.WD)(bowlerName); }
    else if (b==='NB')            { text=pick(C.NB)(bowlerName); }
    else if (b==='INNINGS BREAK') { text=pick(C.INNINGS_BREAK)(team1, ctx.currentScore||'', team2); }
    else if (b==='RAIN DELAY')    { text=pick(C.RAIN_DELAY)(); }
    else if (b==='ABANDONED')     { text=pick(C.ABANDONED)(team1,team2); }
    else if (b==='SUPER OVER')    { text=pick(C.SUPER_OVER)(team1,team2); }
    else if (b==='FINISHED')      { text=pick(C.FINISHED)(result.split(' ')[0]||team1, result); type='boundary'; }
    else text=`${over}: ${batterName} faces ${bowlerName}.`;
  } catch { text=`${over}: Ball delivered.`; }

  return { over, text, type, generated:true, timestamp:new Date().toISOString() };
};

export const generateOverCommentary = (balls, ctx={}) =>
  (balls||[]).filter(b=>b&&b!=='·').slice(-6)
    .map((b,i) => generateCommentary(b, { ...ctx, over:`${ctx.overNum||0}.${i+1}` }))
    .filter(Boolean);

export const MATCH_STATUS_INFO = {
  'LIVE':              { label:'LIVE',           color:'red',    emoji:'🔴' },
  'INNINGS BREAK':     { label:'INNINGS BREAK',  color:'yellow', emoji:'⏸️' },
  'FINISHED':          { label:'FINISHED',       color:'green',  emoji:'🏆' },
  'RECENTLY FINISHED': { label:'FINISHED',       color:'green',  emoji:'🏆' },
  'RAIN DELAY':        { label:'RAIN DELAY 🌧️', color:'blue',   emoji:'🌧️' },
  'ABANDONED':         { label:'ABANDONED',      color:'gray',   emoji:'❌' },
  'POSTPONED':         { label:'POSTPONED',      color:'gray',   emoji:'📅' },
  'SUPER OVER':        { label:'SUPER OVER! ⚡', color:'purple', emoji:'⚡' },
};