import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, CheckCircle2 } from 'lucide-react';
import { useMatchContext } from '../context/MatchContext';

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

const PredictorWidget = () => {
  const { state, socket } = useMatchContext();
  const [activeSlot, setActiveSlot] = useState('slot1');
  const [votedChoice, setVotedChoice] = useState(null);
  const [pollData, setPollData] = useState({
    votesA: 0,
    votesB: 0,
    totalVotes: 0,
  });

  const slotMatch = activeSlot === 'slot2' ? (state.slot2 || state.slot1) : (state.slot1 || state.slot2);
  const match = slotMatch || {
    team1: { name: 'CSK' },
    team2: { name: 'RCB' },
  };

  const t1 = match.team1?.name || match.teamA || 'Team 1';
  const t2 = match.team2?.name || match.teamB || 'Team 2';
  const matchKey = `PREDICTOR_${t1}_${t2}`;

  // ── Sync Poll State with Socket ──
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

    socket.emit('getPoll', {
      slot: activeSlot,
      matchKey,
      question: `Who will win between ${t1} and ${t2}?`,
      optionA: t1,
      optionB: t2,
    });

    return () => {
      socket.off('pollData', onPollData);
      socket.off('pollUpdated', onPollUpdated);
    };
  }, [socket, matchKey, t1, t2, activeSlot]);

  // Check if voter already voted
  useEffect(() => {
    try {
      const existing = localStorage.getItem(`voted_${matchKey}`);
      setVotedChoice(existing || null);
    } catch {
      setVotedChoice(null);
    }
  }, [matchKey]);

  const handleVote = (choice) => {
    if (votedChoice || !socket) return;
    const voterId = getVoterId();
    setVotedChoice(choice);
    try {
      localStorage.setItem(`voted_${matchKey}`, choice);
    } catch { }

    socket.emit('castPollVote', {
      slot: activeSlot,
      matchKey,
      choice,
      voterId,
    });
  };

  const total = pollData.totalVotes;
  const pctA = total > 0 ? Math.round((pollData.votesA / total) * 100) : 50;
  const pctB = total > 0 ? 100 - pctA : 50;

  const hasDoubleHeader = !!(state.slot1 && state.slot2);

  return (
    <section className="w-full py-8">
      <div className="glass bg-gradient-to-br from-ipl-neon/10 via-transparent to-purple-950/20 border border-ipl-neon/20 rounded-[2.5rem] p-8 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-ipl-neon/10 blur-[80px] rounded-full pointer-events-none" />

        <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
          <div className="space-y-3 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2 text-ipl-neon">
              <Zap className="w-4 h-4 fill-ipl-neon" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em]">Fan Prediction Arena</span>
            </div>

            <h3 className="text-2xl md:text-3xl font-black italic uppercase tracking-tighter text-white">
              Who will take <span className="text-ipl-neon">the Win?</span>
            </h3>

            <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">
              {t1} vs {t2} • <span className="text-white font-mono">{total}</span> Real Fan Votes Recorded
            </p>

            {/* Double header selector */}
            {hasDoubleHeader && (
              <div className="flex gap-2 pt-1 justify-center md:justify-start">
                <button
                  onClick={() => setActiveSlot('slot1')}
                  className={`px-3 py-1 rounded-full text-[9px] font-black uppercase transition-all ${
                    activeSlot === 'slot1'
                      ? 'bg-ipl-neon text-black'
                      : 'bg-white/5 border border-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  3:30 PM Match
                </button>
                <button
                  onClick={() => setActiveSlot('slot2')}
                  className={`px-3 py-1 rounded-full text-[9px] font-black uppercase transition-all ${
                    activeSlot === 'slot2'
                      ? 'bg-ipl-neon text-black'
                      : 'bg-white/5 border border-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  7:30 PM Match
                </button>
              </div>
            )}
          </div>

          <div className="w-full md:w-auto flex flex-col gap-4 min-w-[320px]">
            {!votedChoice ? (
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleVote('A')}
                  className="group relative overflow-hidden px-8 py-5 bg-white/5 border border-white/10 rounded-2xl hover:border-ipl-neon hover:bg-white/10 transition-all text-center"
                >
                  <span className="relative z-10 font-black text-sm uppercase text-white group-hover:text-ipl-neon transition-colors">
                    {t1}
                  </span>
                  <div className="absolute inset-0 bg-ipl-neon/10 translate-y-full group-hover:translate-y-0 transition-transform" />
                </button>

                <button
                  onClick={() => handleVote('B')}
                  className="group relative overflow-hidden px-8 py-5 bg-white/5 border border-white/10 rounded-2xl hover:border-rose-400 hover:bg-white/10 transition-all text-center"
                >
                  <span className="relative z-10 font-black text-sm uppercase text-white group-hover:text-rose-400 transition-colors">
                    {t2}
                  </span>
                  <div className="absolute inset-0 bg-rose-500/10 translate-y-full group-hover:translate-y-0 transition-transform" />
                </button>
              </div>
            ) : (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
                <div className="space-y-3">
                  <div className="relative h-12 w-full bg-white/5 rounded-2xl overflow-hidden border border-white/10">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pctA}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className="absolute inset-y-0 left-0 bg-ipl-neon flex items-center px-4"
                    >
                      <span className="text-xs font-black text-black">
                        {t1} {pctA}%
                      </span>
                    </motion.div>
                  </div>

                  <div className="relative h-12 w-full bg-white/5 rounded-2xl overflow-hidden border border-white/10">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pctB}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className="absolute inset-y-0 left-0 bg-rose-500 flex items-center px-4"
                    >
                      <span className="text-xs font-black text-white">
                        {t2} {pctB}%
                      </span>
                    </motion.div>
                  </div>
                </div>

                <p className="text-[10px] text-center text-emerald-400 font-black uppercase tracking-widest flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Vote Locked! Live percentages reflect real fan submissions.
                </p>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default PredictorWidget;