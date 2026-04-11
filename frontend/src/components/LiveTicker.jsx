import React from 'react';
import { motion } from 'framer-motion';

// Mock Data: In real app, this will come from your API
const matches = [
  { id: 1, t1: 'CSK', t2: 'MI', s1: '184/4', ov: '18.2', status: 'LIVE', last6: ['1', '4', 'W', '0', '6', '1'], alert: 'six' },
  { id: 2, t1: 'RCB', t2: 'KKR', s1: '150/2', ov: '15.0', status: 'LIVE', last6: ['1', '1', '2', '0', '4', 'W'], alert: null },
  { id: 3, t1: 'GT', t2: 'LSG', s1: '210/6', ov: '20.0', status: 'INNINGS BREAK', last6: ['6', '6', 'W', '1', '4', '2'], alert: null },
  { id: 4, t1: 'DC', t2: 'PBKS', s1: '120/9', ov: '19.4', status: 'LIVE', last6: ['W', '0', 'W', '1', '0', 'W'], alert: 'wicket' },
];

const TickerCard = ({ match }) => (
  <div className={`flex items-center gap-6 px-8 py-2 border-r border-white/5 cursor-pointer hover:bg-white/5 transition-all group relative overflow-hidden ${match.alert === 'wicket' ? 'animate-[pulse_1s_infinite] bg-red-900/20' : ''}`}>
    
    {/* Team Info */}
    <div className="flex items-center gap-3">
      <div className="flex -space-x-2">
        <img src={`https://cricketvectors.akamaized.net/teams/IPL/${match.t1}.png`} alt={match.t1} className="w-6 h-6 object-contain" />
        <img src={`https://cricketvectors.akamaized.net/teams/IPL/${match.t2}.png`} alt={match.t2} className="w-6 h-6 object-contain" />
      </div>
      <span className="font-bold text-sm tracking-tighter">{match.t1} vs {match.t2}</span>
    </div>

    {/* Score & Monospace Font */}
    <div className="flex flex-col items-start leading-tight">
      <span className={`font-mono text-base font-black ${match.alert === 'six' ? 'text-green-400 animate-bounce' : 'text-white'}`}>
        {match.s1} <span className="text-[10px] text-gray-400">({match.ov})</span>
      </span>
      {/* Secret Sauce: Last 6 Balls */}
      <div className="flex gap-1 mt-0.5">
        {match.last6.map((ball, i) => (
          <span key={i} className={`w-3 h-3 flex items-center justify-center rounded-full text-[7px] font-bold border ${
            ball === 'W' ? 'bg-red-500 border-red-400 text-white' : 
            ball === '6' || ball === '4' ? 'bg-green-500 border-green-400 text-white' : 
            'bg-white/10 border-white/20 text-gray-300'
          }`}>
            {ball}
          </span>
        ))}
      </div>
    </div>

    {/* Status Tag */}
    <div className={`text-[8px] px-1.5 py-0.5 rounded-sm font-bold tracking-widest ${
      match.status === 'LIVE' ? 'bg-red-600/20 text-red-500 animate-pulse' : 'bg-gray-700 text-gray-400'
    }`}>
      {match.status}
    </div>
  </div>
);

const LiveTicker = () => {
  return (
    <div className="fixed top-[86px] w-full z-40 bg-black/40 backdrop-blur-md border-b border-white/5">
      {/* Edge Blur Mask */}
      <div className="relative w-full overflow-hidden h-[50px] [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        
        <motion.div 
          className="flex whitespace-nowrap absolute"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          whileHover={{ animationPlayState: 'paused' }}
        >
          {/* Duplicate list for infinite scroll */}
          {[...matches, ...matches].map((match, index) => (
            <TickerCard key={index} match={match} />
          ))}
        </motion.div>
      </div>
    </div>
  );
};

export default LiveTicker;