import { getLiveScore } from '../services/cricketService.js';
import { getMatchIntel } from '../services/geminiService.js';
import { mapRawDataToInsights } from '../utils/dataMapper.js';

let cachedData = null;
let lastFetchTime = 0;
const CACHE_DURATION_MS = 60 * 1000; // 60 seconds

export const getSmartMatchData = async (req, res) => {
  try {
    const forceSync = req.query.force === 'true';
    const currentTime = Date.now();
    
    // 1. Smart Refresh Logic
    if (!forceSync && cachedData && (currentTime - lastFetchTime < CACHE_DURATION_MS)) {
      console.log('Serving from cache to save API credits...');
      return res.json(cachedData);
    }

    console.log('Fetching fresh data from RapidAPI & Gemini...');
    
    // 2. Fetch from RapidAPI
    const rawScoreData = await getLiveScore();
    
    // 3. Data Mapping
    const insights = mapRawDataToInsights(rawScoreData);

    // 4. AI Insights 'Intel' Flow
    const intelReport = await getMatchIntel(rawScoreData);

    // 5. Construct Final Payload
    const finalData = {
      ...rawScoreData,
      insights,
      intelReport,
      lastUpdated: new Date().toISOString()
    };

    // Update Cache
    cachedData = finalData;
    lastFetchTime = Date.now();

    res.json(finalData);

  } catch (error) {
    console.error('Error in Smart Refresh Flow:', error);
    
    if (cachedData) {
      return res.json({ ...cachedData, isErrorFallback: true });
    }
    res.status(500).json({ error: 'Failed to fetch match data' });
  }
};
