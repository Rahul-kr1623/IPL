import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Zap, Target, Shield, TrendingUp, Star, Loader2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TEAM_COLORS } from '../utils/constants.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Dummy match history for the graph
const matchHistory = [
  { match: 'Match 1', runs: 45 }, { match: 'Match 2', runs: 12 },
  { match: 'Match 3', runs: 88 }, { match: 'Match 4', runs: 34 },
  { match: 'Match 5', runs: 56 },
];

const PlayerDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [playerData, setPlayerData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlayer = async () => {
      try {
        const response = await fetch(`${API_URL}/api/v1/data/players`);
        const data = await response.json();
        const p = data.players?.find(p => String(p.id) === String(id));
        setPlayerData(p);
      } catch (error) {
        console.error('Failed to load player:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchPlayer();
  }, [id]);

  if (loading) {
    return (
      <div className="w-full flex justify-center items-center h-[60vh]">
        <Loader2 className="w-10 h-10 text-ipl-neon animate-spin" />
      </div>
    );
  }

  if (!playerData) {
    return (
      <div className="w-full flex flex-col justify-center items-center h-[60vh]">
        <p className="text-xl font-black text-gray-500 uppercase">Player Not Found</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-ipl-neon underline font-bold uppercase text-xs tracking-widest">Go Back</button>
      </div>
    );
  }

  const teamColor = TEAM_COLORS[playerData.activeTeam] || '#0ea5e9';
  const displayRole = (playerData.role && playerData.role.trim()) ? playerData.role : (playerData.bowlingStyle ? 'Bowler/All-Rounder' : 'Batter');
  const sr = playerData.careerBatting?.sr || 0;
  const avg = playerData.careerBatting?.avg || 0;

  return (
    <div className="w-full py-10 space-y-10 relative z-10">
      {/* Back Button */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-400 hover:text-ipl-neon transition-colors group">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        <span className="text-[10px] font-black uppercase tracking-widest">Back</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left: Player Profile Card */}
        <div className="lg:col-span-4 space-y-6">
          <div className="glass p-8 rounded-[3rem] border border-white/10 bg-white/5 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 blur-[60px] opacity-20" style={{ backgroundColor: teamColor }} />
            <div className="w-32 h-32 rounded-full mx-auto mb-6 p-1 border-2 border-dashed" style={{ borderColor: teamColor }}>
              <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${playerData.name}`} className="w-full h-full rounded-full bg-white/5" alt={playerData.name} />
            </div>
            <h2 className="text-3xl font-black italic uppercase tracking-tighter">{playerData.name}</h2>
            <p className="font-bold uppercase tracking-[0.3em] text-[10px] mt-2" style={{ color: teamColor }}>{displayRole}</p>
            {playerData.activeTeam && (
              <p className="text-gray-400 font-black text-xs uppercase tracking-widest mt-2">Team: <span className="text-white">{playerData.activeTeam}</span></p>
            )}
            
            <div className="grid grid-cols-2 gap-4 mt-8">
              <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                <p className="text-[8px] text-gray-500 uppercase font-black">Batting SR</p>
                <p className="text-xl font-mono font-black">{sr}</p>
              </div>
              <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                <p className="text-[8px] text-gray-500 uppercase font-black">Batting Avg</p>
                <p className="text-xl font-mono font-black">{avg}</p>
              </div>
            </div>
          </div>

          {/* AI Intel Card */}
          <div className="glass p-6 rounded-[2rem] border bg-opacity-5" style={{ borderColor: `${teamColor}40`, backgroundColor: `${teamColor}10` }}>
             <div className="flex items-center gap-2 mb-4">
                <Zap className="w-4 h-4" style={{ color: teamColor, fill: teamColor }} />
                <h4 className="text-[10px] font-black uppercase tracking-widest text-white">AI Analysis</h4>
             </div>
             <p className="text-xs text-gray-400 leading-relaxed italic">
                "{playerData.name} shows dynamic capability against varying bowling attacks. Strongly performs in mid-overs. Recommended strategy based on recent historical metrics."
             </p>
          </div>
        </div>

        {/* Right: Performance Graph */}
        <div className="lg:col-span-8 space-y-6">
          <div className="glass p-8 rounded-[3rem] border border-white/10 bg-white/5 h-full">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                <TrendingUp className="w-4 h-4" style={{ color: teamColor }} /> Recent Performance
              </h3>
              <div className="text-[10px] font-black text-gray-500 uppercase">Season 2025-26</div>
            </div>
            
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={matchHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                  <XAxis dataKey="match" stroke="#ffffff20" fontSize={10} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', border: 'none', borderRadius: '16px' }} />
                  <Line type="monotone" dataKey="runs" stroke={teamColor} strokeWidth={4} dot={{ r: 6, fill: teamColor }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Achievements Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
               {['Key Player', 'Match Winner', 'Fan Favorite'].map(badge => (
                 <div key={badge} className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                    <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                    <span className="text-[8px] font-black uppercase tracking-widest">{badge}</span>
                 </div>
               ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default PlayerDetail;