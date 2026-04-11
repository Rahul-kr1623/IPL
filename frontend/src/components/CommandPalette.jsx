import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { useMatchContext } from '../context/MatchContext';

const CommandPalette = () => {
  const { state, dispatch } = useMatchContext();
  const inputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Toggle on Cmd+K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        dispatch({ type: 'TOGGLE_SEARCH' });
      }
      if (e.key === 'Escape') {
        dispatch({ type: 'TOGGLE_SEARCH', payload: false });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch]);

  // Focus input when opened
  useEffect(() => {
    if (state.isSearchOpen && inputRef.current) {
      setTimeout(() => inputRef.current.focus(), 100);
    }
  }, [state.isSearchOpen]);

  return (
    <AnimatePresence>
      {state.isSearchOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 backdrop-blur-md bg-black/60"
          onClick={() => dispatch({ type: 'TOGGLE_SEARCH', payload: false })}
        >
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-ipl-dark/90 border border-white/10 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden glass relative"
          >
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-ipl-neon to-transparent opacity-50"></div>
            
            <div className="flex items-center px-6 py-4 border-b border-white/5">
              <Search className="w-5 h-5 text-ipl-neon mr-4 animate-pulse" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search players, teams, or stats..."
                className="flex-1 bg-transparent border-none outline-none text-lg text-white placeholder:text-gray-500 font-medium tracking-wide"
                value={state.searchQuery}
                onChange={(e) => dispatch({ type: 'SET_SEARCH_QUERY', payload: e.target.value })}
              />
              <button 
                onClick={() => dispatch({ type: 'TOGGLE_SEARCH', payload: false })}
                className="p-1 rounded-md hover:bg-white/10 transition-colors"
                title="ESC to empty/close"
              >
                <X className="w-5 h-5 text-gray-400 hover:text-white" />
              </button>
            </div>
            
            <div className="p-6 bg-black/20">
              <p className="text-xs text-center text-gray-500 font-mono uppercase tracking-widest flex items-center justify-center gap-2">
                {state.searchQuery ? `Searching for "${state.searchQuery}" globally...` : 'Type a name to search...'}
              </p>
              
              {!state.searchQuery && (
                <div className="mt-4 flex justify-center gap-3">
                  <span className="text-[10px] text-gray-500 border border-white/10 bg-white/5 py-1 px-2 rounded font-mono">MS Dhoni</span>
                  <span className="text-[10px] text-gray-500 border border-white/10 bg-white/5 py-1 px-2 rounded font-mono">CSK</span>
                  <span className="text-[10px] text-gray-500 border border-white/10 bg-white/5 py-1 px-2 rounded font-mono">Virat Kohli</span>
                </div>
              )}
            </div>
            
            <div className="px-6 py-3 border-t border-white/5 flex justify-between items-center text-[10px] text-gray-500 font-bold uppercase tracking-widest">
              <span>Navigate with Arrows</span>
              <span>Press <kbd className="bg-white/10 px-1 py-0.5 rounded ml-1">Esc</kbd> to close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CommandPalette;
