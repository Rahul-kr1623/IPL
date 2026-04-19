import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, useMotionValue, useTransform, useSpring, AnimatePresence } from 'framer-motion';
import {
  Play, Volume2, VolumeX, X, Pause,
  Activity, RefreshCw, WifiOff, Clock, Trophy, BarChart2, MapPin,
} from 'lucide-react';
import { useMatchContext } from '../context/MatchContext';
import iplAudio from '../assets/_Ye_Khel_Hai_Sher_Jawano_Ka_Ipl_Ringtone_(by Fringster.com).mp3';

// ─── Logo map ─────────────────────────────────────────────────────────────────
const LOGO = {
  CSK:'/src/assets/logos/csk_logo.png', MI:'/src/assets/logos/mi_logo.png',
  RCB:'/src/assets/logos/rcb_logo.png', KKR:'/src/assets/logos/kkr_logo.png',
  RR:'/src/assets/logos/rr_logo.png',   PBKS:'/src/assets/logos/pbks_logo.png',
  DC:'/src/assets/logos/dc_logo.png',   GT:'/src/assets/logos/gt_logo.png',
  LSG:'/src/assets/logos/lsg_logo.png', SRH:'/src/assets/logos/srh_logo.png',
};
const getLogo = (n) => n ? LOGO[n.toUpperCase()] || null : null;

// ─── Ball color ───────────────────────────────────────────────────────────────
const ballCls = (b) => {
  if (b === '6')  return 'bg-yellow-500 border-yellow-300 text-black scale-110 shadow-[0_0_10px_#eab308]';
  if (b === '4')  return 'bg-amber-400  border-amber-200  text-black';
  if (b === 'W')  return 'bg-red-600    border-red-400    text-white animate-pulse shadow-[0_0_10px_#dc2626]';
  if (b === 'WD' || b === 'NB') return 'bg-purple-600 border-purple-400 text-white';
  if (b === '·' || b === '0')   return 'bg-white/5   border-white/10  text-gray-600';
  return 'bg-white/15 border-white/20 text-white';
};

// ─── Status config ────────────────────────────────────────────────────────────
// Returns display text, colors, and whether to show the pulsing live dot
const getStatusConfig = (status) => {
  switch ((status || '').toUpperCase()) {
    case 'LIVE':
      return { label: 'LIVE', dot: true,  bgCls: 'bg-red-600/20 border-red-500/30',    textCls: 'text-red-400' };
    case 'INNINGS BREAK':
      return { label: 'INNINGS BREAK', dot: false, bgCls: 'bg-yellow-600/20 border-yellow-500/30', textCls: 'text-yellow-400' };
    case 'RAIN DELAY':
      return { label: '🌧 RAIN DELAY',  dot: false, bgCls: 'bg-blue-600/20 border-blue-500/30',   textCls: 'text-blue-400' };
    case 'SUPER OVER':
      return { label: '⚡ SUPER OVER',  dot: true,  bgCls: 'bg-purple-600/20 border-purple-500/30', textCls: 'text-purple-400' };
    case 'TIMEOUT':
      return { label: '⏸ TIMEOUT',     dot: false, bgCls: 'bg-orange-600/20 border-orange-500/30', textCls: 'text-orange-400' };
    case 'DRINK BREAK':
    case 'STRATEGIC TIMEOUT':
      return { label: '⏸ TIMEOUT',     dot: false, bgCls: 'bg-orange-600/20 border-orange-500/30', textCls: 'text-orange-400' };
    case 'ABANDONED':
    case 'POSTPONED':
      return { label: status,           dot: false, bgCls: 'bg-gray-600/20 border-gray-500/30',   textCls: 'text-gray-400' };
    case 'FINISHED':
    case 'RECENTLY FINISHED':
      return { label: 'RESULT',         dot: false, bgCls: 'bg-green-600/20 border-green-500/30', textCls: 'text-green-400', icon: 'trophy' };
    default:
      return { label: status || 'LIVE', dot: false, bgCls: 'bg-white/10 border-white/20',          textCls: 'text-white' };
  }
};

// ─── Loading card ─────────────────────────────────────────────────────────────
const LoadingCard = ({ icon: Icon = RefreshCw, label, sub }) => (
  <div className="flex flex-col items-center gap-5 py-20 text-center">
    <Icon className="w-12 h-12 text-ipl-neon animate-spin" />
    <div>
      <p className="text-white font-black text-base uppercase tracking-widest mb-1">{label}</p>
      {sub && <p className="text-gray-500 text-xs">{sub}</p>}
    </div>
    {[70,50,35].map((w,i) => (
      <div key={i} style={{width:`${w}%`}} className="h-3 rounded-full bg-white/10 animate-pulse mx-auto" />
    ))}
  </div>
);

// ─── Win probability meter ────────────────────────────────────────────────────
const WinProbMeter = ({ leftTeam, rightTeam, leftProb, rightProb }) => {
  const p1 = Math.max(0, Math.min(100, Math.round(leftProb  ?? 50)));
  const p2 = Math.max(0, Math.min(100, Math.round(rightProb ?? 50)));
  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
        <span className="text-indigo-400">{leftTeam}  <span className="text-white ml-1">{p1}%</span></span>
        <span className="text-gray-600 text-[8px]">WIN PROBABILITY</span>
        <span className="text-red-400">{p2}% <span className="text-white ml-1">{rightTeam}</span></span>
      </div>
      <div className="relative h-3 rounded-full overflow-hidden bg-white/5 border border-white/10">
        <motion.div animate={{ width: `${p1}%` }} transition={{ duration: 1.2, ease: 'easeOut' }}
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-indigo-600 to-indigo-400" />
        <motion.div animate={{ width: `${p2}%` }} transition={{ duration: 1.2, ease: 'easeOut' }}
          className="absolute right-0 top-0 h-full bg-gradient-to-l from-red-600 to-red-400" />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SCORECARD MODAL
// ─────────────────────────────────────────────────────────────────────────────
const ScorecardModal = ({ match, onClose, team1Name, team2Name, logo1, logo2 }) => {
  const inn = match.currentInnings ?? 2;
  const [tab, setTab] = useState(inn === 1 ? 'inn1' : 'inn2');

  const isFinished = match.status === 'FINISHED' || match.status === 'RECENTLY FINISHED';
  const isFirstInnings = inn === 1;

  const firstInningsScore = match.team1Score
    ? `${match.team1Score}${match.team1Wickets ? '/' + match.team1Wickets : ''} (${match.team1Overs || '20.0'})`
    : isFirstInnings ? `${match.score}/${match.wickets} (${match.overs})` : 'Yet to bat';

  const secondInningsScore = !isFirstInnings
    ? `${match.score}/${match.wickets} (${match.overs})`
    : 'Yet to bat';

  const currentBatsmen = match.batsmen || [];
  const currentBowlers = match.bowlers || [];
  const statusCfg = getStatusConfig(match.status);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0 bg-black/95 backdrop-blur-md cursor-pointer" />
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 24 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 24 }}
        className="relative w-full max-w-2xl max-h-[88vh] bg-[#0c0c14] border border-white/10 rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden"
      >
        <button onClick={onClose} className="absolute top-5 right-5 z-10 p-2 hover:bg-white/10 rounded-full transition-colors">
          <X className="w-5 h-5 text-white" />
        </button>

        <div className="p-6 pb-0 flex-shrink-0">
          {/* Match meta */}
          {(match.matchNumber || match.venue || match.toss) && (
            <div className="mb-4 text-center space-y-0.5">
              {match.matchNumber && <p className="text-[9px] text-gray-500 uppercase tracking-widest font-black">{match.matchNumber}</p>}
              {match.venue && (
                <p className="text-[9px] text-gray-600 flex items-center justify-center gap-1">
                  <MapPin className="w-2.5 h-2.5" />{match.venue}
                </p>
              )}
              {match.toss && <p className="text-[9px] text-gray-600 italic">🪙 {match.toss}</p>}
            </div>
          )}

          <div className="flex justify-around items-center mb-5">
            {/* team1 — batted first */}
            <div className="text-center">
              {logo1 && <img src={logo1} className="w-12 mx-auto mb-1" alt={team1Name} />}
              <p className="text-xs font-black text-white">{team1Name}</p>
              <p className="text-[10px] font-mono text-gray-400">{firstInningsScore}</p>
              <p className="text-[9px] text-gray-600 mt-0.5">1st Innings</p>
            </div>

            {/* Centre */}
            <div className="text-center space-y-1">
              <span className={`text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest ${statusCfg.bgCls} ${statusCfg.textCls}`}>
                {statusCfg.label}
              </span>
              {match.target && !isFirstInnings && <p className="text-[9px] text-gray-500">Target: {match.target}</p>}
              {match.result && <p className="text-green-400 font-black text-[10px] italic">{match.result}</p>}
            </div>

            {/* team2 — bats second */}
            <div className="text-center">
              {logo2 && <img src={logo2} className="w-12 mx-auto mb-1" alt={team2Name} />}
              <p className="text-xs font-black text-white">{team2Name}</p>
              <p className="text-[10px] font-mono text-ipl-neon font-bold">{secondInningsScore}</p>
              <p className="text-[9px] text-gray-600 mt-0.5">2nd Innings</p>
            </div>
          </div>

          <div className="mb-4">
            <WinProbMeter leftTeam={team1Name} leftProb={match.winProbT1} rightTeam={team2Name} rightProb={match.winProbT2} />
          </div>

          <div className="flex gap-1 bg-white/5 p-1 rounded-2xl mb-2">
            {[{ id: 'inn1', label: `${team1Name} Innings` }, { id: 'inn2', label: `${team2Name} Innings` }].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all
                  ${tab === t.id ? 'bg-ipl-neon text-black' : 'text-gray-400 hover:text-white'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 pt-3" style={{ scrollbarWidth: 'none' }}>
          {tab === 'inn1' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center">
                <p className="text-xs font-black text-white mb-1">{team1Name} — 1st Innings</p>
                <p className="text-2xl font-black text-ipl-neon font-mono">{firstInningsScore}</p>
              </div>
              {isFirstInnings && currentBatsmen.length > 0 ? (
                <>
                  <BattingTable batsmen={currentBatsmen} />
                  {currentBowlers.length > 0 && <BowlingTable bowlers={currentBowlers} />}
                </>
              ) : isFirstInnings ? (
                <AwaitingData />
              ) : (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <BarChart2 className="w-8 h-8 text-gray-700" />
                  <p className="text-xs text-gray-500 font-black uppercase tracking-widest">1st Innings Complete</p>
                  <div className="mt-2 p-3 bg-white/5 rounded-xl border border-white/10 text-left text-[10px] w-full">
                    <p className="text-gray-400 font-black mb-2">SUMMARY</p>
                    <div className="flex justify-between py-1 border-b border-white/5"><span className="text-gray-500">Team</span><span className="text-white font-bold">{team1Name}</span></div>
                    <div className="flex justify-between py-1 border-b border-white/5"><span className="text-gray-500">Score</span><span className="text-ipl-neon font-bold">{firstInningsScore}</span></div>
                    {match.target && <div className="flex justify-between py-1"><span className="text-gray-500">Set target</span><span className="text-yellow-400 font-bold">{match.target}</span></div>}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'inn2' && (
            <div className="space-y-5">
              {!isFirstInnings ? (
                <>
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex justify-between items-center">
                    <div>
                      <p className="text-[9px] text-gray-500 uppercase tracking-widest font-black">{team2Name} — {isFinished ? 'Final Score' : '2nd Innings'}</p>
                      <p className="text-2xl font-black text-ipl-neon font-mono mt-1">{match.score}/{match.wickets}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-gray-500 uppercase tracking-widest">Overs</p>
                      <p className="text-lg font-black text-white">{match.overs}</p>
                      {match.crr && !isFinished && <p className="text-[9px] text-gray-500 mt-1">CRR: {match.crr}</p>}
                      {match.rrr && !isFinished && <p className="text-[9px] text-red-400">RRR: {match.rrr}</p>}
                    </div>
                  </div>
                  {match.target && !isFinished && (
                    <div className="p-3 bg-white/5 rounded-xl border border-white/10 flex justify-between text-[10px]">
                      <div className="text-center"><p className="text-gray-500">Target</p><p className="text-yellow-400 font-black text-sm">{match.target}</p></div>
                      <div className="text-center"><p className="text-gray-500">Need</p><p className="text-white font-black text-sm">{Math.max(0, match.target - parseInt(match.score || 0))} runs</p></div>
                      <div className="text-center"><p className="text-gray-500">Balls left</p><p className="text-white font-black text-sm">{Math.max(0, Math.floor((20 - parseFloat(match.overs || 0)) * 6))}</p></div>
                    </div>
                  )}
                  {match.recent?.some(b => b !== '·') && (
                    <div>
                      <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest mb-2">Last 6 Balls</p>
                      <div className="flex gap-2">
                        {match.recent.map((b, i) => (
                          <div key={i} className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black border ${ballCls(b)}`}>{b}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {currentBatsmen.length > 0 ? <BattingTable batsmen={currentBatsmen} /> : <AwaitingData />}
                  {currentBowlers.length > 0 && <BowlingTable bowlers={currentBowlers} />}
                  {isFinished && match.result && (
                    <div className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-2xl text-center">
                      <Trophy className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
                      <p className="text-green-400 font-black text-sm italic">{match.result}</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <Clock className="w-8 h-8 text-gray-700" />
                  <p className="text-xs text-gray-500 font-black uppercase tracking-widest">Not Yet Started</p>
                  <p className="text-[10px] text-gray-600">{team2Name} will bat in the 2nd innings.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>,
    document.body
  );
};

// ─── Shared table components ──────────────────────────────────────────────────
const BattingTable = ({ batsmen }) => (
  <>
    <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest">Batting</p>
    <table className="w-full text-left text-xs">
      <thead className="text-[9px] text-gray-600 border-b border-white/10 uppercase font-black">
        <tr><th className="py-2 px-1">Batter</th><th className="py-2 px-1 text-right">R</th><th className="py-2 px-1 text-right">B</th><th className="py-2 px-1 text-right">4s</th><th className="py-2 px-1 text-right">6s</th><th className="py-2 px-1 text-right">SR</th></tr>
      </thead>
      <tbody className="divide-y divide-white/5">
        {batsmen.map((bat, i) => (
          <tr key={i} className="hover:bg-white/5">
            <td className="py-2.5 px-1 font-bold text-white flex items-center gap-1.5">
              {bat.onStrike && <span className="w-1.5 h-1.5 rounded-full bg-ipl-neon animate-pulse inline-block flex-shrink-0" />}
              {bat.name}
            </td>
            <td className="py-2.5 px-1 text-right font-black text-ipl-neon">{bat.runs}</td>
            <td className="py-2.5 px-1 text-right font-mono text-gray-300">{bat.balls}</td>
            <td className="py-2.5 px-1 text-right text-amber-400">{bat.fours ?? '—'}</td>
            <td className="py-2.5 px-1 text-right text-yellow-400">{bat.sixes ?? '—'}</td>
            <td className="py-2.5 px-1 text-right text-gray-400">{bat.sr ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </>
);

const BowlingTable = ({ bowlers }) => (
  <>
    <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest mt-4 mb-2">Bowling</p>
    <table className="w-full text-left text-xs">
      <thead className="text-[9px] text-gray-600 border-b border-white/10 uppercase font-black">
        <tr><th className="py-2 px-1">Bowler</th><th className="py-2 px-1 text-right">O</th><th className="py-2 px-1 text-right">M</th><th className="py-2 px-1 text-right">R</th><th className="py-2 px-1 text-right">W</th><th className="py-2 px-1 text-right">Eco</th></tr>
      </thead>
      <tbody className="divide-y divide-white/5">
        {bowlers.map((b, i) => (
          <tr key={i} className="hover:bg-white/5">
            <td className="py-2.5 px-1 font-bold text-white">{b.name}</td>
            <td className="py-2.5 px-1 text-right font-mono text-gray-300">{b.overs}</td>
            <td className="py-2.5 px-1 text-right text-gray-500">{b.maidens ?? 0}</td>
            <td className="py-2.5 px-1 text-right text-white">{b.runs}</td>
            <td className="py-2.5 px-1 text-right font-black text-ipl-neon">{b.wickets}</td>
            <td className="py-2.5 px-1 text-right text-gray-400">{b.economy ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </>
);

const AwaitingData = () => (
  <div className="flex flex-col items-center gap-2 py-6 text-center">
    <Activity className="w-6 h-6 text-gray-700 animate-pulse" />
    <p className="text-[10px] text-gray-600">Live data will appear within 2 scrape cycles (~80s).</p>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE MATCH CARD
//
// DATA MODEL:
//   team1         = batted FIRST (always)
//   team2         = bats SECOND  (always)
//   currentInnings = 1 → team1 currently batting
//                    2 → team2 currently batting / match finished
//
// LAYOUT:
//   currentInnings === 1:  LEFT=team2 (yet to bat, dimmed)  RIGHT=team1 (batting, bright)
//   currentInnings === 2:  LEFT=team1 (batted first, dimmed)  RIGHT=team2 (batting/chased, bright)
//
// "Currently Batting" badge only appears on the right team when status === LIVE
// "Match Over" badge appears on the right team when FINISHED
// ─────────────────────────────────────────────────────────────────────────────
const MatchCard = ({ match, onOpenModal }) => {
  const t1 = match?.team1?.name || '';
  const t2 = match?.team2?.name || '';
  const currentInnings = match?.currentInnings ?? 2;

  const isLive     = match?.status === 'LIVE';
  const isFinished = match?.status === 'FINISHED' || match?.status === 'RECENTLY FINISHED';
  const statusCfg  = getStatusConfig(match?.status);

  // LEFT = not currently batting (dimmed)
  // RIGHT = currently batting (bright)
  const leftTeam  = currentInnings === 1 ? t2 : t1;
  const rightTeam = currentInnings === 1 ? t1 : t2;
  const leftLogo  = getLogo(leftTeam);
  const rightLogo = getLogo(rightTeam);

  // Left team score
  const leftScoreDisplay = currentInnings === 1
    ? null   // t2 hasn't batted yet
    : (match?.team1Score
        ? `${match.team1Score}/${match.team1Wickets || ''} (${match.team1Overs || '20.0'})`
        : null);

  // Win prob — left gets whichever team is on the left
  const leftProb  = currentInnings === 1 ? (match?.winProbT2 ?? 50) : (match?.winProbT1 ?? 50);
  const rightProb = currentInnings === 1 ? (match?.winProbT1 ?? 50) : (match?.winProbT2 ?? 50);

  let finalLeftProb  = leftProb;
  let finalRightProb = rightProb;
  if (isFinished && match?.result) {
    const w = (match.result || '').toUpperCase();
    if (leftTeam  && w.includes(leftTeam.toUpperCase()))  { finalLeftProb = 100; finalRightProb = 0; }
    if (rightTeam && w.includes(rightTeam.toUpperCase())) { finalRightProb = 100; finalLeftProb = 0; }
  }

  const batters = [...(match?.batsmen || [])].sort((a, b) => (b.onStrike ? 1 : 0) - (a.onStrike ? 1 : 0));
  const bowler  = match?.bowlers?.[0] || null;

  // Right side badge text
  const rightBadgeText = isFinished
    ? 'Match Over'
    : match?.status === 'INNINGS BREAK' ? 'Innings Break'
    : match?.status === 'RAIN DELAY'    ? 'Rain Delay'
    : match?.status === 'SUPER OVER'    ? 'Super Over!'
    : isLive ? 'Currently Batting' : (match?.status || '');

  const rightBadgeCls = isFinished
    ? 'bg-green-500/20 text-green-400'
    : match?.status === 'INNINGS BREAK' ? 'bg-yellow-500/20 text-yellow-400'
    : match?.status === 'RAIN DELAY'    ? 'bg-blue-500/20 text-blue-400'
    : match?.status === 'SUPER OVER'    ? 'bg-purple-500/20 text-purple-400'
    : 'bg-ipl-neon/20 text-ipl-neon';

  return (
    <div className="relative">
      {/* Match meta bar — match number, venue, toss */}
      {(match?.matchNumber || match?.venue || match?.toss) && (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mb-4 text-[9px] text-gray-500">
          {match.matchNumber && <span className="font-black uppercase tracking-widest text-gray-400">{match.matchNumber}</span>}
          {match.venue && (
            <span className="flex items-center gap-1">
              <MapPin className="w-2.5 h-2.5 flex-shrink-0" />{match.venue}
            </span>
          )}
          {match.toss && <span className="italic">🪙 {match.toss}</span>}
        </div>
      )}

      {/* Status badge */}
      <div
        className={`absolute top-0 left-1/2 flex items-center gap-2 px-4 py-1.5 rounded-full border ${statusCfg.bgCls}`}
        style={{ transform: 'translateX(-50%) translateZ(80px)', top: match?.matchNumber || match?.venue ? '28px' : '0' }}
      >
        {statusCfg.dot && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
          </span>
        )}
        {statusCfg.icon === 'trophy' && <Trophy className="w-3 h-3 text-green-400" />}
        <span className={`text-[10px] font-black uppercase tracking-[0.3em] ${statusCfg.textCls}`}>
          {statusCfg.label}
        </span>
      </div>

      {/* Recent balls */}
      <div className="flex justify-center gap-2 mb-10 mt-8" style={{ transform: 'translateZ(50px)' }}>
        {(match?.recent?.length ? match.recent : ['·','·','·','·','·','·']).map((ball, i) => (
          <motion.div key={`${ball}-${i}`}
            initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-black border ${ballCls(ball)}`}>
            {ball}
          </motion.div>
        ))}
      </div>

      {/* Scoreboard */}
      <div className="flex flex-col lg:flex-row justify-between items-center gap-8 mb-8"
        style={{ transform: 'translateZ(100px)' }}>

        {/* LEFT — not batting (dimmed) */}
        <div className="text-center opacity-40 hover:opacity-70 transition-opacity">
          {leftLogo
            ? <img src={leftLogo} alt={leftTeam} className="w-28 md:w-36 mx-auto drop-shadow-2xl" />
            : <div className="w-32 h-20 mx-auto flex items-center justify-center">
                <span className="text-3xl font-black text-gray-400">{leftTeam}</span>
              </div>}
          <h2 className="text-lg font-bold mt-3 tracking-widest text-gray-400 uppercase">{leftTeam}</h2>
          {leftScoreDisplay
            ? <p className="text-sm font-mono mt-1 text-gray-500">{leftScoreDisplay}</p>
            : <p className="text-xs text-gray-600 mt-1">
                {currentInnings === 1 ? 'Yet to bat' : '1st Innings'}
              </p>
          }
        </div>

        {/* CENTRE — big score (always the currently batting team) */}
        <div className="text-center">
          {match?.target && currentInnings === 2 && !isFinished && (
            <p className="text-[10px] font-mono text-gray-500 mb-1 uppercase tracking-widest">
              Target <span className="text-white">{match.target}</span>
              {match?.rrr && <span className="ml-3 text-red-400">RRR {match.rrr}</span>}
            </p>
          )}
          <div className="flex items-center justify-center gap-3">
            <motion.span key={match?.score}
              initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              className="text-8xl md:text-[9rem] font-black tracking-tighter text-white">
              {match?.score}
            </motion.span>
            <span className="text-5xl text-ipl-neon opacity-30 italic">/</span>
            <span className="text-5xl text-white/40 font-black">{match?.wickets}</span>
          </div>
          <p className="font-mono text-ipl-neon text-base tracking-[0.5em] uppercase mt-1 font-black">
            {match?.overs} OVERS
          </p>
          {match?.crr && !isFinished && (
            <p className="text-[10px] font-mono text-gray-500 mt-1">CRR: {match.crr}</p>
          )}
          {isFinished && match?.result && (
            <p className="text-green-400 font-black text-sm mt-2 italic">{match.result}</p>
          )}
          {/* Special status overlays */}
          {match?.status === 'INNINGS BREAK' && (
            <p className="text-yellow-400 font-black text-xs mt-2 uppercase tracking-widest">⏸ Innings Break</p>
          )}
          {match?.status === 'RAIN DELAY' && (
            <p className="text-blue-400 font-black text-xs mt-2 uppercase tracking-widest">🌧 Rain Delay</p>
          )}
          {match?.status === 'SUPER OVER' && (
            <p className="text-purple-400 font-black text-sm mt-2 uppercase tracking-widest animate-pulse">⚡ Super Over!</p>
          )}
        </div>

        {/* RIGHT — currently batting (bright, highlighted) */}
        <div className="text-center">
          <div className="relative">
            {rightLogo
              ? <img src={rightLogo} alt={rightTeam}
                  className={`w-28 md:w-40 mx-auto drop-shadow-2xl ${isLive ? 'animate-pulse' : ''}`} />
              : <div className="w-32 h-20 mx-auto flex items-center justify-center">
                  <span className="text-3xl font-black text-white">{rightTeam}</span>
                </div>}
            {isLive && <Activity className="absolute -top-2 -right-2 w-5 h-5 text-ipl-neon animate-bounce" />}
          </div>
          <h2 className="text-xl font-black mt-3 tracking-tighter text-white uppercase italic">{rightTeam}</h2>
          <span className={`text-[9px] px-3 py-1 rounded-full font-black tracking-widest uppercase ${rightBadgeCls}`}>
            {rightBadgeText}
          </span>
        </div>
      </div>

      {/* Win probability */}
      <div className="mb-8 px-2" style={{ transform: 'translateZ(60px)' }}>
        <WinProbMeter leftTeam={leftTeam} leftProb={finalLeftProb} rightTeam={rightTeam} rightProb={finalRightProb} />
      </div>

      {/* Scorecard button */}
      <div className="flex justify-center mb-8" style={{ transform: 'translateZ(60px)' }}>
        <button onClick={onOpenModal}
          className="px-10 py-4 rounded-full border border-white/20 bg-white/5 hover:bg-ipl-neon hover:text-black transition-all text-[11px] font-black uppercase tracking-[0.3em] flex items-center gap-3 shadow-2xl">
          <BarChart2 className="w-4 h-4" />
          {isFinished ? 'View Match Result' : 'View Detailed Scorecard'}
        </button>
      </div>

      {/* Batter / Bowler HUD */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ transform: 'translateZ(40px)' }}>
        <div className="glass bg-white/5 p-5 rounded-[1.5rem] border border-white/10 flex items-center justify-between">
          <div>
            <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest mb-1 flex items-center gap-1">
              {batters[0]?.onStrike !== false
                ? <><span className="w-1.5 h-1.5 rounded-full bg-ipl-neon animate-pulse inline-block" />Striker</>
                : 'Batter'}
            </p>
            <h4 className="font-black text-sm text-white">
              {batters[0]?.name || <span className="text-gray-600 italic text-xs">Awaiting…</span>}
            </h4>
          </div>
          {batters[0]
            ? <div className="text-right">
                <span className="text-lg font-black text-ipl-neon">{batters[0].runs}{batters[0].onStrike ? '*' : ''}</span>
                <p className="text-[9px] text-gray-500">{batters[0].balls} (B)</p>
              </div>
            : <span className="text-gray-700 text-sm">—</span>}
        </div>

        <div className="glass bg-white/5 p-5 rounded-[1.5rem] border border-white/10 flex items-center justify-between">
          <div>
            <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest mb-1">Non-Striker</p>
            <h4 className="font-black text-sm text-white">
              {batters[1]?.name || <span className="text-gray-600 italic text-xs">Awaiting…</span>}
            </h4>
          </div>
          {batters[1]
            ? <div className="text-right">
                <span className="text-lg font-black text-white">{batters[1].runs}</span>
                <p className="text-[9px] text-gray-500">{batters[1].balls} (B)</p>
              </div>
            : <span className="text-gray-700 text-sm">—</span>}
        </div>

        <div className="glass bg-white/5 p-5 rounded-[1.5rem] border border-white/10 flex items-center justify-between">
          <div>
            <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest mb-1">Bowler</p>
            <h4 className="font-black text-sm text-white">
              {bowler?.name || <span className="text-gray-600 italic text-xs">Awaiting…</span>}
            </h4>
          </div>
          {bowler
            ? <div className="text-right">
                <span className="text-lg font-black text-white">{bowler.wickets}-{bowler.runs}</span>
                <p className="text-[9px] text-gray-500">{bowler.overs} Ov</p>
              </div>
            : <span className="text-gray-700 text-sm">—</span>}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// HERO — renders 1 or 2 MatchCards depending on how many matches are live
// ─────────────────────────────────────────────────────────────────────────────
const Hero = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted,   setIsMuted]   = useState(false);
  const [modalMatch, setModalMatch] = useState(null); // which match's modal is open
  const audioRef = useRef(new Audio(iplAudio));

  const { state } = useMatchContext();
  const { matches, fetchStatus, fetchError, lastFetched, isStale } = state;

  // Support both old (currentMatch) and new (matches array) shape from context
  const matchList = matches?.length > 0 ? matches : (state.currentMatch ? [state.currentMatch] : []);

  useEffect(() => {
    isPlaying ? audioRef.current.play().catch(() => {}) : audioRef.current.pause();
    audioRef.current.loop = true;
  }, [isPlaying]);
  useEffect(() => { audioRef.current.muted = isMuted; }, [isMuted]);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const xSp = useSpring(mouseX, { damping: 30, stiffness: 100 });
  const ySp = useSpring(mouseY, { damping: 30, stiffness: 100 });
  const rotateX = useTransform(ySp, [-300, 300], [8, -8]);
  const rotateY = useTransform(xSp, [-300, 300], [-8, 8]);
  const onMouseMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - (r.left + r.width / 2));
    mouseY.set(e.clientY - (r.top + r.height / 2));
  };

  const isLoading = (fetchStatus === 'LOADING' || fetchStatus === 'IDLE') && matchList.length === 0;
  const isError   = fetchStatus === 'ERROR' && matchList.length === 0;
  const isDoubleHeader = matchList.length >= 2;

  return (
    <section
      className="relative min-h-[90vh] w-full flex items-center justify-center py-20 px-4 overflow-hidden mt-10"
      onMouseMove={onMouseMove}
      onMouseLeave={() => { mouseX.set(0); mouseY.set(0); }}
    >
      {/* Background blobs */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <motion.div animate={{ scale:[1,1.1,1], rotate:[0,45,0] }} transition={{ duration:15, repeat:Infinity }}
          className="absolute top-[-10%] left-[-5%] w-[60%] h-[60%] rounded-full opacity-10 blur-[100px]"
          style={{ background:'radial-gradient(circle,#6366f1,transparent)' }} />
        <motion.div animate={{ scale:[1.1,1,1.1], rotate:[45,0,45] }} transition={{ duration:12, repeat:Infinity }}
          className="absolute bottom-[-10%] right-[-5%] w-[60%] h-[60%] rounded-full opacity-10 blur-[100px]"
          style={{ background:'radial-gradient(circle,#ef4444,transparent)' }} />
      </div>

      <motion.div
        style={{ rotateX, rotateY, perspective:1200, transformStyle:'preserve-3d' }}
        className="w-full max-w-6xl glass rounded-[4rem] p-10 md:p-16 relative border border-white/10 shadow-2xl overflow-hidden"
      >
        {/* Loading / error / empty */}
        {isLoading && <LoadingCard label="Connecting to live feed…" sub="First load takes ~30s" />}
        {isError && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <WifiOff className="w-12 h-12 text-red-500" />
            <p className="text-white font-black text-base uppercase tracking-widest">Connection Error</p>
            <p className="text-gray-400 text-sm max-w-xs">{fetchError}</p>
            <p className="text-gray-600 text-xs mt-1">Retrying every 40s…</p>
          </div>
        )}
        {fetchStatus === 'SUCCESS' && matchList.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <Clock className="w-12 h-12 text-gray-500" />
            <p className="text-white font-black text-base uppercase tracking-widest">No Live Match</p>
            <p className="text-gray-400 text-sm">No IPL match in progress right now.</p>
          </div>
        )}

        {/* Match content */}
        {matchList.length > 0 && (
          <>
            {/* Stale banner */}
            {(isStale || fetchError) && (
              <div className="flex items-center gap-2 justify-center mb-5 px-4 py-2 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-[10px] font-bold uppercase tracking-widest"
                style={{ transform:'translateZ(20px)' }}>
                <WifiOff className="w-3 h-3" />
                {fetchError ? 'Offline — showing last saved data' : 'Data may be delayed'}
                {lastFetched && (
                  <span className="text-yellow-600 ml-1 normal-case font-normal">
                    (saved {new Date(lastFetched).toLocaleTimeString()})
                  </span>
                )}
              </div>
            )}

            {/* Double-header label */}
            {isDoubleHeader && (
              <div className="text-center mb-8">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-ipl-neon px-4 py-1.5 rounded-full bg-ipl-neon/10 border border-ipl-neon/30">
                  ⚡ Double Header Day
                </span>
              </div>
            )}

            {/* Single match */}
            {!isDoubleHeader && (
              <MatchCard match={matchList[0]} onOpenModal={() => setModalMatch(matchList[0])} />
            )}

            {/* Double header — two side-by-side cards */}
            {isDoubleHeader && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                {matchList.map((m, idx) => (
                  <div key={m.espnId || idx} className="border border-white/10 rounded-[2.5rem] p-6 bg-white/[0.02]">
                    <MatchCard match={m} onOpenModal={() => setModalMatch(m)} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Timestamp */}
        {lastFetched && (
          <p className="absolute bottom-3 right-5 text-[9px] text-gray-700 font-mono pointer-events-none">
            {fetchStatus === 'REFRESHING' ? '⟳ refreshing…' : `Updated ${new Date(lastFetched).toLocaleTimeString()}`}
          </p>
        )}
      </motion.div>

      {/* Scorecard modal — for whichever match the user clicked */}
      <AnimatePresence>
        {modalMatch && (
          <ScorecardModal
            match={modalMatch}
            onClose={() => setModalMatch(null)}
            team1Name={modalMatch.team1?.name || ''}
            team2Name={modalMatch.team2?.name || ''}
            logo1={getLogo(modalMatch.team1?.name)}
            logo2={getLogo(modalMatch.team2?.name)}
          />
        )}
      </AnimatePresence>

      {/* Floating audio */}
      <div className="absolute bottom-12 right-12 flex flex-col gap-5 z-30">
        <button onClick={() => setIsPlaying(!isPlaying)}
          className={`w-14 h-14 rounded-full glass flex items-center justify-center border border-white/10 ${isPlaying ? 'bg-ipl-neon text-black' : 'text-ipl-neon'}`}>
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </button>
        <button onClick={() => setIsMuted(!isMuted)}
          className={`w-14 h-14 rounded-full glass flex items-center justify-center border border-white/10 ${isMuted ? 'bg-red-500 text-white' : 'text-gray-300'}`}>
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>
    </section>
  );
};

export default Hero;