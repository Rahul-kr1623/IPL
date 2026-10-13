import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, MapPin, Clock, Trophy, Activity,
  Search, Zap, ChevronDown, Filter, Loader2,
} from 'lucide-react';
import { useMatchContext } from '../context/MatchContext';
import SeasonDropdown from '../components/SeasonDropdown.jsx';
import Pagination from '../components/Pagination.jsx';
import ScorecardModal from '../components/ScorecardModal.jsx';
import { CURRENT_SEASON, TEAM_COLORS, TEAM_NAMES } from '../utils/constants.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const LOGOS = {
  CSK: '/logos/csk_logo.png', MI: '/logos/mi_logo.png',
  RCB: '/logos/rcb_logo.png', KKR: '/logos/kkr_logo.png',
  RR: '/logos/rr_logo.png', PBKS: '/logos/pbks_logo.png',
  DC: '/logos/dc_logo.png', GT: '/logos/gt_logo.png',
  LSG: '/logos/lsg_logo.png', SRH: '/logos/srh_logo.png',
};

// Check if a fixture is currently live
const isFixtureLive = (fixture, liveMatch) => {
  if (!liveMatch?.team1?.name || !liveMatch?.team2?.name) return false;
  const l1 = liveMatch.team1.name.toUpperCase();
  const l2 = liveMatch.team2.name.toUpperCase();
  const f1 = (fixture.teamA || fixture.team1 || '').toUpperCase();
  const f2 = (fixture.teamB || fixture.team2 || '').toUpperCase();

  const sameTeams = (f1 === l1 && f2 === l2) || (f1 === l2 && f2 === l1);
  if (!sameTeams) return false;

  if (liveMatch.espnId && fixture.espnId) {
    return String(liveMatch.espnId) === String(fixture.espnId);
  }
  return true;
};

const Fixtures = () => {
  const [season, setSeason] = useState(CURRENT_SEASON);
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedScorecardMatch, setSelectedScorecardMatch] = useState(null);

  const { state } = useMatchContext();
  const liveMatch = state.currentMatch || state.slot1 || state.slot2;

  const itemsPerPage = 12;

  // ── Fetch Fixtures from DB for selected season ───────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const fetchSeasonFixtures = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/v1/data/season/${season}/fixtures`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;

        // Support both array of matches and { matches: [...] }
        const list = Array.isArray(data) ? data : (data.matches || []);
        setFixtures(list);
      } catch (err) {
        console.error('Failed to load fixtures:', err.message);
        if (!cancelled) setFixtures([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSeasonFixtures();
    return () => { cancelled = true; };
  }, [season]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, teamFilter, statusFilter, season]);

  // ── Merge Live Match State & Normalization ──────────────────────────────────
  const normalizedFixtures = useMemo(() => {
    return fixtures.map((m, idx) => {
      const teamA = m.teamA || m.team1 || 'Team A';
      const teamB = m.teamB || m.team2 || 'Team B';
      const isLive = isFixtureLive(m, liveMatch);

      let effectiveStatus = (m.status || 'UPCOMING').toUpperCase();
      let scoreA = m.scoreA ? `${m.scoreA}/${m.wicketsA ?? '0'} (${m.oversA ?? '20'})` : null;
      let scoreB = m.scoreB ? `${m.scoreB}/${m.wicketsB ?? '0'} (${m.oversB ?? '20'})` : null;
      let result = m.result || '';

      if (isLive && liveMatch) {
        effectiveStatus = liveMatch.status || 'LIVE';
        scoreA = liveMatch.team1Score || scoreA;
        scoreB = `${liveMatch.score}/${liveMatch.wickets} (${liveMatch.overs} ov)`;
        result = liveMatch.result || result;
      }

      return {
        ...m,
        id: m.matchId || m._id || idx + 1,
        teamA,
        teamB,
        effectiveStatus,
        isLive,
        scoreA,
        scoreB,
        result,
        venue: m.venue || 'IPL Stadium',
        date: m.date || 'Scheduled',
        time: m.time || (idx % 2 === 0 ? '07:30 PM' : '03:30 PM'),
      };
    });
  }, [fixtures, liveMatch]);

  // ── Filter & Search ──────────────────────────────────────────────────────────
  const filteredMatches = useMemo(() => {
    return normalizedFixtures.filter((m) => {
      // Search by team or venue
      const s = search.toLowerCase();
      const matchSearch =
        !search ||
        m.teamA.toLowerCase().includes(s) ||
        m.teamB.toLowerCase().includes(s) ||
        m.venue.toLowerCase().includes(s);

      // Filter by team
      const matchTeam =
        teamFilter === 'all' ||
        m.teamA.toUpperCase() === teamFilter ||
        m.teamB.toUpperCase() === teamFilter;

      // Filter by status
      let matchStatus = true;
      if (statusFilter === 'live') {
        matchStatus = m.effectiveStatus === 'LIVE' || m.effectiveStatus === 'SUPER OVER';
      } else if (statusFilter === 'completed') {
        matchStatus = m.effectiveStatus === 'FINISHED' || m.effectiveStatus === 'RECENTLY FINISHED';
      } else if (statusFilter === 'upcoming') {
        matchStatus = m.effectiveStatus === 'UPCOMING' || m.effectiveStatus === 'SCHEDULED';
      }

      return matchSearch && matchTeam && matchStatus;
    });
  }, [normalizedFixtures, search, teamFilter, statusFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredMatches.length / itemsPerPage);
  const paginatedMatches = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredMatches.slice(start, start + itemsPerPage);
  }, [filteredMatches, currentPage, itemsPerPage]);

  const allTeams = ['all', 'CSK', 'MI', 'RCB', 'KKR', 'RR', 'PBKS', 'DC', 'GT', 'LSG', 'SRH'];

  return (
    <div className="w-full py-10 space-y-10 relative z-10 max-w-7xl mx-auto px-4">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-1.5 bg-ipl-neon rounded-full" />
            <h1 className="text-4xl font-black italic uppercase tracking-tighter text-white">
              IPL <span className="text-ipl-neon">{season} Fixtures</span>
            </h1>
          </div>
          <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-1">
            Complete schedule, scores, and official match scorecards
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SeasonDropdown selectedSeason={season} onSelectSeason={setSeason} />
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="glass p-5 rounded-2xl border border-white/10 bg-white/[0.02] flex flex-wrap gap-4 items-center justify-between">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search teams or venue..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-ipl-neon transition-colors"
          />
        </div>

        {/* Status Filters */}
        <div className="flex gap-1.5 bg-black/40 p-1 rounded-xl border border-white/10">
          {[
            { id: 'all', label: 'All' },
            { id: 'live', label: 'Live' },
            { id: 'upcoming', label: 'Upcoming' },
            { id: 'completed', label: 'Finished' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                statusFilter === tab.id
                  ? 'bg-ipl-neon text-black'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Team Filter Dropdown */}
        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className="px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white font-bold uppercase focus:outline-none focus:border-ipl-neon"
        >
          {allTeams.map((t) => (
            <option key={t} value={t} className="bg-slate-900 text-white">
              {t === 'all' ? 'All Teams' : t}
            </option>
          ))}
        </select>
      </div>

      {/* Matches Grid */}
      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-ipl-neon animate-spin" />
          <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">
            Loading {season} Schedule...
          </p>
        </div>
      ) : paginatedMatches.length === 0 ? (
        <div className="py-24 text-center glass rounded-3xl border border-white/10 p-8 space-y-2">
          <p className="text-sm font-black text-gray-400 uppercase tracking-widest">
            No fixtures found matching your filter criteria
          </p>
          <button
            onClick={() => { setSearch(''); setTeamFilter('all'); setStatusFilter('all'); }}
            className="text-xs text-ipl-neon hover:underline font-bold uppercase tracking-wider"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paginatedMatches.map((m, idx) => {
            const colorA = TEAM_COLORS[m.teamA] || '#3b82f6';
            const colorB = TEAM_COLORS[m.teamB] || '#f43f5e';
            const isCompleted = m.effectiveStatus === 'FINISHED' || m.effectiveStatus === 'RECENTLY FINISHED';
            const isLive = m.effectiveStatus === 'LIVE' || m.effectiveStatus === 'SUPER OVER';

            return (
              <motion.div
                key={m.id || idx}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className={`glass rounded-3xl p-6 border transition-all hover:-translate-y-1 relative overflow-hidden flex flex-col justify-between ${
                  isLive
                    ? 'border-red-500/40 bg-gradient-to-b from-red-950/20 to-black/60 shadow-[0_0_25px_rgba(239,68,68,0.15)]'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                }`}
              >
                {/* Card Top: Match Header */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[9px] font-mono font-bold text-gray-500 uppercase tracking-widest">
                      {m.date}
                    </span>
                    <span
                      className={`text-[8px] px-2.5 py-0.5 rounded font-black uppercase tracking-widest ${
                        isLive
                          ? 'bg-red-500/30 text-red-400 border border-red-500/40 animate-pulse'
                          : isCompleted
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-white/10 text-gray-400 border border-white/10'
                      }`}
                    >
                      {m.effectiveStatus}
                    </span>
                  </div>

                  {/* Team A vs Team B Duel */}
                  <div className="space-y-4 my-3">
                    {/* Team A */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img
                          src={LOGOS[m.teamA] || `https://cricketvectors.akamaized.net/teams/IPL/${m.teamA}.png`}
                          alt={m.teamA}
                          className="w-8 h-8 object-contain"
                          onError={(e) => { e.target.src = '/logo.svg'; }}
                        />
                        <span className="font-black text-sm text-white tracking-tight">
                          {m.teamA}
                        </span>
                      </div>
                      <span className="font-mono text-sm font-black text-white">
                        {m.scoreA || '—'}
                      </span>
                    </div>

                    {/* Team B */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img
                          src={LOGOS[m.teamB] || `https://cricketvectors.akamaized.net/teams/IPL/${m.teamB}.png`}
                          alt={m.teamB}
                          className="w-8 h-8 object-contain"
                          onError={(e) => { e.target.src = '/logo.svg'; }}
                        />
                        <span className="font-black text-sm text-white tracking-tight">
                          {m.teamB}
                        </span>
                      </div>
                      <span className="font-mono text-sm font-black text-white">
                        {m.scoreB || '—'}
                      </span>
                    </div>
                  </div>

                  {/* Match Result if Completed */}
                  {m.result && (
                    <p className="text-[10px] font-bold text-emerald-400 mt-2 italic border-t border-white/5 pt-2">
                      {m.result}
                    </p>
                  )}
                </div>

                {/* Card Bottom: Venue & Action */}
                <div className="border-t border-white/10 pt-4 mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-gray-400 truncate max-w-[170px]">
                    <MapPin className="w-3 h-3 text-ipl-neon shrink-0" />
                    <span className="text-[10px] font-medium truncate">{m.venue}</span>
                  </div>

                  {(isCompleted || isLive) ? (
                    <button
                      onClick={() => setSelectedScorecardMatch(m)}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-ipl-neon hover:text-black transition-all text-[9px] font-black uppercase tracking-wider flex items-center gap-1"
                    >
                      <Activity className="w-3 h-3" />
                      Scorecard
                    </button>
                  ) : (
                    <span className="text-[9px] font-mono text-gray-500 font-bold">
                      {m.time}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      )}

      {/* Reusable Scorecard Modal */}
      <ScorecardModal
        isOpen={!!selectedScorecardMatch}
        onClose={() => setSelectedScorecardMatch(null)}
        match={selectedScorecardMatch}
      />
    </div>
  );
};

export default Fixtures;