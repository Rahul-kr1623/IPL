# IPL 2026 UNIVERSE — COMPLETE MASTER IMPLEMENTATION SPECIFICATION
**Version:** 3.1.0 (Exhaustive Production Blueprint)  
**Cost Model:** 100% Free / Zero Paid Subscriptions  
**Architecture:** Real-Time Push (ESPN REST CDN ➔ Node/Express ➔ MongoDB ➔ Socket.io ➔ Vite/React)

---

## 1. Comprehensive Codebase Audit: 12 Unspoken Problems & Exact Solutions

A line-by-line inspection of the entire codebase revealed 12 critical hidden flaws, hardcoded placeholders, and architectural bottlenecks:

| # | File & Location | Hidden Problem Discovered | Exact Engineering Solution |
| :--- | :--- | :--- | :--- |
| **1** | `PulseEngagement.jsx` (lines 70–75) | **Fake Math.random() Poll Voting:** Voting uses `Math.floor(Math.random() * 12) + 5` locally. Never sends votes to any backend, never persists, and other users see nothing. | Hook into real WebSocket event `socket.emit('cast-poll-vote')` and persist votes in MongoDB `Poll` collection with IP hash guards. |
| **2** | `PredictorWidget.jsx` (lines 8, 12, 33) | **Hardcoded Predictor Widget:** Falls back to hardcoded `CSK vs RCB`, displays static `"24,512 Votes Polled"`, and hardcodes `{ teamA: 64, teamB: 36 }`. No dual-match support for double-headers. | Bind dynamically to active matches from `useMatchContext()`; render 2 voting cards if double-header; broadcast real live percentages via Socket.io. |
| **3** | `LiveTicker.jsx` (lines 5–10) | **100% Mock Data Ticker:** Renders a static hardcoded array of 4 mock matches (`CSK vs MI 184/4`, `RCB vs KKR`, etc.). Never connects to real live match data. | Connect `LiveTicker` directly to `useMatchContext()` to display ongoing live scores, running overs, and active boundaries/wickets. |
| **4** | `MatchInsights.jsx` (lines 149–185, 298, 317) | **Hardcoded H2H & Weather / Fragile LocalStorage:** Hardcodes `14` vs `11` wins for Head-to-Head regardless of teams; hardcodes `28°C` and `Hard & Dry` pitch; stores over-by-over momentum solely in browser `localStorage`. | Query real Head-to-Head records from MongoDB `HeadToHead` collection; calculate momentum and worm charts directly from match innings over-by-over scorecards. |
| **5** | `Fixtures.jsx` (lines 50–133, 846–850) | **Hardcoded 2026 Schedule & Bypass:** Hardcodes 70 matches (`BASE_SCHEDULE`) and scorecards (`SC`). Line 847 explicitly bypasses API: `if (isCurrentSeason) { setHistoricalData(null); return; }`. | Remove the 71KB hardcoded arrays; make `Fixtures.jsx` fetch `/api/v1/data/season/2026/fixtures` dynamically from MongoDB. |
| **6** | `Teams.jsx` (lines 10–34) | **Hardcoded Trophy Cabinet & Captains:** `teamsData` and `trophyData` hardcode title counts (e.g. CSK 5, MI 5, RCB 1) and years (`2010, 2011...`). Will never update when a season ends. | Compute trophy counts dynamically by aggregating season final winners from MongoDB `Match` & `PointsTable` collections. |
| **7** | `PlayerDetail.jsx` (lines 10–15, 26, 76) | **500KB Inefficient Fetch & Dummy Graph:** Hardcodes dummy match history `[{ match: 'Match 1', runs: 45 }]`; fetches the entire 500KB players JSON on client-side and filters in browser; uses cartoon DiceBear avatars. | Add dedicated `GET /api/v1/data/players/:playerId` backend route; compute real career progression graph from match performances; use sleek cricket badge UI. |
| **8** | `Footer.jsx` (lines 45–53) | **Hardcoded Stats Ticker Strip:** `STATS_TICKER` array contains static text (`'🏏 74 matches played in IPL 2026'`, `'🟠 Vaibhav Sooryavanshi — 776 runs'`). | Expose `/api/v1/data/season/2026/quick-stats` route to dynamically feed total boundaries, top scores, and current season milestones. |
| **9** | `dbService.js` (lines 68, 78) | **Destructive deleteMany & Limit 2:** If `espnId` is missing, line 68 executes `await LiveMatch.deleteMany({})`, wiping the entire collection. Line 78 limits queries to 2 documents, hiding Box 3 when 2 matches are live. | Use immutable upserts keyed by `season + matchNumber + slot`; remove `deleteMany({})`; expand query limit to support Box 1, Box 2, and Box 3 simultaneously. |
| **10**| `liveController.js` (lines 84–105) | **Blocking On-Demand Scraper:** When a slot document is missing, the API handler initiates `scrapeAllSlots()` on the fly during incoming HTTP requests, creating race conditions. | Decouple API handlers completely from scraping. Route handlers only read from MongoDB and in-memory cache; background scheduler handles ingestion. |
| **11**| `scraperService.js` (2,493 lines) | **Bloat, Dead Proxies & RAM Crashes:** Contains dead `cricbuzz-live.vercel.app` (402 Payment Required), broken Cricbuzz web API (404), and Puppeteer logic that crashes 512MB RAM servers. | Overhaul `scraperService.js` into a lightweight (~300 lines) pure Node.js `fetch` client targeting ESPN Edge REST JSON endpoints. |
| **12**| `MatchContext.jsx` (lines 243–285) | **Client-Side Double Polling:** Connects to Socket.io, but simultaneously maintains an active `setInterval` polling `GET /api/v1/live-score` every 30s (and 5s on disconnect). | Eliminate continuous HTTP polling when socket is connected. Rely 100% on Socket.io push updates; use HTTP strictly for initial page load hydration. |

---

## 2. System Topology & Architectural Principles

### 2.1 The Zero-Cost Philosophy
To operate without paying monthly API fees ($50–$300/mo) while delivering sub-15-second live ball-by-ball updates:
1. **No Commercial APIs with Micro-Quotas:** RapidAPI and CricAPI free tiers offer 100–500 calls/month. At 15-second intervals, one single 4-hour match exhausts 960 calls.
2. **No Headless Chrome in Production:** Puppeteer consumes 400MB+ RAM per instance. On free hostings (e.g. Render with 512MB RAM), Puppeteer triggers instant Out-Of-Memory (OOM) crashes.
3. **No Unreliable Scraping Proxies:** Third-party unauthenticated proxies (like `cricbuzz-live.vercel.app`) get suspended.
4. **Primary Free Source:** Direct, unauthenticated HTTP requests to **ESPN's Global Edge REST CDN** (`site.api.espn.com`). It serves pure, lightweight JSON (~15KB), handles high-frequency polling, and does not block standard HTTP clients that include appropriate browser headers.

### 2.2 The "Single Poller, Infinite Subscriber" Engine
```
                  ┌──────────────────────────────────────────────┐
                  │          ESPN Edge REST CDN API              │
                  │  (https://site.api.espn.com/apis/site/v2/...)│
                  └──────────────────────┬───────────────────────┘
                                         │ Single Poller (10–12s during Live play)
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │          Node.js Background Worker           │
                  │             (services/scheduler.js)          │
                  └──────────────┬───────────────────────────────┘
                                 │
                 ┌───────────────┴─────────────────┐
                 ▼                                 ▼
      ┌─────────────────────┐           ┌──────────────────────┐
      │   MongoDB Atlas     │           │   Socket.io Server   │
      │   (Single Truth)    │           │ (WebSocket Broadcast)│
      └─────────────────────┘           └──────────┬───────────┘
                                                   │
                          ┌────────────────────────┼────────────────────────┐
                          ▼                        ▼                        ▼
                   [Client Tab 1]           [Client Tab 2]          [Client Tab 1000]
```
- Only **one** process polls ESPN.
- Whether 1 or 10,000 users visit the platform, external traffic remains strictly **one request every 10–12 seconds**.
- Frontend clients never poll ESPN or your Express API; they receive instantaneous updates via WebSocket (`Socket.io`).

---

## 3. Complete Database Schemas (MongoDB / Mongoose)

All data moves from static `.json` files to indexed MongoDB collections.

### 3.1 Match Schema (`backend/models/Match.js`)
```javascript
import mongoose from 'mongoose';

const batsmanScoreSchema = new mongoose.Schema({
  name: { type: String, required: true },
  playerId: { type: String, index: true },
  runs: { type: Number, default: 0 },
  balls: { type: Number, default: 0 },
  fours: { type: Number, default: 0 },
  sixes: { type: Number, default: 0 },
  sr: { type: String, default: '0.0' },
  dismissal: { type: String, default: 'not out' },
  onStrike: { type: Boolean, default: false }
}, { _id: false });

const bowlerScoreSchema = new mongoose.Schema({
  name: { type: String, required: true },
  playerId: { type: String, index: true },
  overs: { type: String, default: '0.0' },
  maidens: { type: Number, default: 0 },
  runs: { type: Number, default: 0 },
  wickets: { type: Number, default: 0 },
  economy: { type: String, default: '0.00' }
}, { _id: false });

const ballCommentarySchema = new mongoose.Schema({
  over: { type: String, required: true },
  ballNumber: Number,
  text: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['normal', 'boundary', 'wicket', 'milestone', 'extra'], 
    default: 'normal' 
  },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const matchSchema = new mongoose.Schema({
  season: { type: Number, required: true, index: true }, // e.g. 2026
  matchNumber: { type: Number, required: true, index: true }, // 1, 2, ..., 74
  espnEventId: { type: String, unique: true, sparse: true, index: true },
  matchTitle: { type: String, required: true }, // "Match 18", "Qualifier 1"
  stage: { type: String, enum: ['League', 'Playoff', 'Final'], default: 'League' },
  date: { type: Date, required: true, index: true },
  time: { type: String, required: true }, // "03:30 PM", "07:30 PM"
  slot: { type: String, enum: ['slot1', 'slot2'], required: true },
  venue: { type: String, required: true, index: true },
  city: { type: String, required: true },
  teamA: { type: String, required: true, index: true }, // "CSK"
  teamB: { type: String, required: true, index: true }, // "MI"
  status: {
    type: String,
    enum: [
      'UPCOMING', 'LIVE', 'INNINGS BREAK', 'RAIN DELAY', 
      'STRATEGIC TIMEOUT', 'SUPER OVER', 'FINISHED', 'ABANDONED'
    ],
    default: 'UPCOMING',
    index: true
  },
  toss: {
    winner: String,
    decision: String, // "bat" or "field"
    text: String      // "CSK won the toss and elected to bat"
  },
  live: {
    currentInnings: { type: Number, default: 1 },
    battingTeam: String,
    bowlingTeam: String,
    score: { type: Number, default: 0 },
    wickets: { type: Number, default: 0 },
    overs: { type: String, default: '0.0' },
    target: { type: Number, default: null },
    team1Score: { type: String, default: null },
    crr: { type: Number, default: 0.0 },
    rrr: { type: Number, default: 0.0 },
    lastSixBalls: { type: [String], default: ['·', '·', '·', '·', '·', '·'] },
    winProbTeamA: { type: Number, default: 50 },
    winProbTeamB: { type: Number, default: 50 },
    currentBatsmen: [batsmanScoreSchema],
    currentBowlers: [bowlerScoreSchema],
    recentCommentary: [ballCommentarySchema]
  },
  result: { type: String, default: null },
  winner: { type: String, default: null, index: true },
  playerOfTheMatch: {
    name: String,
    playerId: String
  },
  scorecard: {
    innings1: {
      team: String,
      total: String,
      overs: String,
      batting: [batsmanScoreSchema],
      bowling: [bowlerScoreSchema],
      fallOfWickets: [{ score: Number, wicket: Number, over: String, player: String }]
    },
    innings2: {
      team: String,
      total: String,
      overs: String,
      batting: [batsmanScoreSchema],
      bowling: [bowlerScoreSchema],
      fallOfWickets: [{ score: Number, wicket: Number, over: String, player: String }]
    }
  },
  lastScrapedAt: { type: Date, default: Date.now }
}, { timestamps: true });

matchSchema.index({ season: 1, slot: 1, status: 1 });

export default mongoose.model('Match', matchSchema);
```

### 3.2 Player Schema (`backend/models/Player.js`)
```javascript
import mongoose from 'mongoose';

const playerSchema = new mongoose.Schema({
  playerId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, index: true },
  fullName: { type: String, default: '' },
  image: { type: String, default: '/players/default_avatar.png' },
  activeTeam: { type: String, required: true, index: true },
  teamsPlayedFor: [String],
  role: { 
    type: String, 
    enum: ['Batsman', 'Bowler', 'All-Rounder', 'Wicketkeeper Batsman'], 
    required: true 
  },
  battingStyle: { type: String, default: 'Right hand Bat' },
  bowlingStyle: { type: String, default: 'Right arm Medium' },
  isDebutSeason: { type: Boolean, default: false },
  careerBatting: {
    matches: { type: Number, default: 0 },
    innings: { type: Number, default: 0 },
    runs: { type: Number, default: 0 },
    highestScore: { type: String, default: '0' },
    average: { type: Number, default: 0.0 },
    strikeRate: { type: Number, default: 0.0 },
    hundreds: { type: Number, default: 0 },
    fifties: { type: Number, default: 0 },
    fours: { type: Number, default: 0 },
    sixes: { type: Number, default: 0 }
  },
  careerBowling: {
    matches: { type: Number, default: 0 },
    innings: { type: Number, default: 0 },
    balls: { type: Number, default: 0 },
    runsConceded: { type: Number, default: 0 },
    wickets: { type: Number, default: 0 },
    bestFigures: { type: String, default: '0/0' },
    average: { type: Number, default: 0.0 },
    economy: { type: Number, default: 0.0 },
    fourWickets: { type: Number, default: 0 },
    fiveWickets: { type: Number, default: 0 }
  },
  season2026: {
    runs: { type: Number, default: 0, index: true },
    wickets: { type: Number, default: 0, index: true },
    matches: { type: Number, default: 0 },
    strikeRate: { type: Number, default: 0.0 },
    economy: { type: Number, default: 0.0 },
    highestScore: { type: String, default: '0' },
    bestBowling: { type: String, default: '0/0' }
  }
}, { timestamps: true });

export default mongoose.model('Player', playerSchema);
```

### 3.3 Points Table Schema (`backend/models/PointsTable.js`)
```javascript
import mongoose from 'mongoose';

const teamStandingSchema = new mongoose.Schema({
  team: { type: String, required: true },
  played: { type: Number, default: 0 },
  won: { type: Number, default: 0 },
  lost: { type: Number, default: 0 },
  tied: { type: Number, default: 0 },
  noResult: { type: Number, default: 0 },
  points: { type: Number, default: 0 },
  nrr: { type: Number, default: 0.000 },
  forRuns: { type: Number, default: 0 },
  forOvers: { type: Number, default: 0.0 },
  againstRuns: { type: Number, default: 0 },
  againstOvers: { type: Number, default: 0.0 },
  recentForm: { type: [String], default: [] },
  qualified: { type: Boolean, default: false }
}, { _id: false });

const pointsTableSchema = new mongoose.Schema({
  season: { type: Number, required: true, unique: true, index: true },
  standings: [teamStandingSchema],
  orangeCap: {
    player: String,
    playerId: String,
    team: String,
    runs: Number,
    matches: Number
  },
  purpleCap: {
    player: String,
    playerId: String,
    team: String,
    wickets: Number,
    matches: Number
  },
  lastCalculatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('PointsTable', pointsTableSchema);
```

### 3.4 Live Fan Poll Schema (`backend/models/Poll.js`)
```javascript
import mongoose from 'mongoose';

const pollSchema = new mongoose.Schema({
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true, index: true },
  slot: { type: String, enum: ['slot1', 'slot2'], required: true },
  question: { type: String, required: true },
  optionA: { type: String, required: true },
  optionB: { type: String, required: true },
  votesA: { type: Number, default: 0 },
  votesB: { type: Number, default: 0 },
  voters: [{
    clientHash: { type: String, required: true },
    choice: { type: String, enum: ['A', 'B'], required: true },
    votedAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

pollSchema.index({ matchId: 1, 'voters.clientHash': 1 });

export default mongoose.model('Poll', pollSchema);
```

---

## 4. Zero-Cost Live Ingestion Engine (`scraperService.js`)

Overhauls the 2,493-line legacy scraper into a clean, pure Node.js REST scraper (~250 lines):
- Targets `https://site.api.espn.com/apis/site/v2/sports/cricket/{LEAGUE_ID}/scoreboard`
- Fallback: `https://site.api.espn.com/apis/personalized/v2/scoreboard/header?sport=cricket&region=in&tz=Asia/Calcutta`
- Zero Puppeteer, zero headless Chrome, zero CPU/RAM spikes on Render free tier.

---

## 5. Multi-Slot Scheduler & Non-Destructive Storage

### 5.1 Slot Resolution (Double-Header Overlap)
Matches are bucketed by UTC scheduled start hour:
- Hour $< 12:00$ UTC ($< 5:30$ PM IST) $\rightarrow$ `slot1` (Afternoon 3:30 PM Match).
- Hour $\ge 12:00$ UTC ($\ge 5:30$ PM IST) $\rightarrow$ `slot2` (Evening 7:30 PM Match).

### 5.2 Safe Ingestion in `dbService.js`
- Replaces destructive `LiveMatch.deleteMany({})` with atomic `Match.findOneAndUpdate({ espnEventId }, { $set: doc }, { upsert: true })`.
- Increases query limit to support concurrent `slot1`, `slot2`, and `latestFinished` queries.

---

## 6. Automated Post-Match Pipeline (`completedMatchService.js`)

When a match reaches `status: "FINISHED"`:
1. Re-calculates NRR according to official cricket rules:
   $$\text{NRR} = \left(\frac{\text{Runs Scored}}{\text{Overs Faced}}\right) - \left(\frac{\text{Runs Conceded}}{\text{Overs Bowled}}\right)$$
   *(All-out counts as full 20.0 overs).*
2. Recalculates Points Table and applies `qualified: true` if team reaches mathematically safe points threshold.
3. Finds Orange Cap and Purple Cap leaders from `Player` collection and updates `PointsTable`.
4. Updates season trophy count when the Final match is marked finished.

---

## 7. Real-Time Socket.io Fan Voting & Broadcast

### 7.1 Server-Side Handler (`backend/game/gameServer.js`)
Adds poll voting handlers to the existing Socket.io server alongside Hand Cricket:
- Event: `cast-poll-vote` with payload `{ matchId, teamChoice, clientHash }`.
- Deduplication: checks `voters.clientHash`.
- Broadcast: `io.emit('poll-update-${matchId}', { votesA, votesB, pctA, pctB })`.

---

## 8. Frontend Modernization & Solutions to Codebase Glitches

### 8.1 Real Dynamic Voting in `PulseEngagement.jsx` and `PredictorWidget.jsx`
- Replaces `Math.random()` with Socket.io vote emission:
  ```javascript
  const handleVote = (choice) => {
    socket.emit('cast-poll-vote', { matchId: activeMatch._id, teamChoice: choice, clientHash: getFingerprint() });
  };
  ```
- Renders 2 voting cards if double-header is active (`slot1` and `slot2`).

### 8.2 Real Live Scores in `LiveTicker.jsx`
- Connects `LiveTicker` to `useMatchContext()`.
- Renders live ongoing match score, balls remaining, CRR, and last 6 balls ticker.

### 8.3 Dynamic Data Lab in `MatchInsights.jsx`
- Replaces hardcoded 14 vs 11 wins with real MongoDB query from `HeadToHead`.
- Replaces static weather with venue intelligence from `Stadium`.
- Renders live SVG Worm chart and Manhattan bars calculated directly from match scorecard overs.

### 8.4 Removing 71KB Hardcoded Fixtures from `Fixtures.jsx`
- Deletes `BASE_SCHEDULE` and `SC`.
- Fetches all fixtures dynamically from `/api/v1/data/season/:year/fixtures` regardless of season.

### 8.5 Dynamic Trophy Cabinet in `Teams.jsx`
- Computes `trophyData` from season champions stored in DB.

### 8.6 Dedicated Player Profile Route in `PlayerDetail.jsx`
- Implements `GET /api/v1/data/players/:id` for instant $< 5$ms lookups.
- Renders real match progression line chart and radar spider comparison.

### 8.7 Dynamic Stats Strip in `Footer.jsx`
- Replaces static `STATS_TICKER` with live aggregates from `/api/v1/data/season/2026/quick-stats`.

---

## 9. Visual Brand Identity & Logo Specification

Modern SVG stadium floodlight crest placed in `frontend/public/logo.svg` scaling crisply from $16\times16$ favicon to $512\times512$ app icon.

---

## 10. Step-by-Step Implementation Execution Checklist

```
STEP 1: Database Foundation & Seeding
  ├── [1.1] Create backend/models/Match.js
  ├── [1.2] Create backend/models/Player.js
  ├── [1.3] Create backend/models/PointsTable.js
  ├── [1.4] Create backend/models/Stadium.js
  ├── [1.5] Create backend/models/Poll.js
  └── [1.6] Run backend/scripts/seedDatabase.js to populate MongoDB from data/

STEP 2: Backend Scraper & Scheduler Overhaul
  ├── [2.1] Overhaul backend/services/scraperService.js (Pure ESPN REST, zero Puppeteer)
  ├── [2.2] Refactor backend/services/scheduler.js (Adaptive timing, dual-slot state)
  ├── [2.3] Create backend/services/completedMatchService.js (Auto NRR & Points)
  └── [2.4] Wire Poll voting in backend/game/gameServer.js

STEP 3: REST API & Caching Routes
  ├── [3.1] Update backend/routes/data.js (Player by ID, Stadiums, Dynamic Fixtures)
  └── [3.2] Decouple backend/controllers/liveController.js (Pure DB reads)

STEP 4: Frontend Live Core & Sockets
  ├── [4.1] Strip HTTP double-polling from frontend/src/context/MatchContext.jsx
  ├── [4.2] Update frontend/src/components/Hero.jsx (Slot 1, Slot 2, Latest Finished)
  ├── [4.3] Connect frontend/src/components/LiveTicker.jsx to live context
  └── [4.4] Create reusable frontend/src/components/ScorecardModal.jsx

STEP 5: Dynamic Engagement & Data Lab
  ├── [5.1] Fix PulseEngagement.jsx (Real Socket fan poll, commentary feed)
  ├── [5.2] Fix PredictorWidget.jsx (Real Socket voting, dual match support)
  ├── [5.3] Fix MatchInsights.jsx (Dynamic H2H, Worm chart, Manhattan bars)
  └── [5.4] Connect Footer.jsx stats band to dynamic quick-stats endpoint

STEP 6: Secondary Pages Modernization
  ├── [6.1] Decouple Fixtures.jsx (Remove 71KB hardcoded arrays, fetch 2026 from API)
  ├── [6.2] Decouple Teams.jsx (Dynamic trophy cabinet and H2H)
  ├── [6.3] Modernize Players.jsx & PlayerDetail.jsx (Spider chart, direct player API)
  └── [6.4] Save frontend/public/logo.svg and update favicon
```
