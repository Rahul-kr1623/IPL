import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Zap, ChevronRight, Users, Combine, X } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { useNavigate } from 'react-router-dom'; // Import Navigate Hook
import { useMatchContext } from '../context/MatchContext';

// Note: Ise baad mein iplData.js se import karna
const playersData = [
  { id: 1, name: "MS Dhoni", team: "CSK", role: "WK-Batsman", stats: "SR: 142.5", color: "#F7B111" },
  { id: 2, name: "Virat Kohli", team: "RCB", role: "Batsman", stats: "Runs: 741", color: "#CC0000" },
  { id: 3, name: "Rohit Sharma", team: "MI", role: "Batsman", stats: "SR: 150.1", color: "#004BA0" },
  { id: 4, name: "Rishabh Pant", team: "DC", role: "WK-Batsman", stats: "Runs: 446", color: "#005CA5" },
  { id: 5, name: "Shubman Gill", team: "GT", role: "Batsman", stats: "Runs: 426", color: "#1B2133" },
  { id: 6, name: "Shreyas Iyer", team: "KKR", role: "Batsman", stats: "Runs: 351", color: "#3A225D" },
  { id: 7, name: "Sanju Samson", team: "RR", role: "WK-Batsman", stats: "SR: 153.4", color: "#EA1A85" },
  { id: 8, name: "KL Rahul", team: "LSG", role: "Batsman", stats: "Runs: 520", color: "#0057E2" },
  { id: 20, name: "Pat Cummins", team: "SRH", role: "Bowler", stats: "Wkts: 18", color: "#F7B111" },
  { id: 22, name: "Sam Curran", team: "PBKS", role: "All-Rounder", stats: "Wkts: 13", color: "#ED1B24" }
];

const teamFilters = ["ALL", "CSK", "MI", "RCB", "RR", "KKR", "GT", "DC", "LSG", "SRH", "PBKS"];

const Players = () => {
  const { state, dispatch } = useMatchContext();
  const searchTerm = state.searchQuery;
  const setSearchTerm = (val) => dispatch({ type: 'SET_SEARCH_QUERY', payload: val });
  
  const [activeTeam, setActiveTeam] = useState("ALL");
  const [compareMode, setCompareMode] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const navigate = useNavigate(); // Hook initialize

  const handlePlayerClick = (player) => {
    if (compareMode) {
      if (selectedPlayers.find(p => p.id === player.id)) {
        setSelectedPlayers(selectedPlayers.filter(p => p.id !== player.id));
      } else if (selectedPlayers.length < 2) {
        setSelectedPlayers([...selectedPlayers, player]);
      }
    } else {
      navigate(`/player/${player.id}`);
    }
  };

  const filteredPlayers = playersData.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTeam = activeTeam === "ALL" || p.team === activeTeam;
    return matchesSearch && matchesTeam;
  });

  return (
    <div className="w-full py-10 space-y-12 relative z-10">
      <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-6">
        <div className="border-l-4 border-ipl-neon pl-6">
          <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white">
            Players <span className="text-ipl-neon">Hub</span>
          </h2>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px] mt-2 italic">
            Squad Analytics 2026 • Road to Glory
          </p>
        </div>
        
        <div className="relative w-full md:w-80 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-ipl-neon transition-colors" />
          <input 
            type="text" 
            placeholder="Search Player..." 
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm focus:border-ipl-neon outline-none backdrop-blur-md transition-all shadow-inner"
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pb-4 no-scrollbar overflow-x-auto">
        {teamFilters.map(team => (
          <button
            key={team}
            onClick={() => setActiveTeam(team)}
            className={`px-5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border shrink-0 ${
              activeTeam === team 
                ? 'bg-ipl-neon text-black border-ipl-neon shadow-[0_0_15px_#0ea5e9]' 
                : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30 hover:text-white'
            }`}
          >
            {team}
          </button>
        ))}
        
        <button
          onClick={() => { setCompareMode(!compareMode); setSelectedPlayers([]); }}
          className={`ml-auto px-5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border flex items-center gap-2 ${
            compareMode 
              ? 'bg-ipl-accent text-white border-ipl-accent shadow-[0_0_15px_#f43f5e]' 
              : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30 hover:text-white'
          }`}
        >
          <Combine className="w-3 h-3" /> Compare Mode {compareMode ? 'ON' : 'OFF'}
        </button>
      </div>

      <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <AnimatePresence mode='popLayout'>
          {filteredPlayers.map((player) => (
            <motion.div 
              layout
              key={player.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              whileHover={{ y: -10 }}
              className={`glass bg-white/5 border rounded-[2.5rem] p-6 group relative overflow-hidden cursor-pointer transition-all ${
                selectedPlayers.find(p => p.id === player.id) 
                  ? 'border-ipl-accent shadow-[0_0_20px_rgba(244,63,94,0.3)]' 
                  : 'border-white/10'
              }`}
            >
              <div className="absolute -top-10 -right-10 w-32 h-32 blur-[50px] opacity-10 transition-all group-hover:opacity-20" style={{ backgroundColor: player.color }} />
              
              <div className="flex flex-col items-center">
                <div className="w-24 h-24 rounded-full p-1 border-2 border-dashed border-white/10 group-hover:border-ipl-neon transition-all duration-500 mb-4 overflow-hidden bg-white/5 flex items-center justify-center">
                  <img 
                    src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${player.name}`} 
                    alt={player.name} 
                    className="w-full h-full rounded-full"
                  />
                </div>

                <h3 className="text-lg font-black uppercase tracking-tighter text-white group-hover:text-ipl-neon transition-colors">
                  {player.name}
                </h3>
                
                <span 
                  className="text-[9px] font-black px-4 py-1 rounded-full mt-3 tracking-widest uppercase" 
                  style={{ backgroundColor: `${player.color}20`, color: player.color, border: `1px solid ${player.color}40` }}
                >
                  {player.team}
                </span>

                <p className="text-[10px] text-gray-500 mt-3 uppercase font-bold tracking-widest">{player.role}</p>
                
                <div className="mt-4 flex items-center gap-2 text-ipl-neon font-mono text-xs font-black bg-ipl-neon/5 px-3 py-1 rounded-lg">
                  <Zap className="w-3 h-3 fill-ipl-neon" /> {player.stats}
                </div>

                {/* REDIRECT OR SELECT */}
                <button 
                  onClick={() => handlePlayerClick(player)}
                  className={`w-full mt-8 py-3 bg-white/5 border rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all group/btn ${
                    selectedPlayers.find(p => p.id === player.id)
                      ? 'bg-ipl-accent text-white border-ipl-accent hover:bg-red-500'
                      : compareMode
                        ? 'border-white/10 hover:border-ipl-accent hover:text-ipl-accent'
                        : 'border-white/10 group-hover:bg-ipl-neon group-hover:text-black group-hover:border-ipl-neon'
                  }`}
                >
                  {compareMode 
                    ? selectedPlayers.find(p => p.id === player.id) ? 'Deselect' : 'Select Player'
                    : 'View Full Profile'
                  }
                  {!compareMode && <ChevronRight className="w-3 h-3 group-hover/btn:translate-x-1 transition-transform" />}
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Comparison Overlay Radar */}
      <AnimatePresence>
        {selectedPlayers.length === 2 && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className="fixed bottom-10 left-1/2 z-[200] w-[90%] md:w-[500px] glass bg-ipl-dark/95 border border-white/10 rounded-[2rem] p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)]"
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-black italic uppercase tracking-tighter text-white">
                Head to <span className="text-ipl-accent">Head</span>
              </h3>
              <button 
                onClick={() => setSelectedPlayers([])}
                className="p-1 hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="flex gap-4 items-center">
               <div className="flex-1 text-center bg-white/5 rounded-xl py-2">
                 <p className="text-sm font-black" style={{color: selectedPlayers[0].color}}>{selectedPlayers[0].name}</p>
                 <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">{selectedPlayers[0].team}</p>
               </div>
               <div className="text-2xl font-black italic text-white/20 px-2 lg:px-4">VS</div>
               <div className="flex-1 text-center bg-white/5 rounded-xl py-2">
                 <p className="text-sm font-black" style={{color: selectedPlayers[1].color}}>{selectedPlayers[1].name}</p>
                 <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">{selectedPlayers[1].team}</p>
               </div>
            </div>

            <div className="w-full h-56 mt-6">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={[
                  { subject: 'Strike Rate', A: 140 + Math.random()*20, B: 135 + Math.random()*20 },
                  { subject: 'Power', A: 80 + Math.random()*15, B: 85 + Math.random()*15 },
                  { subject: 'Consistency', A: 90 - Math.random()*20, B: 80 + Math.random()*15 },
                  { subject: 'Form', A: 80 + Math.random()*15, B: 70 + Math.random()*20 },
                  { subject: 'Impact', A: 95 - Math.random()*10, B: 88 + Math.random()*10 }
                ]}>
                  <PolarGrid stroke="#ffffff20" />
                  <PolarAngleAxis dataKey="subject" stroke="#ffffff50" fontSize={10} fontWeight="bold" />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', border: 'none', borderRadius: '12px', fontSize: '10px' }} cursor={false} />
                  <Radar name={selectedPlayers[0].name} dataKey="A" stroke={selectedPlayers[0].color} fill={selectedPlayers[0].color} fillOpacity={0.4} />
                  <Radar name={selectedPlayers[1].name} dataKey="B" stroke={selectedPlayers[1].color} fill={selectedPlayers[1].color} fillOpacity={0.4} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Players;