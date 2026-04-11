import React from 'react';
import { motion } from 'framer-motion';
import Hero from '../components/Hero';
import MatchInsights from '../components/MatchInsights';
import PredictorWidget from '../components/PredictorWidget';

const Home = () => {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col gap-12 md:gap-20"
    >
      {/* 1. Main Scoreboard & Hero Branding */}
      <section className="w-full relative z-10">
        <Hero />
      </section>

      {/* 2. Interactive Fan Engagement (Predictor) */}
      <section className="w-full relative z-10 px-2">
        <PredictorWidget />
      </section>

      {/* 3. Deep Data Analytics & Bento Grid */}
      <section className="w-full relative z-10">
        <div className="flex items-center gap-4 mb-8 border-l-4 border-ipl-neon pl-6">
          <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white">
            Match <span className="text-ipl-neon">Insights</span>
          </h2>
          <div className="h-[1px] flex-1 bg-white/5 md:block hidden" />
        </div>
        <MatchInsights />
      </section>
      
    </motion.div>
  );
};

export default Home;