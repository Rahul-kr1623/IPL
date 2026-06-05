import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Zap, ChevronRight, Combine, X, Star, Activity } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useMatchContext } from '../context/MatchContext.jsx';
import SeasonDropdown from '../components/SeasonDropdown.jsx';
import { CURRENT_SEASON, TEAM_COLORS, ACTIVE_TEAMS } from '../data/seasons/index.js';
import masterPlayers from '../data/global/players_master.json';

// ── Season-specific player rosters (2026 = current) ─────────────────────────
const CURRENT_ROSTER = [
  { id: 'virat_kohli',    name: 'Virat Kohli',     team: 'RCB',  role: 'Batter',       nationality: 'India' },
  { id: 'ms_dhoni',       name: 'MS Dhoni',         team: 'CSK',  role: 'WK-Batter',    nationality: 'India' },
  { id: 'rohit_sharma',   name: 'Rohit Sharma',     team: 'MI',   role: 'Batter',       nationality: 'India' },
  { id: 'jasprit_bumrah', name: 'Jasprit Bumrah',   team: 'MI',   role: 'Bowler',       nationality: 'India' },
  { id: 'sunil_narine',   name: 'Sunil Narine',     team: 'KKR',  role: 'All-Rounder',  nationality: 'West Indies' },
  { id: 'andre_russell',  name: 'Andre Russell',    team: 'KKR',  role: 'All-Rounder',  nationality: 'West Indies' },
  { id: 'kl_rahul',       name: 'KL Rahul',         team: 'LSG',  role: 'WK-Batter',    nationality: 'India' },
  { id: 'hardik_pandya',  name: 'Hardik Pandya',    team: 'MI',   role: 'All-Rounder',  nationality: 'India' },
  { id: 'shubman_gill',   name: 'Shubman Gill',     team: 'GT',   role: 'Batter',       nationality: 'India' },
  { id: 'yuzvendra_chahal', name: 'Yuzvendra Chahal', team: 'PBKS', role: 'Bowler',     nationality: 'India' },
  { id: 'jos_buttler',    name: 'Jos Buttler',      team: 'RR',   role: 'WK-Batter',    nationality: 'England' },
  { id: 'pat_cummins',    name: 'Pat Cummins',      team: 'SRH',  role: 'Bowler',       nationality: 'Australia' },
  { id: 'shreyas_iyer',   name: 'Shreyas Iyer',     team: 'PBKS', role: 'Batter',       nationality: 'India' },
  { id: 'rishabh_pant',   name: 'Rishabh Pant',     team: 'LSG',  role: 'WK-Batter',    nationality: 'India' },
  { id: 'axar_patel',     name: 'Axar Patel',       team: 'DC',   role: 'All-Rounder',  nationality: 'India' },
  { id: 'riyan_parag',    name: 'Riyan Parag',      team: 'RR',   role: 'All-Rounder',  nationality: 'India' },
  { id: 'ruturaj_gaikwad',name: 'Ruturaj Gaikwad',  team: 'CSK',  role: 'Batter',       nationality: 'India' },
  { id: 'rajat_patidar',  name: 'Rajat Patidar',    team: 'RCB',  role: 'Batter',       nationality: 'India' },
  { id: 'rinku_singh',    name: 'Rinku Singh',      team: 'KKR',  role: 'Batter',       nationality: 'India' },
  { id: 'mayank_yadav',   name: 'Mayank Yadav',     team: 'LSG',  role: 'Bowler',       nationality: 'India' },
];

const ROLES = ['ALL', 'Batter', 'Bowler', 'All-Rounder', 'WK-Batter'];
const TEAM_FILTERS = ['ALL', ...ACTIVE_TEAMS];

// Build radar scores from career batting + bowling stats
const buildRadar = (master) => {
  if (!master) return null;
  const b = master.careerBatting;
  const bow = master.careerBowling;
  const sr  = b ? Math.min((b.sr  / 200) * 100, 100) : 0;
  const avg = b ? Math.min((b.avg / 60)  * 100, 100) : 0;
  const imp = b ? Math.min((b.runs / 6000) * 100, 100) : 0;
  const wkt = bow ? Math.min((bow.wickets / 200) * 100, 100) : 0;
  const eco = bow ? Math.max(100 - ((bow.economy - 6) / 4) * 100, 0) : 0;
  return [
    { subject: 'Strike Rate', A: sr },
    { subject: 'Average',     A: avg },
    { subject: 'Impact',      A: imp },
    { subject: 'Wickets',     A: wkt },
    { subject: 'Economy',     A: eco },
  ];
};

const Players = () => {
  const { state, dispatch } = useMatchContext();
  const searchTerm = state.searchQuery || '';
  const setSearchTerm = (val) => dispatch({ type: 'SET_SEARCH_QUERY', payload: val });
  const navigate = useNavigate();

  const [season, setSeason]           = useState(CURRENT_SEASON);
  const [activeTeam, setActiveTeam]   = useState('ALL');
  const [activeRole, setActiveRole]   = useState('ALL');
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected]       = useState([]);

  // Resolve player list for chosen season
  const playerList = useMemo(() => {
    if (season === 'all') {
      // Show all career players from master
      return masterPlayers.players.map(p => ({
        id: p.id,
        name: p.name,
        team: p.activeTeam || p.teams?.slice(-1)[0]?.team || '—',
        role: p.role,
        nationality: p.nationality,
        isAllTime: true,
      }));
    }
    if (season === CURRENT_SEASON) return CURRENT_ROSTER;
    // For historical seasons, filter master players who played that season
    return masterPlayers.players
      .filter(p => p.teams?.some(t => t.season === season))
      .map(p => {
        const teamEntry = p.teams.find(t => t.season === season);
        return { id: p.id, name: p.name, team: teamEntry?.team || '—', role: p.role, nationality: p.nationality };
      });
  }, [season]);

  const filtered = useMemo(() => {
    return playerList.filter(p => {
      const s = searchTerm.toLowerCase();
      const matchSearch = !s || p.name.toLowerCase().includes(s) || p.team.toLowerCase().includes(s);
      const matchTeam = activeTeam === 'ALL' || p.team === activeTeam;
      const matchRole = activeRole === 'ALL' || p.role === activeRole;
      return matchSearch && matchTeam && matchRole;
    });
  }, [playerList, searchTerm, activeTeam, activeRole]);

  const handleCard = (player) => {
    if (compareMode) {
      if (selected.find(p => p.id === player.id)) setSelected(selected.filter(p => p.id !== player.id));
      else if (selected.length < 2) setSelected([...selected, player]);
    } else {
      navigate(`/player/${player.id}`);
    }
  };

  const getMasterData = (id) => masterPlayers.players.find(p => p.id === id);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-8 py-10 space-y-10 relative z-10">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="border-l-4 border-ipl-neon pl-6">
          <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white">
            Players <span className="text-ipl-neon">Hub</span>
          </h2>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px] mt-2 italic">
            {season === 'all' ? 'All-Time IPL Players · Career Stats' : `Season ${season} • Squad Analytics`}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <SeasonDropdown selected={season} onChange={s => { setSeason(s); setActiveTeam('ALL'); }} showAllTime label="Season" />
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-ipl-neon transition-colors" />
            <input
              type="text"
              placeholder="Search player..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-ipl-neon outline-none backdrop-blur-md transition-all w-52"
            />
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-2">
        {/* Team filter */}
        <div className="flex flex-wrap gap-1.5">
          {TEAM_FILTERS.map(t => (
            <button key={t} onClick={() => setActiveTeam(t)}
              className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border shrink-0
                ${activeTeam === t
                  ? 'bg-ipl-neon text-black border-ipl-neon shadow-[0_0_12px_#0ea5e9]'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30 hover:text-white'}`}
            >{t}</button>
          ))}
        </div>

        {/* Role filter */}
        <div className="flex flex-wrap gap-1.5 ml-0 md:ml-auto">
          {ROLES.map(r => (
            <button key={r} onClick={() => setActiveRole(r)}
              className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border shrink-0
                ${activeRole === r
                  ? 'bg-ipl-accent text-white border-ipl-accent'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30 hover:text-white'}`}
            >{r}</button>
          ))}
          <button onClick={() => { setCompareMode(!compareMode); setSelected([]); }}
            className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border flex items-center gap-1.5
              ${compareMode ? 'bg-ipl-accent text-white border-ipl-accent' : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'}`}
          >
            <Combine className="w-3 h-3" /> Compare {compareMode ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* ── Player Grid ── */}
      <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <AnimatePresence mode="popLayout">
          {filtered.map((player) => {
            const color = TEAM_COLORS[player.team] || '#fff';
            const master = getMasterData(player.id);
            const isSelected = selected.find(p => p.id === player.id);
            return (
              <motion.div
                layout key={player.id}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                whileHover={{ y: -6 }}
                className={`glass bg-white/5 border rounded-[2rem] p-5 group relative overflow-hidden cursor-pointer transition-all
                  ${isSelected ? 'border-ipl-accent shadow-[0_0_20px_rgba(244,63,94,0.3)]' : 'border-white/10'}`}
              >
                <div className="absolute -top-8 -right-8 w-28 h-28 blur-[40px] opacity-10 group-hover:opacity-25 transition-all" style={{ backgroundColor: color }} />

                <div className="flex flex-col items-center text-center">
                  {/* Avatar */}
                  <div className="relative mb-3">
                    <div className="w-20 h-20 rounded-full p-0.5 border-2 border-dashed border-white/10 group-hover:border-ipl-neon transition-all duration-500 overflow-hidden bg-white/5 flex items-center justify-center">
                      <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${player.name}`} alt={player.name} className="w-full h-full rounded-full" />
                    </div>
                    {/* Team logo dot */}
                    <img src={`/logos/${player.team.toLowerCase()}_logo.png`} alt={player.team}
                      className="absolute -bottom-1 -right-1 w-7 h-7 object-contain bg-[#0c0c14] rounded-full border border-white/10 p-0.5"
                      onError={e => { e.target.style.display = 'none'; }} />
                  </div>

                  <h3 className="text-sm font-black uppercase tracking-tight text-white group-hover:text-ipl-neon transition-colors leading-tight">
                    {player.name}
                  </h3>

                  <span className="text-[9px] font-black px-3 py-0.5 rounded-full mt-2 tracking-widest uppercase"
                    style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}40` }}>
                    {player.team}
                  </span>

                  <p className="text-[9px] text-gray-500 mt-2 uppercase font-bold tracking-widest">{player.role}</p>

                  {/* Career quick stats (if in master) */}
                  {master && (
                    <div className="w-full mt-3 grid grid-cols-2 gap-1.5 text-center">
                      {master.careerBatting && (
                        <div className="bg-white/5 rounded-xl py-1.5 px-2">
                          <p className="text-[8px] text-gray-600 uppercase font-bold tracking-wider">Runs</p>
                          <p className="text-xs font-black text-ipl-neon">{master.careerBatting.runs.toLocaleString()}</p>
                        </div>
                      )}
                      {master.careerBowling ? (
                        <div className="bg-white/5 rounded-xl py-1.5 px-2">
                          <p className="text-[8px] text-gray-600 uppercase font-bold tracking-wider">Wkts</p>
                          <p className="text-xs font-black text-ipl-accent">{master.careerBowling.wickets}</p>
                        </div>
                      ) : master.careerBatting ? (
                        <div className="bg-white/5 rounded-xl py-1.5 px-2">
                          <p className="text-[8px] text-gray-600 uppercase font-bold tracking-wider">SR</p>
                          <p className="text-xs font-black text-white">{master.careerBatting.sr}</p>
                        </div>
                      ) : null}
                    </div>
                  )}

                  <button onClick={() => handleCard(player)}
                    className={`w-full mt-4 py-2.5 bg-white/5 border rounded-xl flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest transition-all
                      ${isSelected
                        ? 'bg-ipl-accent text-white border-ipl-accent'
                        : compareMode
                          ? 'border-white/10 hover:border-ipl-accent hover:text-ipl-accent'
                          : 'border-white/10 group-hover:bg-ipl-neon group-hover:text-black group-hover:border-ipl-neon'}`}
                  >
                    {compareMode
                      ? (isSelected ? 'Deselect' : 'Select')
                      : <>View Profile <ChevronRight className="w-3 h-3" /></>
                    }
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>

      {/* ── Compare Overlay ── */}
      <AnimatePresence>
        {selected.length === 2 && (() => {
          const p1 = getMasterData(selected[0].id);
          const p2 = getMasterData(selected[1].id);
          const r1 = buildRadar(p1);
          const r2 = buildRadar(p2);
          const merged = r1 && r2 ? r1.map((d, i) => ({ ...d, B: r2[i].A })) : [];
          const c1 = TEAM_COLORS[selected[0].team] || '#0ea5e9';
          const c2 = TEAM_COLORS[selected[1].team] || '#f43f5e';
          return (
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] w-[94%] md:w-[560px]
                         glass bg-[#0a0a14]/96 border border-white/10 rounded-[2rem] p-6
                         shadow-[0_20px_80px_rgba(0,0,0,0.8)]"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black italic uppercase tracking-tighter">
                  Head to <span className="text-ipl-accent">Head</span>
                </h3>
                <button onClick={() => setSelected([])} className="p-1 hover:bg-white/10 rounded-full">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="flex gap-3 items-center mb-4">
                <div className="flex-1 text-center bg-white/5 rounded-xl py-2 px-3">
                  <p className="text-sm font-black" style={{ color: c1 }}>{selected[0].name}</p>
                  <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">{selected[0].team}</p>
                </div>
                <div className="text-xl font-black italic text-white/20">VS</div>
                <div className="flex-1 text-center bg-white/5 rounded-xl py-2 px-3">
                  <p className="text-sm font-black" style={{ color: c2 }}>{selected[1].name}</p>
                  <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">{selected[1].team}</p>
                </div>
              </div>

              {merged.length > 0 && (
                <div className="w-full h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={merged}>
                      <PolarGrid stroke="#ffffff15" />
                      <PolarAngleAxis dataKey="subject" stroke="#ffffff40" fontSize={9} fontWeight="bold" />
                      <Tooltip contentStyle={{ backgroundColor: '#020617', border: 'none', borderRadius: '10px', fontSize: '10px' }} cursor={false} />
                      <Radar name={selected[0].name} dataKey="A" stroke={c1} fill={c1} fillOpacity={0.35} />
                      <Radar name={selected[1].name} dataKey="B" stroke={c2} fill={c2} fillOpacity={0.35} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Stat comparison rows */}
              {p1 && p2 && (
                <div className="mt-3 space-y-1.5">
                  {[
                    { label: 'IPL Runs', v1: p1.careerBatting?.runs, v2: p2.careerBatting?.runs },
                    { label: 'Avg', v1: p1.careerBatting?.avg, v2: p2.careerBatting?.avg },
                    { label: 'SR', v1: p1.careerBatting?.sr, v2: p2.careerBatting?.sr },
                    { label: 'Wickets', v1: p1.careerBowling?.wickets, v2: p2.careerBowling?.wickets },
                  ].filter(r => r.v1 != null || r.v2 != null).map(row => (
                    <div key={row.label} className="flex items-center gap-2 text-[10px] font-bold">
                      <span className="w-16 text-right font-black" style={{ color: c1 }}>{row.v1 ?? '—'}</span>
                      <span className="flex-1 text-center text-gray-500 uppercase tracking-widest text-[8px]">{row.label}</span>
                      <span className="w-16 font-black" style={{ color: c2 }}>{row.v2 ?? '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
};

export default Players;
