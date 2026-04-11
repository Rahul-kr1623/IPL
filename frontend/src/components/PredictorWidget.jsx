import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Zap, Users, CheckCircle2 } from 'lucide-react';
import { useMatchContext } from '../context/MatchContext';

const PredictorWidget = () => {
  const { state } = useMatchContext();
  const match = state.currentMatch || { team1: { name: 'CSK' }, team2: { name: 'RCB' } };
  const [voted, setVoted] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);

  const [votes, setVotes] = useState({ teamA: 64, teamB: 36 });

  const handleVote = (team) => {
    setSelectedTeam(team);
    setVoted(true);
  };

  return (
    <section className="w-full py-8">
      <div className="glass bg-gradient-to-br from-ipl-neon/10 to-transparent border border-ipl-neon/20 rounded-[2.5rem] p-8 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-ipl-neon/10 blur-[80px] rounded-full pointer-events-none" />
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
          <div className="space-y-2 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2 text-ipl-neon">
              <Zap className="w-4 h-4 fill-ipl-neon" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em]">Fan Prediction</span>
            </div>
            <h3 className="text-2xl font-black italic uppercase tracking-tighter text-white">
              Who will win <span className="text-ipl-neon text-3xl">Tonight?</span>
            </h3>
            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">
              {match.team1?.name} vs {match.team2?.name} • 24,512 Votes Polled
            </p>
          </div>

          <div className="w-full md:w-auto flex flex-col gap-4 min-w-[300px]">
            {!voted ? (
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => handleVote(match.team1?.name)}
                  className="group relative overflow-hidden px-8 py-4 bg-white/5 border border-white/10 rounded-2xl hover:border-ipl-neon transition-all"
                >
                  <span className="relative z-10 font-black text-[12px] uppercase text-white group-hover:text-ipl-neon transition-colors">{match.team1?.name}</span>
                  <div className="absolute inset-0 bg-ipl-neon/5 translate-y-full group-hover:translate-y-0 transition-transform" />
                </button>
                
                <button 
                  onClick={() => handleVote(match.team2?.name)}
                  className="group relative overflow-hidden px-8 py-4 bg-white/5 border border-white/10 rounded-2xl hover:border-ipl-neon transition-all"
                >
                  <span className="relative z-10 font-black text-[12px] uppercase text-white group-hover:text-ipl-neon transition-colors">{match.team2?.name}</span>
                  <div className="absolute inset-0 bg-ipl-neon/5 translate-y-full group-hover:translate-y-0 transition-transform" />
                </button>
              </div>
            ) : (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
                <div className="space-y-3">
                  <div className="relative h-10 w-full bg-white/5 rounded-xl overflow-hidden border border-white/10">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${votes.teamA}%` }} className="absolute inset-y-0 left-0 bg-ipl-neon flex items-center px-4">
                      <span className="text-[10px] font-black text-black">{match.team1?.name} {votes.teamA}%</span>
                    </motion.div>
                  </div>
                  <div className="relative h-10 w-full bg-white/5 rounded-xl overflow-hidden border border-white/10">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${votes.teamB}%` }} className="absolute inset-y-0 left-0 bg-white/20 flex items-center px-4">
                      <span className="text-[10px] font-black text-white">{match.team2?.name} {votes.teamB}%</span>
                    </motion.div>
                  </div>
                </div>
                <p className="text-[9px] text-center text-ipl-neon font-black uppercase tracking-widest flex items-center justify-center gap-2">
                   <CheckCircle2 className="w-3 h-3" /> Thanks for voting, Captain!
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