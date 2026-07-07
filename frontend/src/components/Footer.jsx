import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ArrowUp, Server, RefreshCw, Heart,
  Mail, WifiOff, Activity, Zap, Shield, Trophy,
  ExternalLink, ChevronRight, Radio,
} from 'lucide-react';
import { useMatchContext } from '../context/MatchContext.jsx';

const NAV = [
  { name: 'Live Now',    path: '/' },
  { name: 'Fixtures',   path: '/fixtures' },
  { name: 'Teams',      path: '/teams' },
  { name: 'Players',    path: '/players' },
  { name: 'Stats',      path: '/stats' },
  { name: 'Points',     path: '/points' },
  { name: 'Stadiums',   path: '/stadiums' },
];

// Social icon SVGs (lucide-react v0.383 doesn't export Github/Linkedin/Instagram)
const SvgInstagram = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
  </svg>
);
const SvgLinkedin = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>
  </svg>
);
const SvgGithub = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
  </svg>
);

const SOCIALS = [
  { icon: SvgInstagram, label: 'Instagram', handle: '@rahulkr_1623',   href: 'https://www.instagram.com/rahulkr_1623/',    color: '#E1306C' },
  { icon: SvgLinkedin,  label: 'LinkedIn',  handle: 'rahulkumar-web',  href: 'https://www.linkedin.com/in/rahulkumar-web', color: '#0A66C2' },
  { icon: SvgGithub,    label: 'GitHub',    handle: 'Rahul-kr1623',    href: 'https://github.com/Rahul-kr1623',            color: '#e2e8f0' },
  { icon: Mail,         label: 'Email',     handle: 'rahulkr23082006', href: 'mailto:rahulkr23082006@gmail.com',           color: '#0ea5e9' },
];

const STATS_TICKER = [
  '🏏 74 matches played in IPL 2026',
  '🏆 RCB crowned champions for the 2nd time',
  '🟠 Vaibhav Sooryavanshi — Orange Cap — 776 runs',
  '🟣 Kagiso Rabada — Purple Cap — 29 wickets',
  '⭐ Vaibhav Suryavanshi — Most Valuable Player',
  '🌟 Vaibhav Suryavanshi — Emerging Player',
  '📍 19 seasons · 2008 – 2026 · India\'s premier T20 league',
];

const Footer = () => {
  const { state } = useMatchContext();
  const match = state.currentMatch;

  const [serverOnline, setServerOnline]   = useState(true);
  const [lastSync, setLastSync]           = useState(new Date());
  const [syncPulse, setSyncPulse]         = useState(false);
  const [tickerIdx, setTickerIdx]         = useState(0);
  const [easterCount, setEasterCount]     = useState(0);
  const [easterActive, setEasterActive]   = useState(false);
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  // Ping server health every 30s
  useEffect(() => {
    const ping = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/health`, { signal: AbortSignal.timeout(5000) });
        setServerOnline(res.ok);
        setLastSync(new Date());
        setSyncPulse(true);
        setTimeout(() => setSyncPulse(false), 800);
      } catch {
        setServerOnline(false);
      }
    };
    ping();
    const id = setInterval(ping, 30000);
    return () => clearInterval(id);
  }, []);

  // Stats ticker rotation
  useEffect(() => {
    const id = setInterval(() => setTickerIdx(i => (i + 1) % STATS_TICKER.length), 3500);
    return () => clearInterval(id);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const handleEaster = () => {
    const next = easterCount + 1;
    setEasterCount(next);
    if (next >= 5) { setEasterActive(true); setEasterCount(0); setTimeout(() => setEasterActive(false), 3000); }
  };

  const fmtTime = (d) => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const isLive  = match?.status === 'LIVE';

  return (
    <footer className="relative bg-[#020617] overflow-hidden border-t border-white/5 mt-20">

      {/* Animated scan line */}
      <div className="absolute top-0 left-0 w-full h-[1px] overflow-hidden">
        <motion.div
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          className="w-1/3 h-full bg-gradient-to-r from-transparent via-ipl-neon to-transparent"
          style={{ boxShadow: '0 0 20px #0ea5e9' }}
        />
      </div>

      {/* Background glow blobs */}
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-ipl-neon/4 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-ipl-accent/4 rounded-full blur-[100px] pointer-events-none" />

      {/* ── LIVE TICKER BAR ────────────────────────────────────────────────── */}
      <div className="border-b border-white/5 bg-white/[0.02] overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[9px] font-black text-ipl-neon uppercase tracking-widest shrink-0">
            <Radio className="w-3 h-3 animate-pulse" /> IPL Stats
          </span>
          <div className="w-px h-4 bg-white/10 shrink-0" />
          <div className="flex-1 overflow-hidden relative h-4">
            <AnimatePresence mode="wait">
              <motion.p
                key={tickerIdx}
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -12, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="text-[10px] font-bold text-gray-400 absolute whitespace-nowrap"
              >
                {STATS_TICKER[tickerIdx]}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── MAIN FOOTER GRID ───────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 pt-16 pb-10 grid grid-cols-1 md:grid-cols-12 gap-12 relative z-10">

        {/* ── Col 1: Brand (4 cols) ── */}
        <div className="md:col-span-4 space-y-6">
          <Link to="/" className="block group">
            <div className="flex items-center gap-3 mb-1">
              <img src="/logos/ipl_logo.png" alt="IPL" className="w-8 h-8 object-contain"
                onError={e => { e.target.style.display = 'none'; }} />
              <span className="text-2xl font-black italic tracking-tighter">
                CRICKET <span className="text-ipl-neon">INTEL</span>
              </span>
            </div>
          </Link>

          <p className="text-xs font-bold text-gray-500 leading-relaxed max-w-xs">
            Where raw stadium data meets immersive design. Real-time scores, deep analytics,
            and 19 seasons of IPL history — all in one place.
          </p>

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-ipl-neon/5 border border-ipl-neon/10">
            <Zap className="w-3.5 h-3.5 text-ipl-neon" />
            <span className="text-[9px] font-black uppercase tracking-widest text-ipl-neon">
              Built for the next generation of cricket fans
            </span>
          </div>

          {/* IPL glory row */}
          <div className="flex flex-wrap gap-2">
            {[
              { label: '19 Seasons', icon: '📅' },
              { label: '10 Teams',   icon: '🏟️' },
              { label: '1000+ Matches', icon: '🏏' },
            ].map(b => (
              <div key={b.label} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full">
                <span className="text-xs">{b.icon}</span>
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">{b.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Col 2: Navigation (2 cols) ── */}
        <div className="md:col-span-2 space-y-5">
          <h4 className="text-[9px] font-black uppercase tracking-[0.3em] text-gray-500">Navigate</h4>
          <ul className="space-y-2.5">
            {NAV.map(link => (
              <li key={link.name}>
                <Link to={link.path} onClick={scrollToTop}
                  className="flex items-center gap-2 text-[11px] font-bold text-gray-500 hover:text-ipl-neon
                             transition-colors uppercase tracking-widest group">
                  <ChevronRight className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 -ml-3 group-hover:ml-0 transition-all text-ipl-neon" />
                  {link.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Col 3: Creator (3 cols) ── */}
        <div className="md:col-span-3 space-y-5">
          <h4 className="text-[9px] font-black uppercase tracking-[0.3em] text-gray-500">The Creator</h4>

          <div className="flex items-center gap-3 p-4 bg-white/5 border border-white/10 rounded-2xl">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-ipl-neon to-ipl-accent flex items-center justify-center font-black text-xl text-white shrink-0">
              R
            </div>
            <div>
              <p className="text-sm font-black text-white">Rahul Kumar</p>
              <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Full Stack Developer</p>
              <p className="text-[8px] text-gray-600 font-mono mt-0.5">rahulkr23082006@gmail.com</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {SOCIALS.map(s => (
              <a key={s.label} href={s.href} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 p-3 bg-white/5 border border-white/10 rounded-xl
                           hover:border-white/30 hover:bg-white/10 transition-all group overflow-hidden"
              >
                <s.icon className="w-4 h-4 flex-shrink-0 transition-colors"
                  style={{ color: s.color }} />
                <div className="min-w-0">
                  <p className="text-[8px] font-black uppercase tracking-widest text-gray-500 group-hover:text-white transition-colors">
                    {s.label}
                  </p>
                  <p className="text-[8px] font-mono text-gray-600 truncate group-hover:text-gray-400 transition-colors">
                    {s.handle}
                  </p>
                </div>
                <ExternalLink className="w-2.5 h-2.5 text-gray-700 ml-auto flex-shrink-0 group-hover:text-gray-400 transition-colors" />
              </a>
            ))}
          </div>
        </div>

        {/* ── Col 4: System Status (3 cols) ── */}
        <div className="md:col-span-3 space-y-5">
          <h4 className="text-[9px] font-black uppercase tracking-[0.3em] text-gray-500">System Status</h4>

          {/* Server status card */}
          <div className="space-y-3">
            {/* Server */}
            <div className={`flex items-center justify-between p-4 rounded-2xl border transition-all
              ${serverOnline
                ? 'bg-green-500/5 border-green-500/20'
                : 'bg-red-500/5 border-red-500/20'}`}>
              <div className="flex items-center gap-3">
                {serverOnline
                  ? <Server className="w-4 h-4 text-green-400" />
                  : <WifiOff className="w-4 h-4 text-red-400" />}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Backend</p>
                  <p className={`text-[10px] font-black ${serverOnline ? 'text-green-400' : 'text-red-400'}`}>
                    {serverOnline ? '● OPERATIONAL' : '● OFFLINE'}
                  </p>
                </div>
              </div>
              <div className={`w-2 h-2 rounded-full ${serverOnline ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            </div>

            {/* Sync status */}
            <div className={`flex items-center justify-between p-4 rounded-2xl border bg-ipl-neon/5 border-ipl-neon/20 transition-all`}>
              <div className="flex items-center gap-3">
                <motion.div animate={syncPulse ? { rotate: 360 } : {}} transition={{ duration: 0.5 }}>
                  <RefreshCw className="w-4 h-4 text-ipl-neon" />
                </motion.div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Data Sync</p>
                  <p className="text-[10px] font-black text-ipl-neon">● REAL-TIME</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[8px] text-gray-600 font-mono">Last sync</p>
                <p className="text-[9px] text-gray-400 font-mono">{fmtTime(lastSync)}</p>
              </div>
            </div>

            {/* Live match indicator */}
            <div className={`flex items-center justify-between p-4 rounded-2xl border transition-all
              ${isLive
                ? 'bg-ipl-accent/5 border-ipl-accent/20'
                : 'bg-white/5 border-white/10'}`}>
              <div className="flex items-center gap-3">
                <Activity className={`w-4 h-4 ${isLive ? 'text-ipl-accent' : 'text-gray-600'}`} />
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Live Match</p>
                  <p className={`text-[10px] font-black ${isLive ? 'text-ipl-accent' : 'text-gray-600'}`}>
                    {isLive
                      ? `● ${match?.team1?.name} vs ${match?.team2?.name}`
                      : '● NO MATCH'}
                  </p>
                </div>
              </div>
              {isLive && (
                <div className="w-2 h-2 rounded-full bg-ipl-accent animate-pulse" />
              )}
            </div>

            {/* Tech stack */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {['React','Vite','TailwindCSS','MongoDB','Node.js','Express','ESPN API'].map(t => (
                <span key={t}
                  className="text-[7px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-white/5 border border-white/10 text-gray-500">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM BAR ─────────────────────────────────────────────────────── */}
      <div className="border-t border-white/5 relative z-10">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-4">

          {/* Left: copyright */}
          <button onClick={handleEaster} className="text-[10px] text-gray-600 font-bold cursor-pointer select-none hover:text-white transition-colors tracking-widest">
            © 2026 · Built with{' '}
            <Heart className="w-3 h-3 inline text-red-500 fill-red-500 mx-0.5" />
            {' '}by{' '}
            <span className="text-ipl-neon font-black uppercase">Rahul Kumar</span>
          </button>

          {/* Center: disclaimer */}
          <p className="text-[8px] text-gray-700 font-mono text-center max-w-xs">
            Fan-made project · Not affiliated with BCCI or IPL · Data sourced via ESPN Cricinfo
          </p>

          {/* Right: version */}
          <div className="flex items-center gap-2">
            <Shield className="w-3 h-3 text-gray-700" />
            <span className="text-[9px] font-mono text-gray-700">v2026.5.1 · MIT License</span>
          </div>
        </div>
      </div>

      {/* Easter egg overlay */}
      <AnimatePresence>
        {easterActive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-0 z-[500] flex items-center justify-center pointer-events-none"
          >
            <div className="glass bg-[#0c0c14]/90 border border-ipl-neon/40 rounded-3xl px-12 py-8 text-center shadow-[0_0_80px_rgba(14,165,233,0.3)]">
              <p className="text-5xl mb-3">🏏</p>
              <p className="text-2xl font-black italic text-ipl-neon uppercase tracking-tighter">That's a SIX!</p>
              <p className="text-sm text-gray-400 font-bold mt-2">— Rahul Kumar's special easter egg —</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scroll to top */}
      <motion.button
        onClick={scrollToTop}
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.9 }}
        className="fixed bottom-8 right-8 w-11 h-11 rounded-full bg-ipl-neon/10 border border-ipl-neon/20
                   flex items-center justify-center text-ipl-neon shadow-[0_0_20px_#0ea5e933] z-[100]
                   hover:bg-ipl-neon/20 hover:border-ipl-neon/40 transition-all"
      >
        <ArrowUp className="w-4 h-4" />
      </motion.button>
    </footer>
  );
};

export default Footer;