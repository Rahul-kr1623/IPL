import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Users, TrendingUp, TrendingDown, Zap, Shield, Loader2 } from 'lucide-react';
import { TEAM_COLORS } from '../utils/constants.js';

const PITCH_COLORS = { Batting:'#10b981', Spin:'#f59e0b', Balanced:'#0ea5e9' };

const Stadiums = () => {
  const [filter, setFilter] = useState('ALL');
  const pitchTypes = ['ALL', 'Batting', 'Spin', 'Balanced'];
  const [stadiumsRaw, setStadiumsRaw] = useState({ stadiums: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/v1/data/stadiums');
        const data = await response.json();
        // Handle array or object structure
        setStadiumsRaw(Array.isArray(data) ? { stadiums: data } : data);
      } catch (error) {
        console.error('Failed to fetch stadiums:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const stadiums = useMemo(() => {
    if (!stadiumsRaw.stadiums) return [];
    if (filter === 'ALL') return stadiumsRaw.stadiums;
    return stadiumsRaw.stadiums.filter(s => s.pitchType === filter);
  }, [filter, stadiumsRaw]);

  if (loading) {
    return (
      <div className="w-full flex justify-center items-center h-[60vh]">
        <Loader2 className="w-10 h-10 text-ipl-neon animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-8 py-10 relative z-10 space-y-10">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="border-l-4 border-ipl-neon pl-6">
          <h2 className="text-4xl font-black italic uppercase tracking-tighter">
            Stadiums <span className="text-ipl-neon">&amp; Pitches</span>
          </h2>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px] mt-2">
            {stadiumsRaw.stadiums.length} IPL Venues · Pitch Reports &amp; Stats
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {pitchTypes.map(pt => (
            <button key={pt} onClick={() => setFilter(pt)}
              className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border
                ${filter === pt
                  ? 'text-black border-transparent shadow-lg'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:border-white/30'}`}
              style={filter === pt ? { backgroundColor: PITCH_COLORS[pt] || '#0ea5e9' } : {}}
            >{pt}</button>
          ))}
        </div>
      </div>

      {/* Stats overview */}
      {stadiumsRaw.stadiums.length > 0 && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label:'Total Venues', val: stadiumsRaw.stadiums.length, icon:'🏟️' },
          { label:'Avg 1st Innings', val: Math.round(stadiumsRaw.stadiums.reduce((a,s)=>a+(s.avgFirst||s.stats?.avgFirstInnings||0),0)/stadiumsRaw.stadiums.length), icon:'🏏', suffix:' runs' },
          { label:'Batting Tracks', val: stadiumsRaw.stadiums.filter(s=>s.pitchType==='Batting').length, icon:'📈' },
          { label:'Spin Tracks',    val: stadiumsRaw.stadiums.filter(s=>s.pitchType==='Spin').length,    icon:'🌀' },
        ].map(card => (
          <div key={card.label} className="glass bg-white/5 border border-white/10 rounded-2xl p-5 text-center">
            <div className="text-3xl mb-2">{card.icon}</div>
            <p className="text-2xl font-black text-ipl-neon">{card.val}{card.suffix || ''}</p>
            <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mt-1">{card.label}</p>
          </div>
        ))}
      </div>
      )}

      {/* Stadium Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {stadiums.map((s, i) => {
          const homeColor = s.homeTeam ? (TEAM_COLORS[s.homeTeam] || '#fff') : '#4b5563';
          const pitchColor = PITCH_COLORS[s.pitchType] || '#fff';
          return (
            <motion.div key={s.id}
              initial={{ opacity:0, y:20 }} whileInView={{ opacity:1, y:0 }}
              viewport={{ once:true }} transition={{ delay: i * 0.04 }}
              className="glass bg-white/5 border border-white/10 rounded-3xl overflow-hidden group hover:border-white/20 transition-all"
            >
              {/* Top bar */}
              <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${homeColor}, ${pitchColor})` }} />

              <div className="p-6 space-y-5">
                {/* Name + location */}
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h3 className="text-lg font-black tracking-tight text-white group-hover:text-ipl-neon transition-colors leading-tight">
                      {s.name}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <MapPin className="w-3 h-3 text-gray-500" />
                      <span className="text-xs text-gray-400 font-bold">{s.city}, {s.state}</span>
                    </div>
                  </div>
                  <span className="text-[9px] font-black px-3 py-1.5 rounded-full tracking-widest border shrink-0"
                    style={{ backgroundColor: `${pitchColor}15`, color: pitchColor, borderColor: `${pitchColor}30` }}>
                    {s.pitchType}
                  </span>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <Users className="w-4 h-4 text-gray-500 mx-auto mb-1" />
                    <p className="text-sm font-black text-white">{s.capacity.toLocaleString()}</p>
                    <p className="text-[8px] text-gray-600 uppercase font-bold tracking-wider">Capacity</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <TrendingUp className="w-4 h-4 text-green-400 mx-auto mb-1" />
                    <p className="text-sm font-black text-green-400">{s.avgFirst}</p>
                    <p className="text-[8px] text-gray-600 uppercase font-bold tracking-wider">Avg 1st Inn</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <TrendingDown className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                    <p className="text-sm font-black text-blue-400">{s.avgSecond}</p>
                    <p className="text-[8px] text-gray-600 uppercase font-bold tracking-wider">Avg 2nd Inn</p>
                  </div>
                </div>

                {/* Records */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex gap-2">
                    <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest w-20 shrink-0">High Score</span>
                    <span className="font-bold text-green-400 text-[10px]">{s.highScore || s.stats?.highestScore}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest w-20 shrink-0">Low Score</span>
                    <span className="font-bold text-red-400 text-[10px]">{s.lowScore || s.stats?.lowestScore}</span>
                  </div>
                </div>

                {/* Pitch notes */}
                <p className="text-[10px] text-gray-500 leading-relaxed border-t border-white/5 pt-4">{s.notes}</p>

                {/* Footer */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    {s.homeTeam && (
                      <>
                        <img src={`/logos/${s.homeTeam.toLowerCase()}_logo.png`} alt={s.homeTeam}
                          className="w-6 h-6 object-contain"
                          onError={e => { e.target.style.display = 'none'; }} />
                        <span className="text-[9px] font-black" style={{ color: homeColor }}>Home of {s.homeTeam}</span>
                      </>
                    )}
                  </div>
                  <span className="text-[9px] font-mono text-gray-600">{s.iplMatches} IPL matches</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default Stadiums;
