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
  const { currentMatch: match, fetchStatus, isStale } = state;

  useEffect(() => {
    const fn = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const isFetching = ['LOADING', 'WARMING_UP', 'IDLE'].includes(fetchStatus) && !match;
  const isRefreshing = fetchStatus === 'REFRESHING';
  const isFinished = match?.status === 'FINISHED' || match?.status === 'RECENTLY FINISHED';
  const isLive = match?.status === 'LIVE';
  const isOffline = fetchStatus === 'ERROR';

  // currentInnings: 1 = team1 is batting (1st innings), 2 = team2 is batting (2nd innings)
  const battingTeam =
    match?.currentInnings === 2
      ? match?.team2
      : match?.team1;

  const otherTeam =
    match?.currentInnings === 2
      ? match?.team1
      : match?.team2;
  // otherScore = the completed innings score of the non-batting team (only in 2nd innings)
  const otherScore =
    match?.currentInnings === 2 &&
      match?.team1Score !== null &&
      match?.team1Score !== undefined
      ? `${match.team1Score}/${match.team1Wickets ?? 0}`
      : null;

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
          <div className={`hidden xl:flex items-center px-4 py-1.5 rounded-full border transition-all gap-3 group min-w-[260px] justify-between
            ${isOffline && match ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-ipl-neon/30 bg-ipl-neon/5 hover:bg-ipl-neon/10'}`}>

            <div className="flex items-center gap-2">
              {isOffline
                ? <WifiOff className="w-3 h-3 text-yellow-500" />
                : <Activity className={`w-3 h-3 text-ipl-neon ${isRefreshing ? 'animate-spin' : 'animate-pulse'}`} />
              }
              <span className={`text-[10px] font-bold uppercase tracking-widest
                ${isOffline ? 'text-yellow-500' : 'text-ipl-neon'}`}>
                {isFetching ? 'LOADING'
                  : isOffline && match ? 'CACHED'
                    : isFinished ? 'RESULT'
                      : isLive ? 'LIVE'
                        : 'RECENT'}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono border-l border-white/10 pl-3">
              {!match && isFetching && (
                <span className="text-gray-500 italic text-[10px] animate-pulse">Fetching score…</span>
              )}
              {!match && !isFetching && fetchStatus !== 'ERROR' && (
                <span className="text-gray-500 italic text-[10px]">No match today</span>
              )}
              {!match && fetchStatus === 'ERROR' && (
                <span className="text-yellow-600 italic text-[10px]">Offline</span>
              )}
              {match && (
                <>
                  <span className="font-black text-white group-hover:text-ipl-neon transition-colors">
                    {battingTeam?.name || 'TBD'} {match?.score ?? 0}/{match?.wickets ?? 0}
                  </span>

                  <span className="text-gray-500 text-[10px]">
                    ({match?.overs || '0.0'})
                  </span>

                  <span className="text-gray-600 italic text-[10px]">v</span>

                  <span className="font-bold text-gray-400">
                    {otherTeam?.name || 'TBD'}
                    {otherScore ? ` ${otherScore}` : ''}
                  </span>
                </>
              )}
            </div>
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
              {match
                ? <div className="flex justify-between items-end">
                  <span className="text-2xl font-bold">{battingTeam?.name} {match.score}/{match.wickets} <span className="text-base font-normal text-ipl-neon">({match.overs} ov)</span></span>
                  <span className="text-gray-400 font-mono text-sm">{otherTeam?.name}{otherScore ? ` ${otherScore}` : ''}</span>
                </div>
                : <p className="text-gray-500 text-sm italic">
                  {isFetching ? 'Fetching live data…' : 'No match in progress'}
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
