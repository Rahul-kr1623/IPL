import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Target, Users } from 'lucide-react';

const Sidebar = ({ isOpen, setIsOpen }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Background Overlay */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
          />

          {/* Sidebar Content */}
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full md:w-96 bg-ipl-dark/90 backdrop-blur-2xl z-[70] border-l border-white/10 p-8 shadow-[-20px_0_50px_rgba(0,0,0,0.5)]"
          >
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-xl font-black italic tracking-tighter">
                MATCH <span className="text-ipl-neon font-black">INTEL</span>
              </h3>
              <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-8">
              {/* 1. AI Analysis Card */}
              <div className="p-5 rounded-2xl bg-white/5 border border-white/5 group hover:border-ipl-neon/30 transition-all">
                <div className="flex items-center gap-3 mb-3">
                  <Zap className="w-5 h-5 text-ipl-neon fill-ipl-neon/20" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">AI Momentum</span>
                </div>
                <p className="text-sm leading-relaxed text-gray-300">
                  "CSK has a 85% success rate when needing 12+ runs in the final over at Chepauk. MI needs a yorker-length execution here."
                </p>
              </div>

              {/* 2. Live Poll */}
              <div className="p-5 rounded-2xl bg-white/5 border border-white/5">
                <div className="flex items-center gap-3 mb-4">
                  <Target className="w-5 h-5 text-ipl-accent" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Fan Prediction</span>
                </div>
                <p className="text-sm font-bold mb-4 italic">Will Dhoni finish with a SIX?</p>
                <div className="space-y-3">
                  <button className="w-full py-3 rounded-xl border border-white/10 text-xs font-bold hover:bg-ipl-neon/20 hover:border-ipl-neon transition-all">YES (72%)</button>
                  <button className="w-full py-3 rounded-xl border border-white/10 text-xs font-bold hover:bg-white/10 transition-all">NO (28%)</button>
                </div>
              </div>

              {/* 3. Fantasy Impact Players */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <Users className="w-5 h-5 text-green-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Impact Players</span>
                </div>
                <div className="flex gap-2">
                   {['MSD', 'BUMRAH', 'SKY'].map(player => (
                     <div key={player} className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-bold">{player}</div>
                   ))}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default Sidebar;