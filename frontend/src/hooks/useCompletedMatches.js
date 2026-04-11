/**
 * useCompletedMatches.js
 * Custom hook — fetches completed match data from server.
 * Fixtures.jsx uses this so statuses update automatically
 * without needing to redeploy frontend after each match.
 * 
 * Usage in Fixtures.jsx:
 *   const { completedIds, getResult } = useCompletedMatches();
 *   const isCompleted = completedIds.has(match.id);
 *   const res = getResult(match.id);  // { winner, result, scoreA, scoreB }
 */

import { useState, useEffect } from 'react';

const CACHE_KEY = 'ipl_completed_matches';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

export const useCompletedMatches = () => {
  const [data, setData] = useState(() => {
    // Load from localStorage cache
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const { payload, savedAt } = JSON.parse(raw);
        if (Date.now() - savedAt < CACHE_TTL) return payload;
      }
    } catch {}
    return { completedIds: [], results: [] };
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res  = await fetch('http://localhost:5000/api/v1/completed-matches');
        const json = await res.json();
        setData(json);
        // Cache it
        localStorage.setItem(CACHE_KEY, JSON.stringify({ payload: json, savedAt: Date.now() }));
      } catch (err) {
        console.warn('Could not fetch completed matches:', err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // Re-fetch every 15 minutes
    const t = setInterval(fetchData, CACHE_TTL);
    return () => clearInterval(t);
  }, []);

  const completedIds = new Set(data.completedIds || []);

  const getResult = (matchId) =>
    (data.results || []).find(r => r.id === matchId) || null;

  return { completedIds, getResult, loading };
};