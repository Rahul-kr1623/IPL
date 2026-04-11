import React, { createContext, useContext, useReducer, useEffect } from 'react';

const LS_MATCH = 'ipl_last_match';
const LS_THEME = 'ipl_theme';

const saveLS = (data) => {
  try { localStorage.setItem(LS_MATCH, JSON.stringify({ data, savedAt: new Date().toISOString() })); } catch { }
};
const loadLS = () => {
  try {
    const raw = localStorage.getItem(LS_MATCH);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
};

const cached = loadLS();

// ─── Initial state ────────────────────────────────────────────────────────────
const initialState = {
  currentMatch: cached?.data || null,
  fetchStatus: cached ? 'CACHED' : 'IDLE',
  fetchError: null,
  lastFetched: cached?.savedAt || null,
  isStale: false,
  searchQuery: '',
  isSearchOpen: false,
  theme: localStorage.getItem(LS_THEME) || 'DEFAULT',
};

// ─── Reducer ──────────────────────────────────────────────────────────────────
const reducer = (state, action) => {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, fetchStatus: state.currentMatch ? 'REFRESHING' : 'LOADING' };

    case 'FETCH_SUCCESS': {
      const { _stale, _id, __v, createdAt, updatedAt, ...clean } = action.payload;
      saveLS(clean);
      return { ...state, fetchStatus: 'SUCCESS', fetchError: null, lastFetched: new Date().toISOString(), isStale: !!_stale, currentMatch: clean };
    }

    case 'FETCH_EMPTY':
      return { ...state, fetchStatus: state.currentMatch ? 'REFRESHING' : 'WARMING_UP', fetchError: null };

    case 'FETCH_ERROR':
      return { ...state, fetchStatus: 'ERROR', fetchError: action.payload, isStale: true };

    case 'UPDATE_MATCH':
    case 'UPDATE_MATCH_DATA':
      if (!action.payload || action.payload._empty) return state;
      return { ...state, currentMatch: { ...state.currentMatch, ...action.payload }, fetchStatus: 'SUCCESS', lastFetched: new Date().toISOString() };

    case 'SET_SEARCH_QUERY': return { ...state, searchQuery: action.payload };
    case 'TOGGLE_SEARCH': return { ...state, isSearchOpen: action.payload !== undefined ? action.payload : !state.isSearchOpen };
    case 'SET_THEME':
      localStorage.setItem(LS_THEME, action.payload);
      return { ...state, theme: action.payload };

    default: return state;
  }
};

// ─── Context ──────────────────────────────────────────────────────────────────
const MatchContext = createContext();

export const MatchProvider = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      dispatch({ type: 'FETCH_START' });
      try {
        // Updated to use environment variable for production
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        const res = await fetch(`${API_URL}/api/v1/live-score`);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (cancelled) return;

        if (data._empty) { dispatch({ type: 'FETCH_EMPTY' }); return; }
        if (data.error) { dispatch({ type: 'FETCH_ERROR', payload: data.error }); return; }

        dispatch({ type: 'FETCH_SUCCESS', payload: data });
      } catch (err) {
        if (!cancelled) dispatch({
          type: 'FETCH_ERROR',
          payload: err.message.includes('fetch')
            ? 'Cannot reach server. Showing last saved data.'
            : err.message,
        });
      }
    };

    poll();
    const t = setInterval(poll, 20000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Theme CSS vars
  useEffect(() => {
    const root = document.documentElement;
    const themes = {
      CSK: { neon: '#F7B111', accent: '#004BA0' }, MI: { neon: '#004BA0', accent: '#F7B111' },
      RCB: { neon: '#CC0000', accent: '#1B2133' }, KKR: { neon: '#914BE3', accent: '#F7B111' },
      RR: { neon: '#EA1A85', accent: '#0057E2' }, SRH: { neon: '#FF822A', accent: '#000000' },
      DC: { neon: '#005CA5', accent: '#EF1B23' }, PBKS: { neon: '#ED1B24', accent: '#D7C15C' },
      GT: { neon: '#B59453', accent: '#1B2133' }, LSG: { neon: '#0ea5e9', accent: '#F26522' },
    };
    const t = themes[state.theme] || { neon: '#0ea5e9', accent: '#f43f5e' };
    root.style.setProperty('--ipl-neon', t.neon);
    root.style.setProperty('--ipl-accent', t.accent);
  }, [state.theme]);

  return (
    <MatchContext.Provider value={{ state, dispatch }}>
      {children}
    </MatchContext.Provider>
  );
};

export const useMatchContext = () => useContext(MatchContext);