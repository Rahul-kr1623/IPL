import React from 'react';
import { motion } from 'framer-motion';
import { useMatchContext } from '../context/MatchContext';
import { Activity, Target, Zap, Clock, ShieldAlert } from 'lucide-react';

const Stats = () => {
  const { state } = useMatchContext();
  const match = state.currentMatch || {};

  const isDormant = match.score === '0' && match.team2Score === '0';

  const getOvers = (oversStr) => {
    if (!oversStr) return 0;
    const parts = oversStr.toString().split('.');
    if (parts.length === 1) return parseInt(parts[0], 10);
    return parseInt(parts[0], 10) + parseInt(parts[1], 10) / 6;
  };

  const currentOvers = isDormant ? 0 : (getOvers(match.overs) || 1);
  const currentRR = isDormant ? "0.00" : (parseInt(match.score, 10) / currentOvers).toFixed(2);
  const projected = isDormant ? "-" : Math.round(currentRR * 20);
  const requiredRR = isDormant ? "-" : (parseInt(match.team2Score) > 0 ? (((parseInt(match.team2Score) + 1 - parseInt(match.score)) / (20 - currentOvers)).toFixed(2)) : currentRR);
  const ballsRemaining = isDormant ? 120 : (120 - Math.floor(currentOvers * 6));
  const equation = isDormant ? "Awaiting Toss" : match.result;
  const recentMomentum = isDormant ? [] : (match.recent || []);

  return (
    <div className="min-h-[85vh] w-full max-w-7xl mx-auto px-4 md:px-8 py-10 relative z-10 flex flex-col">
      <div className="mb-12 border-l-4 border-ipl-neon pl-6">
        <h2 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-white">
          Data <span className="text-ipl-neon">Lab</span>
        </h2>
        <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px] mt-2">
          IPL 2026 • Real-Time Match Analytics
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
         
         {/* Current Equation Card */}
         <motion.div 
           initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
           className="glass p-8 rounded-3xl border border-white/10 bg-white/5 lg:col-span-2 relative overflow-hidden group"
         >
            <div className="absolute top-0 right-0 w-64 h-64 bg-ipl-neon/10 rounded-full blur-3xl group-hover:bg-ipl-neon/20 transition-colors"></div>
            <div className="flex items-center gap-3 mb-6 relative z-10">
               <Zap className="w-6 h-6 text-ipl-neon" />
               <h4 className="text-sm font-black uppercase tracking-widest text-gray-400">The Equation</h4>
            </div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tighter text-white mb-2 relative z-10 leading-tight">
              {equation}
            </h2>
            <div className="flex gap-6 mt-8 relative z-10">
               <div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Target Setting</p>
                  <p className="text-2xl font-black text-ipl-neon">{parseInt(match.team2Score) > 0 ? match.team2Score : projected} <span className="text-sm text-gray-400 font-mono">est.</span></p>
               </div>
               <div className="w-[1px] h-12 bg-white/10"></div>
               <div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Remaining</p>
                  <p className="text-2xl font-black text-white">{ballsRemaining} <span className="text-sm text-gray-400 font-mono">balls</span></p>
               </div>
            </div>
         </motion.div>

         {/* Win Probability */}
         <motion.div 
           initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
           className="glass p-8 rounded-3xl border border-white/10 bg-white/5 flex flex-col items-center justify-center relative overflow-hidden text-center"
         >
            <div className="absolute -inset-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-ipl-neon/20 via-transparent to-transparent opacity-50"></div>
            <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-8 relative z-10 w-full text-left">{isDormant ? 'Pre-Match Edge' : 'Win Predictor'}</h4>
            
            <div className="relative w-40 h-40 flex items-center justify-center z-10 mb-4">
               <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                  <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
                  <circle cx="80" cy="80" r="70" fill="none" stroke={match.team1?.color || 'var(--ipl-neon)'} strokeWidth="12" strokeDasharray={`${(match.winProb || 50) * 4.4} 440`} className="transition-all duration-1000 ease-out" />
               </svg>
               <div className="flex flex-col items-center">
                  <span className="text-4xl font-black tracking-tighter" style={{ color: match.team1?.color || '#fff' }}>{match.winProb || 50}%</span>
                  <span className="text-[10px] font-bold uppercase text-gray-500 tracking-widest mt-1">{match.team1?.name}</span>
               </div>
            </div>
            <p className="text-xs font-bold text-gray-400 z-10">AI favors {(match.winProb || 50) >= 50 ? match.team1?.name : match.team2?.name}</p>
         </motion.div>

         {/* Run Rate Metric */}
         <motion.div 
           initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
           className="glass p-8 rounded-3xl border border-white/10 bg-white/5 flex flex-col justify-between"
         >
            <div className="flex items-center gap-3 mb-6">
               <Activity className="w-6 h-6 text-ipl-accent" />
               <h4 className="text-sm font-black uppercase tracking-widest text-gray-400">Current Run Rate</h4>
            </div>
            <div>
               <span className="text-6xl font-black tracking-tighter text-white">{currentRR}</span>
               <p className="text-xs font-mono text-gray-500 mt-2 tracking-widest uppercase">Runs Per Over</p>
            </div>
            <div className="mt-6 flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
               <span className="text-xs font-bold text-gray-400">Required RR</span>
               <span className="text-lg font-black text-ipl-accent">
                 {requiredRR}
               </span>
            </div>
         </motion.div>

         {/* recent Form Momentum */}
         <motion.div 
           initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
           className="glass p-8 rounded-3xl border border-white/10 bg-white/5 lg:col-span-2"
         >
            <div className="flex items-center gap-3 mb-10">
               <Target className="w-6 h-6 text-blue-400" />
               <h4 className="text-sm font-black uppercase tracking-widest text-gray-400">Momentum Pulse (Last {recentMomentum.length} Balls)</h4>
            </div>
            
            <div className="flex items-center justify-between gap-2 overflow-x-auto pb-4 no-scrollbar">
               {recentMomentum.length > 0 ? recentMomentum.map((ball, i) => (
                  <motion.div 
                     key={i}
                     initial={{ scale: 0 }}
                     animate={{ scale: 1 }}
                     transition={{ delay: i * 0.1, type: "spring" }}
                     className={`flex-shrink-0 w-16 h-16 rounded-full flex items-center justify-center font-black text-xl border-2 shadow-xl ${
                       ball === 'W' || ball === 'Wdr' ? 'bg-red-500/20 border-red-500 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]' :
                       ball === '6' ? 'bg-ipl-neon/20 border-ipl-neon text-ipl-neon shadow-[0_0_15px_var(--ipl-neon)] scale-110' :
                       ball === '4' ? 'bg-blue-500/20 border-blue-500 text-blue-500' :
                       'bg-white/5 border-white/10 text-white'
                     }`}
                  >
                    {ball}
                  </motion.div>
               )) : (
                  <div className="w-full flex items-center justify-center py-4">
                     <span className="text-sm text-gray-600 font-mono tracking-widest uppercase">Awaiting live deliveries to trace momentum...</span>
                  </div>
               )}
            </div>
         </motion.div>

      </div>
    </div>
  );
};
export default Stats;
