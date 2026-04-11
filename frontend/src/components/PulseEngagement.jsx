import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, BarChart2, RefreshCw, AlertTriangle } from 'lucide-react';
import { useMatchContext } from '../context/MatchContext';

const COMM_STYLES = {
  wicket:   { border:'border-red-500',   bg:'bg-red-500/10',   tag:'WICKET!',    tagCl:'text-red-400' },
  boundary: { border:'border-green-500', bg:'bg-green-500/10', tag:'BOUNDARY!',  tagCl:'text-green-400 italic underline' },
  normal:   { border:'border-white/15',  bg:'bg-white/5',      tag:null,         tagCl:'' },
};

const POLLS = [
  { q:'Will there be a Super Over today?',        opts:['Yes!', 'No way'] },
  { q:'Who wins this match?',                     opts:['Team 1', 'Team 2'] },
  { q:'Will there be a century in this innings?', opts:['Absolutely', 'Unlikely'] },
  { q:'Next ball: boundary or dot?',              opts:['Boundary 🔥', 'Dot ball'] },
  { q:'Will a wicket fall this over?',            opts:['Yes', 'No'] },
];

const PulseEngagement = () => {
  const [isHovered,  setIsHovered]  = useState(false);
  const [commentary, setCommentary] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [pollIdx,    setPollIdx]    = useState(0);
  const [voted,      setVoted]      = useState(null);
  const [votes,      setVotes]      = useState([52, 48]);

  const { state } = useMatchContext();
  const match = state.currentMatch;

  // ── Fetch commentary ────────────────────────────────────────────────────────
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res  = await fetch('http://localhost:5000/api/v1/commentary');
        const json = await res.json();
        if (json.commentary?.length > 0) setCommentary(json.commentary);
        setLoading(false);
      } catch { setLoading(false); }
    };
    fetch_();
    const t = setInterval(fetch_, 40000);
    return () => clearInterval(t);
  }, []);

  // ── Rotate poll every 3 min ──────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      setPollIdx(p => (p + 1) % POLLS.length);
      setVoted(null);
      setVotes([52, 48]);
    }, 3 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Use match.commentary if richer, else fetched
  const liveComm = (match?.commentary?.length ?? 0) > (commentary.length ?? 0)
    ? match.commentary : commentary;

  const poll = POLLS[pollIdx];
  const pollOpts = poll.opts.map((o, i) => {
    if (o === 'Team 1' && match?.team1?.name) return match.team1.name;
    if (o === 'Team 2' && match?.team2?.name) return match.team2.name;
    return o;
  });

  const handleVote = (idx) => {
    if (voted !== null) return;
    setVoted(idx);
    const bump = Math.floor(Math.random() * 12) + 5;
    const a = idx === 0 ? Math.min(92, votes[0] + bump) : Math.max(8, votes[0] - bump);
    setVotes([a, 100 - a]);
  };

  return (
    <motion.aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      animate={{ width: isHovered ? 288 : 12 }}
      transition={{ type:'spring', damping:28, stiffness:200 }}
      className="fixed right-0 top-1/2 -translate-y-1/2 h-[580px] bg-[#1a0808]/95 border border-rose-500/20 backdrop-blur-2xl rounded-l-3xl overflow-hidden z-[60] shadow-[-20px_0_60px_rgba(0,0,0,0.6)]"
    >
      {/* Slim glow */}
      <AnimatePresence>
        {!isHovered && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="flex items-center justify-center h-full">
            <div className="w-[3px] h-28 bg-gradient-to-b from-transparent via-rose-500 to-transparent rounded-full animate-pulse"
              style={{ boxShadow:'0 0 12px #f43f5e' }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded panel */}
      <AnimatePresence>
        {isHovered && (
          <motion.div key="pulse"
            initial={{opacity:0, x:16}} animate={{opacity:1, x:0}} exit={{opacity:0, x:16}}
            transition={{duration:0.18}}
            className="p-5 w-[288px] h-full flex flex-col gap-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-rose-400" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Live Pulse</span>
              </div>
              {loading && <RefreshCw className="w-3 h-3 text-rose-400 animate-spin" />}
            </div>

            {/* Commentary feed */}
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0" style={{scrollbarWidth:'none'}}>
              {liveComm.length > 0 ? (
                liveComm.slice(0, 10).map((item, i) => {
                  const s = COMM_STYLES[item.type] || COMM_STYLES.normal;
                  return (
                    <motion.div key={i}
                      initial={{opacity:0, x:10}} animate={{opacity:1, x:0}}
                      transition={{delay: i * 0.03}}
                      className={`p-3 rounded-xl border-l-2 text-[10px] ${s.bg} ${s.border}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        {s.tag && <span className={`text-[9px] font-black uppercase ${s.tagCl}`}>{s.tag}</span>}
                        {item.over && <span className="text-gray-600 font-mono text-[9px] ml-auto">{item.over}</span>}
                      </div>
                      <p className="text-gray-300 leading-relaxed">{item.text}</p>
                    </motion.div>
                  );
                })
              ) : loading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_,i) => <div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse" />)}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 py-8 text-center">
                  <AlertTriangle className="w-8 h-8 text-gray-700" />
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest font-black">
                    Commentary unavailable
                  </p>
                  <p className="text-[9px] text-gray-700">
                    Cricbuzz scraper didn't extract ball-by-ball data this cycle.
                  </p>
                </div>
              )}
            </div>

            {/* Poll */}
            <div className="border-t border-white/5 pt-4 flex-shrink-0 space-y-3">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-3 h-3 text-rose-400" />
                <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Live Poll</span>
                {voted !== null && <span className="ml-auto text-[8px] text-green-500 font-bold">Voted ✓</span>}
              </div>

              <p className="text-xs font-bold italic leading-snug text-white">{poll.q}</p>

              <div className="space-y-2">
                {pollOpts.map((opt, i) => (
                  <button key={i} onClick={() => handleVote(i)} disabled={voted !== null}
                    className={`relative w-full h-9 rounded-xl border overflow-hidden text-left transition-all
                      ${voted === null
                        ? 'border-white/10 bg-white/5 hover:border-ipl-neon/40 hover:bg-ipl-neon/10 cursor-pointer'
                        : voted === i ? 'border-ipl-neon/40 cursor-default' : 'border-white/5 opacity-50 cursor-default'}`}>
                    {voted !== null && (
                      <motion.div
                        initial={{width:0}} animate={{width:`${votes[i]}%`}}
                        transition={{duration:0.6, ease:'easeOut'}}
                        className={`absolute inset-0 ${i===0 ? 'bg-ipl-neon/20' : 'bg-rose-500/20'}`}
                      />
                    )}
                    <div className="absolute inset-0 flex justify-between items-center px-3">
                      <span className={`text-[10px] font-black uppercase ${voted===i ? 'text-white' : 'text-gray-400'}`}>
                        {opt}
                      </span>
                      {voted !== null && (
                        <span className={`text-[10px] font-black ${votes[i] > votes[1-i] ? 'text-ipl-neon' : 'text-gray-500'}`}>
                          {votes[i]}%
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              {voted !== null && (
                <p className="text-[8px] text-gray-700 text-right">
                  {Math.floor(Math.random() * 800 + 200)} fans voted
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
};

export default PulseEngagement;