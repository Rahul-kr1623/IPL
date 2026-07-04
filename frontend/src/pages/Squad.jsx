import React, { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MoveLeft, Shield, Zap, Target, Users, Trophy, Star } from 'lucide-react';
import SeasonDropdown from '../components/SeasonDropdown.jsx';
import { CURRENT_SEASON, TEAM_COLORS } from '../utils/constants.js';

// ─── Squad data per team per season ──────────────────────────────────────────
const SQUADS = {
  csk: {
    2026: [
      { name: 'Ruturaj Gaikwad', role: 'Batter', type: 'captain' },
      { name: 'Devon Conway',    role: 'Batter', type: 'overseas' },
      { name: 'Rahul Tripathi',  role: 'Batter' },
      { name: 'Shaik Rasheed',   role: 'Batter' },
      { name: 'Sameer Rizvi',    role: 'Batter' },
      { name: 'MS Dhoni',        role: 'Wicket-Keeper', type: 'icon' },
      { name: 'Kartik Sharma',   role: 'Wicket-Keeper' },
      { name: 'Ravindra Jadeja', role: 'All-Rounder' },
      { name: 'Shivam Dube',     role: 'All-Rounder' },
      { name: 'Moeen Ali',       role: 'All-Rounder', type: 'overseas' },
      { name: 'Mitchell Santner',role: 'All-Rounder', type: 'overseas' },
      { name: 'Matheesha Pathirana', role: 'Bowler', type: 'overseas' },
      { name: 'Deepak Chahar',   role: 'Bowler' },
      { name: 'Tushar Deshpande',role: 'Bowler' },
      { name: 'Noor Ahmad',      role: 'Bowler', type: 'overseas' },
      { name: 'Nathan Ellis',    role: 'Bowler', type: 'overseas' },
    ],
    2025: [
      { name: 'Ruturaj Gaikwad', role: 'Batter', type: 'captain' },
      { name: 'Devon Conway',    role: 'Batter', type: 'overseas' },
      { name: 'MS Dhoni',        role: 'Wicket-Keeper', type: 'icon' },
      { name: 'Ravindra Jadeja', role: 'All-Rounder' },
      { name: 'Shivam Dube',     role: 'All-Rounder' },
      { name: 'Matheesha Pathirana', role: 'Bowler', type: 'overseas' },
      { name: 'Deepak Chahar',   role: 'Bowler' },
    ],
    2024: [
      { name: 'Ruturaj Gaikwad', role: 'Batter', type: 'captain' },
      { name: 'MS Dhoni',        role: 'Wicket-Keeper', type: 'icon' },
      { name: 'Ravindra Jadeja', role: 'All-Rounder' },
      { name: 'Deepak Chahar',   role: 'Bowler' },
      { name: 'Matheesha Pathirana', role: 'Bowler', type: 'overseas' },
    ],
  },
  mi: {
    2026: [
      { name: 'Rohit Sharma',    role: 'Batter', type: 'icon' },
      { name: 'Tilak Varma',     role: 'Batter' },
      { name: 'Naman Dhir',      role: 'Batter' },
      { name: 'Ishan Kishan',    role: 'Wicket-Keeper' },
      { name: 'Hardik Pandya',   role: 'All-Rounder', type: 'captain' },
      { name: 'Tim David',       role: 'All-Rounder', type: 'overseas' },
      { name: 'Romario Shepherd',role: 'All-Rounder', type: 'overseas' },
      { name: 'Jasprit Bumrah',  role: 'Bowler', type: 'icon' },
      { name: 'Gerald Coetzee',  role: 'Bowler', type: 'overseas' },
      { name: 'Akash Madhwal',   role: 'Bowler' },
      { name: 'Piyush Chawla',   role: 'Bowler' },
    ],
    2025: [
      { name: 'Rohit Sharma',    role: 'Batter', type: 'captain' },
      { name: 'Tilak Varma',     role: 'Batter' },
      { name: 'Ishan Kishan',    role: 'Wicket-Keeper' },
      { name: 'Hardik Pandya',   role: 'All-Rounder' },
      { name: 'Jasprit Bumrah',  role: 'Bowler', type: 'icon' },
    ],
    2024: [
      { name: 'Rohit Sharma',    role: 'Batter', type: 'captain' },
      { name: 'Hardik Pandya',   role: 'All-Rounder' },
      { name: 'Jasprit Bumrah',  role: 'Bowler', type: 'icon' },
      { name: 'Suryakumar Yadav',role: 'Batter' },
    ],
  },
  rcb: {
    2026: [
      { name: 'Virat Kohli',     role: 'Batter', type: 'icon' },
      { name: 'Rajat Patidar',   role: 'Batter', type: 'captain' },
      { name: 'Devdutt Padikkal',role: 'Batter' },
      { name: 'Jacob Bethell',   role: 'Batter', type: 'overseas' },
      { name: 'Phil Salt',       role: 'Wicket-Keeper', type: 'overseas' },
      { name: 'Jitesh Sharma',   role: 'Wicket-Keeper' },
      { name: 'Krunal Pandya',   role: 'All-Rounder' },
      { name: 'Josh Hazlewood',  role: 'Bowler', type: 'overseas' },
      { name: 'Bhuvneshwar Kumar',role: 'Bowler' },
      { name: 'Yash Dayal',      role: 'Bowler' },
    ],
    2025: [
      { name: 'Virat Kohli',     role: 'Batter', type: 'icon' },
      { name: 'Rajat Patidar',   role: 'Batter', type: 'captain' },
      { name: 'Josh Hazlewood',  role: 'Bowler', type: 'overseas' },
      { name: 'Bhuvneshwar Kumar',role: 'Bowler' },
    ],
  },
  kkr: {
    2026: [
      { name: 'Ajinkya Rahane',  role: 'Batter', type: 'captain' },
      { name: 'Rinku Singh',     role: 'Batter' },
      { name: 'Venkatesh Iyer',  role: 'Batter' },
      { name: 'Rahmanullah Gurbaz', role: 'Wicket-Keeper', type: 'overseas' },
      { name: 'Andre Russell',   role: 'All-Rounder', type: 'overseas' },
      { name: 'Sunil Narine',    role: 'All-Rounder', type: 'overseas' },
      { name: 'Mitchell Starc',  role: 'Bowler', type: 'overseas' },
      { name: 'Varun Chakravarthy', role: 'Bowler' },
      { name: 'Harshit Rana',    role: 'Bowler' },
    ],
    2024: [
      { name: 'Shreyas Iyer',    role: 'Batter', type: 'captain' },
      { name: 'Sunil Narine',    role: 'All-Rounder', type: 'overseas' },
      { name: 'Andre Russell',   role: 'All-Rounder', type: 'overseas' },
      { name: 'Mitchell Starc',  role: 'Bowler', type: 'overseas' },
      { name: 'Varun Chakravarthy', role: 'Bowler' },
    ],
  },
  rr: {
    2026: [
      { name: 'Riyan Parag',     role: 'All-Rounder', type: 'captain' },
      { name: 'Yashasvi Jaiswal',role: 'Batter' },
      { name: 'Sanju Samson',    role: 'Wicket-Keeper' },
      { name: 'Jos Buttler',     role: 'Wicket-Keeper', type: 'overseas' },
      { name: 'Dhruv Jurel',     role: 'Wicket-Keeper' },
      { name: 'Rovman Powell',   role: 'All-Rounder', type: 'overseas' },
      { name: 'Trent Boult',     role: 'Bowler', type: 'overseas' },
      { name: 'Yuzvendra Chahal',role: 'Bowler' },
    ],
    2022: [
      { name: 'Sanju Samson',    role: 'Wicket-Keeper', type: 'captain' },
      { name: 'Jos Buttler',     role: 'Wicket-Keeper', type: 'overseas' },
      { name: 'Yashasvi Jaiswal',role: 'Batter' },
      { name: 'Trent Boult',     role: 'Bowler', type: 'overseas' },
      { name: 'Yuzvendra Chahal',role: 'Bowler' },
    ],
  },
  gt: {
    2026: [
      { name: 'Shubman Gill',    role: 'Batter', type: 'captain' },
      { name: 'Sai Sudharsan',   role: 'Batter' },
      { name: 'Kane Williamson', role: 'Batter', type: 'overseas' },
      { name: 'Wriddhiman Saha', role: 'Wicket-Keeper' },
      { name: 'Rahul Tewatia',   role: 'All-Rounder' },
      { name: 'Rashid Khan',     role: 'All-Rounder', type: 'overseas' },
      { name: 'Mohammed Shami',  role: 'Bowler' },
      { name: 'Joshua Little',   role: 'Bowler', type: 'overseas' },
    ],
    2022: [
      { name: 'Hardik Pandya',   role: 'All-Rounder', type: 'captain' },
      { name: 'Shubman Gill',    role: 'Batter' },
      { name: 'Rashid Khan',     role: 'All-Rounder', type: 'overseas' },
      { name: 'Mohammed Shami',  role: 'Bowler' },
    ],
  },
  srh: {
    2026: [
      { name: 'Pat Cummins',     role: 'Bowler', type: 'captain' },
      { name: 'Travis Head',     role: 'Batter', type: 'overseas' },
      { name: 'Abhishek Sharma', role: 'Batter' },
      { name: 'Heinrich Klaasen',role: 'Wicket-Keeper', type: 'overseas' },
      { name: 'Marco Jansen',    role: 'All-Rounder', type: 'overseas' },
      { name: 'Washington Sundar',role: 'All-Rounder' },
      { name: 'Bhuvneshwar Kumar',role: 'Bowler' },
    ],
  },
  dc: {
    2026: [
      { name: 'Axar Patel',      role: 'All-Rounder', type: 'captain' },
      { name: 'KL Rahul',        role: 'Batter' },
      { name: 'Abhishek Porel',  role: 'Wicket-Keeper' },
      { name: 'Tristan Stubbs',  role: 'Wicket-Keeper', type: 'overseas' },
      { name: 'Kuldeep Yadav',   role: 'Bowler' },
      { name: 'Mitchell Starc',  role: 'Bowler', type: 'overseas' },
    ],
  },
  pbks: {
    2026: [
      { name: 'Shreyas Iyer',    role: 'Batter', type: 'captain' },
      { name: 'Prabhsimran Singh',role:'Batter' },
      { name: 'Jonny Bairstow',  role: 'Wicket-Keeper', type: 'overseas' },
      { name: 'Sam Curran',      role: 'All-Rounder', type: 'overseas' },
      { name: 'Arshdeep Singh',  role: 'Bowler' },
      { name: 'Kagiso Rabada',   role: 'Bowler', type: 'overseas' },
    ],
  },
  lsg: {
    2026: [
      { name: 'Rishabh Pant',    role: 'Wicket-Keeper', type: 'captain' },
      { name: 'Ayush Badoni',    role: 'Batter' },
      { name: 'Nicholas Pooran', role: 'Wicket-Keeper', type: 'overseas' },
      { name: 'Krunal Pandya',   role: 'All-Rounder' },
      { name: 'Ravi Bishnoi',    role: 'Bowler' },
      { name: 'Mark Wood',       role: 'Bowler', type: 'overseas' },
    ],
  },
};

const ROLE_ICON = {
  'Batter':         <Target className="w-4 h-4" />,
  'Bowler':         <Zap className="w-4 h-4" />,
  'Wicket-Keeper':  <Shield className="w-4 h-4" />,
  'All-Rounder':    <Star className="w-4 h-4" />,
};

const ROLE_ORDER = ['Batter', 'Wicket-Keeper', 'All-Rounder', 'Bowler'];

const teamsMeta = {
  csk:  { name: 'Chennai Super Kings',         color: '#F7B111' },
  mi:   { name: 'Mumbai Indians',               color: '#004BA0' },
  rcb:  { name: 'Royal Challengers Bengaluru',  color: '#CC0000' },
  kkr:  { name: 'Kolkata Knight Riders',        color: '#3A225D' },
  rr:   { name: 'Rajasthan Royals',             color: '#EA1A85' },
  srh:  { name: 'Sunrisers Hyderabad',          color: '#FF822A' },
  dc:   { name: 'Delhi Capitals',               color: '#005CA5' },
  pbks: { name: 'Punjab Kings',                 color: '#ED1B24' },
  gt:   { name: 'Gujarat Titans',               color: '#1B2133' },
  lsg:  { name: 'Lucknow Super Giants',         color: '#0ea5e9' },
};

const Squad = () => {
  const { id } = useParams();
  const meta   = teamsMeta[id] || { name: 'Unknown Team', color: '#fff' };
  const color  = meta.color;

  // Find available seasons for this team
  const teamSeasons = Object.keys(SQUADS[id] || {}).map(Number).sort((a, b) => b - a);
  const defaultSeason = teamSeasons.includes(CURRENT_SEASON) ? CURRENT_SEASON : (teamSeasons[0] || CURRENT_SEASON);
  const [season, setSeason] = useState(defaultSeason);

  const squad = useMemo(() => {
    const raw = SQUADS[id]?.[season] || SQUADS[id]?.[defaultSeason] || [];
    return ROLE_ORDER.flatMap(role => raw.filter(p => p.role === role));
  }, [id, season]);

  const grouped = useMemo(() => {
    return ROLE_ORDER.reduce((acc, role) => {
      const group = squad.filter(p => p.role === role);
      if (group.length) acc[role] = group;
      return acc;
    }, {});
  }, [squad]);

  const captain = squad.find(p => p.type === 'captain');

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-8 py-10 relative z-10 space-y-10">

      {/* Back */}
      <Link to="/teams"
        className="inline-flex items-center gap-2 px-4 py-2 border border-white/10 rounded-full bg-white/5
                   hover:bg-white/10 transition-colors text-[10px] uppercase font-black tracking-widest text-gray-400">
        <MoveLeft className="w-3 h-3" /> Back to Teams
      </Link>

      {/* Hero banner */}
      <div className="relative flex flex-col md:flex-row items-center gap-8 p-8 rounded-3xl border border-white/10 bg-white/5 overflow-hidden group">
        <div className="absolute inset-0 opacity-5 group-hover:opacity-10 transition-opacity"
          style={{ background: `radial-gradient(ellipse at top right, ${color}, transparent 70%)` }} />

        <img src={`/logos/${id}_logo.png`} alt={meta.name}
          className="w-28 h-28 object-contain drop-shadow-2xl z-10"
          onError={e => { e.target.src = 'https://cricketvectors.akamaized.net/teams/IPL/BCCI.png'; }} />

        <div className="z-10 text-center md:text-left flex-1">
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter italic uppercase" style={{ color }}>
            {meta.name}
          </h1>
          {captain && (
            <p className="text-gray-400 font-bold tracking-widest uppercase text-xs mt-1">
              Captain: <span className="text-white">{captain.name}</span>
            </p>
          )}
          <p className="text-[10px] text-gray-600 font-mono mt-1">
            {squad.length} players · IPL {season} Roster
          </p>
        </div>

        {/* Season selector */}
        <div className="z-10">
          <SeasonDropdown
            selected={season}
            onChange={yr => setSeason(yr)}
            showAllTime={false}
            label="Season"
          />
          {!SQUADS[id]?.[season] && season !== defaultSeason && (
            <p className="text-[9px] text-yellow-500/80 font-bold mt-2 text-center">
              Showing {defaultSeason} roster
            </p>
          )}
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-3">
        {ROLE_ORDER.map(role => (
          <div key={role} className="glass bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
            <div className="flex justify-center mb-2" style={{ color }}>
              {ROLE_ICON[role]}
            </div>
            <p className="text-xl font-black text-white">{grouped[role]?.length || 0}</p>
            <p className="text-[8px] text-gray-500 uppercase font-bold tracking-widest mt-0.5">
              {role === 'Wicket-Keeper' ? 'WK' : role}s
            </p>
          </div>
        ))}
      </div>

      {/* Grouped roster */}
      <div className="space-y-8">
        {ROLE_ORDER.filter(role => grouped[role]).map(role => (
          <div key={role}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-xl border border-white/10 bg-white/5" style={{ color }}>
                {ROLE_ICON[role]}
              </div>
              <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">
                {role}s <span className="text-gray-600">({grouped[role].length})</span>
              </h3>
              <div className="flex-1 h-px bg-white/5" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {grouped[role].map((player, idx) => (
                <motion.div
                  key={player.name}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.04 }}
                  whileHover={{ y: -4 }}
                  className={`glass p-5 rounded-2xl border bg-white/5 group flex gap-4 items-center relative overflow-hidden
                    ${player.type === 'captain' ? 'border-yellow-400/30' : 'border-white/10'}
                    ${player.type === 'icon'    ? 'border-ipl-neon/20'  : ''}`}
                >
                  <div className="absolute -bottom-4 -right-4 w-20 h-20 blur-2xl opacity-10 group-hover:opacity-25 transition-all"
                    style={{ backgroundColor: color }} />

                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-full border-2 border-dashed flex-shrink-0 flex items-center justify-center text-lg"
                    style={{ borderColor: `${color}60`, backgroundColor: `${color}15`, color }}>
                    {ROLE_ICON[player.role]}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="text-sm font-black tracking-tight text-white leading-tight">
                        {player.name}
                      </h4>
                      {player.type === 'captain' && (
                        <span className="text-[8px] bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 px-1.5 py-0.5 rounded-full font-black tracking-widest">C</span>
                      )}
                      {player.type === 'overseas' && (
                        <span className="text-[8px] bg-blue-400/10 text-blue-400 border border-blue-400/20 px-1.5 py-0.5 rounded-full font-black tracking-widest">OS</span>
                      )}
                    </div>
                    <p className="text-[9px] font-bold tracking-widest uppercase mt-0.5" style={{ color }}>
                      {player.role}
                    </p>
                    <p className="text-[8px] text-gray-600 font-mono mt-0.5">IPL {season}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Squad;