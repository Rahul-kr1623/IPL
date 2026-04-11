import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom'; // Import Link for navigation
import { 
  ArrowUp, Server, RefreshCw, Heart 
} from 'lucide-react';

const Footer = () => {
  const [clickCount, setClickCount] = useState(0);

  // Rahul Kumar Easter Egg Logic
  const handleEasterEgg = () => {
    setClickCount(prev => prev + 1);
    if (clickCount + 1 === 3) {
      alert("🏏 BOOM! Rahul Kumar's special: That's a massive SIX! 🚀");
      setClickCount(0);
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Centralized Sitemap Data
  const sitemap = [
    { name: 'Live Matches', path: '/' },
    { name: 'Schedule', path: '/fixtures' },
    { name: 'Points Table', path: '/points-table' },
    { name: 'Players Hub', path: '/players' },
  ];

  return (
    <footer className="relative bg-[#020617] pt-20 pb-10 px-6 overflow-hidden border-t border-white/5">
      {/* 1. Animated Neon Top Border */}
      <div className="absolute top-0 left-0 w-full h-[1px] bg-white/5">
        <motion.div 
          animate={{ x: ['-100%', '100%'] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          className="w-1/3 h-full bg-gradient-to-r from-transparent via-ipl-neon to-transparent shadow-[0_0_15px_#0ea5e9]"
        />
      </div>

      {/* Atmospheric Background Glow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-ipl-neon/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 relative z-10">
        
        {/* Column 1: Brand & Vision */}
        <div className="space-y-4">
          <Link to="/" className="text-xl font-black italic tracking-tighter block">
            MOTION <span className="text-ipl-neon font-black underline decoration-white/20">IPL 2026</span>
          </Link>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest leading-relaxed">
            Revolutionizing Cricket <br /> Data Visualization.
          </p>
          <p className="text-[10px] text-gray-500 leading-relaxed max-w-[200px]">
            Turning raw stadium metrics into immersive visual stories for the next generation of fans.
          </p>
        </div>

        {/* Column 2: Quick Navigation (FIXED LINKS) */}
        <div className="space-y-6">
          <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Sitemap</h4>
          <ul className="space-y-3 text-[11px] font-bold text-gray-400">
            {sitemap.map(link => (
              <li key={link.name}>
                <Link 
                  to={link.path} 
                  onClick={scrollToTop}
                  className="hover:text-ipl-neon cursor-pointer transition-colors uppercase tracking-widest block"
                >
                  {link.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Column 3: Connect with Creator */}
        <div className="space-y-6">
          <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">The Creator</h4>
          <div className="flex gap-4">
            <a href="https://instagram.com" target="_blank" rel="noreferrer" className="p-3 rounded-xl bg-white/5 border border-white/10 hover:border-pink-500 hover:shadow-[0_0_15px_#ec489966] transition-all group text-[10px] font-bold">
              IG
            </a>
          </div>
        </div>
      </div>

      {/* 2026 Tech Bar & Copyright */}
      <div className="mt-20 pt-8 border-t border-white/5 flex flex-col items-center justify-center gap-6 relative z-10 text-center">
        <div className="flex items-center gap-8 text-[10px] font-mono text-gray-600">
          <div className="flex items-center gap-2">
            <Server className="w-3 h-3 text-green-500" />
            <span>SERVER: <span className="text-gray-400 font-bold">OPERATIONAL</span></span>
          </div>
          <div className="flex items-center gap-2">
            <RefreshCw className="w-3 h-3 text-ipl-neon animate-spin-slow" />
            <span>SYNC: <span className="text-gray-400 font-bold">REAL-TIME</span></span>
          </div>
        </div>

        <p 
          onClick={handleEasterEgg}
          className="text-[10px] text-gray-500 font-bold cursor-pointer select-none hover:text-white transition-colors tracking-[0.1em]"
        >
          © 2026 | Built with <Heart className="w-3 h-3 inline text-red-500 fill-red-500 mx-1" /> by <span className="text-ipl-neon uppercase tracking-tighter">Rahul Kumar</span>
        </p>
      </div>

      {/* Floating Scroll to Top */}
      <motion.button 
        onClick={scrollToTop}
        whileHover={{ y: -5 }}
        whileTap={{ scale: 0.9 }}
        className="fixed bottom-8 right-8 w-12 h-12 rounded-full glass bg-ipl-neon/10 border border-ipl-neon/20 flex items-center justify-center text-ipl-neon shadow-[0_0_20px_#0ea5e933] z-[100]"
      >
        <ArrowUp className="w-5 h-5" />
      </motion.button>
    </footer>
  );
};

export default Footer;