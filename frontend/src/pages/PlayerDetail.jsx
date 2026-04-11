import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Zap, Target, Shield, TrendingUp, Star } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// Demo Data (Ideally ye iplData.js se aayega)
const matchHistory = [
  { match: 'Match 1', runs: 45 }, { match: 'Match 2', runs: 12 },
  { match: 'Match 3', runs: 88 }, { match: 'Match 4', runs: 34 },
  { match: 'Match 5', runs: 56 },
];

const PlayerDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // Yahan hum ID ke base pe player ka data fetch karenge (abhi ke liye static)
  const player = { name: "MS Dhoni", team: "CSK", role: "WK-Batsman", sr: 142.5, avg: 39.4, color: "#F7B111" };

  return (
    <div className="w-full py-10 space-y-10 relative z-10">
      {/* Back Button */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-400 hover:text-ipl-neon transition-colors group">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        <span className="text-[10px] font-black uppercase tracking-widest">Back to Squad</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left: Player Profile Card */}
        <div className="lg:col-span-4 space-y-6">
          <div className="glass p-8 rounded-[3rem] border border-white/10 bg-white/5 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 blur-[60px] opacity-20" style={{ backgroundColor: player.color }} />
            <div className="w-32 h-32 rounded-full mx-auto mb-6 p-1 border-2 border-dashed border-ipl-neon">
              <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${player.name}`} className="w-full h-full rounded-full bg-white/5" alt="" />
            </div>
            <h2 className="text-3xl font-black italic uppercase tracking-tighter">{player.name}</h2>
            <p className="text-ipl-neon font-bold uppercase tracking-[0.3em] text-[10px] mt-2">{player.role}</p>
            
            <div className="grid grid-cols-2 gap-4 mt-8">
              <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                <p className="text-[8px] text-gray-500 uppercase font-black">Strike Rate</p>
                <p className="text-xl font-mono font-black">{player.sr}</p>
              </div>
              <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                <p className="text-[8px] text-gray-500 uppercase font-black">Average</p>
                <p className="text-xl font-mono font-black">{player.avg}</p>
              </div>
            </div>
          </div>

          {/* AI Intel Card */}
          <div className="glass p-6 rounded-[2rem] border border-ipl-neon/20 bg-ipl-neon/5">
             <div className="flex items-center gap-2 mb-4">
                <Zap className="w-4 h-4 text-ipl-neon fill-ipl-neon" />
                <h4 className="text-[10px] font-black uppercase tracking-widest text-white">AI Analysis</h4>
             </div>
             <p className="text-xs text-gray-400 leading-relaxed italic">
                "Dhoni shows 85% efficiency in death overs when facing high-pace deliveries. Recommended strategy: Slow-cutters and wide yorkers."
             </p>
          </div>
        </div>

        {/* Right: Performance Graph */}
        <div className="lg:col-span-8 space-y-6">
          <div className="glass p-8 rounded-[3rem] border border-white/10 bg-white/5 h-full">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-ipl-neon" /> Recent Performance
              </h3>
              <div className="text-[10px] font-black text-gray-500 uppercase">Season 2025-26</div>
            </div>
            
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={matchHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                  <XAxis dataKey="match" stroke="#ffffff20" fontSize={10} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', border: 'none', borderRadius: '16px' }} />
                  <Line type="monotone" dataKey="runs" stroke="#0ea5e9" strokeWidth={4} dot={{ r: 6, fill: '#0ea5e9' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Achievements Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
               {['5x Trophy Winner', 'Finisher Gold', 'Captain Cool'].map(badge => (
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