import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, BarChart2, RefreshCw, AlertTriangle } from 'lucide-react';
import { useMatchContext } from '../context/MatchContext';

const COMM_STYLES = {
  wicket: { border: 'border-red-500', bg: 'bg-red-500/10', tag: 'WICKET!', tagCl: 'text-red-400' },
  boundary: { border: 'border-green-500', bg: 'bg-green-500/10', tag: 'BOUNDARY!', tagCl: 'text-green-400 italic underline' },
  normal: { border: 'border-white/15', bg: 'bg-white/5', tag: null, tagCl: '' },
};

const DEFAULT_POLLS = [
  { q: 'Who wins this high-stakes clash?', opts: ['Team 1', 'Team 2'] },
  { q: 'Will there be a Super Over today?', opts: ['Yes! 🔥', 'No way'] },
  { q: 'Next boundary coming this over?', opts: ['Yes 💥', 'Dot balls'] },
  { q: 'Will a wicket fall in the next 2 overs?', opts: ['Wicket incoming', 'Batsmen safe'] },
];

const getVoterId = () => {
  try {
    let id = localStorage.getItem('ipl_voter_id');
    if (!id) {
      id = 'voter_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      localStorage.setItem('ipl_voter_id', id);
    }
    return id;
  } catch {
    return 'anon_voter_' + Date.now();
  }
};

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const PulseEngagement = () => {
  const [isHovered, setIsHovered] = useState(false);
  const [commentary, setCommentary] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pollIdx, setPollIdx] = useState(0);
  const [votedChoice, setVotedChoice] = useState(null);
  const [pollData, setPollData] = useState({
    votesA: 0,
    votesB: 0,
    totalVotes: 0,
  });

  const { state, socket } = useMatchContext();
  const match = state.currentMatch || state.slot1 || state.slot2;

  const currentPollTemplate = DEFAULT_POLLS[pollIdx];
  const t1 = match?.team1?.name || 'Team 1';
  const t2 = match?.team2?.name || 'Team 2';

  const pollQuestion = currentPollTemplate.q;
  const pollOptionA = currentPollTemplate.opts[0] === 'Team 1' ? t1 : currentPollTemplate.opts[0];
  const pollOptionB = currentPollTemplate.opts[1] === 'Team 2' ? t2 : currentPollTemplate.opts[1];
  const matchKey = `${t1}_${t2}_P${pollIdx}`;

  // ── Sync Poll with Socket ──────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onPollData = (data) => {
      if (data.matchKey === matchKey) {
        setPollData({
          votesA: data.votesA || 0,
          votesB: data.votesB || 0,
          totalVotes: data.totalVotes || 0,
        });
      }
    };

    const onPollUpdated = (data) => {
      if (data.matchKey === matchKey) {
        setPollData({
          votesA: data.votesA || 0,
          votesB: data.votesB || 0,
          totalVotes: data.totalVotes || 0,
        });
      }
    };

    socket.on('pollData', onPollData);
    socket.on('pollUpdated', onPollUpdated);

    // Request poll state
    socket.emit('getPoll', {
      slot: match?.slot || 'slot1',
      matchKey,
      question: pollQuestion,
      optionA: pollOptionA,
      optionB: pollOptionB,
    });

    return () => {
      socket.off('pollData', onPollData);
      socket.off('pollUpdated', onPollUpdated);
    };
  }, [socket, matchKey, pollQuestion, pollOptionA, pollOptionB, match?.slot]);

  // Check if voter already voted on this poll
  useEffect(() => {
    try {
      const votedKey = `voted_${matchKey}`;
      const existing = localStorage.getItem(votedKey);
      setVotedChoice(existing || null);
    } catch {
      setVotedChoice(null);
    }
  }, [matchKey]);

  // Rotate poll question every 4 minutes
  useEffect(() => {
    const t = setInterval(() => {
      setPollIdx((p) => (p + 1) % DEFAULT_POLLS.length);
    }, 4 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const handleVote = (choice) => {
    if (votedChoice || !socket) return;
    const voterId = getVoterId();
    setVotedChoice(choice);
    try {
      localStorage.setItem(`voted_${matchKey}`, choice);
    } catch { }

    socket.emit('castPollVote', {
      slot: match?.slot || 'slot1',
      matchKey,
      choice,
      voterId,
    });
  };

  const total = pollData.totalVotes;
  const pctA = total > 0 ? Math.round((pollData.votesA / total) * 100) : 50;
  const pctB = total > 0 ? 100 - pctA : 50;

  const liveComm = match?.commentary || [];

  return (
    <motion.aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      animate={{ width: isHovered ? 300 : 12 }}
      transition={{ type: 'spring', damping: 28, stiffness: 200 }}
      className="fixed right-0 top-1/2 -translate-y-1/2 h-[600px] bg-[#120808]/95 border border-rose-500/20 backdrop-blur-2xl rounded-l-3xl overflow-hidden z-[60] shadow-[-20px_0_60px_rgba(0,0,0,0.6)]"
    >
      {/* Slim glow bar */}
      <AnimatePresence>
        {!isHovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center h-full"
          >
            <div
              className="w-[3px] h-28 bg-gradient-to-b from-transparent via-rose-500 to-transparent rounded-full animate-pulse"
              style={{ boxShadow: '0 0 12px #f43f5e' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded panel */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            key="pulse"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.18 }}
            className="p-5 w-[300px] h-full flex flex-col gap-4 text-white"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-rose-400" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Live Pulse</span>
              </div>
              {match?.status === 'LIVE' && (
                <span className="text-[8px] bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded font-black tracking-widest animate-pulse">
                  LIVE
                </span>
              )}
            </div>

            {/* Commentary feed */}
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0" style={{ scrollbarWidth: 'none' }}>
              {liveComm.length > 0 ? (
                liveComm.slice(0, 15).map((item, i) => {
                  const s = COMM_STYLES[item.type] || COMM_STYLES.normal;
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className={`p-3 rounded-xl border-l-2 text-[10px] ${s.bg} ${s.border}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        {s.tag && <span className={`text-[9px] font-black uppercase ${s.tagCl}`}>{s.tag}</span>}
                        {item.over && <span className="text-gray-400 font-mono text-[9px] ml-auto">{item.over}</span>}
                      </div>
                      <p className="text-gray-200 leading-relaxed font-sans">{item.text}</p>
                    </motion.div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 py-8 text-center">
                  <AlertTriangle className="w-7 h-7 text-gray-600" />
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest font-black">
                    Awaiting Live Over Data
                  </p>
                  <p className="text-[9px] text-gray-600">
                    Ball-by-ball commentary streams dynamically once match is in progress.
                  </p>
                </div>
              )}
            </div>

            {/* Real Fan Poll */}
            <div className="border-t border-white/10 pt-4 flex-shrink-0 space-y-3">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Live Fan Poll</span>
                {votedChoice && <span className="ml-auto text-[8px] text-emerald-400 font-bold">Voted ✓</span>}
              </div>

              <p className="text-xs font-bold leading-snug text-white">{pollQuestion}</p>

              <div className="space-y-2">
                {[
                  { label: pollOptionA, choice: 'A', pct: pctA },
                  { label: pollOptionB, choice: 'B', pct: pctB },
                ].map((opt, i) => (
                  <button
                    key={opt.choice}
                    onClick={() => handleVote(opt.choice)}
                    disabled={!!votedChoice}
                    className={`relative w-full h-9 rounded-xl border overflow-hidden text-left transition-all ${
                      !votedChoice
                        ? 'border-white/10 bg-white/5 hover:border-rose-400/50 hover:bg-white/10 cursor-pointer'
                        : votedChoice === opt.choice
                        ? 'border-rose-500/50 bg-rose-500/10 cursor-default'
                        : 'border-white/5 opacity-60 cursor-default'
                    }`}
                  >
                    {votedChoice && (
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${opt.pct}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        className={`absolute inset-0 ${i === 0 ? 'bg-blue-500/20' : 'bg-rose-500/20'}`}
                      />
                    )}
                    <div className="absolute inset-0 flex justify-between items-center px-3">
                      <span className={`text-[10px] font-black uppercase ${votedChoice === opt.choice ? 'text-white' : 'text-gray-300'}`}>
                        {opt.label}
                      </span>
                      {votedChoice && (
                        <span className="text-[10px] font-mono font-black text-white">
                          {opt.pct}%
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <p className="text-[8px] text-gray-500 text-right font-mono">
                {total} live votes recorded
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
};

export default PulseEngagement;