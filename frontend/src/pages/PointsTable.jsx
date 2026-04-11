import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

const PointsTable = () => {
  const teams = [
    { rank: 1, name: "Kolkata Knight Riders", short: "KKR", p: 14, w: 9, l: 3, pts: 20, nrr: "+1.428", trend: "up", lastFive: ['W', 'W', 'L', 'W', 'W'] },
    { rank: 2, name: "Sunrisers Hyderabad", short: "SRH", p: 14, w: 8, l: 5, pts: 17, nrr: "+0.413", trend: "up", lastFive: ['W', 'L', 'W', 'W', 'L'] },
    { rank: 3, name: "Rajasthan Royals", short: "RR", p: 14, w: 8, l: 5, pts: 17, nrr: "+0.273", trend: "down", lastFive: ['L', 'L', 'L', 'W', 'L'] },
    { rank: 4, name: "Royal Challengers Bengaluru", short: "RCB", p: 14, w: 7, l: 7, pts: 14, nrr: "+0.459", trend: "up", lastFive: ['W', 'W', 'W', 'W', 'W'] },
    { rank: 5, name: "Chennai Super Kings", short: "CSK", p: 14, w: 7, l: 7, pts: 14, nrr: "+0.428", trend: "down", lastFive: ['L', 'W', 'L', 'W', 'L'] },
    { rank: 6, name: "Delhi Capitals", short: "DC", p: 14, w: 7, l: 7, pts: 14, nrr: "-0.377", trend: "up", lastFive: ['W', 'L', 'W', 'L', 'W'] },
    { rank: 7, name: "Lucknow Super Giants", short: "LSG", p: 14, w: 7, l: 7, pts: 14, nrr: "-0.667", trend: "down", lastFive: ['L', 'L', 'W', 'L', 'W'] },
    { rank: 8, name: "Gujarat Titans", short: "GT", p: 14, w: 5, l: 7, pts: 12, nrr: "-1.063", trend: "down", lastFive: ['L', 'L', 'W', 'L', 'L'] },
    { rank: 9, name: "Punjab Kings", short: "PBKS", p: 14, w: 5, l: 9, pts: 10, nrr: "-0.353", trend: "up", lastFive: ['W', 'L', 'L', 'W', 'L'] },
    { rank: 10, name: "Mumbai Indians", short: "MI", p: 14, w: 4, l: 10, pts: 8, nrr: "-0.318", trend: "down", lastFive: ['L', 'W', 'L', 'L', 'L'] },
  ];

  return (
    <div className="w-full py-10 space-y-10 relative z-10">
      <div className="border-l-4 border-ipl-neon pl-6">
        <h2 className="text-4xl font-black italic uppercase tracking-tighter">League <span className="text-ipl-neon">Standings</span></h2>
        <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px] mt-2">Current Points Table - Season 2026</p>
      </div>

      <div className="glass overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white/5">
              <tr className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                <th className="px-8 py-6">Pos</th>
                <th className="px-8 py-6">Team</th>
                <th className="px-8 py-6">Played</th>
                <th className="px-8 py-6">Won</th>
                <th className="px-8 py-6 text-ipl-neon">Points</th>
                <th className="px-8 py-6">NRR</th>
                <th className="px-8 py-6">Form (Last 5)</th>
              </tr>
            </thead>
            <tbody className="text-sm font-bold divide-y divide-white/5">
              {teams.map((team) => (
                <tr key={team.short} className="hover:bg-white/10 transition-all group">
                  <td className="px-8 py-6 text-gray-500 font-mono">
                    {team.rank < 10 ? `0${team.rank}` : team.rank}
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-black italic group-hover:text-ipl-neon transition-colors">{team.short}</span>
                      <span className="text-[10px] text-gray-500 hidden md:inline uppercase tracking-tighter">{team.name}</span>
                      {team.trend === "up" ? (
                        <TrendingUp className="w-3 h-3 text-green-500" />
                      ) : (
                        <TrendingDown className="w-3 h-3 text-red-500" />
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-6 font-mono">{team.p}</td>
                  <td className="px-8 py-6 font-mono text-gray-300">{team.w}</td>
                  <td className="px-8 py-6 text-ipl-neon text-lg italic">{team.pts}</td>
                  <td className="px-8 py-6 font-mono text-gray-400">{team.nrr}</td>
                  <td className="px-8 py-6">
                    <div className="flex gap-1.5">
                      {team.lastFive.map((res, i) => (
                        <div 
                          key={i} 
                          className={`w-5 h-5 rounded-md flex items-center justify-center text-[8px] font-black shadow-sm ${
                            res === 'W' 
                              ? 'bg-green-500/20 text-green-500 border border-green-500/30' 
                              : 'bg-red-500/20 text-red-500 border border-red-500/30'
                          }`}
                        >
                          {res}
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PointsTable;