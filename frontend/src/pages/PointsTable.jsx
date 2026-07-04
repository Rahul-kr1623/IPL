import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Trophy, Star, Medal, Loader2 } from 'lucide-react';
import SeasonDropdown from '../components/SeasonDropdown.jsx';
import { CURRENT_SEASON, TEAM_COLORS, TEAM_NAMES } from '../utils/constants.js';

// ── All-Time aggregated table ────────────────────────────────────────────────
const QUAL_LINE = 4; // top 4 qualify

const PointsTable = () => {
  const [season, setSeason] = useState(CURRENT_SEASON);
  const [pointsData, setPointsData] = useState({});
  const [awardsData, setAwardsData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [pointsRes, awardsRes] = await Promise.all([
          fetch('http://localhost:5000/api/v1/data/global/points_tables'),
          fetch('http://localhost:5000/api/v1/data/global/awards')
        ]);
        const points = await pointsRes.json();
        const awards = await awardsRes.json();
        setPointsData(points);
        setAwardsData(awards);
      } catch (error) {
        console.error('Failed to fetch points table data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const buildAllTime = () => {
    const map = {};
    Object.values(pointsData).forEach(({ teams }) => {
      (teams || []).forEach(t => {
        if (!map[t.team]) map[t.team] = { team: t.team, played: 0, won: 0, lost: 0, tied: 0, nr: 0, pts: 0, titles: 0, finals: 0, semis: 0 };
        map[t.team].played += (t.played || 0);
        map[t.team].won    += (t.won   || 0);
        map[t.team].lost   += (t.lost  || 0);
        map[t.team].tied   += (t.tied  || 0);
        map[t.team].nr     += (t.nr    || 0);
        map[t.team].pts    += (t.pts   || 0);
        if (t.finalPosition === 'Winner')    { map[t.team].titles++; map[t.team].finals++; }
        if (t.finalPosition === 'Runner-Up') map[t.team].finals++;
        if (t.finalPosition === 'Semifinal') map[t.team].semis++;
      });
    });
    return Object.values(map)
      .map(t => ({ ...t, winPct: t.played ? ((t.won / t.played) * 100).toFixed(1) : '0.0' }))
      .sort((a, b) => b.titles - a.titles || b.won - a.won);
  };

  const tableData = useMemo(() => {
    if (Object.keys(pointsData).length === 0) return [];
    if (season === 'all') return buildAllTime();
    const d = pointsData[String(season)];
    return (d?.teams || []).slice().sort((a, b) => a.rank - b.rank);
  }, [season, pointsData]);

  const award = season !== 'all' ? awardsData[String(season)] : null;
  const isAllTime = season === 'all';

  if (loading) {
    return (
      <div className="w-full flex justify-center items-center h-[60vh]">
        <Loader2 className="w-10 h-10 text-ipl-neon animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 md:px-8 py-10 space-y-10 relative z-10">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="border-l-4 border-ipl-neon pl-6">
          <h2 className="text-4xl font-black italic uppercase tracking-tighter">
            League <span className="text-ipl-neon">Standings</span>
          </h2>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px] mt-2">
            {isAllTime ? 'All-Time IPL Records · 2008 – 2025' : `Season ${season} · Points Table`}
          </p>
        </div>
        <SeasonDropdown selected={season} onChange={setSeason} showAllTime label="Season" />
      </div>

      {/* ── Season Awards Strip (non-alltime) ── */}
      {award && !isAllTime && (award.orangeCap || award.purpleCap) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          {[
            { icon: '🟠', label: 'Orange Cap', player: award.orangeCap?.player, team: award.orangeCap?.team, stat: award.orangeCap?.runs ? `${award.orangeCap.runs} runs` : null },
            { icon: '🟣', label: 'Purple Cap', player: award.purpleCap?.player, team: award.purpleCap?.team, stat: award.purpleCap?.wickets ? `${award.purpleCap.wickets} wkts` : null },
            { icon: '⭐', label: 'MVP',         player: award.mvp?.player,         team: award.mvp?.team,         stat: null },
            { icon: '🌟', label: 'Emerging',   player: award.emergingPlayer?.player, team: award.emergingPlayer?.team, stat: null },
          ].filter(a => a.player).map(a => (
            <div key={a.label} className="glass bg-white/5 border border-white/10 rounded-2xl px-4 py-3 flex items-center gap-3">
              <span className="text-2xl">{a.icon}</span>
              <div className="min-w-0">
                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{a.label}</p>
                <p className="text-xs font-black text-white truncate">{a.player}</p>
                {a.stat && <p className="text-[9px] font-bold text-ipl-neon">{a.stat}</p>}
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {/* ── Table ── */}
      <div className="glass overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[640px]">
            <thead className="bg-white/5 border-b border-white/5">
              <tr className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                <th className="px-6 py-5">Pos</th>
                <th className="px-6 py-5">Team</th>
                <th className="px-6 py-5">P</th>
                <th className="px-6 py-5">W</th>
                <th className="px-6 py-5">L</th>
                {!isAllTime && <th className="px-6 py-5 text-ipl-neon">Pts</th>}
                {!isAllTime && <th className="px-6 py-5">NRR</th>}
                {isAllTime  && <th className="px-6 py-5 text-yellow-400">Titles</th>}
                {isAllTime  && <th className="px-6 py-5">Win %</th>}
                {!isAllTime && <th className="px-6 py-5">Status</th>}
              </tr>
            </thead>
            <tbody className="text-sm font-bold divide-y divide-white/5">
              {tableData.map((team, idx) => {
                const pos = isAllTime ? idx + 1 : team.rank;
                const isQualified = !isAllTime && pos <= QUAL_LINE;
                const isWinner = !isAllTime && team.finalPosition === 'Winner';
                const color = TEAM_COLORS[team.team] || '#fff';
                return (
                  <motion.tr
                    key={team.team}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className={`hover:bg-white/5 transition-all group
                      ${isQualified ? 'border-l-2' : ''}`}
                    style={isQualified ? { borderLeftColor: color } : {}}
                  >
                    {/* Pos */}
                    <td className="px-6 py-4 font-mono text-gray-500">
                      {String(pos).padStart(2, '0')}
                    </td>

                    {/* Team */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={`/logos/${team.team.toLowerCase()}_logo.png`}
                          alt={team.team}
                          className="w-7 h-7 object-contain"
                          onError={e => { e.target.style.display = 'none'; }}
                        />
                        <div>
                          <span className="font-black italic group-hover:text-ipl-neon transition-colors" style={{ color }}>
                            {team.team}
                          </span>
                          <span className="hidden md:block text-[9px] text-gray-500 font-bold tracking-wider">
                            {TEAM_NAMES[team.team] || ''}
                          </span>
                        </div>
                        {isWinner && <Trophy className="w-3.5 h-3.5 text-yellow-400 ml-1" />}
                        {!isAllTime && team.rank <= 4 && (
                          <TrendingUp className="w-3 h-3 text-green-500" />
                        )}
                        {!isAllTime && team.rank > 4 && (
                          <TrendingDown className="w-3 h-3 text-gray-600" />
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4 font-mono text-gray-300">{team.played}</td>
                    <td className="px-6 py-4 font-mono text-green-400">{team.won}</td>
                    <td className="px-6 py-4 font-mono text-red-400">{team.lost}</td>

                    {!isAllTime && (
                      <td className="px-6 py-4 text-ipl-neon text-lg italic font-black">{team.pts}</td>
                    )}
                    {!isAllTime && (
                      <td className="px-6 py-4 font-mono text-gray-400 text-xs">
                        {team.nrr}
                      </td>
                    )}
                    {isAllTime && (
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          {team.titles > 0 ? (
                            Array.from({ length: Math.min(team.titles, 5) }).map((_, i) => (
                              <Trophy key={i} className="w-3.5 h-3.5 text-yellow-400" />
                            ))
                          ) : (
                            <span className="text-gray-600 font-mono">—</span>
                          )}
                          {team.titles > 5 && <span className="text-yellow-400 text-xs font-black">+{team.titles - 5}</span>}
                        </div>
                      </td>
                    )}
                    {isAllTime && (
                      <td className="px-6 py-4 font-mono text-ipl-neon">{team.winPct}%</td>
                    )}
                    {!isAllTime && (
                      <td className="px-6 py-4">
                        {isWinner ? (
                          <span className="text-[9px] font-black px-3 py-1 rounded-full bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 tracking-widest">CHAMPION</span>
                        ) : team.finalPosition === 'Runner-Up' ? (
                          <span className="text-[9px] font-black px-3 py-1 rounded-full bg-gray-400/10 text-gray-300 border border-gray-400/20 tracking-widest">FINALIST</span>
                        ) : isQualified ? (
                          <span className="text-[9px] font-black px-3 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 tracking-widest">QUALIFIED</span>
                        ) : (
                          <span className="text-[9px] font-bold text-gray-600 tracking-widest">—</span>
                        )}
                      </td>
                    )}
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Qualification note */}
        {!isAllTime && (
          <div className="px-6 py-4 border-t border-white/5 flex items-center gap-4 text-[9px] font-bold text-gray-600 uppercase tracking-widest">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-ipl-neon/30 inline-block" /> Top 4 qualify for playoffs</span>
            <span className="flex items-center gap-1.5"><Trophy className="w-3 h-3 text-yellow-400" /> Champion</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default PointsTable;
