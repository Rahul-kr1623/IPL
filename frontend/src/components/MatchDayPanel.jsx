/**
 * MatchDayPanel.jsx
 *
 * Three vertical boxes on the home page:
 *
 *  ┌──────────────────────────────────────────────────────────┐
 *  │  BOX 1 — Afternoon Match (3:30 PM slot)                 │
 *  │  Live if underway · "No match undergoing" if empty      │
 *  └──────────────────────────────────────────────────────────┘
 *  ┌──────────────────────────────────────────────────────────┐
 *  │  BOX 2 — Evening Match (7:30 PM slot)                   │
 *  │  Live if underway · "No match undergoing" if empty      │
 *  └──────────────────────────────────────────────────────────┘
 *  ┌──────────────────────────────────────────────────────────┐
 *  │  BOX 3 — Latest finished match result                   │
 *  └──────────────────────────────────────────────────────────┘
 *
 * Data: state.slot1 / state.slot2 / state.latestFinished from MatchContext
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Activity, Trophy, MapPin, Clock, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMatchContext } from '../context/MatchContext';

// ─── Logos + colors ───────────────────────────────────────────────────────────
const LOGOS = {
  CSK: '/src/assets/logos/csk_logo.png', MI: '/src/assets/logos/mi_logo.png',
  RCB: '/src/assets/logos/rcb_logo.png', KKR: '/src/assets/logos/kkr_logo.png',
  RR: '/src/assets/logos/rr_logo.png', PBKS: '/src/assets/logos/pbks_logo.png',
  DC: '/src/assets/logos/dc_logo.png', GT: '/src/assets/logos/gt_logo.png',
  LSG: '/src/assets/logos/lsg_logo.png', SRH: '/src/assets/logos/srh_logo.png',
};
const COLORS = {
  CSK: '#F7B111', MI: '#004BA0', RCB: '#CC0000', KKR: '#3A225D',
  RR: '#EA1A85', PBKS: '#ED1B24', DC: '#005CA5', GT: '#B59453',
  LSG: '#0ea5e9', SRH: '#FF822A',
};
const getLogo = (c) => LOGOS[c?.toUpperCase()] || null;
const getColor = (c) => COLORS[c?.toUpperCase()] || '#555555';

// ─── TeamChip ─────────────────────────────────────────────────────────────────
const TeamChip = ({ code, score, isWinner, dimmed }) => {
  const src = getLogo(code);
  return (
    <div className={`flex flex-col items-center gap-2 min-w-[64px] transition-opacity ${dimmed ? 'opacity-30' : 'opacity-100'}`}>
      {src
        ? <img src={src} alt={code} className="w-14 h-14 object-contain drop-shadow-lg" />
        : <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
          <span className="text-xs font-black text-gray-300">{code}</span>
        </div>
      }
      <span className="text-sm font-black uppercase tracking-wide text-white">{code}</span>
      {score && <span className="text-[10px] font-mono text-gray-300 text-center leading-snug">{score}</span>}
      {isWinner && <Trophy className="w-3.5 h-3.5 text-yellow-400" />}
    </div>
  );
};

// ─── Ball dot ─────────────────────────────────────────────────────────────────
const BallDot = ({ b }) => {
  const cls =
    b === 'W' ? 'bg-red-500 text-white' :
      b === '6' ? 'bg-yellow-400 text-black' :
        b === '4' ? 'bg-amber-400 text-black' :
          b === 'WD' || b === 'NB' ? 'bg-purple-500 text-white' :
            'bg-white/10 text-gray-500';
  return (
    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black border border-white/10 ${cls}`}>
      {b === '·' ? '' : b}
    </span>
  );
};

// ─── Status badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const map = {
    'LIVE': { label: 'LIVE', cls: 'bg-red-500/15 text-red-400 border-red-500/30', dot: true },
    'INNINGS BREAK': { label: 'INNINGS BREAK', cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', dot: false },
    'RAIN DELAY': { label: '🌧 RAIN DELAY', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30', dot: false },
    'SUPER OVER': { label: '⚡ SUPER OVER', cls: 'bg-purple-500/15 text-purple-400 border-purple-500/30', dot: true },
    'TIMEOUT': { label: '⏸ TIMEOUT', cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30', dot: false },
    'FINISHED': { label: 'RESULT', cls: 'bg-green-500/15 text-green-400 border-green-500/30', dot: false },
    'RECENTLY FINISHED': { label: 'RESULT', cls: 'bg-green-500/15 text-green-400 border-green-500/30', dot: false },
    'ABANDONED': { label: 'ABANDONED', cls: 'bg-gray-500/15 text-gray-400 border-gray-500/30', dot: false },
  };
  const cfg = map[status?.toUpperCase()] || { label: status || '—', cls: 'bg-white/10 text-gray-400 border-white/10', dot: false };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${cfg.cls}`}>
      {cfg.dot && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
        </span>
      )}
      {cfg.label}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// LiveMatchBox — BOX 1 and BOX 2
// match: live match object (team1:{name}, team2:{name}, score, wickets, ...)
// ─────────────────────────────────────────────────────────────────────────────
const LiveMatchBox = ({ slotLabel, timeLabel, match }) => {
  const isLive = match?.status === 'LIVE';
  const isFinished = match?.status === 'FINISHED' || match?.status === 'RECENTLY FINISHED';
  const isBreak = match?.status === 'INNINGS BREAK';

  const t1 = match?.team1?.name || '';
  const t2 = match?.team2?.name || '';
  const inn = match?.currentInnings ?? 2;

  // Play has started = overs > 0 or batsmen data available or 1st innings completed
  const oversFloat = parseFloat(match?.overs || '0');
  const playStarted = oversFloat > 0 || (match?.batsmen?.length > 0) || (match?.team1Score != null);

  // Left = bat-first team, Right = currently batting team
  const leftCode = t1 || '';
  const rightCode = t2 || '';

  const leftScore = match?.team1Score
    ? `${match?.team1Score}/${match?.team1Wickets || ''} (${match.team1Overs || '20.0'})`
    : 'Yet to bat';

  const winner =
  isFinished && match?.result && t1 && t2
    ? (
        match.result.toUpperCase().includes(t1.toUpperCase())
          ? t1
          : t2
      )
    : null;

  // Innings labels
  const leftLabel = inn === 2 ? '1st Innings' : null;  // left team batted first
  const rightLabel = isFinished
    ? 'Match Over'
    : match?.status === 'INNINGS BREAK' ? 'Innings Break'
      : match?.status === 'RAIN DELAY' ? '🌧 Rain Delay'
        : match?.status === 'SUPER OVER' ? '⚡ Super Over'
          : (isLive && playStarted) ? 'Currently Batting'
            : isLive ? 'Toss Awaited'
              : null;

  const topBarBg =
  t1 && t2
    ? `linear-gradient(90deg, ${getColor(t1)}, ${getColor(t2)})`
    : 'rgba(255,255,255,0.05)';

  const borderCls = isLive
    ? 'border-red-500/30 shadow-[0_0_24px_rgba(239,68,68,0.05)]'
    : 'border-white/10';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`w-full rounded-3xl border ${borderCls} bg-white/[0.03] overflow-hidden`}
    >
      {/* Top color bar */}
      <div className="h-0.5" style={{ background: topBarBg }} />

      <div className="p-6">
        {/* Slot label row */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-ipl-neon">{slotLabel}</p>
            <p className="text-[9px] text-gray-600 mt-0.5 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />{timeLabel}
            </p>
          </div>
          {match ? <StatusBadge status={match.status} /> : (
            <span className="text-[9px] text-gray-600 uppercase tracking-widest">—</span>
          )}
        </div>

        {/* ── NO MATCH STATE ── */}
        {!match && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
              <WifiOff className="w-4 h-4 text-gray-600" />
            </div>
            <p className="text-xs text-gray-500 uppercase tracking-widest font-black">
              No match today in this time slot
            </p>
            <Link to="/fixtures" className="text-[9px] text-ipl-neon/50 hover:text-ipl-neon transition-colors">
              View full schedule →
            </Link>
          </div>
        )}

        {/* ── MATCH CONTENT ── */}
        {match && (
          <>
            {/* Match number + venue */}
            {(match.matchNumber || match.venue) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mb-4 text-[9px] text-gray-600">
                {match.matchNumber && (
                  <span className="font-black text-gray-400 uppercase tracking-wider">{match.matchNumber}</span>
                )}
                {match.venue && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-2.5 h-2.5 flex-shrink-0" />{match.venue}
                  </span>
                )}
              </div>
            )}

            {/* Teams + centre score */}
            <div className="flex items-center justify-between gap-2 mb-4">
              {/* Left team — batted first (dimmed while 2nd innings live) */}
              <div className="flex flex-col items-center gap-1">
                <TeamChip
                  code={leftCode}
                  score={leftScore}
                  isWinner={isFinished && winner === leftCode}
                  dimmed={isLive && inn === 2 && playStarted}
                />
                {leftLabel && (
                  <span className="text-[8px] px-2 py-0.5 rounded-full bg-white/5 text-gray-600 font-black uppercase tracking-widest">
                    {leftLabel}
                  </span>
                )}
              </div>

              {/* Centre — live score */}
              <div className="flex-1 text-center">
                {match.target && inn === 2 && !isFinished && (
                  <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-1">
                    Target <span className="text-white font-black">{match.target}</span>
                  </p>
                )}
                <div className="flex items-baseline justify-center gap-1">
                  <motion.span
                    key={match.score}
                    initial={{ scale: 1.12, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-5xl font-black text-white tracking-tighter leading-none"
                  >
                    {match.score}
                  </motion.span>
                  <span className="text-2xl text-ipl-neon/30 font-black">/</span>
                  <span className="text-2xl text-white/35 font-black">{match.wickets}</span>
                </div>
                <p className="text-[10px] font-mono text-ipl-neon tracking-[0.4em] uppercase mt-1">
                  {match.overs} OV
                </p>
                {match.crr && !isFinished && (
                  <p className="text-[9px] text-gray-500 mt-0.5">
                    CRR {match.crr}
                    {match.rrr && <span className="text-red-400 ml-2">RRR {match.rrr}</span>}
                  </p>
                )}
                {isFinished && match.result && (
                  <p className="text-[10px] text-green-400 font-black italic mt-1 leading-snug">{match.result}</p>
                )}
                {isBreak && (
                  <p className="text-[9px] text-yellow-400 font-black mt-1 uppercase tracking-widest">⏸ Innings Break</p>
                )}
                {match.status === 'RAIN DELAY' && (
                  <p className="text-[9px] text-blue-400 font-black mt-1 uppercase tracking-widest">🌧 Rain Delay</p>
                )}
              </div>

              {/* Right team — currently batting */}
              <div className="flex flex-col items-center gap-1">
                <TeamChip
                  code={rightCode}
                  score={isFinished ? `${match.score}/${match.wickets}(${match.overs})`.replace('/(', ' (') : null}
                  isWinner={isFinished && winner === rightCode}
                  dimmed={false}
                />
                {rightLabel && (
                  <span className={`text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest
                    ${isFinished ? 'bg-green-500/10 text-green-400'
                      : match?.status === 'INNINGS BREAK' ? 'bg-yellow-500/10 text-yellow-400'
                        : match?.status === 'RAIN DELAY' ? 'bg-blue-500/10 text-blue-400'
                          : (isLive && playStarted) ? 'bg-ipl-neon/15 text-ipl-neon'
                            : 'bg-white/5 text-gray-500'}`}>
                    {rightLabel}
                  </span>
                )}
                {/* 2nd Innings label */}
                {inn === 2 && isLive && playStarted && (
                  <span className="text-[8px] text-gray-600 uppercase tracking-widest">2nd Innings</span>
                )}
              </div>
            </div>

            {/* Toss */}
            {match.toss && (
              <p className="text-[9px] text-gray-600 italic text-center mb-3">🪙 {match.toss}</p>
            )}

            {/* Last 6 balls */}
            {!isFinished && match.recent?.some(b => b && b !== '·') && (
              <div className="mb-3">
                <p className="text-[8px] text-gray-600 uppercase tracking-widest font-black mb-1.5">Last 6 balls</p>
                <div className="flex gap-1.5">
                  {match.recent.map((b, i) => <BallDot key={i} b={b || '·'} />)}
                </div>
              </div>
            )}

            {!isFinished && (
              <div className="bg-white/[0.04] rounded-2xl px-4 py-3 space-y-2">
                {[match.currentBatsman, match.nonStriker]
                  .filter(Boolean)
                  .map((bat, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        {bat.onStrike && (
                          <span className="w-1.5 h-1.5 rounded-full bg-ipl-neon animate-pulse flex-shrink-0" />
                        )}
                        <span className="text-white font-bold">{bat.name}</span>
                      </div>

                      <span className="font-mono text-ipl-neon font-black">
                        {bat.runs}
                        <span className="text-white/40 font-normal">
                          ({bat.balls})
                        </span>
                      </span>
                    </div>
                  ))}

                {match.currentBowler && (
                  <div className="flex items-center justify-between text-xs border-t border-white/5 pt-2">
                    <span className="text-gray-400">
                      {match.currentBowler.name}
                    </span>

                    <span className="font-mono text-gray-300">
                      {match.currentBowler.wickets}/{match.currentBowler.runs} ({match.currentBowler.overs})
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// LatestResultBox — BOX 3
// finished: seasonStore object  (team1:"KKR", team2:"RR", team1Score:"167/8 (20.0)", ...)
//        or MongoDB object      (team1:{name:"KKR"}, team2:{name:"RR"}, score:"145", ...)
// ─────────────────────────────────────────────────────────────────────────────
const LatestResultBox = ({ finished }) => {
  // Normalise team codes — handles all shapes:
  //   CompletedMatch API: { teamA, teamB }
  //   seasonStore JSON:   { team1: "KKR", team2: "RR" } (strings)
  //   LiveMatch MongoDB:  { team1: { name: "KKR" }, team2: { name: "RR" } }
  const t1 = finished?.teamA
    || (typeof finished?.team1 === 'string' ? finished.team1 : finished?.team1?.name)
    || '';
  const t2 = finished?.teamB
    || (typeof finished?.team2 === 'string' ? finished.team2 : finished?.team2?.name)
    || '';

  // Score strings — handles all formats:
  //   CompletedMatch API: scoreA = "192/5 (20)" already formatted
  //   seasonStore JSON:   team1Score = "192/5 (20.0)"
  //   LiveMatch MongoDB:  score/wickets/overs separate
  const score1 = finished?.scoreA || finished?.team1Score || null;
  const score2 = finished?.scoreB || finished?.team2Score
    || (finished?.score ? `${finished.score}/${finished.wickets} (${finished.overs})` : null);

  const winner =
  isFinished && match?.result && t1 && t2
    ? (
        match.result.toUpperCase().includes(t1.toUpperCase())
          ? t1
          : t2
      )
    : null;

  const topBarBg =
  t1 && t2
    ? `linear-gradient(90deg, ${getColor(t1)}, ${getColor(t2)})`
    : 'rgba(255,255,255,0.05)';

  const dateStr = finished?.completedAt
    ? new Date(finished.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : finished?.date || null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 }}
      className="w-full rounded-3xl border border-green-500/20 bg-green-500/[0.02] overflow-hidden"
    >
      <div className="h-0.5" style={{ background: topBarBg }} />

      <div className="p-6">
        {/* Label row */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-green-400 flex items-center gap-1.5">
              <Trophy className="w-3 h-3" /> Latest Result
            </p>
            {finished?.matchNumber && (
              <p className="text-[9px] text-gray-600 mt-0.5 uppercase tracking-wider">{finished.matchNumber}</p>
            )}
          </div>
          <Link to="/fixtures" className="text-[9px] text-ipl-neon/50 hover:text-ipl-neon transition-colors font-black uppercase tracking-widest">
            All results →
          </Link>
        </div>

        {/* No result yet */}
        {!finished && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
              <Trophy className="w-4 h-4 text-gray-600" />
            </div>
            <p className="text-xs text-gray-500 uppercase tracking-widest font-black">No results yet this season</p>
          </div>
        )}

        {finished && (
          <>
            {/* Venue + date */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mb-4 text-[9px] text-gray-600">
              {finished.venue && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-2.5 h-2.5 flex-shrink-0" />{finished.venue}
                </span>
              )}
              {dateStr && <span>{dateStr}</span>}
            </div>

            {/* Teams + scores */}
            <div className="flex items-center justify-between gap-2 mb-4">
              <TeamChip
                code={t1}
                score={score1}
                isWinner={winner === t1}
                dimmed={!!winner && winner !== t1}
              />

              <div className="flex-1 text-center">
                <p className="text-[11px] text-green-400 font-black italic leading-snug">{finished.result || '—'}</p>
              </div>

              <TeamChip
                code={t2}
                score={score2}
                isWinner={winner === t2}
                dimmed={!!winner && winner !== t2}
              />
            </div>

            {/* Toss */}
            {finished.toss && (
              <p className="text-[9px] text-gray-600 italic text-center">🪙 {finished.toss}</p>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN — renders 3 boxes stacked vertically
// ─────────────────────────────────────────────────────────────────────────────
const MatchDayPanel = () => {
  const { state } = useMatchContext();
  const { slot1, slot2, latestFinished, fetchStatus } = state;

  // Skeleton on first load before any data
  if ((fetchStatus === 'LOADING' || fetchStatus === 'IDLE') && !slot1 && !slot2) {
    return (
      <div className="max-w-3xl mx-auto px-4 space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="w-full h-48 rounded-3xl bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 space-y-4">
      {/* BOX 1 — Afternoon slot (3:30 PM) */}
      <LiveMatchBox
        slotLabel="Afternoon Match"
        timeLabel="3:30 PM IST"
        match={slot1}
      />

      {/* BOX 2 — Evening slot (7:30 PM) */}
      <LiveMatchBox
        slotLabel="Evening Match"
        timeLabel="7:30 PM IST"
        match={slot2}
      />

      {/* BOX 3 — Latest finished result */}
      <LatestResultBox finished={latestFinished} />
    </div>
  );
};

export default MatchDayPanel;