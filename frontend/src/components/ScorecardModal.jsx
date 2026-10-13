import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiActivity, FiAward, FiMapPin, FiCalendar } from 'react-icons/fi';

const ScorecardModal = ({ isOpen, onClose, match }) => {
  const [activeTab, setActiveTab] = useState('innings1');

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !match) return null;

  const team1 = match.team1?.name || match.teamA || 'Team 1';
  const team2 = match.team2?.name || match.teamB || 'Team 2';

  // Support both LiveMatch (batsmen, bowlers) and completed Match (scorecard.innings1/2) schemas
  const inn1 = match.scorecard?.innings1 || {};
  const inn2 = match.scorecard?.innings2 || {};

  const batting1 = inn1.batting?.length > 0 ? inn1.batting : (match.currentInnings === 1 ? match.batsmen || [] : []);
  const bowling1 = inn1.bowling?.length > 0 ? inn1.bowling : (match.currentInnings === 1 ? match.bowlers || [] : []);

  const batting2 = inn2.batting?.length > 0 ? inn2.batting : (match.currentInnings === 2 ? match.batsmen || [] : []);
  const bowling2 = inn2.bowling?.length > 0 ? inn2.bowling : (match.currentInnings === 2 ? match.bowlers || [] : []);

  const commentaryList = match.commentary || [];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-4xl max-h-[90vh] bg-slate-950/95 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-white z-10"
        >
          {/* Header */}
          <div className="p-6 border-b border-white/10 flex items-start justify-between bg-gradient-to-r from-blue-950/30 to-purple-950/30">
            <div>
              <div className="flex items-center gap-3">
                <span className={`px-2.5 py-0.5 rounded text-xs font-black tracking-widest uppercase ${
                  match.status === 'LIVE' ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse' : 'bg-slate-800 text-slate-300'
                }`}>
                  {match.status}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {match.venue || 'IPL Stadium'}
                </span>
              </div>
              <h2 className="text-2xl font-black mt-2 tracking-tight flex items-center gap-3">
                <span>{team1}</span>
                <span className="text-slate-500 font-light text-base">vs</span>
                <span>{team2}</span>
              </h2>
              {match.result && (
                <p className="text-sm font-semibold text-emerald-400 mt-1 flex items-center gap-1.5">
                  <FiAward className="w-4 h-4" />
                  {match.result}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-white/10 bg-slate-900/50 px-6 gap-2">
            <button
              onClick={() => setActiveTab('innings1')}
              className={`py-3 px-4 font-bold text-xs tracking-wider uppercase transition-colors border-b-2 ${
                activeTab === 'innings1'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              1st Innings ({team1})
            </button>
            <button
              onClick={() => setActiveTab('innings2')}
              className={`py-3 px-4 font-bold text-xs tracking-wider uppercase transition-colors border-b-2 ${
                activeTab === 'innings2'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              2nd Innings ({team2})
            </button>
            <button
              onClick={() => setActiveTab('commentary')}
              className={`py-3 px-4 font-bold text-xs tracking-wider uppercase transition-colors border-b-2 ${
                activeTab === 'commentary'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              Commentary ({commentaryList.length})
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-6 overflow-y-auto flex-1 space-y-6">
            {activeTab === 'innings1' && (
              <div className="space-y-6">
                <ScorecardSection title={`${team1} Batting`} batsmen={batting1} />
                <BowlingSection title={`${team2} Bowling`} bowlers={bowling1} />
              </div>
            )}

            {activeTab === 'innings2' && (
              <div className="space-y-6">
                <ScorecardSection title={`${team2} Batting`} batsmen={batting2} />
                <BowlingSection title={`${team1} Bowling`} bowlers={bowling2} />
              </div>
            )}

            {activeTab === 'commentary' && (
              <div className="space-y-3">
                {commentaryList.length === 0 ? (
                  <p className="text-slate-500 text-center py-8">Commentary stream loading...</p>
                ) : (
                  commentaryList.map((comm, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5 flex gap-4 items-start"
                    >
                      <span className="font-mono text-xs font-bold text-blue-400 bg-blue-500/10 px-2 py-1 rounded shrink-0">
                        {comm.over || `Ball ${idx + 1}`}
                      </span>
                      <p className="text-sm text-slate-300 leading-relaxed">
                        {comm.text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

const ScorecardSection = ({ title, batsmen }) => (
  <div>
    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">{title}</h3>
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
      <table className="w-full text-left text-sm">
        <thead className="bg-white/5 text-xs text-slate-400 uppercase font-mono">
          <tr>
            <th className="py-2.5 px-4">Batter</th>
            <th className="py-2.5 px-3 text-right">R</th>
            <th className="py-2.5 px-3 text-right">B</th>
            <th className="py-2.5 px-3 text-right">4s</th>
            <th className="py-2.5 px-3 text-right">6s</th>
            <th className="py-2.5 px-4 text-right">SR</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 font-mono">
          {batsmen && batsmen.length > 0 ? (
            batsmen.map((b, i) => (
              <tr key={i} className="hover:bg-white/[0.02]">
                <td className="py-2.5 px-4 font-sans font-semibold text-white flex items-center gap-1.5">
                  {b.name}
                  {b.onStrike && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                </td>
                <td className="py-2.5 px-3 text-right font-bold text-white">{b.runs ?? 0}</td>
                <td className="py-2.5 px-3 text-right text-slate-400">{b.balls ?? 0}</td>
                <td className="py-2.5 px-3 text-right text-slate-400">{b.fours ?? 0}</td>
                <td className="py-2.5 px-3 text-right text-slate-400">{b.sixes ?? 0}</td>
                <td className="py-2.5 px-4 text-right text-slate-300">{b.sr || '0.0'}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="6" className="py-4 text-center text-slate-500 font-sans">
                No batting data available yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

const BowlingSection = ({ title, bowlers }) => (
  <div>
    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">{title}</h3>
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
      <table className="w-full text-left text-sm">
        <thead className="bg-white/5 text-xs text-slate-400 uppercase font-mono">
          <tr>
            <th className="py-2.5 px-4">Bowler</th>
            <th className="py-2.5 px-3 text-right">O</th>
            <th className="py-2.5 px-3 text-right">M</th>
            <th className="py-2.5 px-3 text-right">R</th>
            <th className="py-2.5 px-3 text-right">W</th>
            <th className="py-2.5 px-4 text-right">ECON</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 font-mono">
          {bowlers && bowlers.length > 0 ? (
            bowlers.map((bw, i) => (
              <tr key={i} className="hover:bg-white/[0.02]">
                <td className="py-2.5 px-4 font-sans font-semibold text-white">{bw.name}</td>
                <td className="py-2.5 px-3 text-right text-slate-300">{bw.overs ?? '0.0'}</td>
                <td className="py-2.5 px-3 text-right text-slate-400">{bw.maidens ?? 0}</td>
                <td className="py-2.5 px-3 text-right text-slate-300">{bw.runs ?? 0}</td>
                <td className="py-2.5 px-3 text-right font-bold text-emerald-400">{bw.wickets ?? 0}</td>
                <td className="py-2.5 px-4 text-right text-slate-300">{bw.economy || '0.0'}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="6" className="py-4 text-center text-slate-500 font-sans">
                No bowling data available yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

export default ScorecardModal;
