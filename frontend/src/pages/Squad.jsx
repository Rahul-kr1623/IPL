import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MoveLeft, Shield, Zap, Target } from 'lucide-react';

const mockSquads = {
  csk: [
    { name: 'Ruturaj Gaikwad (C)', role: 'Batter' },
    { name: 'Devon Conway', role: 'Batter' },
    { name: 'Rahul Tripathi', role: 'Batter' },
    { name: 'Shaik Rasheed', role: 'Batter' },
    { name: 'Sameer Rizvi', role: 'Batter' },
    { name: 'Prashant Veer', role: 'Batter' },
    { name: 'MS Dhoni', role: 'Wicket-Keeper' },
    { name: 'Kartik Sharma', role: 'Wicket-Keeper' },
    { name: 'Ravindra Jadeja', role: 'All-Rounder' },
    { name: 'Shivam Dube', role: 'All-Rounder' },
    { name: 'Moeen Ali', role: 'All-Rounder' },
    { name: 'Mitchell Santner', role: 'All-Rounder' },
    { name: 'Nishant Sindhu', role: 'All-Rounder' },
    { name: 'Matheesha Pathirana', role: 'Bowler' },
    { name: 'Deepak Chahar', role: 'Bowler' },
    { name: 'Tushar Deshpande', role: 'Bowler' },
    { name: 'Mukesh Choudhary', role: 'Bowler' },
    { name: 'Maheesh Theekshana', role: 'Bowler' },
    { name: 'Noor Ahmad', role: 'Bowler' },
    { name: 'Nathan Ellis', role: 'Bowler' },
    { name: 'Simarjeet Singh', role: 'Bowler' }
  ],
  mi: [
    { name: 'Rohit Sharma', role: 'Batter' },
    { name: 'Tilak Varma', role: 'Batter' },
    { name: 'Naman Dhir', role: 'Batter' },
    { name: 'Nehal Wadhera', role: 'Batter' },
    { name: 'Ishan Kishan', role: 'Wicket-Keeper' },
    { name: 'Vishnu Vinod', role: 'Wicket-Keeper' },
    { name: 'Hardik Pandya (C)', role: 'All-Rounder' },
    { name: 'Tim David', role: 'All-Rounder' },
    { name: 'Romario Shepherd', role: 'All-Rounder' },
    { name: 'Shams Mulani', role: 'All-Rounder' },
    { name: 'Jasprit Bumrah', role: 'Bowler' },
    { name: 'Gerald Coetzee', role: 'Bowler' },
    { name: 'Akash Madhwal', role: 'Bowler' },
    { name: 'Piyush Chawla', role: 'Bowler' },
    { name: 'Kumar Kartikeya', role: 'Bowler' },
    { name: 'Luke Wood', role: 'Bowler' }
  ],
  rcb: [
    { name: 'Virat Kohli', role: 'Batter' },
    { name: 'Devdutt Padikkal', role: 'Batter' },
    { name: 'Rajat Patidar (C)', role: 'Batter' },
    { name: 'Jacob Bethell', role: 'Batter' },
    { name: 'Phil Salt', role: 'Wicket-Keeper' },
    { name: 'Jitesh Sharma', role: 'Wicket-Keeper' },
    { name: 'Krunal Pandya', role: 'All-Rounder' },
    { name: 'Tim David', role: 'All-Rounder' },
    { name: 'Romario Shepherd', role: 'All-Rounder' },
    { name: 'Swapnil Singh', role: 'All-Rounder' },
    { name: 'Satvik Deswal', role: 'All-Rounder' },
    { name: 'Josh Hazlewood', role: 'Bowler' },
    { name: 'Bhuvneshwar Kumar', role: 'Bowler' },
    { name: 'Yash Dayal', role: 'Bowler' },
    { name: 'Nuwan Thushara', role: 'Bowler' },
    { name: 'Suyash Sharma', role: 'Bowler' },
    { name: 'Rasikh Salam', role: 'Bowler' }
  ],
  kkr: [
    { name: 'Ajinkya Rahane (C)', role: 'Batter' },
    { name: 'Rinku Singh', role: 'Batter' },
    { name: 'Venkatesh Iyer', role: 'Batter' },
    { name: 'Angkrish Raghuvanshi', role: 'Batter' },
    { name: 'Rahmanullah Gurbaz', role: 'Wicket-Keeper' },
    { name: 'Andre Russell', role: 'All-Rounder' },
    { name: 'Sunil Narine', role: 'All-Rounder' },
    { name: 'Cameron Green', role: 'All-Rounder' },
    { name: 'Mitchell Starc', role: 'Bowler' },
    { name: 'Varun Chakravarthy', role: 'Bowler' },
    { name: 'Harshit Rana', role: 'Bowler' },
    { name: 'Suyash Sharma', role: 'Bowler' },
    { name: 'Vaibhav Arora', role: 'Bowler' }
  ],
  dc: [
    { name: 'KL Rahul', role: 'Batter' },
    { name: 'Karun Nair', role: 'Batter' },
    { name: 'Sameer Rizvi', role: 'Batter' },
    { name: 'Ashutosh Sharma', role: 'Batter' },
    { name: 'Nitish Rana', role: 'Batter' },
    { name: 'Abhishek Porel', role: 'Wicket-Keeper' },
    { name: 'Tristan Stubbs', role: 'Wicket-Keeper' },
    { name: 'Axar Patel (C)', role: 'All-Rounder' },
    { name: 'Ajay Mandal', role: 'All-Rounder' },
    { name: 'Vipraj Nigam', role: 'All-Rounder' },
    { name: 'Kuldeep Yadav', role: 'Bowler' },
    { name: 'Mitchell Starc', role: 'Bowler' },
    { name: 'T Natarajan', role: 'Bowler' },
    { name: 'Mukesh Kumar', role: 'Bowler' },
    { name: 'Dushmantha Chameera', role: 'Bowler' }
  ],
  pbks: [
    { name: 'Shreyas Iyer (C)', role: 'Batter' },
    { name: 'Prabhsimran Singh', role: 'Batter' },
    { name: 'Shashank Singh', role: 'Batter' },
    { name: 'Jonny Bairstow', role: 'Wicket-Keeper' },
    { name: 'Sam Curran', role: 'All-Rounder' },
    { name: 'Liam Livingstone', role: 'All-Rounder' },
    { name: 'Marcus Stoinis', role: 'All-Rounder' },
    { name: 'Arshdeep Singh', role: 'Bowler' },
    { name: 'Kagiso Rabada', role: 'Bowler' },
    { name: 'Harpreet Brar', role: 'Bowler' },
    { name: 'Rahul Chahar', role: 'Bowler' }
  ],
  rr: [
    { name: 'Yashasvi Jaiswal', role: 'Batter' },
    { name: 'Shimron Hetmyer', role: 'Batter' },
    { name: 'Kunal Singh Rathore', role: 'Batter' },
    { name: 'Sanju Samson', role: 'Wicket-Keeper' },
    { name: 'Dhruv Jurel', role: 'Wicket-Keeper' },
    { name: 'Riyan Parag (C)', role: 'All-Rounder' },
    { name: 'Rovman Powell', role: 'All-Rounder' },
    { name: 'Trent Boult', role: 'Bowler' },
    { name: 'Avesh Khan', role: 'Bowler' },
    { name: 'Yuzvendra Chahal', role: 'Bowler' },
    { name: 'Kuldeep Sen', role: 'Bowler' },
    { name: 'Navdeep Saini', role: 'Bowler' }
  ],
  srh: [
    { name: 'Travis Head', role: 'Batter' },
    { name: 'Abhishek Sharma', role: 'Batter' },
    { name: 'Rahul Tripathi', role: 'Batter' },
    { name: 'Heinrich Klaasen', role: 'Wicket-Keeper' },
    { name: 'Marco Jansen', role: 'All-Rounder' },
    { name: 'Washington Sundar', role: 'All-Rounder' },
    { name: 'Pat Cummins (C)', role: 'Bowler' },
    { name: 'Bhuvneshwar Kumar', role: 'Bowler' },
    { name: 'T Natarajan', role: 'Bowler' },
    { name: 'Mayank Markande', role: 'Bowler' },
    { name: 'Umran Malik', role: 'Bowler' }
  ],
  lsg: [
    { name: 'Ayush Badoni', role: 'Batter' },
    { name: 'Deepak Hooda', role: 'Batter' },
    { name: 'Rishabh Pant (C)', role: 'Wicket-Keeper' },
    { name: 'Nicholas Pooran', role: 'Wicket-Keeper' },
    { name: 'Quinton de Kock', role: 'Wicket-Keeper' },
    { name: 'Marcus Stoinis', role: 'All-Rounder' },
    { name: 'Krunal Pandya', role: 'All-Rounder' },
    { name: 'Ravi Bishnoi', role: 'Bowler' },
    { name: 'Mohsin Khan', role: 'Bowler' },
    { name: 'Naveen-ul-Haq', role: 'Bowler' },
    { name: 'Mark Wood', role: 'Bowler' },
    { name: 'Yash Thakur', role: 'Bowler' }
  ],
  gt: [
    { name: 'Shubman Gill (C)', role: 'Batter' },
    { name: 'Sai Sudharsan', role: 'Batter' },
    { name: 'Kane Williamson', role: 'Batter' },
    { name: 'Wriddhiman Saha', role: 'Wicket-Keeper' },
    { name: 'Matthew Wade', role: 'Wicket-Keeper' },
    { name: 'Rahul Tewatia', role: 'All-Rounder' },
    { name: 'Vijay Shankar', role: 'All-Rounder' },
    { name: 'Rashid Khan', role: 'All-Rounder' },
    { name: 'Mohammed Shami', role: 'Bowler' },
    { name: 'Spencer Johnson', role: 'Bowler' },
    { name: 'Joshua Little', role: 'Bowler' },
    { name: 'Noor Ahmad', role: 'Bowler' },
    { name: 'Umesh Yadav', role: 'Bowler' }
  ]
};

const teamsMeta = {
  csk: { name: 'Chennai Super Kings', color: '#F7B111' },
  mi: { name: 'Mumbai Indians', color: '#004BA0' },
  rcb: { name: 'Royal Challengers Bengaluru', color: '#CC0000' },
  kkr: { name: 'Kolkata Knight Riders', color: '#3A225D' },
  rr: { name: 'Rajasthan Royals', color: '#EA1A85' },
  srh: { name: 'Sunrisers Hyderabad', color: '#FF822A' },
  dc: { name: 'Delhi Capitals', color: '#005CA5' },
  pbks: { name: 'Punjab Kings', color: '#ED1B24' },
  gt: { name: 'Gujarat Titans', color: '#1B2133' },
  lsg: { name: 'Lucknow Super Giants', color: '#0ea5e9' },
};

const Squad = () => {
  const { id } = useParams();
  const meta = teamsMeta[id] || { name: 'Unknown Team', color: '#fff' };
  const squad = mockSquads[id] || [];

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-8 py-10 relative z-10">
      
      {/* Header */}
      <Link to="/teams" className="inline-flex items-center gap-2 px-4 py-2 border border-white/10 rounded-full bg-white/5 hover:bg-white/10 transition-colors mb-8 text-[10px] uppercase font-black tracking-widest text-gray-400">
        <MoveLeft className="w-3 h-3" /> Back to Teams
      </Link>

      <div className="flex flex-col md:flex-row items-center gap-8 mb-16 p-8 rounded-3xl border border-white/10 bg-white/5 relative overflow-hidden group hover:border-white/20 transition-all">
         <div className="absolute top-0 right-0 w-64 h-64 blur-3xl rounded-full opacity-20 pointer-events-none transition-opacity group-hover:opacity-40" style={{ backgroundColor: meta.color }}></div>
         
         <img 
            src={`/logos/${id}_logo.png`} 
            alt={meta.name} 
            className="w-32 h-32 object-contain drop-shadow-[0_0_30px_rgba(255,255,255,0.2)] z-10"
            onError={(e) => { e.target.src = 'https://cricketvectors.akamaized.net/teams/IPL/BCCI.png' }}
          />
         
         <div className="z-10 text-center md:text-left">
           <h1 className="text-4xl md:text-6xl font-black tracking-tighter italic uppercase" style={{ color: meta.color }}>
             {meta.name}
           </h1>
           <p className="text-gray-400 font-bold tracking-widest uppercase text-xs mt-2">Official 2026 IPL Roster • Active Framework</p>
         </div>
      </div>

      {/* Roster Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {squad.map((player, idx) => (
          <motion.div 
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.03 }}
            className="glass p-6 rounded-2xl border border-white/10 bg-white/5 hover:border-white/20 transition-colors group flex gap-4 items-center"
          >
             <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${meta.color}20` }}>
                {player.role === 'Batter' ? <Target className="w-5 h-5" style={{color: meta.color}}/> : 
                 player.role === 'Bowler' ? <Zap className="w-5 h-5" style={{color: meta.color}}/> : 
                 player.role === 'Wicket-Keeper' ? <Shield className="w-5 h-5" style={{color: meta.color}}/> : 
                 <Zap className="w-5 h-5" style={{color: meta.color}}/>}
             </div>
             <div>
                <h4 className="text-sm font-black tracking-tight text-white mb-0.5">{player.name}</h4>
                <div className="flex gap-2 text-[9px] uppercase font-bold tracking-widest text-gray-500">
                  <span style={{color: meta.color}}>{player.role}</span>
                  <span>•</span>
                  <span>2026 SIGNING</span>
                </div>
             </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
export default Squad;
