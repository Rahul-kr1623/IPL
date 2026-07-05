import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Shield, Zap, Target, Star, Swords, X, ChevronRight, Loader2 } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import Pagination from '../components/Pagination.jsx';

const ROLE_ICON = {
  'Batter': <Target className="w-4 h-4" />,
  'Bowler': <Zap className="w-4 h-4" />,
  'WK-Batter': <Shield className="w-4 h-4" />,
  'All-Rounder': <Star className="w-4 h-4" />,
};

const TEAM_COLORS = {
  CSK: '#F7B111', MI: '#004BA0', RCB: '#CC0000', KKR: '#3A225D',
  RR: '#EA1A85', SRH: '#FF822A', DC: '#005CA5', PBKS: '#ED1B24',
  GT: '#1B2133', LSG: '#0ea5e9',
};

const Players = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState('All');
  const [compareList, setCompareList] = useState([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedRole]);

  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/v1/data/players');
        const data = await response.json();
        setPlayers(data.players || []);
      } catch (error) {
        console.error('Failed to load players:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchPlayers();
  }, []);

  const filteredPlayers = useMemo(() => {
    return players.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = selectedRole === 'All' || p.role === selectedRole;
      return matchesSearch && matchesRole;
    });
  }, [searchTerm, selectedRole, players]);

  const toggleCompare = (player) => {
    if (compareList.find(p => p.id === player.id)) {
      setCompareList(compareList.filter(p => p.id !== player.id));
    } else {
      if (compareList.length < 2) {
        setCompareList([...compareList, player]);
      }
    }
  };

  const getChartData = () => {
    if (compareList.length !== 2) return [];
    const [p1, p2] = compareList;
    
    // Normalize stats for comparison (0 to 100 scale roughly)
    const normalize = (val, max) => Math.min(100, Math.max(0, ((val || 0) / max) * 100));

    return [
      {
        subject: 'Batting Avg',
        A: normalize(p1.careerBatting?.avg, 50),
        B: normalize(p2.careerBatting?.avg, 50),
        fullMark: 100,
      },
      {
        subject: 'Strike Rate',
        A: normalize(p1.careerBatting?.sr, 180),
        B: normalize(p2.careerBatting?.sr, 180),
        fullMark: 100,
      },
      {
        subject: 'Boundaries',
        A: normalize((p1.careerBatting?.fours || 0) + (p1.careerBatting?.sixes || 0), 800),
        B: normalize((p2.careerBatting?.fours || 0) + (p2.careerBatting?.sixes || 0), 800),
        fullMark: 100,
      },
      {
        subject: 'Bowling Avg', // Lower is better, inverted for chart
        A: p1.careerBowling?.avg ? 100 - normalize(p1.careerBowling?.avg, 50) : 0,
        B: p2.careerBowling?.avg ? 100 - normalize(p2.careerBowling?.avg, 50) : 0,
        fullMark: 100,
      },
      {
        subject: 'Wickets',
        A: normalize(p1.careerBowling?.wickets, 200),
        B: normalize(p2.careerBowling?.wickets, 200),
        fullMark: 100,
      }
    ];
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-8 py-10 relative z-10 space-y-10">
      
      {/* Header & Search */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter italic uppercase text-white">
            Player <span className="text-ipl-neon">Database</span>
          </h1>
          <p className="text-gray-400 font-bold tracking-widest uppercase text-xs mt-2">
            Explore and compare IPL legends
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input 
              type="text" 
              placeholder="Search players..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full sm:w-64 bg-white/5 border border-white/10 rounded-full py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-ipl-neon/50 transition-colors"
            />
          </div>
          <select 
            value={selectedRole} 
            onChange={e => setSelectedRole(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-full py-2.5 px-4 text-sm text-gray-300 focus:outline-none focus:border-ipl-neon/50 cursor-pointer"
          >
            <option value="All">All Roles</option>
            <option value="Batter">Batter</option>
            <option value="Bowler">Bowler</option>
            <option value="WK-Batter">WK-Batter</option>
            <option value="All-Rounder">All-Rounder</option>
          </select>
        </div>
      </div>

      {/* Floating Compare Action Bar */}
      <AnimatePresence>
        {compareList.length > 0 && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 glass bg-slate-900/90 border border-white/20 rounded-full px-6 py-3 flex items-center gap-6 shadow-2xl shadow-ipl-neon/20"
          >
            <div className="flex items-center gap-4">
              {compareList.map(p => (
                <div key={p.id} className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-white/10 border border-white/20">
                    <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                  </div>
                  <span className="text-sm font-bold text-white hidden sm:block">{p.name}</span>
                </div>
              ))}
              {compareList.length === 1 && (
                <span className="text-sm font-medium text-gray-400 italic">Select one more player...</span>
              )}
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => setCompareList([])}
                className="p-2 rounded-full hover:bg-white/10 text-gray-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <button 
                disabled={compareList.length !== 2}
                onClick={() => setShowCompareModal(true)}
                className={`px-4 py-2 rounded-full text-xs font-black tracking-widest uppercase transition-colors flex items-center gap-2 ${
                  compareList.length === 2 
                  ? 'bg-ipl-neon text-black hover:bg-white' 
                  : 'bg-white/5 text-gray-500 cursor-not-allowed'
                }`}
              >
                <Swords className="w-4 h-4" /> Compare
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-8 h-8 text-ipl-neon animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredPlayers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((player, idx) => {
            const color = TEAM_COLORS[player.activeTeam] || '#888';
            const isSelected = compareList.find(p => p.id === player.id);

          return (
            <motion.div
              key={player.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={`glass rounded-3xl border overflow-hidden relative group flex flex-col transition-all duration-300 ${
                isSelected ? 'border-ipl-neon ring-1 ring-ipl-neon/50' : 'border-white/10 hover:border-white/20'
              }`}
            >
              {/* Background gradient */}
              <div className="absolute top-0 right-0 w-32 h-32 blur-3xl opacity-20 transition-opacity group-hover:opacity-40" 
                style={{ backgroundColor: color }} />
              
              {/* Top Banner */}
              <div className="h-16 relative flex items-start justify-between p-4 z-10" style={{ background: `linear-gradient(to right, ${color}20, transparent)` }}>
                <span className="text-[10px] font-black uppercase tracking-widest text-white/70 px-2 py-1 rounded bg-black/30 border border-white/10 backdrop-blur-md">
                  {player.activeTeam || 'Free Agent'}
                </span>
                <button 
                  onClick={() => toggleCompare(player)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center border transition-colors ${
                    isSelected ? 'bg-ipl-neon border-ipl-neon text-black' : 'bg-black/30 border-white/20 text-white hover:bg-white/20'
                  }`}
                  title="Compare"
                >
                  <Swords className="w-4 h-4" />
                </button>
              </div>

              {/* Avatar & Info */}
              <div className="px-6 pb-6 pt-2 flex flex-col items-center text-center z-10 flex-1">
                <div className="w-24 h-24 rounded-full border-4 bg-slate-800 flex items-center justify-center overflow-hidden mb-4 relative z-10 shadow-xl"
                  style={{ borderColor: color }}>
                  <img src={player.image} alt={player.name} className="w-full h-full object-cover" />
                </div>
                
                <h3 className="text-xl font-black text-white tracking-tight mb-1">{player.name}</h3>
                
                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400 tracking-widest uppercase mb-4">
                  <span style={{ color }}>{ROLE_ICON[player.role]}</span>
                  {player.role}
                </div>

                <div className="grid grid-cols-2 gap-4 w-full mb-6 text-left">
                  <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                    <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest mb-1">Matches</p>
                    <p className="text-lg font-mono text-white">{player.careerBatting?.matches || player.careerBowling?.matches || 0}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                    <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest mb-1">Runs/Wkts</p>
                    <p className="text-lg font-mono text-ipl-neon">
                      {player.role.includes('Bowler') ? player.careerBowling?.wickets : player.careerBatting?.runs}
                    </p>
                  </div>
                </div>

                <Link 
                  to={`/player/${player.id}`}
                  className="mt-auto w-full py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold text-xs tracking-widest uppercase flex justify-center items-center gap-2 transition-colors"
                >
                  View Stats <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </motion.div>
          );
        })}
          </div>
          
          <Pagination 
            currentPage={currentPage}
            totalPages={Math.ceil(filteredPlayers.length / itemsPerPage)}
            onPageChange={setCurrentPage}
          />
        </>
      )}

      {/* Compare Modal */}
      <AnimatePresence>
        {showCompareModal && compareList.length === 2 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex justify-center items-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-4xl bg-[#0f172a] border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                <h2 className="text-2xl font-black italic tracking-tighter uppercase text-white flex items-center gap-3">
                  <Swords className="text-ipl-neon" /> Face-off
                </h2>
                <button onClick={() => setShowCompareModal(false)} className="text-gray-400 hover:text-white p-2">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 md:p-10 flex flex-col lg:flex-row gap-10 overflow-y-auto">
                
                {/* Players Column */}
                <div className="flex flex-row lg:flex-col justify-around gap-6 lg:w-1/3">
                  {compareList.map((p, i) => (
                    <div key={p.id} className="flex flex-col items-center text-center">
                      <div className={`w-20 h-20 md:w-32 md:h-32 rounded-full border-4 flex items-center justify-center overflow-hidden mb-3 bg-slate-800 shadow-xl ${i === 0 ? 'border-blue-500' : 'border-ipl-neon'}`}>
                        <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                      </div>
                      <h3 className="text-lg md:text-2xl font-black text-white tracking-tight">{p.name}</h3>
                      <p className="text-xs font-bold tracking-widest text-gray-500 uppercase mt-1">{p.role}</p>
                    </div>
                  ))}
                </div>

                {/* Radar Chart */}
                <div className="lg:w-2/3 h-[400px] flex-shrink-0 bg-white/5 rounded-2xl border border-white/10 p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={getChartData()}>
                      <PolarGrid stroke="#334155" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name={compareList[0].name} dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.4} strokeWidth={2} />
                      <Radar name={compareList[1].name} dataKey="B" stroke="#bfff00" fill="#bfff00" fillOpacity={0.4} strokeWidth={2} />
                      <Legend wrapperStyle={{ paddingTop: '20px' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }} itemStyle={{ fontWeight: 'bold' }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default Players;