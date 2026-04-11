import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, RefreshCw, TrendingUp, Clock } from 'lucide-react';
import { useMatchContext } from '../context/MatchContext';

const TEAM_COLORS = {
  CSK:'#F7B111', MI:'#004BA0', RCB:'#CC0000', KKR:'#914BE3',
  RR:'#EA1A85',  PBKS:'#ED1B24', DC:'#005CA5', GT:'#B59453',
  LSG:'#0ea5e9', SRH:'#FF822A',
};
const getTeamKey = (name) => Object.keys(TEAM_COLORS).find(k => name?.toUpperCase().includes(k)) || null;
const nrrColor   = (nrr) => { const n = parseFloat(nrr); return isNaN(n) ? 'text-gray-500' : n > 0 ? 'text-green-400' : n < 0 ? 'text-red-400' : 'text-gray-400'; };

const IntelHub = () => {
  const [isHovered, setIsHovered] = useState(false);
  const [iplData,   setIplData]   = useState(null);
  const [loading,   setLoading]   = useState(true);

  const { state } = useMatchContext();
  const match = state.currentMatch;

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res  = await fetch('http://localhost:5000/api/v1/ipl-data');
        const json = await res.json();
        setIplData(json);
        setLoading(json.loading || false);
      } catch { setLoading(false); }
    };
    fetch_();
    const t = setInterval(fetch_, 15 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const topTeams  = iplData?.pointsTable?.slice(0, 4) || [];
  const orangeCap = iplData?.orangeCap;
  const purpleCap = iplData?.purpleCap;

  // Derive live match stats for the mini panel
  const isLive    = match?.status === 'LIVE';
  const isDone    = match?.status === 'FINISHED' || match?.status === 'RECENTLY FINISHED';

  return (
    <motion.aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      animate={{ width: isHovered ? 292 : 12 }}
      transition={{ type:'spring', damping:28, stiffness:200 }}
      className="fixed left-0 top-1/2 -translate-y-1/2 h-[580px] bg-[#080d1a]/95 border border-blue-500/20 backdrop-blur-2xl rounded-r-3xl overflow-hidden z-[60] shadow-[20px_0_60px_rgba(0,0,0,0.6)]"
    >
      {/* Collapsed glow */}
      <AnimatePresence>
        {!isHovered && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="flex items-center justify-center h-full">
            <div className="w-[3px] h-28 bg-gradient-to-b from-transparent via-ipl-neon to-transparent rounded-full animate-pulse"
              style={{boxShadow:'0 0 12px var(--ipl-neon)'}}/>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded panel */}
      <AnimatePresence>
        {isHovered && (
          <motion.div key="panel"
            initial={{opacity:0,x:-16}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-16}}
            transition={{duration:0.18}}
            className="p-5 w-[292px] h-full overflow-y-auto space-y-4"
            style={{scrollbarWidth:'none'}}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-400"/>
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Intel Hub</span>
              </div>
              {loading && <RefreshCw className="w-3 h-3 text-ipl-neon animate-spin"/>}
            </div>

            {/* Live Match Mini Summary */}
            {match && (isLive || isDone) && (
              <div className={`p-3 rounded-xl border text-[10px] ${isLive ? 'bg-red-500/10 border-red-500/20' : 'bg-green-500/10 border-green-500/20'}`}>
                <div className="flex items-center gap-1.5 mb-2">
                  {isLive && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block"/>}
                  <span className={`font-black uppercase tracking-widest text-[9px] ${isLive?'text-red-400':'text-green-400'}`}>
                    {isLive ? 'LIVE NOW' : 'RESULT'}
                  </span>
                </div>
                <div className="flex justify-between items-end">
                  <div>
                    <p className="font-black text-white">{match.team2?.name} <span className="text-ipl-neon">{match.score}/{match.wickets}</span></p>
                    {match.team1Score && (
                      <p className="text-gray-500">{match.team1?.name} {match.team1Score}/{match.team1Wickets}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-gray-400">{match.overs} ov</p>
                    {match.crr && isLive && <p className="text-ipl-neon font-bold">CRR {match.crr}</p>}
                  </div>
                </div>
                {match.result && <p className="text-green-400 font-bold italic mt-1">{match.result}</p>}
              </div>
            )}

            {/* Orange Cap */}
            <div className="space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-orange-400/80 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-orange-500 inline-block"/> Orange Cap
              </p>
              {orangeCap ? (
                <div className="flex items-center gap-3 bg-orange-500/10 border border-orange-500/20 p-3 rounded-xl">
                  <div className="w-9 h-9 rounded-full bg-orange-500/20 border border-orange-400/40 flex items-center justify-center text-xs font-black text-orange-400 flex-shrink-0">
                    {orangeCap.name?.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-white truncate">{orangeCap.name}</p>
                    <p className="text-[10px] text-orange-400 font-bold">{orangeCap.runs} Runs</p>
                  </div>
                </div>
              ) : (
                <div className="h-[52px] bg-white/5 rounded-xl animate-pulse"/>
              )}
            </div>

            {/* Purple Cap */}
            <div className="space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-purple-400/80 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-500 inline-block"/> Purple Cap
              </p>
              {purpleCap ? (
                <div className="flex items-center gap-3 bg-purple-500/10 border border-purple-500/20 p-3 rounded-xl">
                  <div className="w-9 h-9 rounded-full bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-xs font-black text-purple-400 flex-shrink-0">
                    {purpleCap.name?.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-white truncate">{purpleCap.name}</p>
                    <p className="text-[10px] text-purple-400 font-bold">{purpleCap.wickets} Wickets</p>
                  </div>
                </div>
              ) : (
                <div className="h-[52px] bg-white/5 rounded-xl animate-pulse"/>
              )}
            </div>

            {/* Points Table Top 4 */}
            <div className="space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">Live Standings</p>
              {topTeams.length > 0 ? (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[20px_1fr_30px_38px] text-[8px] text-gray-600 font-black uppercase px-1.5 pb-0.5">
                    <span>#</span><span>Team</span><span className="text-right">Pts</span><span className="text-right">NRR</span>
                  </div>
                  {topTeams.map((row, i) => {
                    const tk    = getTeamKey(row.team);
                    const color = tk ? TEAM_COLORS[tk] : '#6366f1';
                    return (
                      <motion.div key={row.team||i}
                        initial={{opacity:0,x:-8}} animate={{opacity:1,x:0}}
                        transition={{delay:i*0.05}}
                        className="grid grid-cols-[20px_1fr_30px_38px] items-center px-1.5 py-1.5 rounded-lg bg-white/5 border border-white/[0.04] hover:bg-white/[0.08] transition-colors"
                      >
                        <span className="text-[10px] font-black text-green-400">{i+1}</span>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{background:color}}/>
                          <span className="text-[11px] font-bold text-white truncate">{tk||row.team?.slice(0,4)}</span>
                        </div>
                        <span className="text-right text-[11px] font-black text-ipl-neon">{row.pts}</span>
                        <span className={`text-right text-[9px] font-mono ${nrrColor(row.nrr)}`}>
                          {row.nrr?(parseFloat(row.nrr)>=0?'+':'')+parseFloat(row.nrr).toFixed(2):'—'}
                        </span>
                      </motion.div>
                    );
                  })}
                  <p className="text-[8px] text-green-500/40 font-bold text-center uppercase tracking-widest pt-0.5">↑ Playoff zone</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {[...Array(4)].map((_,i)=><div key={i} className="h-8 bg-white/5 rounded-lg animate-pulse"/>)}
                  <p className="text-[9px] text-gray-700 text-center italic">Standings scraping every 30 min</p>
                </div>
              )}
            </div>

            {iplData?.lastUpdated && (
              <p className="text-[8px] text-gray-700 font-mono text-center">
                Updated {new Date(iplData.lastUpdated).toLocaleTimeString()}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
};

export default IntelHub;