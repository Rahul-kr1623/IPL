import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Trophy, Users, MoveRight } from 'lucide-react';

const teamsData = [
  { id: 'csk', name: 'Chennai Super Kings', short: 'CSK', color: '#F7B111', titles: 5, captain: 'Ruturaj Gaikwad' },
  { id: 'mi', name: 'Mumbai Indians', short: 'MI', color: '#004BA0', titles: 5, captain: 'Hardik Pandya' },
  { id: 'kkr', name: 'Kolkata Knight Riders', short: 'KKR', color: '#3A225D', titles: 3, captain: 'Ajinkya Rahane' },
  { id: 'rcb', name: 'Royal Challengers Bengaluru', short: 'RCB', color: '#CC0000', titles: 1, captain: 'Rajat Patidar' },
  { id: 'gt', name: 'Gujarat Titans', short: 'GT', color: '#1B2133', titles: 1, captain: 'Shubman Gill' },
  { id: 'rr', name: 'Rajasthan Royals', short: 'RR', color: '#EA1A85', titles: 1, captain: 'Riyan Parag' },
  { id: 'srh', name: 'Sunrisers Hyderabad', short: 'SRH', color: '#FF822A', titles: 1, captain: 'Pat Cummins' },
  { id: 'dc', name: 'Delhi Capitals', short: 'DC', color: '#005CA5', titles: 0, captain: 'Axar Patel' },
  { id: 'pbks', name: 'Punjab Kings', short: 'PBKS', color: '#ED1B24', titles: 0, captain: 'Shreyas Iyer' },
  { id: 'lsg', name: 'Lucknow Super Giants', short: 'LSG', color: '#0ea5e9', titles: 0, captain: 'Rishabh Pant' },
];

const trophyData = [
  { name: 'Chennai Super Kings', logo: 'csk', count: 5, years: '2010, 2011, 2018, 2021, 2023', dot: '#F7B111' },
  { name: 'Mumbai Indians', logo: 'mi', count: 5, years: '2013, 2015, 2017, 2019, 2020', dot: '#004BA0' },
  { name: 'Kolkata Knight Riders', logo: 'kkr', count: 3, years: '2012, 2014, 2024', dot: '#3A225D' },
  { name: 'Royal Challengers Bengaluru', logo: 'rcb', count: 1, years: '2025', dot: '#CC0000' },
  { name: 'Gujarat Titans', logo: 'gt', count: 1, years: '2022', dot: '#1B2133' },
  { name: 'Rajasthan Royals', logo: 'rr', count: 1, years: '2008', dot: '#EA1A85' },
  { name: 'Sunrisers Hyderabad', logo: 'srh', count: 1, years: '2016', dot: '#FF822A' },
  { name: 'Delhi Capitals', logo: 'dc', count: 0, years: '—', dot: '#005CA5' },
  { name: 'Punjab Kings', logo: 'pbks', count: 0, years: '—', dot: '#ED1B24' },
  { name: 'Lucknow Super Giants', logo: 'lsg', count: 0, years: '—', dot: '#0ea5e9' },
];

const Teams = () => {
  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-8 py-10 relative z-10 flex flex-col gap-16">
      
      {/* Core Directory Grid */}
      <div>
        <div className="mb-12 border-l-4 border-ipl-neon pl-6">
          <h2 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-white">
            Franchise <span className="text-ipl-neon">Directory</span>
          </h2>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px] mt-2">
            IPL 2026 • Official Teams
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {teamsData.map((team, index) => (
            <motion.div 
               key={team.id}
               initial={{ opacity: 0, y: 20 }}
               whileInView={{ opacity: 1, y: 0 }}
               whileHover={{ y: -5 }}
               viewport={{ once: true }}
               className="relative glass rounded-3xl overflow-hidden border border-white/5 group bg-white/5"
            >
               <div className="absolute -bottom-4 -right-2 text-9xl font-black italic opacity-[0.03] uppercase pointer-events-none" style={{ color: team.color }}>
                 {team.short}
               </div>
               
               <div className="h-2 w-full" style={{ backgroundColor: team.color }}></div>
               
               <div className="p-6">
                  <div className="flex justify-between items-start mb-6 relative z-10">
                    <img 
                      src={`/src/assets/logos/${team.id}_logo.png`} 
                      alt={team.short} 
                      className="w-16 h-16 object-contain drop-shadow-2xl bg-white/10 rounded-full p-2"
                      onError={(e) => { e.target.src = 'https://cricketvectors.akamaized.net/teams/IPL/BCCI.png' }}
                    />
                    <div className="flex items-center gap-1 bg-white/10 px-3 py-1 rounded-full border border-white/10">
                      <Trophy className="w-3 h-3 text-yellow-500" />
                      <span className="text-[10px] font-black">{team.titles}</span>
                    </div>
                  </div>

                  <div className="space-y-1 mb-8 relative z-10">
                    <h3 className="text-2xl font-black tracking-tight" style={{ color: team.color }}>{team.name}</h3>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Cap: <span className="text-white">{team.captain}</span></p>
                  </div>

                  <Link 
                    to={`/teams/${team.id}`}
                    className="relative z-10 w-full py-3 bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-between px-6 rounded-xl transition-all group-hover:border-white/20"
                  >
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-400 group-hover:text-white" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-300 group-hover:text-white">View Scorecard</span>
                    </div>
                    <MoveRight className="w-4 h-4 text-ipl-neon group-hover:translate-x-1 transition-transform" />
                  </Link>
               </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* IPL Trophy Count Table - Extracted from User Request */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="w-full glass rounded-3xl border border-white/10 bg-[#161616] overflow-hidden"
      >
         <div className="p-8 border-b border-white/5 flex items-center gap-4 bg-gradient-to-r from-white/5 to-transparent">
            <div className="p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/20">
               <Trophy className="w-6 h-6 text-yellow-500" />
            </div>
            <h3 className="text-2xl md:text-3xl font-black tracking-tighter text-white">IPL TROPHY COUNT <span className="text-gray-500 text-lg md:text-2xl">(Team-wise till 2026)</span></h3>
         </div>

         <div className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
               <thead>
                 <tr className="bg-black/20 border-b border-white/10">
                   <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-gray-400">Team</th>
                   <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-gray-400">Trophies Won</th>
                   <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-gray-400">Winning Years</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-white/5">
                 {trophyData.map((row, idx) => (
                   <tr key={idx} className="hover:bg-white/5 transition-colors">
                     <td className="p-6">
                        <div className="flex items-center gap-4">
                           <div className="w-3 h-3 rounded-full flex-shrink-0 shadow-[0_0_10px_currentColor]" style={{ backgroundColor: row.dot, color: row.dot }}></div>
                           <span className="font-bold text-gray-200 text-sm">{row.name}</span>
                        </div>
                     </td>
                     <td className="p-6">
                        <span className="text-xl font-black text-white">{row.count}</span>
                     </td>
                     <td className="p-6">
                        <span className="text-sm font-medium text-gray-400 tracking-wide">{row.years}</span>
                     </td>
                   </tr>
                 ))}
               </tbody>
            </table>
         </div>
      </motion.div>

    </div>
  );
};
export default Teams;
