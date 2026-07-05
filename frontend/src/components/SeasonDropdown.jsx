import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Trophy, Calendar, Clock } from 'lucide-react';
import { TEAM_COLORS, CURRENT_SEASON } from '../utils/constants.js';

const SEASONS_DESC = [
  { year: 2026, winner: null, upcoming: true },
  { year: 2025, winner: 'RCB' },
  { year: 2024, winner: 'KKR' },
  { year: 2023, winner: 'CSK' },
  { year: 2022, winner: 'GT' },
  { year: 2021, winner: 'CSK' },
  { year: 2020, winner: 'MI', hosted: 'UAE' },
  { year: 2019, winner: 'MI' },
  { year: 2018, winner: 'CSK' },
  { year: 2017, winner: 'MI' },
  { year: 2016, winner: 'SRH' },
  { year: 2015, winner: 'MI' },
  { year: 2014, winner: 'KKR', hosted: 'UAE/India' },
  { year: 2013, winner: 'MI' },
  { year: 2012, winner: 'KKR' },
  { year: 2011, winner: 'CSK' },
  { year: 2010, winner: 'CSK' },
  { year: 2009, winner: 'DC', hosted: 'South Africa' },
  { year: 2008, winner: 'RR' }
];

const SeasonDropdown = ({
  selected,
  onChange,
  showAllTime = true,
  label = 'Season',
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const handleSelect = (val) => {
    onChange(val);
    setOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const winnerColor = (year) => {
    const s = SEASONS_DESC.find(s => s.year === year);
    return s?.winner ? (TEAM_COLORS[s.winner] || '#fff') : '#6b7280';
  };

  const displayLabel =
    selected === 'all'            ? 'All Time'
    : selected === CURRENT_SEASON ? `${selected} (Upcoming)`
    : String(selected);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 border border-white/10 rounded-2xl bg-white/5
          hover:border-ipl-neon/50 hover:bg-white/10 transition-all group
          ${compact ? 'px-3 py-2 text-[10px]' : 'px-5 py-3 text-xs'}`}
      >
        <Calendar className={`text-ipl-neon ${compact ? 'w-3 h-3' : 'w-4 h-4'}`} />
        <span className="font-bold uppercase tracking-widest text-gray-300 group-hover:text-white transition-colors">
          {label}:
        </span>
        <span className="font-black text-white">{displayLabel}</span>
        <ChevronDown className={`text-gray-500 transition-transform duration-200 ${open ? 'rotate-180' : ''} ${compact ? 'w-3 h-3' : 'w-4 h-4'}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-[calc(100%+8px)] z-[300] w-64
                       bg-[#0c0c14]/98 border border-white/10 rounded-2xl
                       shadow-[0_20px_60px_rgba(0,0,0,0.7)] backdrop-blur-xl overflow-hidden"
          >
            {/* All Time */}
            {showAllTime && (
              <button
                onClick={() => handleSelect('all')}
                className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors
                  text-xs font-bold tracking-widest uppercase border-b border-white/5
                  ${selected === 'all' ? 'bg-ipl-neon/10 text-ipl-neon' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
              >
                <Trophy className="w-3.5 h-3.5 text-yellow-400" />
                All Time
                {selected === 'all' && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-ipl-neon" />}
              </button>
            )}

            <div className="max-h-72 overflow-y-auto py-1" style={{ scrollbarWidth: 'none' }}>
              {SEASONS_DESC.map((s) => {
                const isSelected = selected === s.year;
                const isUpcoming = s.upcoming;
                const color = winnerColor(s.year);
                return (
                  <button
                    key={s.year}
                    onClick={() => handleSelect(s.year)}
                    className={`w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors
                      ${isSelected
                        ? 'bg-ipl-neon/10 text-ipl-neon'
                        : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                  >
                    {/* Indicator dot */}
                    {isUpcoming
                      ? <Clock className="w-2 h-2 text-gray-500 flex-shrink-0" />
                      : <span className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: s.winner ? color : '#374151', opacity: s.winner ? 1 : 0.3 }} />
                    }

                    <span className="font-black text-sm w-10 flex-shrink-0">{s.year}</span>

                    {isUpcoming ? (
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full tracking-widest bg-gray-500/10 text-gray-500 border border-gray-500/20">
                        UPCOMING
                      </span>
                    ) : s.winner ? (
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full tracking-widest"
                        style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}40` }}>
                        {s.winner}
                      </span>
                    ) : null}

                    {s.hosted !== 'India' && (
                      <span className="ml-auto text-[8px] text-gray-600 font-mono truncate">{s.hosted}</span>
                    )}
                    {isSelected && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-ipl-neon flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SeasonDropdown;