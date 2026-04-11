import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, LineChart, Line, BarChart, Bar, Cell
} from 'recharts';
import { Download, Zap, Swords, Target, Activity, Quote, TrendingUp, Play, ShieldAlert, CloudRain, Wind, Thermometer, MapPin } from 'lucide-react';
import { useMatchContext } from '../context/MatchContext';

const winProbData = [
  { over: 0, prob: 50 }, { over: 5, prob: 45 }, { over: 10, prob: 55 },
  { over: 15, prob: 48 }, { over: 18, prob: 62 }, { over: 20, prob: 75 }
];

const phaseRRData = [
  { phase: '1-6', rr: 8.4 }, { phase: '7-15', rr: 6.2 }, { phase: '16-20', rr: 12.5 }
];

const momentumData = [
  { over: 1, team1: 8, team2: 10 }, { over: 5, team1: 45, team2: 38 },
  { over: 10, team1: 88, team2: 75 }, { over: 15, team1: 142, team2: 130 },
  { over: 20, team1: 212, team2: 195 },
];

const playerStats = [
  { subject: 'SR', A: 150 }, { subject: 'CONSISTENCY', A: 85 },
  { subject: 'BOUNDARY %', A: 40 }, { subject: 'RUNNING', A: 90 },
  { subject: 'POWER', A: 95 },
];

const MatchInsights = () => {
  const [wagonFilter, setWagonFilter] = useState('all');
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  
  const { state } = useMatchContext();
  const match = state.currentMatch || {};

  const isDormant = match.score === '0' && match.team2Score === '0';

  const currentMomentumData = isDormant ? [] : (match.insights?.momentumData || momentumData);
  const currentWinProbData = isDormant ? [] : (match.insights?.winProbData || winProbData);
  const currentPhaseRR = isDormant ? [] : phaseRRData;
  const currentPlayerStats = isDormant ? [
    { subject: 'SR', A: 0 }, { subject: 'CONSISTENCY', A: 0 },
    { subject: 'BOUNDARY %', A: 0 }, { subject: 'RUNNING', A: 0 },
    { subject: 'POWER', A: 0 },
  ] : playerStats;
  
  const intelReportText = match.intelReport || (isDormant 
    ? `"${match.team1?.name || 'Home Team'} enters this highly anticipated fixture with a slight edge. Early seam movement will be critical in the Powerplay. Expect ${match.team2?.name || 'Away Team'}'s openers to play cautiously before accelerating in the middle overs. Par score projected at 185+."`
    : `"Win probability has shifted by 12% in the last 3 overs. Run rate acceleration is currently exceeding the league average by 1.5x. Strategy indicates heavy targeting for boundary bounds in the death."`
  );

  return (
    <div className="mt-20 px-4 space-y-8 pb-20 relative z-10 w-full max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row items-center justify-between mb-10 gap-6">
        <div className="flex items-center gap-4">
          <div className="h-10 w-1.5 bg-ipl-neon rounded-full shadow-[0_0_20px_#0ea5e9]"></div>
          <div>
            <h2 className="text-4xl font-black uppercase tracking-tighter italic text-white">
              Data <span className="text-ipl-neon">Lab</span>
            </h2>
            <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.3em] mt-1">Advanced Performance Metrics</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-8 py-3 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase hover:bg-ipl-neon hover:text-black transition-all group shadow-xl">
          <Download className="w-4 h-4 group-hover:animate-bounce" /> Export Match Report
        </button>
      </div>

      {isDormant && (
        <div className="space-y-6 mb-12">
           <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-[3rem] p-10 border border-ipl-neon/20 bg-gradient-to-r from-ipl-neon/10 via-transparent to-transparent flex flex-col md:flex-row items-center gap-10">
             <div className="w-20 h-20 rounded-[2rem] bg-ipl-neon/20 flex items-center justify-center shadow-[0_0_30px_rgba(14,165,233,0.2)] border border-ipl-neon/30 shrink-0">
               <ShieldAlert className="w-10 h-10 text-ipl-neon" />
             </div>
             <div className="flex-1 space-y-4">
                <div className="flex items-center gap-2">
                  <Quote className="w-4 h-4 text-ipl-neon opacity-50" />
                  <h4 className="text-xs font-black uppercase tracking-[0.4em] text-ipl-neon">Pre-Match AI Prediction</h4>
                </div>
                <p className="text-sm md:text-lg text-gray-300 font-medium leading-relaxed italic tracking-wide">
                  {intelReportText}
                </p>
             </div>
           </motion.div>

           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-[3rem] p-8 border border-white/10 bg-white/5">
                  <div className="flex items-center gap-2 mb-8">
                    <CloudRain className="w-5 h-5 text-ipl-neon" />
                    <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">Match Conditions</h3>
                  </div>
                  <div className="space-y-6">
                     <div className="flex items-center justify-between border-b border-white/5 pb-4">
                        <div className="flex items-center gap-3"><Thermometer className="w-4 h-4 text-gray-500"/><span className="text-xs font-bold text-gray-300">Temperature</span></div>
                        <span className="text-lg font-black text-white">28°C</span>
                     </div>
                     <div className="flex items-center justify-between border-b border-white/5 pb-4">
                        <div className="flex items-center gap-3"><Wind className="w-4 h-4 text-gray-500"/><span className="text-xs font-bold text-gray-300">Wind Speed</span></div>
                        <span className="text-lg font-black text-white">14 km/h <span className="text-[10px] text-gray-500">(SW)</span></span>
                     </div>
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3"><MapPin className="w-4 h-4 text-gray-500"/><span className="text-xs font-bold text-gray-300">Pitch Type</span></div>
                        <span className="text-sm font-black text-ipl-neon uppercase text-right">Hard & Dry</span>
                     </div>
                  </div>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-[3rem] p-8 border border-white/10 bg-white/5 flex flex-col justify-center relative overflow-hidden">
                  <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-8 text-center">Head to Head</h3>
                  <div className="flex items-center justify-between w-full relative z-10 px-4">
                     <div className="flex flex-col items-center">
                        <img src={match.team1?.logo} className="w-16 h-16 object-contain mb-3 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]" alt=""/>
                        <span className="text-3xl font-black">14</span>
                        <span className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Wins</span>
                     </div>
                     <div className="text-2xl font-black italic text-white/20">VS</div>
                     <div className="flex flex-col items-center">
                        <img src={match.team2?.logo} className="w-16 h-16 object-contain mb-3 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]" alt=""/>
                        <span className="text-3xl font-black">11</span>
                        <span className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Wins</span>
                     </div>
                  </div>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass p-8 rounded-[3rem] border border-white/10 bg-white/5 flex flex-col items-center justify-center text-center">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-6">Pre-Match Win Predictor</h4>
                <div className="relative w-36 h-36 flex items-center justify-center mb-2">
                   <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                      <circle cx="72" cy="72" r="62" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
                      <circle cx="72" cy="72" r="62" fill="none" stroke={match.team1?.color || 'var(--ipl-neon)'} strokeWidth="10" strokeDasharray={`${(match.winProb || 50) * 3.9} 390`} className="transition-all duration-1000 ease-out" />
                   </svg>
                   <div className="flex flex-col items-center">
                      <span className="text-3xl font-black tracking-tighter" style={{ color: match.team1?.color || '#fff' }}>{match.winProb || 50}%</span>
                   </div>
                </div>
                <p className="text-[10px] font-bold uppercase text-gray-500 tracking-widest mt-1">Slight Edge for <span className="text-ipl-neon">{(match.winProb || 50) >= 50 ? match.team1?.name : match.team2?.name}</span></p>
              </motion.div>
           </div>
        </div>
      )}

      {/* Main Graphs Grid - Rendered Always, Empty if Dormant */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 relative">
        {/* If dormant, add a generic overlay */}
        {isDormant && (
           <div className="absolute inset-0 z-20 bg-black/40 backdrop-blur-[2px] rounded-[3rem] flex items-center justify-center border border-white/5 pointer-events-none">
              <div className="px-8 py-4 bg-black/80 rounded-full border border-white/10 shadow-2xl flex items-center gap-3">
                 <Activity className="w-5 h-5 text-ipl-neon animate-pulse" />
                 <span className="text-white font-black tracking-widest uppercase text-xs">Visualizing Matrix Offline - Awaiting Live Feed</span>
              </div>
           </div>
        )}

        {/* 1. Momentum Shift */}
        <motion.div whileHover={{ y: -5 }} className="md:col-span-8 glass rounded-[3rem] p-8 border border-white/10 bg-white/5 relative z-10">
          <div className="flex items-center gap-2 mb-8">
            <Activity className="w-4 h-4 text-ipl-neon" />
            <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest">Momentum Shift</h3>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={currentMomentumData}>
                <defs>
                  <linearGradient id="colorT1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis dataKey="over" stroke="#ffffff20" fontSize={10} axisLine={false} tickLine={false} />
                <YAxis hide />
                {currentMomentumData.length > 0 && <Tooltip contentStyle={{ backgroundColor: '#020617', border: 'none', borderRadius: '16px' }} />}
                <Area type="monotone" dataKey="team1" stroke="#0ea5e9" strokeWidth={4} fill="url(#colorT1)" dot={{ r: 4, fill: '#0ea5e9' }} />
                <Area type="monotone" dataKey="team2" stroke="#f43f5e" strokeWidth={2} fill="transparent" strokeDasharray="5 5" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* 2. Live Win Prob Path */}
        <motion.div whileHover={{ y: -5 }} className="md:col-span-4 glass rounded-[3rem] p-8 border border-white/10 bg-white/5 relative z-10">
          <div className="flex items-center gap-2 mb-8">
            <TrendingUp className="w-4 h-4 text-ipl-neon" />
            <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">Live Win Prob</h3>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={currentWinProbData}>
                <XAxis dataKey="over" hide />
                <YAxis hide domain={[0, 100]} />
                {currentWinProbData.length > 0 && <Tooltip contentStyle={{ backgroundColor: '#020617', border: 'none', borderRadius: '12px', fontSize: '10px' }} />}
                <Line type="monotone" dataKey="prob" stroke="#0ea5e9" strokeWidth={4} dot={{ r: 4, fill: '#0ea5e9' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* 3. Key Battle (Reduced opacity when dormant) */}
        <motion.div whileHover={{ y: -5 }} className={`md:col-span-4 glass rounded-[3rem] p-8 border border-white/10 bg-gradient-to-br from-white/5 to-ipl-accent/5 relative overflow-hidden z-10 ${isDormant ? 'opacity-50' : ''}`}>
          <div className="flex items-center gap-2 mb-8">
            <Swords className="w-5 h-5 text-ipl-accent" />
            <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">Impact Duel</h3>
          </div>
          <div className="flex flex-col items-center gap-8">
             <div className="flex items-center justify-between w-full px-4">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full border-2 border-ipl-neon p-1 mb-3 mx-auto flex items-center justify-center bg-white/5 overflow-hidden">
                    <img src="https://cricketvectors.akamaized.net/teams/IPL/BCCI.png" className="w-8 h-8 opacity-50" alt="Batter" />
                  </div>
                  <p className="text-[10px] font-black uppercase text-white">{match.batsmen?.[0]?.name || 'Batter 1'}</p>
                </div>
                <div className="text-2xl font-black italic text-white/20 animate-pulse">VS</div>
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full border-2 border-ipl-accent p-1 mb-3 mx-auto flex items-center justify-center bg-white/5 overflow-hidden">
                    <img src="https://cricketvectors.akamaized.net/teams/IPL/BCCI.png" className="w-8 h-8 opacity-50" alt="Bowler" />
                  </div>
                  <p className="text-[10px] font-black uppercase text-white">{match.bowlers?.[0]?.name || 'Bowler 1'}</p>
                </div>
             </div>
             <div className="w-full space-y-4 bg-black/40 p-5 rounded-[2rem] border border-white/5 shadow-inner">
                <div className="flex justify-between text-[11px] font-black">
                   <span className="text-gray-500 uppercase tracking-widest">Active Strike Rate</span>
                   <span className="text-ipl-neon">{isDormant ? '0.0' : (match.batsmen?.[0]?.sr || '0.0')}</span>
                </div>
                <div className="pt-2">
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: isDormant ? "0%" : `${Math.min((parseFloat(match.batsmen?.[0]?.sr || 0) / 200) * 100, 100)}%` }} className="h-full bg-ipl-accent shadow-[0_0_10px_#f43f5e]" />
                  </div>
                  <p className="text-[8px] text-gray-600 font-bold mt-2 uppercase text-center">{isDormant ? 'AWAITING COMBAT' : 'Live Form Pulse'}</p>
                </div>
             </div>
          </div>
        </motion.div>

        {/* 4. Phase Run Rate */}
        <motion.div whileHover={{ y: -5 }} className="md:col-span-4 glass rounded-[3rem] p-8 border border-white/10 bg-white/5 relative z-10">
          <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-8 text-center">Phase Run Rate</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={currentPhaseRR}>
                <XAxis dataKey="phase" stroke="#ffffff20" fontSize={10} axisLine={false} tickLine={false} />
                {currentPhaseRR.length > 0 && <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ backgroundColor: '#020617', border: 'none' }} />}
                <Bar dataKey="rr" radius={[10, 10, 0, 0]}>
                  {currentPhaseRR.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.rr > 10 ? '#0ea5e9' : '#ffffff20'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* 5. Wagon Wheel - Original Static Visual Retained, dimmed if Dormant */}
        <motion.div whileHover={{ y: -5 }} className={`md:col-span-4 glass rounded-[3rem] p-8 border border-white/10 bg-white/5 relative z-10 ${isDormant ? 'opacity-30' : ''}`}>
          <div className="flex justify-between items-center mb-10">
            <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest">Wagon Wheel</h3>
            <div className="flex gap-2">
              {['all', '4s', '6s'].map(f => (
                <button 
                  key={f} 
                  onClick={() => setWagonFilter(f)} 
                  className={`px-4 py-1 rounded-full text-[9px] font-black uppercase transition-all ${wagonFilter === f ? 'bg-ipl-neon text-black shadow-lg shadow-ipl-neon/30' : 'bg-white/5 border border-white/10 text-gray-500 hover:text-white'}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="relative w-56 h-56 mx-auto border-2 border-dashed border-white/10 rounded-full flex items-center justify-center bg-white/5">
            <div className="w-14 h-28 bg-green-500/10 border border-green-500/20 rounded-xl"></div>
            <AnimatePresence>
              {(!isDormant && (wagonFilter === 'all' || wagonFilter === '4s')) && (
                <>
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute h-0.5 w-24 bg-ipl-neon/40 top-1/2 left-1/2 origin-left rotate-45 rounded-full" />
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute h-0.5 w-20 bg-ipl-neon/40 top-1/2 left-1/2 origin-left rotate-[280deg] rounded-full" />
                </>
              )}
              {(!isDormant && (wagonFilter === 'all' || wagonFilter === '6s')) && (
                <>
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute h-1 w-28 bg-yellow-400 top-1/2 left-1/2 origin-left rotate-[160deg] shadow-[0_0_15px_yellow] rounded-full" />
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute h-1 w-32 bg-yellow-400 top-1/2 left-1/2 origin-left rotate-[210deg] shadow-[0_0_15px_yellow] rounded-full" />
                </>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* 6. Pitch Heatmap - Static Visual retained, dimmed if Dormant */}
        <motion.div whileHover={{ y: -5 }} className={`md:col-span-4 glass rounded-[3rem] p-8 border border-white/10 bg-white/5 relative z-10 ${isDormant ? 'opacity-30' : ''}`}>
          <div className="flex items-center gap-3 mb-10">
            <Target className="w-5 h-5 text-ipl-neon" />
            <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">Pitch Heatmap</h3>
          </div>
          <div className="w-full h-60 bg-green-950/20 border border-white/10 rounded-[2rem] relative flex items-center justify-center overflow-hidden">
              <div className="w-24 h-48 border-2 border-white/10 rounded-lg flex flex-col bg-black/20">
                 <div className="flex-1 border-b border-white/10 flex items-center justify-center bg-red-500/5"><span className="text-[7px] text-gray-600 font-black uppercase">Short</span></div>
                 <div className="flex-1 border-b border-white/10 flex items-center justify-center bg-yellow-500/5"><span className="text-[7px] text-gray-600 font-black uppercase">Good</span></div>
                 <div className="flex-1 flex items-center justify-center bg-green-500/5"><span className="text-[7px] text-gray-600 font-black uppercase">Full</span></div>
              </div>
              {!isDormant && <motion.div animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0.7, 0.3] }} className="absolute w-6 h-6 bg-ipl-neon rounded-full blur-md top-20 left-1/2" />}
          </div>
        </motion.div>

        {/* 7. Player Radar */}
        <motion.div whileHover={{ y: -5 }} className="md:col-span-4 glass rounded-[3rem] p-8 border border-white/10 bg-white/5 relative z-10">
          <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-10 text-center">Performance Radar</h3>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={currentPlayerStats}>
                <PolarGrid stroke="#ffffff10" />
                <PolarAngleAxis dataKey="subject" stroke="#ffffff40" fontSize={10} fontWeight="bold" />
                <Radar name="Player" dataKey="A" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={isDormant ? 0.1 : 0.5} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
        
        {/* Live Match Intel - Displayed conditionally within grid if active */}
        {!isDormant && (
          <motion.div whileHover={{ y: -5 }} className="md:col-span-12 glass rounded-[3rem] p-10 border border-ipl-neon/20 bg-gradient-to-r from-ipl-neon/10 via-transparent to-transparent flex flex-col md:flex-row items-center gap-10">
            <div className="w-20 h-20 rounded-[2rem] bg-ipl-neon/20 flex items-center justify-center shadow-[0_0_30px_rgba(14,165,233,0.2)] border border-ipl-neon/30 shrink-0">
              <Zap className="w-10 h-10 text-ipl-neon fill-ipl-neon" />
            </div>
            <div className="flex-1 space-y-4">
               <div className="flex items-center gap-2">
                 <Quote className="w-4 h-4 text-ipl-neon opacity-50" />
                 <h4 className="text-xs font-black uppercase tracking-[0.4em] text-ipl-neon">Match Intel Report</h4>
               </div>
               <p className="text-sm md:text-base text-gray-300 font-medium leading-relaxed italic tracking-wide">
                 {intelReportText}
               </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Motion Byte Video Integration */}
      <motion.div whileHover={{ y: -5 }} className="glass rounded-[3rem] p-8 md:p-12 border border-white/10 bg-white/5 relative mt-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h3 className="text-2xl font-black italic uppercase tracking-tighter text-white">
              Official IPL <span className="text-ipl-accent">Highlights</span>
            </h3>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Epic Match Recaps</p>
          </div>
          <a href="https://www.youtube.com/@iplt20" target="_blank" rel="noreferrer" className="text-[10px] text-white font-bold uppercase tracking-widest bg-ipl-accent/20 hover:bg-ipl-accent/40 text-ipl-accent px-4 py-2 rounded-full border border-ipl-accent/30 transition-colors">
            Subscribe Channel
          </a>
        </div>
        <div className="w-full aspect-video rounded-3xl overflow-hidden border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative group bg-black cursor-pointer" onClick={() => setIsVideoLoaded(true)}>
          {!isVideoLoaded ? (
            <div className="relative w-full h-full">
              <img src="https://img.youtube.com/vi/gP0H49pMksg/maxresdefault.jpg" className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" alt="Video Thumbnail" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 bg-ipl-accent/80 hover:bg-ipl-accent rounded-full flex items-center justify-center border border-white/20 transition-transform group-hover:scale-110 shadow-[0_0_30px_rgba(244,63,94,0.6)]">
                  <Play className="w-8 h-8 text-white fill-white ml-1" />
                </div>
              </div>
            </div>
          ) : (
            <iframe width="100%" height="100%" src="https://www.youtube.com/embed/gP0H49pMksg?autoplay=1&modestbranding=1&rel=0" title="Official IPL Highlight" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="w-full h-full"></iframe>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default MatchInsights;