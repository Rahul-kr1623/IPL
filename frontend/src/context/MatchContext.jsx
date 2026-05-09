import React, { createContext, useContext, useReducer, useEffect } from 'react';

const LS_SLOTS = 'ipl_live_slots_v2';
const LS_FINISHED = 'ipl_last_finished';
const LS_THEME = 'ipl_theme';

const saveLS = (key, data) => {
  try { localStorage.setItem(key, JSON.stringify({ data, savedAt: new Date().toISOString() })); } catch { }
};
const loadLS = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
};

const cachedSlots = loadLS(LS_SLOTS);
const cachedFinishedRaw = loadLS(LS_FINISHED);
// Determine if the cached finished match is stale and should be cleared:
//   1. No cache at all
//   2. Source is 'hardcoded' or missing (not from a live API)
//   3. Older than 12 hours
//   4. It's the known stale hardcoded match (PBKS vs LSG, Apr 19) —
//      explicitly nuke it regardless of source tag
const cachedFinishedAge = cachedFinishedRaw?.savedAt
  ? Date.now() - new Date(cachedFinishedRaw.savedAt).getTime()
  : Infinity;
const _cd = cachedFinishedRaw?.data;
const _isKnownStale =
  (_cd?.team1 === 'PBKS' && _cd?.team2 === 'LSG' && _cd?.date?.includes('APR 2026')) ||
  (_cd?.team1 === 'LSG' && _cd?.team2 === 'PBKS' && _cd?.date?.includes('APR 2026'));
const cachedFinishedIsStale =
  !cachedFinishedRaw ||
  _isKnownStale ||
  _cd?._source === 'hardcoded' ||
  _cd?.source === 'hardcoded' ||
  (!_cd?._source && !_cd?.source) ||
  cachedFinishedAge > 12 * 60 * 60 * 1000;

if (cachedFinishedIsStale) {
  try { localStorage.removeItem(LS_FINISHED); } catch { }
}
const cachedFinished = cachedFinishedIsStale ? null : cachedFinishedRaw;

// ─── Initial state ──────────────────────────────────────────────────────────
const initialState = {
  slot1: cachedSlots?.data?.slot1 || null,
  slot2: cachedSlots?.data?.slot2 || null,
  latestFinished: cachedFinished?.data || null,
  finishedQueue: cachedFinished?.data ? [cachedFinished.data] : [],  // FIFO queue — max 1 shown

  // Legacy compat
  currentMatch: cachedSlots?.data?.slot1 || null,
  matches: cachedSlots?.data
    ? [cachedSlots.data.slot1, cachedSlots.data.slot2].filter(Boolean)
    : [],

  fetchStatus: cachedSlots ? 'CACHED' : 'IDLE',
  fetchError: null,
  lastFetched: cachedSlots?.savedAt || null,
  isStale: false,
  searchQuery: '',
  isSearchOpen: false,
  theme: localStorage.getItem(LS_THEME) || 'DEFAULT',
};

// ─── Reducer ────────────────────────────────────────────────────────────────
const reducer = (state, action) => {
  switch (action.type) {

    case 'FETCH_START':
      return {
        ...state,
        fetchStatus: (state.slot1 || state.slot2) ? 'REFRESHING' : 'LOADING',
      };

    case 'FETCH_SUCCESS': {
      const raw = action.payload;
      let slot1, slot2;

      if (raw.slot1 !== undefined || raw.slot2 !== undefined) {
        // New API format: { slot1, slot2, ... }
        slot1 = raw.slot1 ? stripMeta(raw.slot1) : null;
        slot2 = raw.slot2 ? stripMeta(raw.slot2) : null;
      } else if (Array.isArray(raw.matches)) {
        // Old format: matches[0] = slot1, matches[1] = slot2
        const clean = raw.matches.map(stripMeta);
        slot1 = clean[0] || null;
        slot2 = clean[1] || null;
      } else if (!raw._empty) {
        slot1 = stripMeta(raw);
        slot2 = null;
      } else {
        slot1 = null;
        slot2 = null;
      }

      if (slot1 || slot2) saveLS(LS_SLOTS, { slot1, slot2 });

      const matches = [slot1, slot2].filter(Boolean);
      return {
        ...state,
        fetchStatus: 'SUCCESS',
        fetchError: null,
        lastFetched: new Date().toISOString(),
        isStale: !!raw._stale,
        slot1,
        slot2,
        currentMatch: slot1,
        matches,
      };
    }

    case 'FETCH_EMPTY':
      return {
        ...state,
        fetchStatus: (state.slot1 || state.slot2) ? 'REFRESHING' : 'WARMING_UP',
        fetchError: null,
        matches: [],
      };

    case 'FETCH_ERROR':
      return { ...state, fetchStatus: 'ERROR', fetchError: action.payload, isStale: true };

    case 'SET_LATEST_FINISHED': {
      const m = action.payload;
      if (!m) return state;

      const incomingSource = m._source || m.source || 'unknown';

      // Only block hardcoded data if we already have real ESPN/JSON data
      // saved THIS session (not from localStorage — that's cleared on stale).
      const prev = state.latestFinished;
      const prevSource = prev?._source || prev?.source || '';
      const prevIsReal = ['espn-scraped', 'json', 'liveMatch'].includes(prevSource);
      const incomingIsHardcoded = incomingSource === 'hardcoded';

      if (prevIsReal && incomingIsHardcoded) {
        return state; // don't downgrade real→hardcoded
      }

      const merged = { ...m, _source: incomingSource };
      saveLS(LS_FINISHED, merged);
      return {
        ...state,
        latestFinished: merged,
        finishedQueue: [merged],
      };
    }

    // ── Bug 9 fix ─────────────────────────────────────────────────────────
    // UPDATE_MATCH / UPDATE_MATCH_DATA previously only updated slot1, leaving
    // slot2 (the 7:30 PM match) frozen on whatever was in Redux state.
    // Fix: update BOTH slots if the payload has a slot field, or fall back to
    // updating slot1 only (legacy callers that don't pass a slot).
    case 'UPDATE_MATCH':
    case 'UPDATE_MATCH_DATA': {
      if (!action.payload || action.payload._empty) return state;
      const patch = action.payload;

      // If the patch carries an explicit slot field, update only that slot.
      // If not (legacy dispatch), update slot1 only — same as before.
      let newSlot1 = state.slot1;
      let newSlot2 = state.slot2;

      if (patch.slot === 'slot2') {
        newSlot2 = state.slot2 ? { ...state.slot2, ...patch } : null;
      } else if (patch.slot === 'slot1' || !patch.slot) {
        newSlot1 = state.slot1 ? { ...state.slot1, ...patch } : null;
      }

      const newMatches = [newSlot1, newSlot2].filter(Boolean);
      return {
        ...state,
        currentMatch: newSlot1,
        slot1: newSlot1,
        slot2: newSlot2,
        matches: newMatches,
        fetchStatus: 'SUCCESS',
        lastFetched: new Date().toISOString(),
      };
    }

    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.payload };

    case 'TOGGLE_SEARCH':
      return {
        ...state,
        isSearchOpen: action.payload !== undefined ? action.payload : !state.isSearchOpen,
      };

    case 'SET_THEME':
      localStorage.setItem(LS_THEME, action.payload);
      return { ...state, theme: action.payload };

    default:
      return state;
  }
};

const stripMeta = ({ _stale, _id, __v, createdAt, updatedAt, ...m } = {}) => m;

// ─── Context ─────────────────────────────────────────────────────────────────
const MatchContext = createContext();

export const MatchProvider = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  // ── Poll live scores (slot1 + slot2) every 20s ────────────────────────
  useEffect(() => {
    let cancelled = false;
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

    const poll = async () => {
      if (cancelled) return;
      dispatch({ type: 'FETCH_START' });
      try {
        const res = await fetch(`${API_URL}/api/v1/live-score`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;

        const hasData = data.slot1 || data.slot2 ||
          (Array.isArray(data.matches) && data.matches.length > 0);

        if (data._empty || !hasData) {
          dispatch({ type: 'FETCH_EMPTY' });
          return;
        }
        if (data.error) {
          dispatch({ type: 'FETCH_ERROR', payload: data.error });
          return;
        }

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

  // ── Fetch latest finished match every 5 min ───────────────────────────
  useEffect(() => {
    let cancelled = false;
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

    const fetchFinished = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`${API_URL}/api/v1/latest-finished`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.match) dispatch({ type: 'SET_LATEST_FINISHED', payload: data.match });
      } catch { /* non-critical */ }
    };

    fetchFinished();
    // Poll every 2 minutes instead of 5 — ensures Box 3 updates quickly
    const t = setInterval(fetchFinished, 2 * 60 * 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // ── Theme CSS vars ────────────────────────────────────────────────────
  useEffect(() => {
    const root = document.documentElement;
    const themes = {
      CSK: { neon: '#F7B111', accent: '#004BA0' },
      MI: { neon: '#004BA0', accent: '#F7B111' },
      RCB: { neon: '#CC0000', accent: '#1B2133' },
      KKR: { neon: '#914BE3', accent: '#F7B111' },
      RR: { neon: '#EA1A85', accent: '#0057E2' },
      SRH: { neon: '#FF822A', accent: '#000000' },
      DC: { neon: '#005CA5', accent: '#EF1B23' },
      PBKS: { neon: '#ED1B24', accent: '#D7C15C' },
      GT: { neon: '#B59453', accent: '#1B2133' },
      LSG: { neon: '#0ea5e9', accent: '#F26522' },
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