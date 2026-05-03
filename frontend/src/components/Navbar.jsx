import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Menu, X, Activity, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMatchContext } from '../context/MatchContext';
import CommandPalette from './CommandPalette';

const navLinks = [
  { name: 'Live Now', href: '/', live: true },
  { name: 'Fixtures', href: '/fixtures' },
  { name: 'Teams', href: '/teams' },
  { name: 'Players Hub', href: '/players' },
  { name: 'Stats', href: '/stats' },
];

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [mobileMenu, setMobileMenu] = useState(false);

  const { state, dispatch } = useMatchContext();
  // state destructured below in capsule vars section

  useEffect(() => {
    const fn = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const { currentMatch: match, slot1, slot2, fetchStatus, isStale } = state;

  const isFetching  = ['LOADING', 'WARMING_UP', 'IDLE'].includes(fetchStatus) && !slot1 && !slot2;
  const isRefreshing = fetchStatus === 'REFRESHING';
  const isOffline   = fetchStatus === 'ERROR';

  // Pick the best match to show: prefer the LIVE one, then any non-null slot
  const activeMatch = (slot1?.status === 'LIVE' ? slot1 : null)
    || (slot2?.status === 'LIVE' ? slot2 : null)
    || slot1 || slot2 || match || null;

  const isLive     = activeMatch?.status === 'LIVE';
  const isFinished = activeMatch?.status === 'FINISHED' || activeMatch?.status === 'RECENTLY FINISHED';
  const isUpcoming = activeMatch?.status === 'UPCOMING';

  // Build a compact score string for any match state
  const buildScore = (m) => {
    if (!m) return null;
    const batting  = m.currentInnings === 2 ? m.team2 : m.team1;
    const fielding = m.currentInnings === 2 ? m.team1 : m.team2;
    const completedScore = m.currentInnings === 2 && m.team1Score
      ? ` (${m.team1Score}/${m.team1Wickets ?? 0})`
      : '';
    if (m.status === 'UPCOMING') return `${m.team1?.name} vs ${m.team2?.name}`;
    if (m.status === 'FINISHED' || m.status === 'RECENTLY FINISHED')
      return `${m.team1?.name} vs ${m.team2?.name}`;
    return `${batting?.name} ${m.score ?? 0}/${m.wickets ?? 0} (${m.overs || '0.0'}) v ${fielding?.name}${completedScore}`;
  };

  const capsuleScore = buildScore(activeMatch);

  // Also build a mini label for a second match if both slots are populated
  const secondMatch = (activeMatch === slot1 ? slot2 : slot1);
  const hasSecond   = !!(secondMatch && secondMatch !== activeMatch);

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className={`fixed top-0 w-full z-50 transition-all duration-500 border-b border-white/10 ${isScrolled
        ? 'py-2 bg-ipl-dark/80 backdrop-blur-xl shadow-[0_4px_30px_rgba(0,0,0,0.5)]'
        : 'py-5 bg-transparent backdrop-blur-sm'
        }`}
    >
      <div className="max-w-7xl mx-auto px-4 lg:px-6 w-full grid grid-cols-2 lg:grid-cols-[auto_1fr_auto] items-center gap-4 xl:gap-8">

        {/* Brand */}
        <div className="flex items-center gap-3 cursor-pointer z-50">
          <motion.div whileHover={{ scale: 1.1, rotate: 5 }}>
            <img src="/src/assets/logos/ipl_logo.png" alt="IPL" className="w-10 h-10 object-contain" />
          </motion.div>
          <span className="text-xl font-black tracking-tighter">
            IPL<span className="text-ipl-neon italic">2026</span>
          </span>
        </div>

        {/* Nav links */}
        <div className="hidden lg:flex justify-center w-full px-4">
          <div className="flex items-center bg-white/5 rounded-full px-2 py-1 gap-1">
            {navLinks.map((link, idx) => (
              <Link
                key={link.name}
                to={link.href}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                className="relative px-5 py-2 text-sm font-semibold rounded-full flex items-center gap-2"
              >
                <div className="relative z-10 flex items-center gap-2 text-gray-300 hover:text-white transition-colors">
                  {link.live && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
                    </span>
                  )}
                  {link.name}
                </div>
                {hoveredIndex === idx && (
                  <motion.div layoutId="nav-capsule"
                    className="absolute inset-0 bg-white/10 rounded-full z-0" />
                )}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-4 xl:gap-6">

          {/* Live Score Capsule */}
          <div className={`hidden xl:flex items-center px-3 py-1.5 rounded-full border transition-all gap-2 group min-w-[240px] max-w-[380px]
            ${isOffline ? 'border-yellow-500/30 bg-yellow-500/5'
              : isLive   ? 'border-red-500/40 bg-red-500/5 hover:bg-red-500/10'
              : isUpcoming ? 'border-amber-500/30 bg-amber-500/5'
              : 'border-ipl-neon/30 bg-ipl-neon/5 hover:bg-ipl-neon/10'}`}>

            {/* Status badge */}
            <div className="flex items-center gap-1.5 shrink-0">
              {isOffline
                ? <WifiOff className="w-3 h-3 text-yellow-500" />
                : isLive
                  ? <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                    </span>
                  : <Activity className={`w-3 h-3 text-ipl-neon ${isRefreshing ? 'animate-spin' : ''}`} />
              }
              <span className={`text-[9px] font-black uppercase tracking-widest shrink-0
                ${isOffline ? 'text-yellow-500'
                  : isLive   ? 'text-red-400'
                  : isUpcoming ? 'text-amber-400'
                  : isFinished ? 'text-green-400'
                  : 'text-ipl-neon'}`}>
                {isFetching   ? 'LOADING'
                  : isOffline  ? 'CACHED'
                  : isLive     ? 'LIVE'
                  : isUpcoming ? 'UPCOMING'
                  : isFinished ? 'RESULT'
                  : activeMatch ? 'RECENT'
                  : 'RECENT'}
              </span>
            </div>

            {/* Score text */}
            <div className="flex items-center gap-1.5 text-[10px] font-mono border-l border-white/10 pl-2 min-w-0 overflow-hidden">
              {isFetching && !activeMatch && (
                <span className="text-gray-500 italic animate-pulse truncate">Fetching…</span>
              )}
              {!activeMatch && !isFetching && fetchStatus !== 'ERROR' && (
                <span className="text-gray-500 italic truncate">No match today</span>
              )}
              {fetchStatus === 'ERROR' && !activeMatch && (
                <span className="text-yellow-600 italic truncate">Offline</span>
              )}
              {activeMatch && (
                <span className="font-black text-white group-hover:text-ipl-neon transition-colors truncate">
                  {capsuleScore}
                </span>
              )}
            </div>

            {/* 2nd match mini badge */}
            {hasSecond && (
              <div className="shrink-0 border-l border-white/10 pl-2">
                <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full
                  ${secondMatch?.status === 'LIVE' ? 'bg-red-500/20 text-red-400'
                  : secondMatch?.status === 'UPCOMING' ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-white/10 text-gray-500'}`}>
                  {secondMatch?.team1?.name} v {secondMatch?.team2?.name}
                </span>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4">
            <Search
              onClick={() => dispatch({ type: 'TOGGLE_SEARCH' })}
              className="w-5 h-5 text-gray-400 hover:text-ipl-neon cursor-pointer transition-colors"
            />

            <select
              value={state.theme}
              onChange={e => dispatch({ type: 'SET_THEME', payload: e.target.value })}
              className="bg-ipl-dark border border-white/10 rounded-lg text-[10px] font-bold px-3 py-1.5 outline-none text-white cursor-pointer uppercase tracking-widest hover:border-ipl-neon/50 transition-colors"
            >
              <option value="DEFAULT">Cyberpunk Theme</option>
              <option value="CSK">CSK Yellow</option>
              <option value="MI">MI Blue</option>
              <option value="RCB">RCB Red</option>
              <option value="KKR">KKR Purple</option>
              <option value="RR">RR Pink</option>
              <option value="PBKS">PBKS Red</option>
              <option value="GT">GT Gold</option>
              <option value="LSG">LSG Cyan</option>
              <option value="SRH">SRH Orange</option>
              <option value="DC">DC Blue</option>
            </select>

            <button className="lg:hidden text-white" onClick={() => setMobileMenu(!mobileMenu)}>
              {mobileMenu ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileMenu && (
          <motion.div
            initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }}
            className="fixed inset-0 top-[60px] bg-ipl-dark/95 backdrop-blur-2xl lg:hidden flex flex-col p-10 gap-6 z-40"
          >
            {navLinks.map(link => (
              <Link key={link.name} to={link.href}
                className="text-3xl font-black uppercase tracking-tighter hover:text-ipl-neon transition-colors"
                onClick={() => setMobileMenu(false)}>
                {link.name}
              </Link>
            ))}

            <div className="mt-auto p-6 bg-white/5 rounded-2xl border border-white/10">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
                {isFetching && !match ? 'Loading…' : 'Current Match'}
              </p>
              {activeMatch
                ? <div className="text-sm font-bold text-white truncate">{capsuleScore}</div>
                : <p className="text-gray-500 text-sm italic">
                  {isFetching ? 'Fetching live data…' : 'No match today'}
                </p>
              }
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <CommandPalette />
    </motion.nav>
  );
};

export default Navbar;