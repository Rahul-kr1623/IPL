import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, useMotionValue, useTransform, useSpring, AnimatePresence } from 'framer-motion';
import {
  Play, MessageSquare, Volume2, VolumeX, X, Pause,
  Activity, RefreshCw, WifiOff, Clock, Trophy, BarChart2, Users, Zap
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

// ─────────────────────────────────────────────────────────────────────────────
// WIN PROBABILITY METER
// ─────────────────────────────────────────────────────────────────────────────
const WinProbMeter = ({ team1, team2, probT1, probT2 }) => {
  const p1 = Math.round(probT1 ?? (100 - (probT2 ?? 50)));
  const p2 = Math.round(probT2 ?? 50);
  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
        <span className="text-indigo-400">{team1} <span className="text-white ml-1">{p1}%</span></span>
        <span className="text-gray-600 text-[8px]">WIN PROBABILITY</span>
        <span className="text-red-400">{p2}% <span className="text-white ml-1">{team2}</span></span>
      </div>
      <div className="relative h-3 rounded-full overflow-hidden bg-white/5 border border-white/10">
        <motion.div
          animate={{ width: `${p1}%` }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-indigo-600 to-indigo-400"
        />
        <motion.div
          animate={{ width: `${p2}%` }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="absolute right-0 top-0 h-full bg-gradient-to-l from-red-600 to-red-400"
        />
      </div>
      <div className="h-px w-full flex overflow-hidden rounded-full opacity-40">
        <motion.div animate={{ width:`${p1}%` }} className="h-full bg-indigo-500 shadow-[0_0_6px_#6366f1]" />
        <motion.div animate={{ width:`${p2}%` }} className="h-full bg-red-500   shadow-[0_0_6px_#dc2626]" />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SCORECARD MODAL — Two innings tabs (like Google / Cricbuzz)
// ─────────────────────────────────────────────────────────────────────────────
const ScorecardModal = ({ match, onClose, team1Name, team2Name, logo1, logo2 }) => {
  // tab: 'inn1' = bowling team (batted first), 'inn2' = batting team (current/chasing)
  const [tab, setTab] = useState('inn2'); // default to current innings

  const isFinished = match.status === 'FINISHED' || match.status === 'RECENTLY FINISHED';

  // Innings labels
  const inn1Label = `${team1Name} Innings`; // bowled first
  const inn2Label = `${team2Name} Innings`; // batting / batted second

  // Current innings data (from live scraper — batsmen/bowlers arrays)
  const currentBatsmen = match.batsmen   || [];
  const currentBowlers = match.bowlers   || [];

  // First innings score display
  const firstInningsScore = match.team1Score
    ? `${match.team1Score}/${match.team1Wickets} (${match.team1Overs})`
    : 'Yet to bat';

  const hasLiveData = currentBatsmen.length > 0 || currentBowlers.length > 0;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/95 backdrop-blur-md cursor-pointer"
      />

      {/* Modal */}
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 24 }}
        className="relative w-full max-w-2xl max-h-[88vh] bg-[#0c0c14] border border-white/10 rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Close */}
        <button onClick={onClose}
          className="absolute top-5 right-5 z-10 p-2 hover:bg-white/10 rounded-full transition-colors">
          <X className="w-5 h-5 text-white" />
        </button>

        {/* Header */}
        <div className="p-6 pb-0 flex-shrink-0">
          {/* Match summary */}
          <div className="flex justify-around items-center mb-5">
            <div className="text-center">
              {logo1 && <img src={logo1} className="w-12 mx-auto mb-1" alt={team1Name} />}
              <p className="text-xs font-black text-white">{team1Name}</p>
              <p className="text-[10px] font-mono text-gray-400">{firstInningsScore}</p>
            </div>
            <div className="text-center space-y-1">
              <span className={`text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest
                ${isFinished ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {match.status}
              </span>
              {match.target && (
                <p className="text-[9px] text-gray-500">Target: {match.target}</p>
              )}
              {match.result && (
                <p className="text-green-400 font-black text-[10px] italic">{match.result}</p>
              )}
            </div>
            <div className="text-center">
              {logo2 && <img src={logo2} className="w-12 mx-auto mb-1" alt={team2Name} />}
              <p className="text-xs font-black text-white">{team2Name}</p>
              <p className="text-[10px] font-mono text-ipl-neon font-bold">
                {match.score}/{match.wickets} ({match.overs})
              </p>
            </div>
          </div>

          {/* Win probability bar */}
          <div className="mb-4">
            <WinProbMeter
              team1={team1Name} team2={team2Name}
              probT1={match.winProbT1} probT2={match.winProbT2}
            />
          </div>

          {/* Innings Tabs */}
          <div className="flex gap-1 bg-white/5 p-1 rounded-2xl mb-2">
            {[
              { id: 'inn1', label: inn1Label },
              { id: 'inn2', label: inn2Label },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all
                  ${tab === t.id ? 'bg-ipl-neon text-black' : 'text-gray-400 hover:text-white'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6 pt-3" style={{ scrollbarWidth: 'none' }}>

          {/* ── INNINGS 1 TAB (bowling team — batted first) ── */}
          {tab === 'inn1' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center">
                <p className="text-xs font-black text-white mb-1">{team1Name} — 1st Innings</p>
                <p className="text-2xl font-black text-ipl-neon font-mono">{firstInningsScore}</p>
              </div>

              {/* Note: we only have live scraped data for current innings */}
              {/* First innings detailed scorecard would need API access */}
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <BarChart2 className="w-8 h-8 text-gray-700" />
                <p className="text-xs text-gray-500 font-black uppercase tracking-widest">
                  First Innings Complete
                </p>
                <p className="text-[10px] text-gray-600 max-w-xs">
                  Ball-by-ball data for the completed innings is not available from the scraper.
                  The detailed first innings scorecard will be saved to the Fixtures page once
                  the match ends.
                </p>
                <div className="mt-2 p-3 bg-white/5 rounded-xl border border-white/10 text-left text-[10px] w-full">
                  <p className="text-gray-400 font-black mb-1">SUMMARY</p>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Team</span>
                    <span className="text-white font-bold">{team1Name}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-gray-500">Score</span>
                    <span className="text-white font-bold">{firstInningsScore}</span>
                  </div>
                  {match.target && (
                    <div className="flex justify-between mt-1">
                      <span className="text-gray-500">Set target of</span>
                      <span className="text-ipl-neon font-bold">{match.target}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── INNINGS 2 TAB (current batting team) ── */}
          {tab === 'inn2' && (
            <div className="space-y-5">
              {/* Current score summary */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex justify-between items-center">
                <div>
                  <p className="text-[9px] text-gray-500 uppercase tracking-widest font-black">{team2Name} — 2nd Innings</p>
                  <p className="text-2xl font-black text-ipl-neon font-mono mt-1">
                    {match.score}/{match.wickets}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-gray-500 uppercase tracking-widest">Overs</p>
                  <p className="text-lg font-black text-white">{match.overs}</p>
                  {match.crr && !isFinished && (
                    <p className="text-[9px] text-gray-500 mt-1">CRR: {match.crr}</p>
                  )}
                  {match.rrr && !isFinished && (
                    <p className="text-[9px] text-red-400">RRR: {match.rrr}</p>
                  )}
                </div>
              </div>

              {/* Last 6 balls */}
              {match.recent?.some(b => b !== '·') && (
                <div>
                  <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest mb-2">Last 6 Balls</p>
                  <div className="flex gap-2">
                    {match.recent.map((b, i) => (
                      <div key={i}
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black border ${ballCls(b)}`}>
                        {b}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Live batting table */}
              {currentBatsmen.length > 0 ? (
                <div>
                  <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest mb-2">Batting</p>
                  <table className="w-full text-left text-xs">
                    <thead className="text-[9px] text-gray-600 border-b border-white/10 uppercase font-black">
                      <tr>
                        <th className="py-2 px-1">Batter</th>
                        <th className="py-2 px-1 text-right">R</th>
                        <th className="py-2 px-1 text-right">B</th>
                        <th className="py-2 px-1 text-right">4s</th>
                        <th className="py-2 px-1 text-right">6s</th>
                        <th className="py-2 px-1 text-right">SR</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {currentBatsmen.map((bat, i) => (
                        <tr key={i} className="hover:bg-white/5">
                          <td className="py-2.5 px-1 font-bold text-white flex items-center gap-1.5">
                            {bat.onStrike && (
                              <span className="w-1.5 h-1.5 rounded-full bg-ipl-neon animate-pulse inline-block flex-shrink-0" />
                            )}
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
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <Activity className="w-6 h-6 text-gray-700 animate-pulse" />
                  <p className="text-[10px] text-gray-600">
                    Live batter data fetched from Cricbuzz. Will appear within 2 scrape cycles.
                  </p>
                </div>
              )}

              {/* Live bowling table */}
              {currentBowlers.length > 0 && (
                <div>
                  <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest mb-2">Bowling</p>
                  <table className="w-full text-left text-xs">
                    <thead className="text-[9px] text-gray-600 border-b border-white/10 uppercase font-black">
                      <tr>
                        <th className="py-2 px-1">Bowler</th>
                        <th className="py-2 px-1 text-right">O</th>
                        <th className="py-2 px-1 text-right">M</th>
                        <th className="py-2 px-1 text-right">R</th>
                        <th className="py-2 px-1 text-right">W</th>
                        <th className="py-2 px-1 text-right">Eco</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {currentBowlers.map((b, i) => (
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
                </div>
              )}

              {/* Finished note */}
              {isFinished && match.result && (
                <div className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-2xl text-center">
                  <Trophy className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
                  <p className="text-green-400 font-black text-sm italic">{match.result}</p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Full scorecard will be available in the Fixtures tab
                  </p>
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

// ─────────────────────────────────────────────────────────────────────────────
// HERO COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const Hero = () => {
  const [isPlaying,  setIsPlaying]  = useState(false);
  const [isMuted,    setIsMuted]    = useState(false);
  const [showModal,  setShowModal]  = useState(false);
  const audioRef = useRef(new Audio(iplAudio));

  const { state } = useMatchContext();
  const { currentMatch: match, fetchStatus, fetchError, lastFetched, isStale } = state;

  useEffect(() => {
    isPlaying ? audioRef.current.play().catch(() => {}) : audioRef.current.pause();
    audioRef.current.loop = true;
  }, [isPlaying]);
  useEffect(() => { audioRef.current.muted = isMuted; }, [isMuted]);

  // Parallax
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

  const t1 = match?.team1?.name || '';
  const t2 = match?.team2?.name || '';
  const logo1 = getLogo(t1);
  const logo2 = getLogo(t2);

  const isLive     = match?.status === 'LIVE';
  const isFinished = match?.status === 'FINISHED' || match?.status === 'RECENTLY FINISHED';
  const isBreak    = match?.status === 'INNINGS BREAK';
  const isLoading  = (fetchStatus === 'LOADING' || fetchStatus === 'IDLE') && !match;
  const isWarmUp   = fetchStatus === 'WARMING_UP' && !match;
  const isError    = fetchStatus === 'ERROR' && !match;

  // Win probability — validated (never show 50/50 for a finished match)
  let probT1 = match?.winProbT1 ?? (100 - (match?.winProb ?? 50));
  let probT2 = match?.winProbT2 ?? (match?.winProb ?? 50);
  if (isFinished && match?.result) {
    const winnerMentioned = t1 && match.result.toUpperCase().startsWith(t1.toUpperCase());
    probT1 = winnerMentioned ? 100 : 0;
    probT2 = winnerMentioned ? 0   : 100;
  }

  // Batters sorted: striker first
  const batters = [...(match?.batsmen || [])].sort((a, b) => (b.onStrike ? 1 : 0) - (a.onStrike ? 1 : 0));
  const bowler  = match?.bowlers?.[0] || null;

  return (
    <section
      className="relative min-h-[90vh] w-full flex items-center justify-center py-20 px-4 overflow-hidden mt-10"
      onMouseMove={onMouseMove}
      onMouseLeave={() => { mouseX.set(0); mouseY.set(0); }}
    >
      {/* Blobs */}
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
        {/* Loading/error/empty states */}
        {isLoading  && <LoadingCard label="Connecting to live feed…" sub="First load takes ~30s" />}
        {isWarmUp   && <LoadingCard icon={Activity} label="Scraper warming up…" />}
        {isError    && !match && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <WifiOff className="w-12 h-12 text-red-500" />
            <p className="text-white font-black text-base uppercase tracking-widest">Connection Error</p>
            <p className="text-gray-400 text-sm max-w-xs">{fetchError}</p>
            <p className="text-gray-600 text-xs mt-1">Retrying every 20s…</p>
          </div>
        )}
        {fetchStatus === 'SUCCESS' && !match && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <Clock className="w-12 h-12 text-gray-500" />
            <p className="text-white font-black text-base uppercase tracking-widest">No Live Match</p>
            <p className="text-gray-400 text-sm">No IPL match in progress right now.</p>
          </div>
        )}

        {/* ── MATCH CONTENT ── */}
        {match && (
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

            {/* Status badge */}
            <div
              className={`absolute top-6 left-1/2 flex items-center gap-2 px-4 py-1.5 rounded-full border
                ${isFinished ? 'bg-green-600/20 border-green-500/30'
                : isBreak    ? 'bg-yellow-600/20 border-yellow-500/30'
                :              'bg-red-600/20    border-red-500/30'}`}
              style={{ transform:'translateX(-50%) translateZ(80px)' }}
            >
              {!isFinished && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
                </span>
              )}
              {isFinished && <Trophy className="w-3 h-3 text-green-400" />}
              <span className={`text-[10px] font-black uppercase tracking-[0.3em]
                ${isFinished ? 'text-green-400' : isBreak ? 'text-yellow-400' : 'text-red-500'}`}>
                {match.status}
              </span>
            </div>

            {/* Recent 6 balls */}
            <div className="flex justify-center gap-2 mb-10" style={{ transform:'translateZ(50px)' }}>
              {(match.recent?.length ? match.recent : ['·','·','·','·','·','·']).map((ball, i) => (
                <motion.div key={`${ball}-${i}`}
                  initial={{ opacity:0, scale:0.5 }} animate={{ opacity:1, scale:1 }}
                  transition={{ delay: i * 0.05 }}
                  className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-black border ${ballCls(ball)}`}>
                  {ball}
                </motion.div>
              ))}
            </div>

            {/* Scoreboard */}
            <div className="flex flex-col lg:flex-row justify-between items-center gap-8 mb-8"
              style={{ transform:'translateZ(100px)' }}>

              {/* Team 1 — bowled first */}
              <div className="text-center opacity-40 hover:opacity-70 transition-opacity">
                {logo1
                  ? <img src={logo1} alt={t1} className="w-28 md:w-36 mx-auto drop-shadow-2xl" />
                  : <div className="w-32 h-20 mx-auto flex items-center justify-center">
                      <span className="text-3xl font-black text-gray-400">{t1}</span>
                    </div>}
                <h2 className="text-lg font-bold mt-3 tracking-widest text-gray-400 uppercase">{t1}</h2>
                {match.team1Score ? (
                  <p className="text-sm font-mono mt-1 text-gray-500">
                    {match.team1Score}/{match.team1Wickets} ({match.team1Overs})
                  </p>
                ) : <p className="text-xs text-gray-600 mt-1">Yet to bat</p>}
              </div>

              {/* Centre */}
              <div className="text-center">
                {match.target && !isFinished && (
                  <p className="text-[10px] font-mono text-gray-500 mb-1 uppercase tracking-widest">
                    Target <span className="text-white">{match.target}</span>
                    {match.rrr && <span className="ml-3 text-red-400">RRR {match.rrr}</span>}
                  </p>
                )}
                <div className="flex items-center justify-center gap-3">
                  <motion.span key={match.score}
                    initial={{ y:20, opacity:0 }} animate={{ y:0, opacity:1 }}
                    className="text-8xl md:text-[9rem] font-black tracking-tighter text-white">
                    {match.score}
                  </motion.span>
                  <span className="text-5xl text-ipl-neon opacity-30 italic">/</span>
                  <span className="text-5xl text-white/40 font-black">{match.wickets}</span>
                </div>
                <p className="font-mono text-ipl-neon text-base tracking-[0.5em] uppercase mt-1 font-black">
                  {match.overs} OVERS
                </p>
                {match.crr && !isFinished && (
                  <p className="text-[10px] font-mono text-gray-500 mt-1">CRR: {match.crr}</p>
                )}
                {isFinished && match.result && (
                  <p className="text-green-400 font-black text-sm mt-2 italic">{match.result}</p>
                )}
              </div>

              {/* Team 2 — batting */}
              <div className="text-center">
                <div className="relative">
                  {logo2
                    ? <img src={logo2} alt={t2}
                        className={`w-28 md:w-40 mx-auto drop-shadow-2xl ${isLive ? 'animate-pulse' : ''}`} />
                    : <div className="w-32 h-20 mx-auto flex items-center justify-center">
                        <span className="text-3xl font-black text-white">{t2}</span>
                      </div>}
                  {isLive && <Activity className="absolute -top-2 -right-2 w-5 h-5 text-ipl-neon animate-bounce" />}
                </div>
                <h2 className="text-xl font-black mt-3 tracking-tighter text-white uppercase italic">{t2}</h2>
                <span className={`text-[9px] px-3 py-1 rounded-full font-black tracking-widest uppercase
                  ${isFinished ? 'bg-green-500/20 text-green-400'
                  : isBreak    ? 'bg-yellow-500/20 text-yellow-400'
                  :              'bg-ipl-neon/20 text-ipl-neon'}`}>
                  {isFinished ? 'Match Over' : isBreak ? 'Innings Break' : 'Currently Batting'}
                </span>
              </div>
            </div>

            {/* Win probability meter */}
            <div className="mb-8 px-2" style={{ transform:'translateZ(60px)' }}>
              <WinProbMeter team1={t1} team2={t2} probT1={probT1} probT2={probT2} />
            </div>

            {/* Scorecard button */}
            <div className="flex justify-center mb-8" style={{ transform:'translateZ(60px)' }}>
              <button onClick={() => setShowModal(true)}
                className="px-10 py-4 rounded-full border border-white/20 bg-white/5 hover:bg-ipl-neon hover:text-black transition-all text-[11px] font-black uppercase tracking-[0.3em] flex items-center gap-3 shadow-2xl">
                <BarChart2 className="w-4 h-4" />
                {isFinished ? 'View Match Result' : 'View Detailed Scorecard'}
              </button>
            </div>

            {/* Batter / Bowler HUD — 3 columns */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ transform:'translateZ(40px)' }}>
              {/* Batter 1 */}
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
                      <span className="text-lg font-black text-ipl-neon">{batters[0].runs}*</span>
                      <p className="text-[9px] text-gray-500">{batters[0].balls} (B)</p>
                    </div>
                  : <span className="text-gray-700 text-sm">—</span>}
              </div>

              {/* Batter 2 */}
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

              {/* Bowler */}
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
          </>
        )}

        {/* Timestamp */}
        {lastFetched && (
          <p className="absolute bottom-3 right-5 text-[9px] text-gray-700 font-mono pointer-events-none">
            {fetchStatus === 'REFRESHING' ? '⟳ refreshing…' : `Updated ${new Date(lastFetched).toLocaleTimeString()}`}
          </p>
        )}
      </motion.div>

      {/* Scorecard Modal */}
      <AnimatePresence>
        {showModal && match && (
          <ScorecardModal
            match={match}
            onClose={() => setShowModal(false)}
            team1Name={t1} team2Name={t2}
            logo1={logo1}  logo2={logo2}
          />
        )}
      </AnimatePresence>

      {/* Floating controls */}
      <div className="absolute bottom-12 right-12 flex flex-col gap-5 z-30">
        <button onClick={() => setIsPlaying(!isPlaying)}
          className={`w-14 h-14 rounded-full glass flex items-center justify-center border border-white/10
            ${isPlaying ? 'bg-ipl-neon text-black' : 'text-ipl-neon'}`}>
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </button>
        <button onClick={() => setIsMuted(!isMuted)}
          className={`w-14 h-14 rounded-full glass flex items-center justify-center border border-white/10
            ${isMuted ? 'bg-red-500 text-white' : 'text-gray-300'}`}>
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>
    </section>
  );
};

export default Hero;