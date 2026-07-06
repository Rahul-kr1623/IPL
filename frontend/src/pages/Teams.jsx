import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Trophy, Users, MoveRight, Swords, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import SeasonDropdown from '../components/SeasonDropdown.jsx';
import { CURRENT_SEASON, TEAM_COLORS, TEAM_NAMES } from '../utils/constants.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const teamsData = [
  { id:'csk',  name:'Chennai Super Kings',          short:'CSK',  color:'#F7B111', titles:5, captain:'Ruturaj Gaikwad', founded:2008, homeGround:'MA Chidambaram Stadium' },
  { id:'mi',   name:'Mumbai Indians',                short:'MI',   color:'#004BA0', titles:5, captain:'Hardik Pandya',   founded:2008, homeGround:'Wankhede Stadium' },
  { id:'kkr',  name:'Kolkata Knight Riders',         short:'KKR',  color:'#3A225D', titles:3, captain:'Ajinkya Rahane',  founded:2008, homeGround:'Eden Gardens' },
  { id:'rcb',  name:'Royal Challengers Bengaluru',   short:'RCB',  color:'#CC0000', titles:1, captain:'Rajat Patidar',   founded:2008, homeGround:'M. Chinnaswamy Stadium' },
  { id:'gt',   name:'Gujarat Titans',                short:'GT',   color:'#B59453', titles:1, captain:'Shubman Gill',    founded:2022, homeGround:'Narendra Modi Stadium' },
  { id:'rr',   name:'Rajasthan Royals',              short:'RR',   color:'#EA1A85', titles:1, captain:'Riyan Parag',     founded:2008, homeGround:'Sawai Mansingh Stadium' },
  { id:'srh',  name:'Sunrisers Hyderabad',           short:'SRH',  color:'#FF822A', titles:1, captain:'Pat Cummins',     founded:2013, homeGround:'Rajiv Gandhi Int. Stadium' },
  { id:'dc',   name:'Delhi Capitals',                short:'DC',   color:'#005CA5', titles:0, captain:'Axar Patel',      founded:2008, homeGround:'Arun Jaitley Stadium' },
  { id:'pbks', name:'Punjab Kings',                  short:'PBKS', color:'#ED1B24', titles:0, captain:'Shreyas Iyer',    founded:2008, homeGround:'IS Bindra Stadium, Mohali' },
  { id:'lsg',  name:'Lucknow Super Giants',          short:'LSG',  color:'#0ea5e9', titles:0, captain:'Rishabh Pant',    founded:2022, homeGround:'Ekana Cricket Stadium' },
];

const trophyData = [
  { name:'Chennai Super Kings',          logo:'csk',  count:5, years:'2010, 2011, 2018, 2021, 2023', dot:'#F7B111' },
  { name:'Mumbai Indians',               logo:'mi',   count:5, years:'2013, 2015, 2017, 2019, 2020', dot:'#004BA0' },
  { name:'Kolkata Knight Riders',        logo:'kkr',  count:3, years:'2012, 2014, 2024', dot:'#3A225D' },
  { name:'Royal Challengers Bengaluru',  logo:'rcb',  count:1, years:'2025', dot:'#CC0000' },
  { name:'Gujarat Titans',              logo:'gt',   count:1, years:'2022', dot:'#B59453' },
  { name:'Rajasthan Royals',            logo:'rr',   count:1, years:'2008', dot:'#EA1A85' },
  { name:'Sunrisers Hyderabad',         logo:'srh',  count:1, years:'2016', dot:'#FF822A' },
  { name:'Delhi Capitals',              logo:'dc',   count:0, years:'—',    dot:'#005CA5' },
  { name:'Punjab Kings',                logo:'pbks', count:0, years:'—',    dot:'#ED1B24' },
  { name:'Lucknow Super Giants',        logo:'lsg',  count:0, years:'—',    dot:'#0ea5e9' },
];

// ── H2H helpers ───────────────────────────────────────────────────────────────
const findH2H = (t1, t2, h2hData) => {
  if (!h2hData || !h2hData.records) return null;
  const r = h2hData.records.find(r =>
    (r.team1 === t1 && r.team2 === t2) || (r.team1 === t2 && r.team2 === t1)
  );
  if (!r) return null;
  if (r.team1 === t1) return r;
  return { ...r, team1: r.team2, team2: r.team1, team1Wins: r.team2Wins, team2Wins: r.team1Wins,
    recentForm: [...r.recentForm].reverse() };
};

const SHORTS = teamsData.map(t => t.short);

const Teams = () => {
  const [h2hTeam1, setH2hTeam1] = useState('CSK');
  const [h2hTeam2, setH2hTeam2] = useState('MI');
  const [h2hData, setH2hData] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`${API_URL}/api/v1/data/global/head_to_head`);
        const data = await response.json();
        setH2hData(data);
      } catch (error) {
        console.error('Failed to load head to head data:', error);
      }
    };
    fetchData();
  }, []);

  const h2h = useMemo(() => findH2H(h2hTeam1, h2hTeam2, h2hData), [h2hTeam1, h2hTeam2, h2hData]);
  const c1 = TEAM_COLORS[h2hTeam1] || '#fff';
  const c2 = TEAM_COLORS[h2hTeam2] || '#fff';

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-8 py-10 relative z-10 flex flex-col gap-16">

      {/* ── Franchise Directory ── */}
      <div>
        <div className="mb-10 border-l-4 border-ipl-neon pl-6">
          <h2 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-white">
            Franchise <span className="text-ipl-neon">Directory</span>
          </h2>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px] mt-2">IPL 2026 · Official Teams</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {teamsData.map((team, i) => (
            <motion.div key={team.id}
              initial={{ opacity:0, y:20 }} whileInView={{ opacity:1, y:0 }} whileHover={{ y:-5 }}
              viewport={{ once:true }} transition={{ delay: i * 0.05 }}
              className="relative glass rounded-3xl overflow-hidden border border-white/5 group bg-white/5"
            >
              <div className="absolute -bottom-4 -right-2 text-9xl font-black italic opacity-[0.03] uppercase pointer-events-none" style={{ color: team.color }}>
                {team.short}
              </div>
              <div className="h-1.5 w-full" style={{ backgroundColor: team.color }} />
              <div className="p-6">
                <div className="flex justify-between items-start mb-5">
                  <img src={`/logos/${team.id}_logo.png`} alt={team.short}
                    className="w-16 h-16 object-contain drop-shadow-2xl bg-white/10 rounded-full p-2"
                    onError={e => { e.target.src = 'https://cricketvectors.akamaized.net/teams/IPL/BCCI.png'; }} />
                  <div className="flex flex-col items-end gap-1.5">
                    <div className="flex items-center gap-1 bg-white/10 px-3 py-1 rounded-full border border-white/10">
                      <Trophy className="w-3 h-3 text-yellow-500" />
                      <span className="text-[10px] font-black">{team.titles}</span>
                    </div>
                    <span className="text-[8px] text-gray-600 font-mono">Est. {team.founded}</span>
                  </div>
                </div>
                <div className="space-y-0.5 mb-6">
                  <h3 className="text-xl font-black tracking-tight" style={{ color: team.color }}>{team.name}</h3>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Cap: <span className="text-white">{team.captain}</span></p>
                  <p className="text-[9px] text-gray-600 font-mono">{team.homeGround}</p>
                </div>
                <Link to={`/teams/${team.id}`}
                  className="w-full py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-between px-5 rounded-xl transition-all group-hover:border-white/20"
                >
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-gray-400 group-hover:text-white" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-300">View Squad</span>
                  </div>
                  <MoveRight className="w-4 h-4 text-ipl-neon group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Head to Head ── */}
      <motion.div initial={{ opacity:0, y:20 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true }}
        className="glass rounded-3xl border border-white/10 bg-white/5 overflow-hidden"
      >
        <div className="p-8 border-b border-white/5 flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-ipl-accent/10 rounded-xl border border-ipl-accent/20">
              <Swords className="w-6 h-6 text-ipl-accent" />
            </div>
            <div>
              <h3 className="text-2xl font-black tracking-tighter text-white">Head to Head</h3>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">All-time IPL records</p>
            </div>
          </div>

          {/* Team selectors */}
          <div className="flex items-center gap-3 md:ml-auto flex-wrap">
            <select value={h2hTeam1} onChange={e => setH2hTeam1(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm font-black text-white focus:border-ipl-neon outline-none"
              style={{ color: c1 }}>
              {SHORTS.filter(s => s !== h2hTeam2).map(s => <option key={s} value={s} className="bg-[#0c0c14]">{s}</option>)}
            </select>
            <span className="text-gray-500 font-black italic text-lg">vs</span>
            <select value={h2hTeam2} onChange={e => setH2hTeam2(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm font-black text-white focus:border-ipl-neon outline-none"
              style={{ color: c2 }}>
              {SHORTS.filter(s => s !== h2hTeam1).map(s => <option key={s} value={s} className="bg-[#0c0c14]">{s}</option>)}
            </select>
          </div>
        </div>

        {h2h ? (
          <div className="p-8 space-y-8">
            {/* Win bar */}
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <div className="text-center">
                  <p className="text-3xl font-black" style={{ color: c1 }}>{h2h.team1Wins}</p>
                  <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{h2h.team1} wins</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-gray-500">{h2h.total} matches</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-black" style={{ color: c2 }}>{h2h.team2Wins}</p>
                  <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{h2h.team2} wins</p>
                </div>
              </div>
              <div className="flex h-3 rounded-full overflow-hidden">
                <motion.div className="h-full" style={{ backgroundColor: c1 }}
                  initial={{ width: 0 }} whileInView={{ width: `${(h2h.team1Wins / h2h.total) * 100}%` }}
                  viewport={{ once: true }} transition={{ duration: 1, ease: 'easeOut' }} />
                <motion.div className="h-full" style={{ backgroundColor: c2 }}
                  initial={{ width: 0 }} whileInView={{ width: `${(h2h.team2Wins / h2h.total) * 100}%` }}
                  viewport={{ once: true }} transition={{ duration: 1, ease: 'easeOut', delay: 0.1 }} />
              </div>
            </div>

            {/* Recent form */}
            <div>
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Recent Form (last 5)</p>
              <div className="flex gap-2">
                {h2h.recentForm.map((winner, i) => (
                  <div key={i} className="flex-1 py-2 rounded-xl text-center text-[9px] font-black tracking-widest border"
                    style={{ backgroundColor: `${TEAM_COLORS[winner] || '#fff'}15`, color: TEAM_COLORS[winner] || '#fff', borderColor: `${TEAM_COLORS[winner] || '#fff'}30` }}>
                    {winner}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-600 font-bold uppercase tracking-widest text-sm">No data for this matchup</div>
        )}
      </motion.div>

      {/* ── Trophy Count Table ── */}
      <motion.div initial={{ opacity:0, y:20 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true }}
        className="w-full glass rounded-3xl border border-white/10 bg-[#161616] overflow-hidden"
      >
        <div className="p-8 border-b border-white/5 flex items-center gap-4 bg-gradient-to-r from-white/5 to-transparent">
          <div className="p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/20">
            <Trophy className="w-6 h-6 text-yellow-500" />
          </div>
          <h3 className="text-2xl font-black tracking-tighter text-white">IPL Trophy Count <span className="text-gray-500 text-lg">(2008 – 2026)</span></h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[500px]">
            <thead>
              <tr className="bg-black/20 border-b border-white/10">
                <th className="p-5 text-[10px] font-bold uppercase tracking-widest text-gray-400">Team</th>
                <th className="p-5 text-[10px] font-bold uppercase tracking-widest text-gray-400">Trophies</th>
                <th className="p-5 text-[10px] font-bold uppercase tracking-widest text-gray-400">Winning Years</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {trophyData.map((team, i) => (
                <tr key={team.logo} className="hover:bg-white/5 transition-colors">
                  <td className="p-5">
                    <div className="flex items-center gap-3">
                      <img src={`/logos/${team.logo}_logo.png`} alt={team.name} className="w-8 h-8 object-contain"
                        onError={e => { e.target.style.display = 'none'; }} />
                      <span className="font-bold text-sm text-white">{team.name}</span>
                    </div>
                  </td>
                  <td className="p-5">
                    <div className="flex items-center gap-1">
                      {team.count > 0
                        ? Array.from({ length: team.count }).map((_, j) => (
                            <Trophy key={j} className="w-4 h-4 text-yellow-400" />
                          ))
                        : <span className="text-gray-600 font-mono text-sm">—</span>
                      }
                    </div>
                  </td>
                  <td className="p-5 text-sm font-mono text-gray-400">{team.years}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
};

export default Teams;
