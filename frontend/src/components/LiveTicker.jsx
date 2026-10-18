import React from 'react';
import { motion } from 'framer-motion';
import { useMatchContext } from '../context/MatchContext';

const formatMatchToTicker = (m, slotLabel) => {
  if (!m) return null;
  const t1 = m.team1?.name || m.teamA || 'IPL';
  const t2 = m.team2?.name || m.teamB || 'TBD';
  const score = m.score ? `${m.score}/${m.wickets || '0'}` : (m.team1Score || '0/0');
  const overs = m.overs ? `${m.overs} ov` : (m.team1Overs ? `${m.team1Overs} ov` : '');
  const status = m.status || 'UPCOMING';
  const recent = Array.isArray(m.recent) && m.recent.length > 0 
    ? m.recent 
    : ['·', '·', '·', '·', '·', '·'];
  
  const lastBall = recent[recent.length - 1];
  const alert = lastBall === '6' ? 'six' : (lastBall === 'W' ? 'wicket' : null);

  return {
    id: m.matchId || m._id || `${t1}_${t2}`,
    t1,
    t2,
    score,
    overs,
    status,
    last6: recent,
    alert,
    slotLabel: slotLabel || (m.status === 'LIVE' ? 'LIVE NOW' : 'RECENT')
  };
};

const TickerCard = ({ match }) => {
  if (!match) return null;
  return (
    <div className={`flex items-center gap-6 px-8 py-2 border-r border-white/5 cursor-pointer hover:bg-white/5 transition-all group relative overflow-hidden ${
      match.alert === 'wicket' ? 'animate-[pulse_1s_infinite] bg-red-900/20' : ''
    }`}>
      {/* Team Info */}
      <div className="flex items-center gap-3">
        <div className="flex -space-x-2">
          <img
            src={`https://cricketvectors.akamaized.net/teams/IPL/${match.t1}.png`}
            alt={match.t1}
            className="w-6 h-6 object-contain"
            onError={(e) => { e.target.src = '/logo.svg'; }}
          />
          <img
            src={`https://cricketvectors.akamaized.net/teams/IPL/${match.t2}.png`}
            alt={match.t2}
            className="w-6 h-6 object-contain"
            onError={(e) => { e.target.src = '/logo.svg'; }}
          />
        </div>
        <span className="font-bold text-sm tracking-tighter text-white">
          {match.t1} <span className="text-gray-500 font-normal">vs</span> {match.t2}
        </span>
      </div>

      {/* Score & Monospace Font */}
      <div className="flex flex-col items-start leading-tight">
        <span className={`font-mono text-base font-black ${
          match.alert === 'six' ? 'text-green-400 animate-bounce' : 'text-white'
        }`}>
          {match.score} {match.overs && <span className="text-[10px] text-gray-400 font-normal">({match.overs})</span>}
        </span>

        {/* Real Dynamic Last 6 Balls */}
        <div className="flex gap-1 mt-0.5">
          {match.last6.slice(-6).map((ball, i) => (
            <span
              key={i}
              className={`w-3.5 h-3.5 flex items-center justify-center rounded-full text-[8px] font-bold border transition-transform ${
                ball === 'W'
                  ? 'bg-red-500 border-red-400 text-white'
                  : ball === '6' || ball === '4'
                  ? 'bg-green-500 border-green-400 text-white'
                  : ball === '·'
                  ? 'bg-white/5 border-white/10 text-gray-500'
                  : 'bg-white/10 border-white/20 text-gray-300'
              }`}
            >
              {ball}
            </span>
          ))}
        </div>
      </div>

      {/* Status Tag */}
      <div className={`text-[8px] px-2 py-0.5 rounded font-black tracking-widest uppercase ${
        match.status === 'LIVE' || match.status === 'SUPER OVER'
          ? 'bg-red-600/30 text-red-400 border border-red-500/40 animate-pulse'
          : match.status === 'INNINGS BREAK' || match.status === 'STRATEGIC TIMEOUT'
          ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40'
          : 'bg-white/10 text-gray-400 border border-white/10'
      }`}>
        {match.status}
      </div>
    </div>
  );
};

const LiveTicker = () => {
  const { state } = useMatchContext();

  const dynamicCards = [
    formatMatchToTicker(state.slot1, '3:30 PM MATCH'),
    formatMatchToTicker(state.slot2, '7:30 PM MATCH'),
    formatMatchToTicker(state.latestFinished, 'RECENT RESULT')
  ].filter(Boolean);

  // If no matches at all in memory yet, display a subtle warming up card
  const displayItems = dynamicCards.length > 0 
    ? dynamicCards 
    : [{
        id: 'warmup',
        t1: 'IPL',
        t2: '2026',
        score: 'LIVE HUB',
        overs: 'SYNCING',
        status: 'UPCOMING',
        last6: ['·', '·', '·', '·', '·', '·'],
        alert: null,
      }];

  // Repeat for smooth infinite ticker
  const tickerItems = [...displayItems, ...displayItems, ...displayItems, ...displayItems];

  return (
    <div className="fixed top-[86px] w-full z-40 bg-black/50 backdrop-blur-md border-b border-white/10 shadow-lg">
      <div className="relative w-full overflow-hidden h-[50px] [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <motion.div
          className="flex whitespace-nowrap absolute"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: Math.max(20, tickerItems.length * 6), repeat: Infinity, ease: "linear" }}
          whileHover={{ animationPlayState: 'paused' }}
        >
          {tickerItems.map((match, index) => (
            <TickerCard key={`${match.id}_${index}`} match={match} />
          ))}
        </motion.div>
      </div>
    </div>
  );
};

export default LiveTicker;