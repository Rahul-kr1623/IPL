export const SEASONS = [
  { year: 2008, winner: 'RR',   runnerUp: 'CSK',  totalMatches: 59, hosted: 'India' },
  { year: 2009, winner: 'DC',   runnerUp: 'RCB',  totalMatches: 57, hosted: 'South Africa' },
  { year: 2010, winner: 'CSK',  runnerUp: 'MI',   totalMatches: 60, hosted: 'India' },
  { year: 2011, winner: 'CSK',  runnerUp: 'RCB',  totalMatches: 73, hosted: 'India' },
  { year: 2012, winner: 'KKR',  runnerUp: 'CSK',  totalMatches: 76, hosted: 'India' },
  { year: 2013, winner: 'MI',   runnerUp: 'CSK',  totalMatches: 76, hosted: 'India' },
  { year: 2014, winner: 'KKR',  runnerUp: 'PBKS', totalMatches: 60, hosted: 'India / UAE' },
  { year: 2015, winner: 'MI',   runnerUp: 'CSK',  totalMatches: 59, hosted: 'India' },
  { year: 2016, winner: 'SRH',  runnerUp: 'RCB',  totalMatches: 60, hosted: 'India' },
  { year: 2017, winner: 'MI',   runnerUp: 'RPS',  totalMatches: 59, hosted: 'India' },
  { year: 2018, winner: 'CSK',  runnerUp: 'SRH',  totalMatches: 60, hosted: 'India' },
  { year: 2019, winner: 'MI',   runnerUp: 'CSK',  totalMatches: 60, hosted: 'India' },
  { year: 2020, winner: 'MI',   runnerUp: 'DC',   totalMatches: 60, hosted: 'UAE' },
  { year: 2021, winner: 'CSK',  runnerUp: 'KKR',  totalMatches: 60, hosted: 'India / UAE' },
  { year: 2022, winner: 'GT',   runnerUp: 'RR',   totalMatches: 74, hosted: 'India' },
  { year: 2023, winner: 'CSK',  runnerUp: 'GT',   totalMatches: 74, hosted: 'India' },
  { year: 2024, winner: 'KKR',  runnerUp: 'SRH',  totalMatches: 74, hosted: 'India' },
  { year: 2025, winner: 'RCB',  runnerUp: 'PBKS', totalMatches: 74, hosted: 'India' },
  { year: 2026, winner: 'GT',   runnerUp: 'KKR',  totalMatches: 74, hosted: 'India' },
  { year: 2027, winner: null,   runnerUp: null,   totalMatches: null, hosted: 'India', upcoming: true },
];

export const CURRENT_SEASON  = 2026;
export const UPCOMING_SEASON = 2027;
export const FIRST_SEASON    = 2008;

/** All seasons newest-first */
export const SEASONS_DESC = [...SEASONS].reverse();

/** Only completed seasons */
export const COMPLETED_SEASONS = SEASONS.filter(s => s.winner !== null);

/** Helper: get season metadata by year */
export const getSeason = (year) => SEASONS.find(s => s.year === year) || null;

export const TEAM_COLORS = {
  CSK: '#F7B111', MI: '#004BA0', RCB: '#CC0000', KKR: '#3A225D',
  RR: '#EA1A85',  PBKS: '#ED1B24', DC: '#005CA5', GT: '#1B2133',
  LSG: '#0ea5e9', SRH: '#FF822A', RPS: '#E2714B', PWI: '#74307C',
  DD:  '#282968', GL:  '#E84E0E', KTK: '#CC0000', RCF: '#CC0000',
};

export const TEAM_NAMES = {
  CSK:  'Chennai Super Kings',          MI:   'Mumbai Indians',
  RCB:  'Royal Challengers Bengaluru',  KKR:  'Kolkata Knight Riders',
  RR:   'Rajasthan Royals',             PBKS: 'Punjab Kings',
  DC:   'Delhi Capitals',               GT:   'Gujarat Titans',
  LSG:  'Lucknow Super Giants',         SRH:  'Sunrisers Hyderabad',
  RPS:  'Rising Pune Supergiant',       PWI:  'Pune Warriors India',
  DD:   'Delhi Daredevils',             GL:   'Gujarat Lions',
  KTK:  'Kochi Tuskers Kerala',
};

export const ACTIVE_TEAMS = ['CSK','MI','RCB','KKR','RR','PBKS','DC','GT','LSG','SRH'];