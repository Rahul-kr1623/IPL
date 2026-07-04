import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Calendar, MapPin, Clock, Trophy, X, Activity, Search, Zap, Radio } from 'lucide-react';
import { useMatchContext } from '../context/MatchContext';
import { useCompletedMatches } from '../hooks/useCompletedMatches';
import SeasonDropdown from '../components/SeasonDropdown.jsx';
import { CURRENT_SEASON } from '../utils/constants.js';

const COLORS = {
  CSK: "#FDB913", RCB: "#CC0000", MI: "#004BA0", KKR: "#3A225D",
  RR: "#EA1A85", PBKS: "#ED1B24", GT: "#B59453", LSG: "#0ea5e9",
  DC: "#005CA5", SRH: "#FF822A",
};

const LOGOS = {
  CSK: '/logos/csk_logo.png', MI: '/logos/mi_logo.png',
  RCB: '/logos/rcb_logo.png', KKR: '/logos/kkr_logo.png',
  RR: '/logos/rr_logo.png', PBKS: '/logos/pbks_logo.png',
  DC: '/logos/dc_logo.png', GT: '/logos/gt_logo.png',
  LSG: '/logos/lsg_logo.png', SRH: '/logos/srh_logo.png',
};

const VENUES = {
  Bengaluru: 'M. Chinnaswamy Stadium', Mumbai: 'Wankhede Stadium',
  Guwahati: 'ACA-VDCA Cricket Stadium', 'New Chandigarh': 'Maharaja Yadavindra Singh Stadium',
  Lucknow: 'Ekana Cricket Stadium', Kolkata: 'Eden Gardens',
  Chennai: 'M.A. Chidambaram Stadium', Delhi: 'Arun Jaitley Stadium',
  Ahmedabad: 'Narendra Modi Stadium', Hyderabad: 'Rajiv Gandhi International Stadium',
  Jaipur: 'Sawai Mansingh Stadium', Raipur: 'Shaheed Veer Narayan Singh Stadium',
  Dharamshala: 'HPCA Stadium',
};

// ─── Match entry helper ───────────────────────────────────────────────────────
const mk = (id, date, day, time, home, away, city, extras = {}) => ({
  id, date, day, time, teamA: home, teamB: away,
  city, venue: VENUES[city] || city,
  type: extras.type || 'League Match',
  baseStatus: extras.baseStatus || 'upcoming',
  result: extras.result || null,
  winner: extras.winner || null,
  scoreA: extras.scoreA || null,
  scoreB: extras.scoreB || null,
  scorecard: extras.scorecard || null,
});

// ─── Completed scorecards ──────────────────────────────────────────────────────
const SC = {
  1: { innings1: { team: "RCB", total: "163/8 (20)", batsmen: [{ name: "V. Kohli", runs: 72, balls: 48, fours: 8, sixes: 2, sr: "150.0", dismissal: "c Abhishek b Cummins" }, { name: "F. du Plessis", runs: 31, balls: 22, fours: 4, sixes: 1, sr: "140.9", dismissal: "b Harshal" }, { name: "G. Maxwell", runs: 28, balls: 16, fours: 2, sixes: 2, sr: "175.0", dismissal: "c Cummins b Shahbaz" }, { name: "D. Padikkal", runs: 14, balls: 12, fours: 1, sixes: 0, sr: "116.7", dismissal: "run out" }, { name: "D. Karthik†", runs: 8, balls: 5, fours: 1, sixes: 0, sr: "160.0", dismissal: "not out" }], bowlers: [{ name: "P. Cummins", overs: "4", maidens: 0, runs: 32, wickets: 2, economy: "8.00" }, { name: "Harshal Patel", overs: "4", maidens: 0, runs: 38, wickets: 2, economy: "9.50" }, { name: "Shahbaz Ahmed", overs: "4", maidens: 0, runs: 28, wickets: 2, economy: "7.00" }, { name: "T. Natarajan", overs: "4", maidens: 0, runs: 35, wickets: 1, economy: "8.75" }, { name: "Abhishek S.", overs: "4", maidens: 0, runs: 30, wickets: 1, economy: "7.50" }] }, innings2: { team: "SRH", total: "164/4 (18.3)", batsmen: [{ name: "Abhishek Sharma", runs: 54, balls: 32, fours: 6, sixes: 3, sr: "168.8", dismissal: "c Kohli b Siraj" }, { name: "Travis Head", runs: 68, balls: 42, fours: 7, sixes: 4, sr: "161.9", dismissal: "not out" }, { name: "H. Klaasen", runs: 28, balls: 18, fours: 2, sixes: 2, sr: "155.6", dismissal: "c Maxwell b Siraj" }, { name: "Nitish Reddy", runs: 10, balls: 8, fours: 1, sixes: 0, sr: "125.0", dismissal: "not out" }], bowlers: [{ name: "M. Siraj", overs: "4", maidens: 0, runs: 38, wickets: 2, economy: "9.50" }, { name: "G. Maxwell", overs: "3", maidens: 0, runs: 22, wickets: 1, economy: "7.33" }, { name: "Y. Dayal", overs: "3.3", maidens: 0, runs: 34, wickets: 1, economy: "9.71" }, { name: "K. Ahmed", overs: "4", maidens: 0, runs: 42, wickets: 0, economy: "10.50" }, { name: "J. Hazlewood", overs: "4", maidens: 0, runs: 28, wickets: 0, economy: "7.00" }] } },
  2: { innings1: { team: "MI", total: "189/5 (20)", batsmen: [{ name: "R. Sharma", runs: 44, balls: 28, fours: 5, sixes: 2, sr: "157.1", dismissal: "c Narine b Hasnain" }, { name: "I. Kishan†", runs: 62, balls: 38, fours: 6, sixes: 4, sr: "163.2", dismissal: "not out" }, { name: "S. Tendulkar", runs: 35, balls: 22, fours: 3, sixes: 2, sr: "159.1", dismissal: "b Hasnain" }, { name: "T. David", runs: 31, balls: 16, fours: 2, sixes: 3, sr: "193.8", dismissal: "not out" }], bowlers: [{ name: "M. Hasnain", overs: "4", maidens: 0, runs: 36, wickets: 2, economy: "9.00" }, { name: "S. Narine", overs: "4", maidens: 0, runs: 28, wickets: 1, economy: "7.00" }, { name: "A. Khan", overs: "4", maidens: 0, runs: 42, wickets: 1, economy: "10.50" }, { name: "V. Singh", overs: "4", maidens: 0, runs: 38, wickets: 1, economy: "9.50" }, { name: "Suyash Sharma", overs: "4", maidens: 0, runs: 45, wickets: 0, economy: "11.25" }] }, innings2: { team: "KKR", total: "181/9 (20)", batsmen: [{ name: "P. Salt†", runs: 58, balls: 36, fours: 7, sixes: 3, sr: "161.1", dismissal: "c Kishan b Bumrah" }, { name: "S. Narine", runs: 42, balls: 28, fours: 4, sixes: 2, sr: "150.0", dismissal: "b Hardik" }, { name: "A. Russell", runs: 36, balls: 18, fours: 2, sixes: 4, sr: "200.0", dismissal: "c David b Bumrah" }, { name: "V. Iyer", runs: 22, balls: 18, fours: 2, sixes: 1, sr: "122.2", dismissal: "run out" }], bowlers: [{ name: "J. Bumrah", overs: "4", maidens: 0, runs: 28, wickets: 2, economy: "7.00" }, { name: "H. Pandya", overs: "4", maidens: 0, runs: 38, wickets: 2, economy: "9.50" }, { name: "J. Yadav", overs: "4", maidens: 0, runs: 42, wickets: 2, economy: "10.50" }, { name: "A. Tiwary", overs: "4", maidens: 0, runs: 36, wickets: 2, economy: "9.00" }, { name: "M. Boucher", overs: "4", maidens: 0, runs: 37, wickets: 1, economy: "9.25" }] } },
  3: { innings1: { team: "RR", total: "172/6 (20)", batsmen: [{ name: "Y. Jaiswal", runs: 88, balls: 54, fours: 9, sixes: 4, sr: "162.9", dismissal: "c Jadeja b Simarjeet" }, { name: "J. Buttler†", runs: 42, balls: 30, fours: 4, sixes: 2, sr: "140.0", dismissal: "b Matheesha" }, { name: "S. Samson", runs: 24, balls: 16, fours: 2, sixes: 1, sr: "150.0", dismissal: "c Ruturaj b Chahar" }], bowlers: [{ name: "Matheesha P.", overs: "4", maidens: 0, runs: 30, wickets: 2, economy: "7.50" }, { name: "D. Chahar", overs: "4", maidens: 0, runs: 28, wickets: 2, economy: "7.00" }, { name: "R. Jadeja", overs: "4", maidens: 0, runs: 38, wickets: 1, economy: "9.50" }, { name: "Simarjeet S.", overs: "4", maidens: 0, runs: 36, wickets: 1, economy: "9.00" }] }, innings2: { team: "CSK", total: "173/6 (19.4)", batsmen: [{ name: "R. Gaikwad", runs: 65, balls: 44, fours: 7, sixes: 2, sr: "147.7", dismissal: "c Jaiswal b Boult" }, { name: "D. Conway†", runs: 48, balls: 34, fours: 5, sixes: 1, sr: "141.2", dismissal: "b Chahal" }, { name: "M. Dhoni", runs: 26, balls: 14, fours: 1, sixes: 3, sr: "185.7", dismissal: "not out" }, { name: "S. Dube", runs: 20, balls: 16, fours: 2, sixes: 0, sr: "125.0", dismissal: "not out" }], bowlers: [{ name: "T. Boult", overs: "4", maidens: 0, runs: 32, wickets: 2, economy: "8.00" }, { name: "Y. Chahal", overs: "4", maidens: 0, runs: 28, wickets: 2, economy: "7.00" }, { name: "K. Yadav", overs: "4", maidens: 0, runs: 38, wickets: 1, economy: "9.50" }, { name: "R. Tewatia", overs: "4", maidens: 0, runs: 40, wickets: 1, economy: "10.00" }, { name: "S. Hetmyer", overs: "3.4", maidens: 0, runs: 35, wickets: 0, economy: "9.55" }] } },
  4: { innings1: { team: "GT", total: "198/5 (20)", batsmen: [{ name: "S. Gil", runs: 94, balls: 56, fours: 9, sixes: 5, sr: "167.9", dismissal: "c Prabhsimran b Arshdeep" }, { name: "W. Saha†", runs: 38, balls: 26, fours: 4, sixes: 1, sr: "146.2", dismissal: "b Arshdeep" }, { name: "H. Pandya", runs: 44, balls: 22, fours: 3, sixes: 4, sr: "200.0", dismissal: "not out" }], bowlers: [{ name: "Arshdeep S.", overs: "4", maidens: 0, runs: 34, wickets: 2, economy: "8.50" }, { name: "R. Ashwin", overs: "4", maidens: 0, runs: 30, wickets: 2, economy: "7.50" }, { name: "C. Sam", overs: "4", maidens: 0, runs: 48, wickets: 1, economy: "12.00" }, { name: "H. Rauf", overs: "4", maidens: 0, runs: 44, wickets: 0, economy: "11.00" }, { name: "L. Livingstone", overs: "4", maidens: 0, runs: 42, wickets: 0, economy: "10.50" }] }, innings2: { team: "PBKS", total: "180/8 (20)", batsmen: [{ name: "Prabhsimran S.", runs: 68, balls: 44, fours: 7, sixes: 3, sr: "154.5", dismissal: "c Gil b Shami" }, { name: "L. Livingstone", runs: 44, balls: 26, fours: 4, sixes: 3, sr: "169.2", dismissal: "b Mohit Sharma" }, { name: "J. Inglis†", runs: 32, balls: 20, fours: 3, sixes: 2, sr: "160.0", dismissal: "c Saha b Shami" }], bowlers: [{ name: "M. Shami", overs: "4", maidens: 0, runs: 28, wickets: 2, economy: "7.00" }, { name: "Mohit Sharma", overs: "4", maidens: 0, runs: 32, wickets: 2, economy: "8.00" }, { name: "N. Khan", overs: "4", maidens: 0, runs: 42, wickets: 2, economy: "10.50" }, { name: "R. Khan", overs: "4", maidens: 0, runs: 38, wickets: 2, economy: "9.50" }, { name: "D. Miller", overs: "4", maidens: 0, runs: 40, wickets: 0, economy: "10.00" }] } },
  5: { innings1: { team: "LSG", total: "155/9 (20)", batsmen: [{ name: "K. Rahul†", runs: 54, balls: 42, fours: 5, sixes: 1, sr: "128.6", dismissal: "c Gill b Axar" }, { name: "Q. de Kock", runs: 38, balls: 28, fours: 4, sixes: 1, sr: "135.7", dismissal: "b Axar" }, { name: "M. Vohra", runs: 22, balls: 18, fours: 2, sixes: 0, sr: "122.2", dismissal: "c Dhruv b Kuldeep" }], bowlers: [{ name: "Axar Patel", overs: "4", maidens: 0, runs: 22, wickets: 2, economy: "5.50" }, { name: "Kuldeep Yadav", overs: "4", maidens: 0, runs: 26, wickets: 2, economy: "6.50" }, { name: "A. Nortje", overs: "4", maidens: 0, runs: 32, wickets: 2, economy: "8.00" }, { name: "Mukesh Kumar", overs: "4", maidens: 0, runs: 38, wickets: 2, economy: "9.50" }, { name: "T. Stubbs", overs: "4", maidens: 0, runs: 37, wickets: 1, economy: "9.25" }] }, innings2: { team: "DC", total: "156/5 (18.2)", batsmen: [{ name: "D. Warner", runs: 72, balls: 46, fours: 8, sixes: 3, sr: "156.5", dismissal: "c Rahul b Avesh" }, { name: "Prithvi Shaw", runs: 34, balls: 24, fours: 4, sixes: 1, sr: "141.7", dismissal: "b Ravi Bishnoi" }, { name: "T. Stubbs", runs: 30, balls: 20, fours: 3, sixes: 1, sr: "150.0", dismissal: "not out" }], bowlers: [{ name: "Avesh Khan", overs: "4", maidens: 0, runs: 32, wickets: 2, economy: "8.00" }, { name: "Ravi Bishnoi", overs: "4", maidens: 0, runs: 22, wickets: 2, economy: "5.50" }, { name: "M. Pathirana", overs: "4", maidens: 0, runs: 38, wickets: 1, economy: "9.50" }, { name: "Y. Thakur", overs: "4", maidens: 0, runs: 34, wickets: 0, economy: "8.50" }, { name: "D. Hooda", overs: "2.2", maidens: 0, runs: 30, wickets: 0, economy: "12.86" }] } },
  6: { innings1: { team: "SRH", total: "226/8 (20)", batsmen: [{ name: "Abhishek Sharma", runs: 78, balls: 44, fours: 8, sixes: 5, sr: "177.3", dismissal: "c Narine b Hasnain" }, { name: "Travis Head", runs: 82, balls: 48, fours: 8, sixes: 6, sr: "170.8", dismissal: "c Russell b Varun" }, { name: "H. Klaasen", runs: 38, balls: 22, fours: 3, sixes: 3, sr: "172.7", dismissal: "b Hasnain" }, { name: "Nitish Reddy", runs: 18, balls: 12, fours: 1, sixes: 1, sr: "150.0", dismissal: "not out" }], bowlers: [{ name: "M. Hasnain", overs: "4", maidens: 0, runs: 44, wickets: 2, economy: "11.00" }, { name: "Varun Chakraborty", overs: "4", maidens: 0, runs: 30, wickets: 2, economy: "7.50" }, { name: "A. Russell", overs: "3", maidens: 0, runs: 38, wickets: 1, economy: "12.67" }, { name: "S. Narine", overs: "4", maidens: 0, runs: 36, wickets: 1, economy: "9.00" }, { name: "Suyash Sharma", overs: "4", maidens: 0, runs: 48, wickets: 1, economy: "12.00" }] }, innings2: { team: "KKR", total: "161/10 (18.3)", batsmen: [{ name: "P. Salt†", runs: 44, balls: 30, fours: 5, sixes: 2, sr: "146.7", dismissal: "c Head b Harshal" }, { name: "S. Narine", runs: 38, balls: 24, fours: 4, sixes: 2, sr: "158.3", dismissal: "b Natarajan" }, { name: "A. Russell", runs: 42, balls: 22, fours: 3, sixes: 4, sr: "190.9", dismissal: "c Klaasen b Cummins" }, { name: "V. Iyer", runs: 18, balls: 16, fours: 1, sixes: 0, sr: "112.5", dismissal: "b Cummins" }], bowlers: [{ name: "P. Cummins", overs: "4", maidens: 0, runs: 28, wickets: 3, economy: "7.00" }, { name: "Harshal Patel", overs: "3.3", maidens: 0, runs: 22, wickets: 3, economy: "6.29" }, { name: "T. Natarajan", overs: "4", maidens: 0, runs: 38, wickets: 2, economy: "9.50" }, { name: "Shahbaz Ahmed", overs: "4", maidens: 0, runs: 36, wickets: 1, economy: "9.00" }, { name: "Abhishek S.", overs: "3", maidens: 0, runs: 37, wickets: 1, economy: "12.33" }] } },
  7: { innings1: { team: "CSK", total: "201/4 (20)", batsmen: [{ name: "R. Gaikwad", runs: 88, balls: 52, fours: 9, sixes: 4, sr: "169.2", dismissal: "c Inglis b Arshdeep" }, { name: "D. Conway†", runs: 54, balls: 36, fours: 5, sixes: 2, sr: "150.0", dismissal: "b Sam" }, { name: "S. Dube", runs: 38, balls: 20, fours: 3, sixes: 3, sr: "190.0", dismissal: "not out" }, { name: "M. Dhoni", runs: 14, balls: 8, fours: 0, sixes: 2, sr: "175.0", dismissal: "not out" }], bowlers: [{ name: "Arshdeep S.", overs: "4", maidens: 0, runs: 38, wickets: 2, economy: "9.50" }, { name: "C. Sam", overs: "4", maidens: 0, runs: 42, wickets: 1, economy: "10.50" }, { name: "H. Rauf", overs: "4", maidens: 0, runs: 48, wickets: 1, economy: "12.00" }, { name: "L. Livingstone", overs: "4", maidens: 0, runs: 36, wickets: 0, economy: "9.00" }, { name: "R. Ashwin", overs: "4", maidens: 0, runs: 37, wickets: 0, economy: "9.25" }] }, innings2: { team: "PBKS", total: "175/8 (20)", batsmen: [{ name: "Prabhsimran S.", runs: 62, balls: 40, fours: 6, sixes: 3, sr: "155.0", dismissal: "c Ruturaj b Matheesha" }, { name: "L. Livingstone", runs: 48, balls: 30, fours: 4, sixes: 3, sr: "160.0", dismissal: "b Jadeja" }, { name: "J. Inglis†", runs: 26, balls: 18, fours: 2, sixes: 1, sr: "144.4", dismissal: "c Dhoni b Chahar" }], bowlers: [{ name: "Matheesha P.", overs: "4", maidens: 0, runs: 26, wickets: 2, economy: "6.50" }, { name: "D. Chahar", overs: "4", maidens: 0, runs: 28, wickets: 2, economy: "7.00" }, { name: "R. Jadeja", overs: "4", maidens: 0, runs: 32, wickets: 2, economy: "8.00" }, { name: "Simarjeet S.", overs: "4", maidens: 0, runs: 44, wickets: 1, economy: "11.00" }, { name: "M. Theekshana", overs: "4", maidens: 0, runs: 45, wickets: 1, economy: "11.25" }] } },
};

// ─── Full 70-match schedule ───────────────────────────────────────────────────
const BASE_SCHEDULE = [
  mk(1, "28 MAR 2026", "Sat", "07:30 PM", "RCB", "SRH", "Bengaluru", { type: "Season Opener", baseStatus: "completed", result: "SRH won by 6 wickets", winner: "SRH", scoreA: "163/8 (20)", scoreB: "164/4 (18.3)", scorecard: SC[1] }),
  mk(2, "29 MAR 2026", "Sun", "07:30 PM", "MI", "KKR", "Mumbai", { baseStatus: "completed", result: "MI won by 8 runs", winner: "MI", scoreA: "189/5 (20)", scoreB: "181/9 (20)", scorecard: SC[2] }),
  mk(3, "30 MAR 2026", "Mon", "07:30 PM", "RR", "CSK", "Guwahati", { baseStatus: "completed", result: "CSK won by 4 wickets", winner: "CSK", scoreA: "172/6 (20)", scoreB: "173/6 (19.4)", scorecard: SC[3] }),
  mk(4, "31 MAR 2026", "Tue", "07:30 PM", "PBKS", "GT", "New Chandigarh", { baseStatus: "completed", result: "GT won by 18 runs", winner: "GT", scoreA: "198/5 (20)", scoreB: "180/8 (20)", scorecard: SC[4] }),
  mk(5, "01 APR 2026", "Wed", "07:30 PM", "LSG", "DC", "Lucknow", { baseStatus: "completed", result: "DC won by 5 wickets", winner: "DC", scoreA: "155/9 (20)", scoreB: "156/5 (18.2)", scorecard: SC[5] }),
  mk(6, "02 APR 2026", "Thu", "07:30 PM", "KKR", "SRH", "Kolkata", { baseStatus: "completed", result: "SRH won by 65 runs", winner: "SRH", scoreA: "226/8 (20)", scoreB: "161/10 (18.3)", scorecard: SC[6] }),
  mk(7, "03 APR 2026", "Fri", "07:30 PM", "CSK", "PBKS", "Chennai", { baseStatus: "completed", result: "CSK won by 26 runs", winner: "CSK", scoreA: "201/4 (20)", scoreB: "175/8 (20)", scorecard: SC[7] }),
  mk(8, "04 APR 2026", "Sat", "03:30 PM", "DC", "MI", "Delhi", { type: "Afternoon Duel" }),
  mk(9, "04 APR 2026", "Sat", "07:30 PM", "GT", "RR", "Ahmedabad"),
  mk(10, "05 APR 2026", "Sun", "03:30 PM", "SRH", "LSG", "Hyderabad", { type: "Afternoon Duel" }),
  mk(11, "05 APR 2026", "Sun", "07:30 PM", "RCB", "CSK", "Bengaluru", { type: "Southern Derby" }),
  mk(12, "06 APR 2026", "Mon", "07:30 PM", "KKR", "PBKS", "Kolkata"),
  mk(13, "07 APR 2026", "Tue", "07:30 PM", "RR", "MI", "Guwahati"),
  mk(14, "08 APR 2026", "Wed", "07:30 PM", "DC", "GT", "Delhi"),
  mk(15, "09 APR 2026", "Thu", "07:30 PM", "KKR", "LSG", "Kolkata"),
  mk(16, "10 APR 2026", "Fri", "07:30 PM", "RR", "RCB", "Guwahati"),
  mk(17, "11 APR 2026", "Sat", "03:30 PM", "PBKS", "SRH", "New Chandigarh", { type: "Afternoon Duel" }),
  mk(18, "11 APR 2026", "Sat", "07:30 PM", "CSK", "DC", "Chennai"),
  mk(19, "12 APR 2026", "Sun", "03:30 PM", "LSG", "GT", "Lucknow", { type: "Afternoon Duel" }),
  mk(20, "12 APR 2026", "Sun", "07:30 PM", "MI", "RCB", "Mumbai", { type: "High Voltage" }),
  mk(21, "13 APR 2026", "Mon", "07:30 PM", "SRH", "RR", "Hyderabad"),
  mk(22, "14 APR 2026", "Tue", "07:30 PM", "CSK", "KKR", "Chennai"),
  mk(23, "15 APR 2026", "Wed", "07:30 PM", "RCB", "LSG", "Bengaluru"),
  mk(24, "16 APR 2026", "Thu", "07:30 PM", "MI", "PBKS", "Mumbai"),
  mk(25, "17 APR 2026", "Fri", "07:30 PM", "GT", "KKR", "Ahmedabad"),
  mk(26, "18 APR 2026", "Sat", "03:30 PM", "RCB", "DC", "Bengaluru", { type: "Afternoon Duel" }),
  mk(27, "18 APR 2026", "Sat", "07:30 PM", "SRH", "CSK", "Hyderabad"),
  mk(28, "19 APR 2026", "Sun", "03:30 PM", "KKR", "RR", "Kolkata", { type: "Afternoon Duel" }),
  mk(29, "19 APR 2026", "Sun", "07:30 PM", "PBKS", "LSG", "New Chandigarh"),
  mk(30, "20 APR 2026", "Mon", "07:30 PM", "GT", "MI", "Ahmedabad"),
  mk(31, "21 APR 2026", "Tue", "07:30 PM", "SRH", "DC", "Hyderabad"),
  mk(32, "22 APR 2026", "Wed", "07:30 PM", "LSG", "RR", "Lucknow"),
  mk(33, "23 APR 2026", "Thu", "07:30 PM", "MI", "CSK", "Mumbai"),
  mk(34, "24 APR 2026", "Fri", "07:30 PM", "RCB", "GT", "Bengaluru"),
  mk(35, "25 APR 2026", "Sat", "03:30 PM", "DC", "PBKS", "Delhi", { type: "Afternoon Duel" }),
  mk(36, "25 APR 2026", "Sat", "07:30 PM", "RR", "SRH", "Jaipur"),
  mk(37, "26 APR 2026", "Sun", "03:30 PM", "GT", "CSK", "Ahmedabad", { type: "Afternoon Duel" }),
  mk(38, "26 APR 2026", "Sun", "07:30 PM", "LSG", "KKR", "Lucknow"),
  mk(39, "27 APR 2026", "Mon", "07:30 PM", "DC", "RCB", "Delhi"),
  mk(40, "28 APR 2026", "Tue", "07:30 PM", "PBKS", "RR", "New Chandigarh"),
  mk(41, "29 APR 2026", "Wed", "07:30 PM", "MI", "SRH", "Mumbai"),
  mk(42, "30 APR 2026", "Thu", "07:30 PM", "GT", "RCB", "Ahmedabad"),
  mk(43, "01 MAY 2026", "Fri", "07:30 PM", "RR", "DC", "Jaipur"),
  mk(44, "02 MAY 2026", "Sat", "07:30 PM", "CSK", "MI", "Chennai"),
  mk(45, "03 MAY 2026", "Sun", "03:30 PM", "SRH", "KKR", "Hyderabad", { type: "Afternoon Duel" }),
  mk(46, "03 MAY 2026", "Sun", "07:30 PM", "GT", "PBKS", "Ahmedabad"),
  mk(47, "04 MAY 2026", "Mon", "07:30 PM", "MI", "LSG", "Mumbai"),
  mk(48, "05 MAY 2026", "Tue", "07:30 PM", "DC", "CSK", "Delhi"),
  mk(49, "06 MAY 2026", "Wed", "07:30 PM", "SRH", "PBKS", "Hyderabad"),
  mk(50, "07 MAY 2026", "Thu", "07:30 PM", "LSG", "RCB", "Lucknow"),
  mk(51, "08 MAY 2026", "Fri", "07:30 PM", "DC", "KKR", "Delhi"),
  mk(52, "09 MAY 2026", "Sat", "07:30 PM", "RR", "GT", "Jaipur"),
  mk(53, "10 MAY 2026", "Sun", "03:30 PM", "CSK", "LSG", "Chennai", { type: "Afternoon Duel" }),
  mk(54, "10 MAY 2026", "Sun", "07:30 PM", "RCB", "MI", "Raipur"),
  mk(55, "11 MAY 2026", "Mon", "07:30 PM", "PBKS", "DC", "Dharamshala"),
  mk(56, "12 MAY 2026", "Tue", "07:30 PM", "GT", "SRH", "Ahmedabad"),
  mk(57, "13 MAY 2026", "Wed", "07:30 PM", "RCB", "KKR", "Raipur"),
  mk(58, "14 MAY 2026", "Thu", "07:30 PM", "PBKS", "MI", "Dharamshala"),
  mk(59, "15 MAY 2026", "Fri", "07:30 PM", "LSG", "CSK", "Lucknow"),
  mk(60, "16 MAY 2026", "Sat", "07:30 PM", "KKR", "GT", "Kolkata"),
  mk(61, "17 MAY 2026", "Sun", "03:30 PM", "PBKS", "RCB", "Dharamshala", { type: "Afternoon Duel" }),
  mk(62, "17 MAY 2026", "Sun", "07:30 PM", "DC", "RR", "Delhi"),
  mk(63, "18 MAY 2026", "Mon", "07:30 PM", "CSK", "SRH", "Chennai"),
  mk(64, "19 MAY 2026", "Tue", "07:30 PM", "RR", "LSG", "Jaipur"),
  mk(65, "20 MAY 2026", "Wed", "07:30 PM", "KKR", "MI", "Kolkata"),
  mk(66, "21 MAY 2026", "Thu", "07:30 PM", "CSK", "GT", "Chennai"),
  mk(67, "22 MAY 2026", "Fri", "07:30 PM", "SRH", "RCB", "Hyderabad"),
  mk(68, "23 MAY 2026", "Sat", "07:30 PM", "LSG", "PBKS", "Lucknow"),
  mk(69, "24 MAY 2026", "Sun", "03:30 PM", "MI", "RR", "Mumbai", { type: "Afternoon Duel" }),
  mk(70, "24 MAY 2026", "Sun", "07:30 PM", "KKR", "DC", "Kolkata"),
];

// ─────────────────────────────────────────────────────────────────────────────
// DEDUPLICATION HELPER
//
// Problem: Teams play each other twice in the season. The old teamsMatch()
// check only looked at team names, so BOTH fixture cards for the same matchup
// (e.g. RCB vs CSK on Apr 5 AND the later rematch) would show live data.
//
// Fix: Parse each fixture's date string and compare it to today's date.
// Only the fixture whose date matches today is considered live.
// Fallback: if espnId is stored in the live data, match by ID for certainty.
// ─────────────────────────────────────────────────────────────────────────────

// Month abbreviation → 0-indexed month number
const MONTH_MAP = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

/**
 * Parse a fixture date string like "17 APR 2026" into a Date object (midnight IST).
 * Returns null if parsing fails.
 */
const parseFixtureDate = (dateStr) => {
  try {
    const parts = dateStr.trim().toUpperCase().split(' ');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0]);
    const month = MONTH_MAP[parts[1]];
    const year = parseInt(parts[2]);
    if (isNaN(day) || month === undefined || isNaN(year)) return null;
    return new Date(year, month, day); // local midnight
  } catch {
    return null;
  }
};

/**
 * Returns true only if this fixture is the one currently being played live.
 *
 * Checks (in order):
 *  1. Teams must match (both teams appear in the fixture).
 *  2. If espnId is available in liveMatch → match by ID (most reliable).
 *  3. Otherwise → fixture date must be today's date.
 *
 * This prevents the duplicate live-score problem when two teams play each
 * other twice in the season.
 */
const isThisFixtureLive = (fixture, liveMatch) => {
  if (!liveMatch?.team1?.name || !liveMatch?.team2?.name) return false;

  const liveA = liveMatch?.team1?.name.toUpperCase();
  const liveB = liveMatch?.team2?.name.toUpperCase();
  const fixA = fixture.teamA.toUpperCase();
  const fixB = fixture.teamB.toUpperCase();

  // Step 1: Teams must match (order doesn't matter)
  const sameTeams = (fixA === liveA && fixB === liveB) ||
    (fixA === liveB && fixB === liveA);
  if (!sameTeams) return false;

  // Step 2: ESPN ID match — most reliable, use it when available
  if (liveMatch.espnId && fixture.espnId) {
    return String(liveMatch.espnId) === String(fixture.espnId);
  }

  // Step 3: Date match — fixture date must be today
  const fixtureDate = parseFixtureDate(fixture.date);
  if (!fixtureDate) return false;

  const today = new Date();
  return (
    fixtureDate.getFullYear() === today.getFullYear() &&
    fixtureDate.getMonth() === today.getMonth() &&
    fixtureDate.getDate() === today.getDate()
  );
};

// ─── SCORECARD MODAL ─────────────────────────────────────────────────────────
const ScorecardModal = ({ match, onClose, liveMatch }) => {
  const [tab, setTab] = useState(
    match.baseStatus === 'completed' ? 'innings1' : 'inn2'
  );

  const isLiveMatch = isThisFixtureLive(match, liveMatch);
  const useLiveData = isLiveMatch && match.baseStatus !== 'completed';
  const staticScorecard = match.scorecard;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0 bg-black/95 backdrop-blur-md cursor-pointer" />
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 24 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0, y: 24 }}
        className="relative w-full max-w-2xl max-h-[88vh] bg-[#0c0c14] border border-white/10 rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden"
      >
        <button onClick={onClose} className="absolute top-5 right-5 z-10 p-2 hover:bg-white/10 rounded-full">
          <X className="w-5 h-5 text-white" />
        </button>

        {/* Header */}
        <div className="p-6 pb-0 flex-shrink-0">
          <div className="flex justify-around items-center mb-4">
            {/* LEFT: team1 (batted first) */}
            <div className="text-center">
              {LOGOS[match.teamA] && <img src={LOGOS[match.teamA]} className="w-12 mx-auto mb-1" alt={match.teamA} />}
              <p className="text-sm font-black text-white">{match.teamA}</p>
              <p className="text-[10px] font-mono text-gray-400">
                {useLiveData
                  ? (liveMatch?.team1Score
                    ? `${liveMatch?.team1Score}/${liveMatch?.team1Wickets ?? ''} (${liveMatch.team1Overs ?? ''})`
                    : 'Yet to bat')
                  : match.scoreA || '—'}
              </p>
              {useLiveData && liveMatch?.team1Score && (
                <p className="text-[9px] text-gray-600 mt-0.5">1st Innings</p>
              )}
            </div>

            {/* CENTRE */}
            <div className="text-center space-y-1">
              <span className={`text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest ${useLiveData && ['LIVE', 'INNINGS BREAK', 'RAIN DELAY'].includes(liveMatch.status)
                ? 'bg-red-500/20 text-red-400'
                : 'bg-green-500/20 text-green-400'
                }`}>
                {useLiveData ? liveMatch.status : 'FINISHED'}
              </span>
              {(useLiveData ? liveMatch.result : match.result) && (
                <p className="text-green-400 font-black text-[10px] italic">
                  {useLiveData ? liveMatch.result : match.result}
                </p>
              )}
              {useLiveData && liveMatch.target && (
                <p className="text-[9px] text-gray-500">Target: {liveMatch.target}</p>
              )}
            </div>

            {/* RIGHT: team2 (batting second) */}
            <div className="text-center">
              {LOGOS[match.teamB] && <img src={LOGOS[match.teamB]} className="w-12 mx-auto mb-1" alt={match.teamB} />}
              <p className="text-sm font-black text-white">{match.teamB}</p>
              <p className="text-[10px] font-mono text-ipl-neon font-bold">
                {useLiveData
                  ? `${liveMatch.score}/${liveMatch.wickets} (${liveMatch.overs})`
                  : match.scoreB || '—'}
              </p>
              {useLiveData && (
                <p className="text-[9px] text-gray-600 mt-0.5">2nd Innings</p>
              )}
            </div>
          </div>

          <p className="text-center text-[9px] text-gray-600 font-mono mb-3">
            {match.date} • {match.venue}
          </p>

          {/* Tabs */}
          {staticScorecard ? (
            <div className="flex gap-1 bg-white/5 p-1 rounded-2xl mb-3">
              {[
                { id: 'innings1', label: `${staticScorecard.innings1.team} — 1st` },
                { id: 'innings2', label: `${staticScorecard.innings2.team} — 2nd` },
              ].map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all
                    ${tab === t.id ? 'bg-ipl-neon text-black' : 'text-gray-400 hover:text-white'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          ) : useLiveData ? (
            <div className="flex gap-1 bg-white/5 p-1 rounded-2xl mb-3">
              {[
                { id: 'inn1', label: `${liveMatch.team1?.name || match.teamA} — 1st` },
                { id: 'inn2', label: `${liveMatch.team2?.name || match.teamB} — 2nd` },
              ].map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all
                    ${tab === t.id ? 'bg-ipl-neon text-black' : 'text-gray-400 hover:text-white'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 pt-2" style={{ scrollbarWidth: 'none' }}>

          {/* ── STATIC SCORECARD (completed matches) ── */}
          {staticScorecard && (() => {
            const inn = tab === 'innings1' ? staticScorecard.innings1 : staticScorecard.innings2;
            return (
              <>
                <div className="flex justify-between mb-3">
                  <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest">Batting</p>
                  <p className="text-[10px] font-black text-white">{inn.total}</p>
                </div>
                <table className="w-full text-left text-xs mb-5">
                  <thead className="text-[9px] text-gray-600 border-b border-white/10 uppercase font-black">
                    <tr>
                      <th className="py-2 px-1">Batter</th>
                      <th className="py-2 px-1 text-[8px] text-gray-500 hidden md:table-cell">Dismissal</th>
                      <th className="py-2 px-1 text-right">R</th>
                      <th className="py-2 px-1 text-right">B</th>
                      <th className="py-2 px-1 text-right">4s</th>
                      <th className="py-2 px-1 text-right">6s</th>
                      <th className="py-2 px-1 text-right">SR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {inn.batsmen.map((b, i) => (
                      <tr key={i} className="hover:bg-white/5">
                        <td className="py-2.5 px-1 font-bold text-white">{b.name}</td>
                        <td className="py-2.5 px-1 text-gray-600 text-[9px] hidden md:table-cell">{b.dismissal}</td>
                        <td className="py-2.5 px-1 text-right font-black text-ipl-neon">{b.runs}</td>
                        <td className="py-2.5 px-1 text-right font-mono text-gray-300">{b.balls}</td>
                        <td className="py-2.5 px-1 text-right text-amber-400">{b.fours}</td>
                        <td className="py-2.5 px-1 text-right text-yellow-400">{b.sixes}</td>
                        <td className="py-2.5 px-1 text-right text-gray-400">{b.sr}</td>
                      </tr>
                    ))}
                    <tr className="bg-white/5">
                      <td colSpan={7} className="py-2 px-1 text-right text-[10px] font-black text-white">
                        Total: {inn.total}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest mb-3">Bowling</p>
                <table className="w-full text-left text-xs">
                  <thead className="text-[9px] text-gray-600 border-b border-white/10 uppercase font-black">
                    <tr>
                      <th className="py-2 px-1">Bowler</th>
                      <th className="py-2 px-1 text-right">O</th>
                      <th className="py-2 px-1 text-right">M</th>
                      <th className="py-2 px-1 text-right">R</th>
                      <th className="py-2 px-1 text-right">W</th>
                      <th className="py-2 px-1 text-right">Eco</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {inn.bowlers.map((b, i) => (
                      <tr key={i} className="hover:bg-white/5">
                        <td className="py-2.5 px-1 font-bold text-white">{b.name}</td>
                        <td className="py-2.5 px-1 text-right font-mono text-gray-300">{b.overs}</td>
                        <td className="py-2.5 px-1 text-right text-gray-500">{b.maidens}</td>
                        <td className="py-2.5 px-1 text-right text-white">{b.runs}</td>
                        <td className="py-2.5 px-1 text-right font-black text-ipl-neon">{b.wickets}</td>
                        <td className="py-2.5 px-1 text-right text-gray-400">{b.economy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            );
          })()}

          {/* ── LIVE DATA INNINGS ── */}
          {!staticScorecard && useLiveData && (
            <>
              {/* 1st innings tab — team1 (batted first) */}
              {tab === 'inn1' && (
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center">
                  <p className="text-xs font-black text-white mb-1">
                    {liveMatch.team1?.name} — 1st Innings
                  </p>
                  <p className="text-2xl font-black text-ipl-neon font-mono">
                    {liveMatch?.team1Score
                      ? `${liveMatch?.team1Score}/${liveMatch?.team1Wickets ?? ''} (${liveMatch.team1Overs ?? ''})`
                      : 'Yet to bat'}
                  </p>
                  {liveMatch.target && (
                    <p className="text-xs text-gray-500 mt-2">Set target of {liveMatch.target}</p>
                  )}
                </div>
              )}

              {/* 2nd innings tab — team2 (currently batting) */}
              {tab === 'inn2' && (
                <div className="space-y-4">
                  {/* Score summary */}
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex justify-between items-center">
                    <div>
                      <p className="text-[9px] text-gray-500 uppercase tracking-widest font-black">
                        {liveMatch.team2?.name} — 2nd Innings
                      </p>
                      <p className="text-2xl font-black text-ipl-neon font-mono mt-1">
                        {liveMatch.score}/{liveMatch.wickets}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-gray-500 uppercase tracking-widest">Overs</p>
                      <p className="text-xl font-black text-white">{liveMatch.overs}</p>
                      {liveMatch.crr && (
                        <p className="text-[9px] text-gray-500 mt-1">CRR: {liveMatch.crr}</p>
                      )}
                      {liveMatch.rrr && (
                        <p className="text-[9px] text-red-400">RRR: {liveMatch.rrr}</p>
                      )}
                    </div>
                  </div>

                  {/* Target info */}
                  {liveMatch.target && liveMatch.status !== 'FINISHED' && (
                    <div className="p-3 bg-white/5 rounded-xl border border-white/10 flex justify-between text-[10px]">
                      <div className="text-center">
                        <p className="text-gray-500">Target</p>
                        <p className="text-yellow-400 font-black text-sm">{liveMatch.target}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-gray-500">Need</p>
                        <p className="text-white font-black text-sm">
                          {Math.max(0, liveMatch.target - parseInt(liveMatch.score || 0))} runs
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-gray-500">Balls left</p>
                        <p className="text-white font-black text-sm">
                          {Math.max(0, Math.floor((20 - parseFloat(liveMatch.overs || 0)) * 6))}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Batsmen */}
                  {liveMatch.batsmen?.length > 0 ? (
                    <div>
                      <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest mb-2">Batting</p>
                      <table className="w-full text-left text-xs">
                        <thead className="text-[9px] text-gray-600 border-b border-white/10 uppercase font-black">
                          <tr>
                            <th className="py-2 px-1">Batter</th>
                            <th className="py-2 px-1 text-right">R</th>
                            <th className="py-2 px-1 text-right">B</th>
                            <th className="py-2 px-1 text-right">SR</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {liveMatch.batsmen.map((b, i) => (
                            <tr key={i} className="hover:bg-white/5">
                              <td className="py-2.5 px-1 font-bold text-white flex items-center gap-1.5">
                                {b.onStrike && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-ipl-neon animate-pulse inline-block flex-shrink-0" />
                                )}
                                {b.name}
                              </td>
                              <td className="py-2.5 px-1 text-right font-black text-ipl-neon">{b.runs}</td>
                              <td className="py-2.5 px-1 text-right font-mono text-gray-300">{b.balls}</td>
                              <td className="py-2.5 px-1 text-right text-gray-400">{b.sr}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-6 text-center">
                      <Activity className="w-6 h-6 text-gray-700 animate-pulse" />
                      <p className="text-[10px] text-gray-600">
                        Live batter data will appear within 2 scrape cycles (~80s).
                      </p>
                    </div>
                  )}

                  {/* Bowlers */}
                  {liveMatch.bowlers?.length > 0 && (
                    <div>
                      <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest mb-2">Bowling</p>
                      <table className="w-full text-left text-xs">
                        <thead className="text-[9px] text-gray-600 border-b border-white/10 uppercase font-black">
                          <tr>
                            <th className="py-2 px-1">Bowler</th>
                            <th className="py-2 px-1 text-right">O</th>
                            <th className="py-2 px-1 text-right">R</th>
                            <th className="py-2 px-1 text-right">W</th>
                            <th className="py-2 px-1 text-right">Eco</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {liveMatch.bowlers.map((b, i) => (
                            <tr key={i} className="hover:bg-white/5">
                              <td className="py-2.5 px-1 font-bold text-white">{b.name}</td>
                              <td className="py-2.5 px-1 text-right font-mono text-gray-300">{b.overs}</td>
                              <td className="py-2.5 px-1 text-right text-white">{b.runs}</td>
                              <td className="py-2.5 px-1 text-right font-black text-ipl-neon">{b.wickets}</td>
                              <td className="py-2.5 px-1 text-right text-gray-400">{b.economy}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Result */}
                  {liveMatch.result && (
                    <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-center">
                      <Trophy className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
                      <p className="text-green-400 font-black text-xs italic">{liveMatch.result}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* No data */}
          {!staticScorecard && !useLiveData && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Clock className="w-8 h-8 text-gray-700" />
              <p className="text-xs text-gray-600 font-black uppercase tracking-widest">
                Scorecard not available
              </p>
              <p className="text-[10px] text-gray-700">Check back after the match starts</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>,
    document.body
  );
};

// ─── FIXTURE CARD ─────────────────────────────────────────────────────────────
const FixtureCard = ({ match, effectiveStatus, liveMatchData, index }) => {
  const [showScorecard, setShowScorecard] = useState(false);

  const colorA = COLORS[match.teamA] || '#6366f1';
  const colorB = COLORS[match.teamB] || '#ef4444';

  const isLive = effectiveStatus === 'live';
  const isCompleted = effectiveStatus === 'completed';
  const isUpcoming = effectiveStatus === 'upcoming';

  // Only use live data if this is the correct fixture for today (dedup applied upstream)
  const liveScore = liveMatchData?.score;
  const liveWkts = liveMatchData?.wickets;
  const liveOvers = liveMatchData?.overs;
  const liveStatus = liveMatchData?.status;
  const liveResult = liveMatchData?.result;

  const showScoreA = isCompleted
    ? match.scoreA
    : isLive && liveMatchData?.team1Score
      ? `${liveMatchData.team1Score}${liveMatchData.team1Wickets ? '/' + liveMatchData.team1Wickets : ''} (${liveMatchData.team1Overs ?? ''})`
      : null;

  const showScoreB = isCompleted
    ? match.scoreB
    : isLive
      ? `${liveScore}/${liveWkts} (${liveOvers})`
      : null;

  const displayResult = isCompleted ? match.result : (isLive ? liveResult : null);
  const displayWinner = isCompleted ? match.winner : null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        whileHover={{ y: -4 }}
        className={`glass group relative p-7 rounded-[2.5rem] border overflow-hidden transition-all
          ${isLive ? 'border-red-500/40 bg-red-500/5 shadow-[0_0_30px_rgba(239,68,68,0.08)]'
            : isCompleted ? 'border-white/10 bg-white/5 hover:border-white/20'
              : 'border-white/[0.06] bg-white/[0.02] hover:border-ipl-neon/30'}`}
      >
        {isLive && (
          <div className="absolute inset-0 rounded-[2.5rem] border-2 border-red-500/20 animate-pulse pointer-events-none" />
        )}

        <div className="absolute top-5 left-7 text-[8px] font-black text-gray-700">#{match.id}</div>

        <div className="absolute -bottom-4 -right-2 text-8xl font-black italic opacity-[0.03] select-none uppercase pointer-events-none">
          {match.teamA}
        </div>

        {/* Top row */}
        <div className="flex justify-between items-center mb-5 mt-2">
          <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[8px] font-black uppercase tracking-[0.2em] text-gray-400">
            {match.type}
          </span>
          <div className="flex items-center gap-2">
            {isLive && (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest text-red-400">LIVE</span>
              </>
            )}
            {isCompleted && (
              <>
                <Trophy className="w-3 h-3 text-yellow-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-green-400">RESULT</span>
              </>
            )}
            {isUpcoming && (
              <span className="text-[10px] font-black uppercase tracking-widest text-ipl-neon">UPCOMING</span>
            )}
          </div>
        </div>

        {/* Teams */}
        <div className="flex justify-between items-center gap-4 mb-5">
          <div className="flex-1 text-center">
            {LOGOS[match.teamA] && (
              <img src={LOGOS[match.teamA]} alt={match.teamA} className="w-14 mx-auto mb-2 drop-shadow-lg" />
            )}
            <div className="text-3xl font-black italic tracking-tighter" style={{ color: colorA }}>
              {match.teamA}
            </div>
            {showScoreA && (
              <p className="text-[10px] font-mono text-gray-400 mt-1">{showScoreA}</p>
            )}
            {displayWinner === match.teamA && (
              <span className="text-[8px] text-yellow-400 font-black">🏆 Winner</span>
            )}
          </div>

          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center border
              ${isLive ? 'bg-red-500/20 border-red-500/40' : 'bg-white/5 border-white/10'}`}>
              {isLive
                ? <Radio className="w-4 h-4 text-red-400 animate-pulse" />
                : <span className="text-xs font-black italic text-ipl-neon">VS</span>}
            </div>
            {displayResult && (
              <p className="text-[8px] text-center text-green-400 font-bold italic max-w-[72px] leading-tight">
                {displayResult}
              </p>
            )}
            {isLive && liveStatus === 'INNINGS BREAK' && (
              <span className="text-[8px] text-yellow-400 font-black uppercase">Break</span>
            )}
          </div>

          <div className="flex-1 text-center">
            {LOGOS[match.teamB] && (
              <img src={LOGOS[match.teamB]} alt={match.teamB}
                className={`w-14 mx-auto mb-2 drop-shadow-lg ${isLive ? 'animate-pulse' : ''}`} />
            )}
            <div className="text-3xl font-black italic tracking-tighter" style={{ color: colorB }}>
              {match.teamB}
            </div>
            {showScoreB && (
              <p className={`text-[10px] font-mono mt-1 ${isLive ? 'text-ipl-neon font-bold' : 'text-gray-400'}`}>
                {showScoreB}
              </p>
            )}
            {displayWinner === match.teamB && (
              <span className="text-[8px] text-yellow-400 font-black">🏆 Winner</span>
            )}
            {isLive && (
              <span className="text-[8px] text-ipl-neon font-black uppercase">Batting</span>
            )}
          </div>
        </div>

        <hr className="border-white/5 mb-4" />

        {/* Bottom row */}
        <div className="flex flex-wrap justify-between items-end gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-gray-400">
              <Calendar className="w-3 h-3 text-ipl-neon flex-shrink-0" />
              <span className="text-[10px] font-black uppercase tracking-widest">
                {match.date} • {match.day}
              </span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <MapPin className="w-3 h-3 text-ipl-neon flex-shrink-0" />
              <span className="text-[10px] font-black uppercase tracking-widest truncate max-w-[200px]">
                {match.venue}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-ipl-neon" />
              <span className="text-lg font-mono font-black italic text-white">{match.time}</span>
            </div>

            {isCompleted && match.scorecard && (
              <button onClick={() => setShowScorecard(true)}
                className="flex items-center gap-2 px-5 py-2 bg-white/10 border border-white/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-ipl-neon hover:text-black hover:border-transparent transition-all">
                <Activity className="w-3 h-3" /> View Scorecard
              </button>
            )}

            {isLive && (
              <button onClick={() => setShowScorecard(true)}
                className="flex items-center gap-2 px-5 py-2 bg-red-500/20 border border-red-500/30 rounded-xl text-[10px] font-black uppercase tracking-widest text-red-400 hover:bg-red-500/40 transition-all animate-pulse">
                <Zap className="w-3 h-3" /> Live Scorecard
              </button>
            )}

            {isUpcoming && (
              <span className="text-[9px] text-gray-600 font-black uppercase tracking-widest">Scheduled</span>
            )}
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {showScorecard && (
          <ScorecardModal
            match={match}
            onClose={() => setShowScorecard(false)}
            liveMatch={liveMatchData}
          />
        )}
      </AnimatePresence>
    </>
  );
};


// ─── Historical Match Card ─────────────────────────────────────────────────────
const HistoricalMatchCard = ({ match: m }) => {
  const c1 = COLORS[m.teamA] || '#fff';
  const c2 = COLORS[m.teamB] || '#fff';
  const isFinal = m.type && m.type !== 'League Match';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className={`glass border rounded-2xl overflow-hidden bg-white/5 group
        ${isFinal ? 'border-yellow-400/30' : 'border-white/10'}`}
    >
      {isFinal && <div className="h-0.5 w-full bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-400" />}
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full
            ${isFinal ? 'bg-yellow-400/10 text-yellow-400 border border-yellow-400/20' : 'bg-white/5 text-gray-500'}`}>
            {m.matchNumber}
          </span>
          <span className="text-[9px] text-gray-600 font-mono">{m.date}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <img src={`/logos/${m.teamA?.toLowerCase()}_logo.png`} alt={m.teamA}
              className="w-9 h-9 object-contain flex-shrink-0"
              onError={e => { e.target.style.display = 'none'; }} />
            <div className="min-w-0">
              <p className="font-black text-sm" style={{ color: c1 }}>{m.teamA}</p>
              {m.scoreA && <p className="text-[10px] font-mono text-gray-300">{m.scoreA}</p>}
            </div>
          </div>
          <div className="text-center flex-shrink-0">
            <div className="text-xs font-black italic text-white/20">vs</div>
            {m.winner && (
              <div className="text-[8px] font-black px-2 py-0.5 rounded-full mt-1"
                style={{ backgroundColor: `${COLORS[m.winner] || '#fff'}20`, color: COLORS[m.winner] || '#fff' }}>
                {m.winner} ✓
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 min-w-0 flex-row-reverse">
            <img src={`/logos/${m.teamB?.toLowerCase()}_logo.png`} alt={m.teamB}
              className="w-9 h-9 object-contain flex-shrink-0"
              onError={e => { e.target.style.display = 'none'; }} />
            <div className="min-w-0 text-right">
              <p className="font-black text-sm" style={{ color: c2 }}>{m.teamB}</p>
              {m.scoreB && <p className="text-[10px] font-mono text-gray-300">{m.scoreB}</p>}
            </div>
          </div>
        </div>
        {m.result && (
          <p className="text-[10px] text-gray-500 mt-3 border-t border-white/5 pt-2 font-bold">{m.result}</p>
        )}
        {m.playerOfMatch && (
          <p className="text-[9px] text-ipl-neon font-bold mt-1">⭐ {m.playerOfMatch}</p>
        )}
        {m.venue && (
          <p className="text-[9px] text-gray-600 font-mono mt-0.5">📍 {m.venue}</p>
        )}
      </div>
    </motion.div>
  );
};

// ─── FIXTURES PAGE ────────────────────────────────────────────────────────────
const Fixtures = () => {
  const [season, setSeason] = useState(CURRENT_SEASON);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [historicalData, setHistoricalData] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const { state } = useMatchContext();
  const liveMatch = state.currentMatch;
  const isCurrentSeason = season === CURRENT_SEASON;

  const { completedIds, getResult } = useCompletedMatches();

  const allTeams = ['all', 'CSK', 'MI', 'RCB', 'KKR', 'RR', 'PBKS', 'DC', 'GT', 'LSG', 'SRH'];

  // ── Historical season matches (non-2026) ──────────────────────────────────
  useEffect(() => {
    if (isCurrentSeason) {
      setHistoricalData(null);
      return;
    }
    const fetchHistory = async () => {
      setLoadingHistory(true);
      try {
        const res = await fetch(`http://localhost:5000/api/v1/data/season/${season}/fixtures`);
        if (res.ok) {
          const data = await res.json();
          setHistoricalData(data);
        } else {
          setHistoricalData({ matches: [] });
        }
      } catch (err) {
        console.error('Failed to fetch historical fixtures:', err);
        setHistoricalData({ matches: [] });
      } finally {
        setLoadingHistory(false);
      }
    };
    fetchHistory();
  }, [season, isCurrentSeason]);

  const historicalMatches = useMemo(() => {
    if (isCurrentSeason || !historicalData) return null;
    return (historicalData.matches || []).map(m => ({
      ...m,
      teamA: m.team1,
      teamB: m.team2,
      baseStatus: 'completed',
      effectiveStatus: 'completed',
      day: '',
      time: '',
    }));
  }, [historicalData, isCurrentSeason]);

  const filteredHistorical = useMemo(() => {
    if (!historicalMatches) return null;
    return historicalMatches.filter(m => {
      const s = search.toLowerCase();
      const teamOk = teamFilter === 'all' || m.teamA === teamFilter || m.teamB === teamFilter;
      const typeOk = filter === 'all' || filter === 'completed';
      const searchOk = !s || m.teamA?.toLowerCase().includes(s) || m.teamB?.toLowerCase().includes(s) ||
                       m.city?.toLowerCase().includes(s) || m.matchNumber?.toLowerCase().includes(s);
      return teamOk && typeOk && searchOk;
    });
  }, [historicalMatches, filter, search, teamFilter]);
  const filterOpts = [
    { id: 'all', label: 'All Matches' },
    { id: 'live', label: 'Live' },
    { id: 'completed', label: 'Results' },
    { id: 'upcoming', label: 'Upcoming' },
  ];

  // ─── ENRICHED SCHEDULE ──────────────────────────────────────────────────────
  // This is where the deduplication fix lives.
  // isThisFixtureLive() ensures only the date-matching fixture gets live data.
  const enrichedSchedule = useMemo(() => {
    return BASE_SCHEDULE.map(match => {
      const apiResult = getResult(match.id);
      const displayResult = apiResult?.result || match.result;
      const displayWinner = apiResult?.winner || match.winner;
      const displayScoreA = apiResult?.scoreA || match.scoreA;
      const displayScoreB = apiResult?.scoreB || match.scoreB;

      // ── KEY FIX: use isThisFixtureLive instead of bare teamsMatch ──────────
      // This prevents BOTH CSK vs MI fixtures from lighting up as "live"
      // when only today's match is actually in progress.
      const matchIsLive = isThisFixtureLive(match, liveMatch);
      const scraperSaysFinished = matchIsLive &&
        (liveMatch?.status === 'FINISHED' || liveMatch?.status === 'RECENTLY FINISHED');

      const effectiveStatus = completedIds.has(match.id)
        ? 'completed'
        : matchIsLive
          ? (scraperSaysFinished ? 'completed' : 'live')
          : match.baseStatus;

      return {
        ...match,
        effectiveStatus,
        result: scraperSaysFinished ? liveMatch.result : displayResult,
        winner: scraperSaysFinished ? liveMatch.result?.split(' ')[0]?.toUpperCase() : displayWinner,
        scoreA: displayScoreA,
        scoreB: displayScoreB,
      };
    });
  }, [liveMatch, completedIds, getResult]);

  // ─── FILTERED LIST ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return enrichedSchedule.filter(m => {
      const statusOk = filter === 'all' || m.effectiveStatus === filter;
      const teamOk = teamFilter === 'all' || m.teamA === teamFilter || m.teamB === teamFilter;
      const searchOk = search === '' ||
        m.teamA.toLowerCase().includes(search.toLowerCase()) ||
        m.teamB.toLowerCase().includes(search.toLowerCase()) ||
        m.city.toLowerCase().includes(search.toLowerCase()) ||
        m.date.toLowerCase().includes(search.toLowerCase());
      return statusOk && teamOk && searchOk;
    });
  }, [enrichedSchedule, filter, search, teamFilter]);

  const liveCount = enrichedSchedule.filter(m => m.effectiveStatus === 'live').length;
  const completedCount = enrichedSchedule.filter(m => m.effectiveStatus === 'completed').length;
  const upcomingCount = enrichedSchedule.filter(m => m.effectiveStatus === 'upcoming').length;

  // ── Historical season render ────────────────────────────────────────────────
  if (!isCurrentSeason) {
    const displayMatches = filteredHistorical || [];
    const finals   = displayMatches.filter(m => m.type === 'Final' || m.type === 'Qualifier' || m.type === 'Eliminator');
    const league   = displayMatches.filter(m => !m.type || m.type === 'League Match');
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-10 space-y-8 relative z-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="border-l-4 border-ipl-neon pl-6">
            <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white">
              IPL <span className="text-ipl-neon">{season}</span>
            </h2>
            <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px] mt-2">
              {historicalData?.totalMatches} Matches · Winner: <span className="text-ipl-neon">{historicalData?.winner || '—'}</span>
            </p>
          </div>
          <SeasonDropdown
            selected={season}
            onChange={(yr) => { setSeason(yr); setFilter('all'); setTeamFilter('all'); setSearch(''); }}
            showAllTime={false}
            label="Season"
          />
        </div>

        {/* Team + search filters */}
        <div className="flex flex-wrap gap-2">
          <div className="flex flex-wrap gap-1 bg-white/5 p-1 rounded-2xl">
            {allTeams.map(t => (
              <button key={t} onClick={() => setTeamFilter(t)}
                className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all
                  ${teamFilter === t ? 'text-black font-black' : 'text-gray-500 hover:text-white'}`}
                style={teamFilter === t && t !== 'all' ? { backgroundColor: COLORS[t] + 'dd' }
                  : teamFilter === t ? { backgroundColor: '#0ea5e9' } : {}}>
                {t === 'all' ? 'All Teams' : t}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search team or city…"
              className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-[11px] text-white placeholder-gray-600 outline-none focus:border-ipl-neon/40 transition-colors" />
          </div>
        </div>

        {/* Finals / knockouts first */}
        {finals.length > 0 && (
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-ipl-neon mb-4 border-b border-ipl-neon/20 pb-2">Knockout Matches</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {finals.map(m => <HistoricalMatchCard key={m.id} match={m} />)}
            </div>
          </div>
        )}

        {/* League matches */}
        {league.length > 0 && (
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-4 border-b border-white/5 pb-2">League Stage ({league.length} matches)</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {league.map(m => <HistoricalMatchCard key={m.id} match={m} />)}
            </div>
          </div>
        )}

        {displayMatches.length === 0 && (
          <div className="text-center py-20 text-gray-500 font-bold uppercase tracking-widest text-sm">
            No matches found for this filter
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-10 space-y-8 relative z-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="border-l-4 border-ipl-neon pl-6">
          <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white">
            Match <span className="text-ipl-neon">Schedule</span>
          </h2>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px] mt-2">
            {season === CURRENT_SEASON ? 'IPL 2026 · Road to the Trophy' : `IPL ${season} · Season Archive`}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <SeasonDropdown
            selected={season}
            onChange={(yr) => { setSeason(yr); setFilter('all'); setTeamFilter('all'); setSearch(''); }}
            showAllTime={false}
            label="Season"
          />
          <div className="flex gap-3">
          <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-center">
            <p className="text-[8px] text-gray-500 uppercase">Total</p>
            <p className="text-lg font-black text-white">70</p>
          </div>
          {liveCount > 0 && (
            <div className="px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-xl text-center animate-pulse">
              <p className="text-[8px] text-red-400 uppercase">Live</p>
              <p className="text-lg font-black text-red-400">{liveCount}</p>
            </div>
          )}
          <div className="px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-xl text-center">
            <p className="text-[8px] text-green-500 uppercase">Done</p>
            <p className="text-lg font-black text-green-400">{completedCount}</p>
          </div>
          <div className="px-4 py-2 bg-ipl-neon/10 border border-ipl-neon/20 rounded-xl text-center">
            <p className="text-[8px] text-ipl-neon uppercase">Left</p>
            <p className="text-lg font-black text-ipl-neon">{upcomingCount}</p>
          </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="flex gap-1 bg-white/5 p-1 rounded-2xl flex-shrink-0">
          {filterOpts.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 whitespace-nowrap
                ${filter === f.id ? 'bg-ipl-neon text-black' : 'text-gray-400 hover:text-white'}`}>
              {f.id === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />}
              {f.label}
              {f.id === 'live' && liveCount > 0 && (
                <span className="ml-1 bg-red-500 text-white text-[8px] rounded-full w-4 h-4 flex items-center justify-center font-black">
                  {liveCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-white/5 p-1 rounded-2xl flex-wrap">
          {allTeams.map(t => (
            <button key={t} onClick={() => setTeamFilter(t)}
              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all
                ${teamFilter === t ? 'text-black font-black' : 'text-gray-500 hover:text-white'}`}
              style={
                teamFilter === t && t !== 'all'
                  ? { backgroundColor: COLORS[t] + 'dd' }
                  : teamFilter === t
                    ? { backgroundColor: '#0ea5e9' }
                    : {}
              }>
              {t === 'all' ? 'All Teams' : t}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search team or city…"
            className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-[11px] text-white placeholder-gray-600 outline-none focus:border-ipl-neon/40 transition-colors" />
        </div>
      </div>

      {(filter !== 'all' || teamFilter !== 'all' || search) && (
        <p className="text-[10px] text-gray-600 font-bold">
          Showing {filtered.length} of {BASE_SCHEDULE.length} matches
        </p>
      )}

      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filtered.map((match, i) => (
            <FixtureCard
              key={match.id}
              match={match}
              effectiveStatus={match.effectiveStatus}
              // ── Pass live data ONLY to the correctly date-matched fixture ──
              liveMatchData={isThisFixtureLive(match, liveMatch) ? liveMatch : null}
              index={i}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <Search className="w-12 h-12 text-gray-700" />
          <p className="text-white font-black text-base uppercase tracking-widest">No matches found</p>
          <p className="text-gray-500 text-sm">Try adjusting your filters</p>
        </div>
      )}
    </div>
  );
};

export default Fixtures;