import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useMatchContext } from '../context/MatchContext.jsx';
import { Activity, Target, Zap, BarChart2, Award, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import SeasonDropdown from '../components/SeasonDropdown.jsx';
import Pagination from '../components/Pagination.jsx';
import { CURRENT_SEASON, TEAM_COLORS, ACTIVE_TEAMS } from '../utils/constants.js';

// ── Historical top scorers per season (orange cap) ────────────────────────────
const buildSeasonLeaders = (year, awardsData) => {
  if (!awardsData) return { batting: [], bowling: [] };
  const a = awardsData[String(year)];
  if (!a) return { batting: [], bowling: [] };
  const batting = a.orangeCap ? [
    { name: a.orangeCap.player, team: a.orangeCap.team, value: a.orangeCap.runs, label: 'runs' },
  ] : [];
  const bowling = a.purpleCap ? [
    { name: a.purpleCap.player, team: a.purpleCap.team, value: a.purpleCap.wickets, label: 'wkts' },
  ] : [];
  return { batting, bowling };
};

// ── All-time orange/purple cap winners chart data ─────────────────────────────
const buildAllTimeChart = (awardsData) => {
  if (!awardsData) return [];
  return Object.entries(awardsData)
    .filter(([, a]) => a.orangeCap)
    .map(([yr, a]) => ({
      year: parseInt(yr),
      runs: a.orangeCap?.runs || 0,
      wickets: a.purpleCap?.wickets || 0,
      orangeTeam: a.orangeCap?.team || 'CSK',
      purpleTeam: a.purpleCap?.team || 'CSK',
    }))
    .sort((a, b) => a.year - b.year);
};

// ── Team NRR chart for a season ───────────────────────────────────────────────
const buildNRRChart = (year, pointsData) => {
  if (!pointsData) return [];
  const d = pointsData[String(year)];
  if (!d) return [];
  return (d.teams || [])
    .map(t => ({ team: t.team, nrr: parseFloat(t.nrr) || 0, pts: t.pts || 0 }))
    .sort((a, b) => b.pts - a.pts);
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0c0c14] border border-white/10 rounded-xl px-4 py-3 text-xs shadow-xl">
      <p className="font-black text-white mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }} className="font-bold">{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

const Stats = () => {
  const { state } = useMatchContext();
  const match = state.currentMatch || {};
  const [season, setSeason]     = useState(CURRENT_SEASON);
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [chartTab, setChartTab] = useState('nrr'); // 'nrr' | 'orange' | 'purple'

  const [data, setData] = useState({
    awardsData: null,
    pointsData: null,
    masterPlayers: { players: [] },
    loading: true
  });

  // Pagination states for Career Stats
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Reset page when team filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [teamFilter]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [awardsRes, pointsRes, playersRes] = await Promise.all([
          fetch('http://localhost:5000/api/v1/data/global/awards'),
          fetch('http://localhost:5000/api/v1/data/global/points_tables'),
          fetch('http://localhost:5000/api/v1/data/players')
        ]);
        const awardsData = await awardsRes.json();
        const pointsData = await pointsRes.json();
        const masterPlayers = await playersRes.json();
        
        setData({ awardsData, pointsData, masterPlayers, loading: false });
      } catch (error) {
        console.error('Failed to load global data:', error);
        setData(prev => ({ ...prev, loading: false }));
      }
    };
    fetchData();
  }, []);

  // Live stats (only for current season)
  const isLive = season === CURRENT_SEASON;
  const isDormant = !match.score || match.score === '0';
  const getOvers = (s) => { if (!s) return 0; const p = s.toString().split('.'); return parseInt(p[0]) + (parseInt(p[1]||0)/6); };
  const overs = isDormant ? 0 : (getOvers(match.overs) || 1);
  const crr   = isDormant ? '0.00' : (parseInt(match.score||0) / overs).toFixed(2);
  const proj  = isDormant ? '—' : Math.round(parseFloat(crr) * 20);
  const balls = isDormant ? 120 : 120 - Math.floor(overs * 6);
  const recent = match.recent || [];

  // Historical chart data
  const allTimeChart  = useMemo(() => buildAllTimeChart(data.awardsData), [data.awardsData]);
  const nrrChart      = useMemo(() => buildNRRChart(season === 'all' ? 2024 : season, data.pointsData), [season, data.pointsData]);
  const leaders       = useMemo(() => season === 'all' ? { batting:[], bowling:[] } : buildSeasonLeaders(season, data.awardsData), [season, data.awardsData]);

  // Career stats for team filter (all-time)
  const careerStats = useMemo(() => {
    if (teamFilter === 'ALL') return data.masterPlayers.players || [];
    return (data.masterPlayers.players || []).filter(p =>
      p.teams?.some(t => t.team === teamFilter) || p.activeTeam === teamFilter
    );
  }, [teamFilter, data.masterPlayers]);

  if (data.loading) {
    return (
      <div className="w-full flex justify-center items-center h-[60vh]">
        <Loader2 className="w-10 h-10 text-ipl-neon animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-8 py-10 space-y-10 relative z-10">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="border-l-4 border-ipl-neon pl-6">
          <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white">
            Data <span className="text-ipl-neon">Lab</span>
          </h2>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px] mt-2">
            {season === 'all' ? 'All-Time IPL Analytics' : `Season ${season} · Analytics`}
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <SeasonDropdown selected={season} onChange={setSeason} showAllTime label="Season" />
          <div className="flex gap-1.5 flex-wrap">
            {['ALL', ...ACTIVE_TEAMS].map(t => (
              <button key={t} onClick={() => setTeamFilter(t)}
                className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border
                  ${teamFilter === t
                    ? 'bg-ipl-neon text-black border-ipl-neon'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'}`}
              >{t}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Live cards (current season only) ── */}
      {isLive && !isDormant && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.1}}
            className="glass p-6 rounded-3xl border border-white/10 bg-white/5 md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <Zap className="w-5 h-5 text-ipl-neon" />
              <h4 className="text-xs font-black uppercase tracking-widest text-gray-400">The Equation</h4>
            </div>
            <h2 className="text-3xl font-black tracking-tighter text-white mb-4">{match.result || 'Match in Progress'}</h2>
            <div className="flex gap-6">
              <div>
                <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-1">Projected Total</p>
                <p className="text-2xl font-black text-ipl-neon">{proj} <span className="text-sm text-gray-400 font-mono">est.</span></p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div>
                <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-1">Balls Left</p>
                <p className="text-2xl font-black text-white">{balls}</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div>
                <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-1">CRR</p>
                <p className="text-2xl font-black text-ipl-neon">{crr}</p>
              </div>
            </div>
          </motion.div>
          <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.2}}
            className="glass p-6 rounded-3xl border border-white/10 bg-white/5 flex flex-col items-center justify-center">
            <h4 className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-4 w-full">Win Prob</h4>
            <div className="relative w-32 h-32">
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle cx="64" cy="64" r="56" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
                <circle cx="64" cy="64" r="56" fill="none" stroke={match.team1?.color || '#0ea5e9'} strokeWidth="10"
                  strokeDasharray={`${(match.winProb || 50) * 3.52} 352`} className="transition-all duration-1000" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black" style={{color:match.team1?.color||'#fff'}}>{match.winProb||50}%</span>
                <span className="text-[8px] font-bold text-gray-500">{match.team1?.name}</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Season Awards ── */}
      {season !== 'all' && (() => { const a = data.awardsData?.[String(season)]; return a && (a.orangeCap || a.purpleCap) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon:'🟠', label:'Orange Cap', p:a.orangeCap?.player,  t:a.orangeCap?.team,  stat:a.orangeCap?.runs   ? `${a.orangeCap.runs} runs`   : null },
            { icon:'🟣', label:'Purple Cap', p:a.purpleCap?.player, t:a.purpleCap?.team, stat:a.purpleCap?.wickets ? `${a.purpleCap.wickets} wkts` : null },
            { icon:'⭐', label:'MVP',         p:a.mvp?.player,         t:a.mvp?.team,         stat:null },
            { icon:'🌟', label:'Emerging',   p:a.emergingPlayer?.player, t:a.emergingPlayer?.team, stat:null },
          ].filter(x=>x.p).map(x=>(
            <div key={x.label} className="glass bg-white/5 border border-white/10 rounded-2xl px-4 py-3 flex items-center gap-3">
              <span className="text-2xl">{x.icon}</span>
              <div className="min-w-0">
                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{x.label}</p>
                <p className="text-xs font-black text-white truncate">{x.p}</p>
                {x.stat && <p className="text-[9px] font-bold text-ipl-neon">{x.stat}</p>}
              </div>
            </div>
          ))}
        </div>
      ); })()}

      {/* ── Charts ── */}
      <div className="glass bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <BarChart2 className="w-5 h-5 text-ipl-neon" />
            <h4 className="text-sm font-black uppercase tracking-widest text-gray-300">
              {chartTab === 'nrr' ? `NRR — Season ${season === 'all' ? 2024 : season}` : 'All-Time Cap Winners'}
            </h4>
          </div>
          <div className="flex gap-2">
            {[{k:'nrr',l:'NRR'},{k:'orange',l:'Orange Cap'},{k:'purple',l:'Purple Cap'}].map(c=>(
              <button key={c.k} onClick={()=>setChartTab(c.k)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all
                  ${chartTab===c.k ? 'bg-ipl-neon text-black border-ipl-neon' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}
              >{c.l}</button>
            ))}
          </div>
        </div>

        <div className="w-full h-64">
          <ResponsiveContainer width="100%" height="100%">
            {chartTab === 'nrr' ? (
              <BarChart data={nrrChart} margin={{top:5,right:10,bottom:5,left:0}}>
                <XAxis dataKey="team" tick={{fontSize:9,fill:'#6b7280',fontWeight:700}} axisLine={false} tickLine={false} />
                <YAxis tick={{fontSize:9,fill:'#6b7280'}} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{fill:'rgba(255,255,255,0.03)'}} />
                <Bar dataKey="nrr" radius={[6,6,0,0]}>
                  {nrrChart.map(d => (
                    <Cell key={d.team} fill={d.nrr >= 0 ? (TEAM_COLORS[d.team]||'#0ea5e9') : '#ef4444'} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            ) : chartTab === 'orange' ? (
              <BarChart data={allTimeChart} margin={{top:5,right:10,bottom:5,left:0}}>
                <XAxis dataKey="year" tick={{fontSize:9,fill:'#6b7280',fontWeight:700}} axisLine={false} tickLine={false} />
                <YAxis tick={{fontSize:9,fill:'#6b7280'}} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{fill:'rgba(255,255,255,0.03)'}} />
                <Bar dataKey="runs" name="Runs" radius={[6,6,0,0]}>
                  {allTimeChart.map(d => (
                    <Cell key={d.year} fill={TEAM_COLORS[d.orangeTeam]||'#f97316'} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <BarChart data={allTimeChart} margin={{top:5,right:10,bottom:5,left:0}}>
                <XAxis dataKey="year" tick={{fontSize:9,fill:'#6b7280',fontWeight:700}} axisLine={false} tickLine={false} />
                <YAxis tick={{fontSize:9,fill:'#6b7280'}} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{fill:'rgba(255,255,255,0.03)'}} />
                <Bar dataKey="wickets" name="Wickets" radius={[6,6,0,0]}>
                  {allTimeChart.map(d => (
                    <Cell key={d.year} fill={TEAM_COLORS[d.purpleTeam]||'#a855f7'} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Career stats table ── */}
      <div className="glass bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center gap-3">
          <Award className="w-5 h-5 text-yellow-400" />
          <h4 className="text-sm font-black uppercase tracking-widest text-gray-300">
            {teamFilter === 'ALL' ? 'Career Batting — All Time' : `Career Stats — ${teamFilter} Players`}
          </h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[700px]">
            <thead className="bg-black/20 border-b border-white/5">
              <tr className="text-[9px] font-black uppercase tracking-widest text-gray-500">
                <th className="px-5 py-4">Player</th>
                <th className="px-5 py-4">M</th>
                <th className="px-5 py-4">Runs</th>
                <th className="px-5 py-4">Avg</th>
                <th className="px-5 py-4">SR</th>
                <th className="px-5 py-4">50s</th>
                <th className="px-5 py-4">100s</th>
                <th className="px-5 py-4">Wkts</th>
                <th className="px-5 py-4">Eco</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {careerStats.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(p => {
                const b = p.careerBatting;
                const bow = p.careerBowling;
                const color = p.activeTeam ? (TEAM_COLORS[p.activeTeam]||'#fff') : '#6b7280';
                return (
                  <tr key={p.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${p.name}`} alt={p.name}
                          className="w-7 h-7 rounded-full bg-white/5" />
                        <div>
                          <p className="text-xs font-black text-white">{p.name}</p>
                          <p className="text-[8px] font-bold tracking-widest" style={{color}}>{p.activeTeam || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-400">{b?.matches ?? '—'}</td>
                    <td className="px-5 py-3 font-mono text-xs text-ipl-neon font-black">{b?.runs?.toLocaleString() ?? '—'}</td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-300">{b?.avg ?? '—'}</td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-300">{b?.sr ?? '—'}</td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-400">{b?.fifties ?? '—'}</td>
                    <td className="px-5 py-3 font-mono text-xs text-yellow-400 font-black">{b?.hundreds ?? '—'}</td>
                    <td className="px-5 py-3 font-mono text-xs text-ipl-accent font-black">{bow?.wickets ?? '—'}</td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-400">{bow?.economy ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        <div className="pb-6">
          <Pagination 
            currentPage={currentPage}
            totalPages={Math.ceil(careerStats.length / itemsPerPage)}
            onPageChange={setCurrentPage}
          />
        </div>
      </div>
    </div>
  );
};

export default Stats;
