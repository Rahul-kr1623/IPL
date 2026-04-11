import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Swords } from 'lucide-react';

const NotFound = () => {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center space-y-8 relative overflow-hidden">
      {/* Background Decorative Element */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-ipl-neon/10 rounded-full blur-[120px] -z-10" />
      
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="space-y-4"
      >
        <h1 className="text-9xl font-black italic text-white/10 select-none">404</h1>
        <div className="space-y-2">
          <h2 className="text-4xl font-black uppercase tracking-tighter italic">
            You're <span className="text-ipl-neon">OUT!</span>
          </h2>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">
            The ball went out of the stadium. Page not found.
          </p>
        </div>
      </motion.div>

      <div className="relative group">
        <div className="w-24 h-24 border-2 border-dashed border-white/10 rounded-full flex items-center justify-center group-hover:border-ipl-neon transition-colors">
          <Swords className="w-10 h-10 text-gray-700 group-hover:text-ipl-neon transition-colors" />
        </div>
      </div>

      <Link to="/">
        <button className="flex items-center gap-3 px-8 py-3 bg-ipl-neon text-black rounded-full font-black uppercase text-[10px] tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(14,165,233,0.4)]">
          <ArrowLeft className="w-4 h-4" /> Back to Pitch
        </button>
      </Link>
    </div>
  );
};

export default NotFound;