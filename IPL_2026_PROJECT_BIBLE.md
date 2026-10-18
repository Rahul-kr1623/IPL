# IPL 2026 LIVE CRICKETING HUB — THE MASTER PROJECT BIBLE
**The Definitive Architectural, Functional, UI/UX, and Engineering Documentary**  
*Version:* 4.0.0 (Exhaustive System Documentation)  
*Target Audience:* Developers, System Architects, and Autonomous AI Coding Agents  
*Cost Model:* 100% Free / Zero Paid Subscriptions / Zero API Fees  
*Live Production URL:* `https://ipl2026t20.vercel.app`  
*Backend Engine:* Node.js / Express / Socket.io / MongoDB Atlas  
*Frontend Engine:* Vite / React 18 / TailwindCSS / Framer Motion / Lucide Icons  

---

## TABLE OF CONTENTS
1. [Executive Summary & Core Philosophy](#1-executive-summary--core-philosophy)
2. [High-Level Architecture & Data Flow](#2-high-level-architecture--data-flow)
3. [The Zero-Cost Ingestion Engine & Scraping Strategy](#3-the-zero-cost-ingestion-engine--scraping-strategy)
4. [Multi-Slot Schedule & Concurrent Match Engine (The 3-Box Architecture)](#4-multi-slot-schedule--concurrent-match-engine-the-3-box-architecture)
5. [Complete Database Schemas & Data Models](#5-complete-database-schemas--data-models)
6. [Complete REST API Surface & Specifications](#6-complete-rest-api-surface--specifications)
7. [WebSocket Protocol & Real-Time Events](#7-websocket-protocol--real-time-events)
8. [Frontend State Management (`MatchContext`) & Data Ingestion Hygiene](#8-frontend-state-management-matchcontext--data-ingestion-hygiene)
9. [Exhaustive Page-by-Page & Component-by-Component Documentary](#9-exhaustive-page-by-page--component-by-component-documentary)
   - 9.1 [Global Overlays & Navigation (`Navbar`, `CommandPalette`, `LiveTicker`, `ErrorBoundary`, `Footer`)](#91-global-overlays--navigation)
   - 9.2 [Home Page (`/`) — The Central Live Hub](#92-home-page---the-central-live-hub)
   - 9.3 [Interactive Scorecard Modal (`ScorecardModal.jsx`)](#93-interactive-scorecard-modal)
   - 9.4 [Predictor Widget & Live Fan Voting (`PredictorWidget.jsx`)](#94-predictor-widget--live-fan-voting)
   - 9.5 [Data Lab & Visual Analytics (`MatchInsights.jsx`)](#95-data-lab--visual-analytics)
   - 9.6 [Pulse Engagement & Commentary Feed (`PulseEngagement.jsx`)](#96-pulse-engagement--commentary-feed)
   - 9.7 [AI Intel Hub & Gemini Tactical Engine (`IntelHub.jsx`)](#97-ai-intel-hub--gemini-tactical-engine)
   - 9.8 [Fixtures & Match Results (`/fixtures`)](#98-fixtures--match-results)
   - 9.9 [Teams & Franchise Profiles (`/teams` and `/teams/:id`)](#99-teams--franchise-profiles)
   - 9.10 [Players Directory & In-Depth Player Dossier (`/players` and `/player/:id`)](#910-players-directory--in-depth-player-dossier)
   - 9.11 [Tournament Statistics & Cap Leaders (`/stats`)](#911-tournament-statistics--cap-leaders)
   - 9.12 [Points Table & Standings (`/points`)](#912-points-table--standings)
   - 9.13 [Stadiums & Venue Intelligence (`/stadiums`)](#913-stadiums--venue-intelligence)
   - 9.14 [Real-Time Multiplayer Hand Cricket Game (`/play`)](#914-real-time-multiplayer-hand-cricket-game)
10. [Design System, Dynamic Franchise Theming & Audio Engine](#10-design-system-dynamic-franchise-theming--audio-engine)
11. [Critical Production Pitfalls, Bug History & Defensive Guidelines](#11-critical-production-pitfalls-bug-history--defensive-guidelines)
12. [Cloud Infrastructure, Deployment & Environment Configuration](#12-cloud-infrastructure-deployment--environment-configuration)
13. [Future Roadmap & AI Agent Extensibility Guidelines](#13-future-roadmap--ai-agent-extensibility-guidelines)

---

## 1. EXECUTIVE SUMMARY & CORE PHILOSOPHY

### 1.1 The Vision
The **IPL 2026 Live Cricketing Hub** is an industry-grade, ultra-responsive digital stadium designed to deliver ball-by-ball IPL match telemetry, deep data analytics, fan engagement, and interactive multiplayer gaming to cricket enthusiasts worldwide.

Unlike commercial sports platforms bloated with intrusive advertisements or expensive subscription barriers, this platform is built with a singular design ethos:
> **Maximum Real-Time Fidelity at Zero Operational Cost with 100% Dynamic Automation.**

### 1.2 Core Invariants & Engineering Guarantees
Every engineer or AI model working on this codebase must uphold four inviolable principles:

1. **Zero Cost / Zero Paid Subscriptions:**
   - Under no circumstances will paid cricket API subscriptions (e.g. CricAPI, RapidAPI, Sportmonks) be integrated.
   - Free tiers on commercial APIs offer 100–500 calls/month; at a 15-second polling interval, one single 4-hour match would burn 960 calls and break the site.
   - All live telemetry is obtained via high-frequency, resilient scraping of open public REST CDN endpoints (specifically ESPN Cricinfo Edge CDN) that require no authentication tokens and incur zero monetary cost.

2. **Zero Hardcoded Data / Zero Freeze Policy:**
   - No mock arrays, hardcoded dummy scores, or frozen JSON fallbacks are permitted to masquerade as live matches.
   - If no live match is currently underway, the UI must explicitly and honestly state: *"No match undergoing in afternoon slot"* or *"Next match starts at 7:30 PM IST"*. Stale or hardcoded scorecards must never freeze the interface.

3. **Sub-15-Second Live Latency:**
   - Ongoing matches update ball-by-ball, score-by-score, and boundary-by-boundary.
   - Telemetry flows from the source to the user interface in under 10–15 seconds via WebSockets (`Socket.io`), eliminating client-side polling bottlenecks.

4. **Micro-Memory Footprint (<512MB RAM):**
   - The backend runs on free cloud container tiers (such as Render Free Tier) which impose strict 512MB memory limits.
   - Heavy headless browser solutions (Puppeteer, Playwright, Selenium) are strictly banned from production. All ingestion uses pure Node.js native `fetch` with lightweight JSON parsing.

---

## 2. HIGH-LEVEL ARCHITECTURE & DATA FLOW

### 2.1 The "Single Poller, Infinite Subscriber" Engine
To serve thousands of concurrent frontend users without getting IP-blocked by data providers or exceeding rate limits, the system implements a strict decoupled subscriber pattern:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   ESPN Edge REST CDN Endpoint                          │
│        (https://site.api.espn.com/apis/site/v2/sports/cricket/...)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                       1 Request every 10–12s
                      (Single Backend Poller)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 Node.js Background Scheduler Worker                    │
│                      (backend/services/scheduler.js)                   │
├────────────────────────────────────────────────────────────────────────┤
│ • Validates payload integrity & detects slot (Slot 1 vs Slot 2)        │
│ • Detects match phase: UPCOMING, LIVE, INNINGS BREAK, FINISHED        │
│ • Calculates NRR, Win Probability, Over-by-Over Worm & Momentum        │
│ • Triggers completedMatchService.js when match concludes              │
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   │                                 │
                   ▼                                 ▼
   ┌──────────────────────────────┐   ┌──────────────────────────────┐
   │    MongoDB Atlas Database    │   │       Socket.io Server       │
   │    (Single Source of Truth)  │   │  (backend/game/gameServer.js)│
   │  Collections: Match, Player, │   └──────────────┬───────────────┘
   │  PointsTable, Stadium, Poll  │                  │
   └──────────────────────────────┘                  │ Instant WebSocket Push
                                                     │ (Zero Client Polling)
                                                     ▼
                            ┌──────────────────────────────────────────────┐
                            │          Connected Browser Clients           │
                            │      (Vite / React 18 / MatchContext)        │
                            ├──────────────────────────────────────────────┤
                            │ • Client 1  (Desktop Chrome)                 │
                            │ • Client 2  (Mobile Safari)                  │
                            │ • Client N  (10,000+ Concurrent Visitors)    │
                            └──────────────────────────────────────────────┘
```

### 2.2 End-to-End Operational Lifecycle
1. **Ingestion Loop:** The background scheduler (`scheduler.js`) runs continuously on the backend server. Every 10–12 seconds during active match windows, it queries ESPN's edge CDN.
2. **Transform & Normalize:** Raw nested arrays from ESPN are normalized into a unified schema: extracting batsmen on strike, current bowler, last 6 balls, run rates, and toss text.
3. **Database Upsert:** The document is atomically updated in MongoDB Atlas using `Match.findOneAndUpdate` keyed by `espnEventId` or `season + matchNumber`.
4. **WebSocket Broadcast:** The updated document is immediately broadcast via `io.emit('live-score-update', payload)` to all active WebSocket clients.
5. **State Hydration:** Frontend clients listen on `socket.on('live-score-update')`, dispatching `FETCH_SUCCESS` to `MatchContext`. The entire UI (scores, wagon wheels, win probability gauges, audio triggers) updates in single-frame React renders without reloading.
6. **Graceful Fallback:** If a client's WebSocket disconnects (e.g. mobile browser sleeping or aggressive firewall), the client automatically activates a polite HTTP polling fallback (`GET /api/v1/live-score` every 8s) until the WebSocket automatically reconnects.

---

## 3. THE ZERO-COST INGESTION ENGINE & SCRAPING STRATEGY

### 3.1 Primary Data Source: ESPN Global Edge REST CDN
The system targets ESPN's public, unauthenticated CDN REST endpoints which power ESPN's official apps and web scoreboards:

- **Primary League Scoreboard Endpoint:**
  `https://site.api.espn.com/apis/site/v2/sports/cricket/{LEAGUE_ID}/scoreboard`
  *(IPL League ID: `8048`)*
- **Personalized Header Live Feed (Alternative / Fallback):**
  `https://site.api.espn.com/apis/personalized/v2/scoreboard/header?sport=cricket&region=in&tz=Asia/Calcutta`
- **Match Summary & Play-by-Play Endpoint:**
  `https://site.web.api.espn.com/apis/site/v2/sports/cricket/summary?event={EVENT_ID}`

### 3.2 Ingestion Engine Guarantees (`backend/services/scraperService.js`)
- **Zero Headless Browsers:** Built with native Node.js `fetch` using gzip/brotli decompression. Execution uses `< 25MB` RAM.
- **Strict User-Agent Rotation & Headers:** Uses standard modern browser headers (`Accept: application/json`, `User-Agent: Mozilla/5.0...`) to prevent Cloudflare bot flags.
- **Resilient Retry with Exponential Backoff:** If a network blip occurs, the scraper retries after 2s, 4s, and 8s before declaring a temporary provider hiatus.
- **Circuit Breaker:** If 5 consecutive failures occur, the scheduler enters an adaptive sleep mode (polling once every 60s) to allow provider recovery.

### 3.3 Adaptive Polling Interval State Machine
The scheduler adapts its polling frequency based on the live match situation to conserve server cycles and network bandwidth:

| Match State | Polling Cadence | Rationale |
| :--- | :--- | :--- |
| **Active Live Play** (Ball-in-Play) | **10–12 Seconds** | Captures every delivery, boundary, wicket, and strike rotation. |
| **Innings Break / Strategic Timeout** | **30 Seconds** | No live deliveries; checks for resumption and target setting. |
| **Rain Delay / Wet Outfield** | **45 Seconds** | Low frequency; waits for official inspection commentary. |
| **Upcoming Match Window** (30 min before toss) | **20 Seconds** | Captures toss announcement and playing XI team releases. |
| **Non-Match Hours** (02:00 AM – 02:00 PM IST) | **10 Minutes** | Minimal checking for schedule amendments or late news. |
| **Off-Season** | **1 Hour** | Idle heartbeat mode. |

---

## 4. MULTI-SLOT SCHEDULE & CONCURRENT MATCH ENGINE (THE 3-BOX ARCHITECTURE)

### 4.1 The Double-Header Problem
In the Indian Premier League, weekend fixtures frequently feature **Double-Headers**:
- **Afternoon Match (Slot 1):** Scheduled at 03:30 PM IST (10:00 AM UTC).
- **Evening Match (Slot 2):** Scheduled at 07:30 PM IST (02:00 PM UTC).

Because an afternoon match often extends past 07:15 PM IST due to strategic timeouts, DRS reviews, or rain delays, the evening match toss (07:00 PM IST) and first ball (07:30 PM IST) frequently overlap with the final overs of the afternoon match.

Conventional sports widgets crash or overwrite the afternoon game when the evening game starts. The IPL 2026 Live Hub completely eliminates this issue with **The 3-Box Architecture**.

### 4.2 The 3-Box Paradigm on the Home Page

```
┌────────────────────────────────────────────────────────────────────────┐
│  BOX 1 — AFTERNOON CLASH (3:30 PM IST SLOT)                           │
│  • Dedicated to Slot 1.                                               │
│  • Displays live ball-by-ball score if active.                        │
│  • Displays countdown / pre-match preview if upcoming.                │
│  • Displays "No match undergoing in afternoon slot" if empty today.   │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│  BOX 2 — EVENING CLASH (7:30 PM IST SLOT)                             │
│  • Dedicated to Slot 2.                                               │
│  • Displays live ball-by-ball score if active.                        │
│  • Co-exists simultaneously with Box 1 during overlap periods.        │
│  • Displays countdown / pre-match preview if upcoming.                │
│  • Displays "No match undergoing in evening slot" if empty today.     │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│  BOX 3 — LATEST FINISHED RESULT (HISTORICAL ANCHOR)                   │
│  • Displays the most recently concluded IPL match.                    │
│  • Highlights match winner, margin of victory, and team final scores. │
│  • Provides instant access to the full official 40-over Scorecard.   │
│  • Updates automatically the moment any live match concludes.         │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Slot Partitioning Algorithm
When the scraper fetches events from ESPN, it categorizes matches into slots based on their scheduled UTC start time:
- Scheduled start hour $< 12:00$ UTC ($< 5:30$ PM IST) $\longrightarrow$ **`slot1`** (Box 1).
- Scheduled start hour $\ge 12:00$ UTC ($\ge 5:30$ PM IST) $\longrightarrow$ **`slot2`** (Box 2).
- Status `FINISHED` or `RECENTLY FINISHED` $\longrightarrow$ Evaluated for **Box 3**.

---

## 5. COMPLETE DATABASE SCHEMAS & DATA MODELS

All collections reside in **MongoDB Atlas** under the database `ipl2026`.

### 5.1 Match Model (`backend/models/Match.js`)
The primary entity for fixtures, live games, and historical results:

```javascript
// Batsman in-match scorecard
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

// Bowler in-match scorecard
const bowlerScoreSchema = new mongoose.Schema({
  name: { type: String, required: true },
  playerId: { type: String, index: true },
  overs: { type: String, default: '0.0' },
  maidens: { type: Number, default: 0 },
  runs: { type: Number, default: 0 },
  wickets: { type: Number, default: 0 },
  economy: { type: String, default: '0.00' }
}, { _id: false });

// Ball-by-ball commentary item
const ballCommentarySchema = new mongoose.Schema({
  over: { type: String, required: true },
  ballNumber: Number,
  text: { type: String, required: true },
  type: { type: String, enum: ['normal', 'boundary', 'wicket', 'milestone', 'extra'], default: 'normal' },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

// Core Match Document
const matchSchema = new mongoose.Schema({
  season: { type: Number, required: true, index: true },         // e.g. 2026
  matchNumber: { type: Number, required: true, index: true },    // 1 to 74
  espnEventId: { type: String, unique: true, sparse: true, index: true },
  matchTitle: { type: String, required: true },                  // "Match 18, T20"
  stage: { type: String, enum: ['League', 'Playoff', 'Final'], default: 'League' },
  date: { type: Date, required: true, index: true },
  time: { type: String, required: true },                         // "03:30 PM", "07:30 PM"
  slot: { type: String, enum: ['slot1', 'slot2'], required: true },
  venue: { type: String, required: true, index: true },
  city: { type: String, required: true },
  teamA: { type: String, required: true, index: true },          // e.g. "CSK"
  teamB: { type: String, required: true, index: true },          // e.g. "RCB"
  status: {
    type: String,
    enum: ['UPCOMING', 'LIVE', 'INNINGS BREAK', 'RAIN DELAY', 'STRATEGIC TIMEOUT', 'SUPER OVER', 'FINISHED', 'ABANDONED'],
    default: 'UPCOMING',
    index: true
  },
  toss: {
    winner: String,
    decision: String,                                            // "bat" or "field"
    text: String                                                 // "CSK won the toss and elected to field"
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
  result: { type: String, default: null },                       // "CSK won by 6 wickets"
  winner: { type: String, default: null, index: true },
  playerOfTheMatch: { name: String, playerId: String },
  scorecard: {
    innings1: {
      team: String, total: String, overs: String,
      batting: [batsmanScoreSchema], bowling: [bowlerScoreSchema],
      fallOfWickets: [{ score: Number, wicket: Number, over: String, player: String }]
    },
    innings2: {
      team: String, total: String, overs: String,
      batting: [batsmanScoreSchema], bowling: [bowlerScoreSchema],
      fallOfWickets: [{ score: Number, wicket: Number, over: String, player: String }]
    }
  },
  lastScrapedAt: { type: Date, default: Date.now }
}, { timestamps: true });

matchSchema.index({ season: 1, slot: 1, status: 1 });
```

### 5.2 Player Model (`backend/models/Player.js`)
Houses comprehensive player biographies, career statistics, and season 2026 milestones:

```javascript
const playerSchema = new mongoose.Schema({
  playerId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, index: true },
  shortName: { type: String, default: '' },
  image: { type: String, default: '/players/default_avatar.png' },
  currentTeam: { type: String, required: true, index: true },   // e.g. "MI"
  activeTeam: { type: String, default: '' },
  role: { type: String, enum: ['Batsman', 'Bowler', 'All-Rounder', 'Wicketkeeper Batsman'], required: true },
  battingStyle: { type: String, default: 'Right hand Bat' },
  bowlingStyle: { type: String, default: 'Right arm Fast' },
  isOverseas: { type: Boolean, default: false },
  isCaptain: { type: Boolean, default: false },
  isWicketkeeper: { type: Boolean, default: false },
  nationality: { type: String, default: 'India' },
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
```

### 5.3 PointsTable Model (`backend/models/PointsTable.js`)
Tracks standings, Net Run Rate (NRR), and cap leaders across any season (2008–2026):

```javascript
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
  recentForm: { type: [String], default: [] },                  // ['W', 'W', 'L', 'W', 'NR']
  qualified: { type: Boolean, default: false }
}, { _id: false });

const pointsTableSchema = new mongoose.Schema({
  season: { type: Number, required: true, unique: true, index: true },
  standings: [teamStandingSchema],
  orangeCap: { player: String, playerId: String, team: String, runs: Number, matches: Number },
  purpleCap: { player: String, playerId: String, team: String, wickets: Number, matches: Number },
  lastCalculatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
```

### 5.4 Stadium Model (`backend/models/Stadium.js`)
Stores pitch reports, stadium geography, and historical venue analytics:

```javascript
const stadiumSchema = new mongoose.Schema({
  stadiumId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  city: { type: String, required: true },
  homeTeam: { type: String, required: true },                   // e.g. "KKR"
  capacity: { type: Number, default: 50000 },
  pitchType: { type: String, default: 'Batting Friendly' },     // 'Batting', 'Spin Friendly', 'Pace & Bounce'
  avgFirstInningsScore: { type: Number, default: 175 },
  avgSecondInningsScore: { type: Number, default: 160 },
  matchesPlayed: { type: Number, default: 80 },
  battingFirstWon: { type: Number, default: 38 },
  chasingWon: { type: Number, default: 42 },
  highestScore: { type: String, default: '245/3' },
  lowestScore: { type: String, default: '49' },
  image: { type: String, default: '/stadiums/default.jpg' }
}, { timestamps: true });
```

### 5.5 Live Fan Poll Model (`backend/models/Poll.js`)
Persists real-time fan predictions with IP/client hash deduplication:

```javascript
const pollSchema = new mongoose.Schema({
  slot: { type: String, enum: ['slot1', 'slot2'], default: 'slot1' },
  matchKey: { type: String, required: true, index: true },      // e.g. "CSK_RCB_P0"
  question: { type: String, required: true },
  optionA: { type: String, required: true },
  optionB: { type: String, required: true },
  votesA: { type: Number, default: 0 },
  votesB: { type: Number, default: 0 },
  voters: [{
    clientHash: { type: String, required: true },               // Browser fingerprint / voter ID
    choice: { type: String, enum: ['A', 'B'], required: true },
    votedAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });
```

---

## 6. COMPLETE REST API SURFACE & SPECIFICATIONS

All backend REST routes are prefixed with `/api/v1`.

### 6.1 Live Telemetry & Core Endpoints
| HTTP Method | Route | Description | Caching / Performance |
| :--- | :--- | :--- | :--- |
| `GET` | `/live-score` | Returns active matches for Slot 1 and Slot 2. Filtered against dataless stubs. | Real-time DB read with 50s in-memory fallback cache. |
| `GET` | `/latest-finished` | Returns Box 3's latest completed match scorecard with normalized string toss. | In-memory cached for 2 minutes (`LATEST_FINISHED_CACHE_MS`). |
| `GET` | `/ipl-data` | High-level tournament snapshot: active standings, cap leaders, upcoming match. | Cached for 12 hours (`standingsCache.js`). |
| `GET` | `/match-intel` | Gemini AI-generated live match tactical commentary, win projection & momentum. | Cached for 90 seconds keyed by `over + score`. |

### 6.2 Data Directory & Historical Archive (`/api/v1/data`)
| HTTP Method | Route | Query Parameters / Usage | Response Structure |
| :--- | :--- | :--- | :--- |
| `GET` | `/data/players` | `?team=CSK&role=Batsman&search=Dhoni` | Array of player documents matching filter criteria. |
| `GET` | `/data/players/:id` | `:id` (e.g. `virat-kohli` or MongoDB `_id`) | Player document with attached `matchHistory` (last 5 games). |
| `GET` | `/data/stadiums` | None | Array of all 10+ official IPL venues with pitch analytics. |
| `GET` | `/data/season/:year/fixtures` | `:year` (2008 to 2026) | Full 74-match schedule with results and scorecards. |
| `GET` | `/data/season/:year/points_table` | `:year` (2008 to 2026) | Standings array with won, lost, pts, and NRR. |
| `GET` | `/data/season/:year/team_squads` | `:year` (2008 to 2026) | Grouped object: `{ CSK: [...], MI: [...], ... }`. |
| `GET` | `/data/season/:year/quick-stats` | `:year` (defaults to 2026) | `{ totalSixes, totalFours, highestTotal, orangeCap, purpleCap }`. |
| `GET` | `/data/global/:file` | `:file` in `['awards', 'points_tables', 'head_to_head']` | Tournament historical ledger across all 18 seasons. |

---

## 7. WEBSOCKET PROTOCOL & REAL-TIME EVENTS

The WebSocket engine is implemented via `Socket.io` at path `/socket.io`. It serves two distinct systems simultaneously: **Live Match Telemetry Broadcast** and **Multiplayer Hand Cricket / Fan Polls**.

### 7.1 Match Telemetry Channel
- **Event `live-score-update` (Server $\longrightarrow$ Client):**
  Triggered by the background scheduler whenever new ball data or score changes occur.
  ```json
  {
    "slot1": {
      "matchId": "ipl2026-m18",
      "team1": { "name": "CSK", "score": "184/4", "overs": "18.2" },
      "team2": { "name": "RCB" },
      "status": "LIVE",
      "crr": 10.04,
      "lastSixBalls": ["4", "1", "W", "0", "6", "2"],
      "toss": "CSK won the toss and elected to bat"
    },
    "slot2": null,
    "matches": [...]
  }
  ```

### 7.2 Fan Poll Channel
- **`getPoll` (Client $\longrightarrow$ Server):** `{ slot, matchKey, question, optionA, optionB }`
- **`pollData` (Server $\longrightarrow$ Client):** `{ pollId, votesA, votesB, totalVotes }`
- **`castPollVote` (Client $\longrightarrow$ Server):** `{ slot, matchKey, choice: 'A'|'B', voterId }`
- **`pollUpdated` (Server $\longrightarrow$ All Clients):** Broadcasts new vote tallies to all viewers in real-time.
- **`voteConfirmed` / `voteRejected` (Server $\longrightarrow$ Calling Client):** Acknowledges or blocks duplicate voting.

### 7.3 Multiplayer Hand Cricket Game Channel
- **`createRoom` (Client $\longrightarrow$ Server):** `{ name }` $\longrightarrow$ returns `{ code: "ABCDE" }`.
- **`joinRoom` (Client $\longrightarrow$ Server):** `{ name, roomCode }` $\longrightarrow$ alerts player 1 and transitions to `phase: "toss"`.
- **`tossPick` (Client $\longrightarrow$ Server):** `{ roomCode, move: 1..6 }`. When both pick, odd/even sum determines winner.
- **`tossChoice` (Client $\longrightarrow$ Server):** `{ roomCode, choice: "bat"|"bowl" }`. Starts innings 1.
- **`makeMove` (Client $\longrightarrow$ Server):** `{ roomCode, move: 1..6 }`. If moves match $\longrightarrow$ **WICKET!** If moves differ $\longrightarrow$ Batting runs increment by batsman's pick.
- **`rematchVote` & `playAgain`:** Handles clean reset and re-toss.

---

## 8. FRONTEND STATE MANAGEMENT (`MatchContext`) & DATA INGESTION HYGIENE

The entire React frontend tree is governed by `frontend/src/context/MatchContext.jsx`.

### 8.1 State Anatomy
```javascript
const initialState = {
  slot1: null,              // 3:30 PM afternoon match (Box 1)
  slot2: null,              // 7:30 PM evening match (Box 2)
  latestFinished: null,     // Most recently concluded match (Box 3)
  finishedQueue: [],        // Queue of finished matches
  currentMatch: null,       // Pointer to active slot
  matches: [],              // Non-null array of [slot1, slot2]
  fetchStatus: 'IDLE',      // 'IDLE' | 'LOADING' | 'SUCCESS' | 'REFRESHING' | 'WARMING_UP' | 'ERROR'
  fetchError: null,
  lastFetched: null,        // ISO Timestamp
  isStale: false,           // Set to true if data > 10m old
  searchQuery: '',
  isSearchOpen: false,      // Command palette open state
  theme: 'DEFAULT'          // Dynamic team theme ('CSK', 'MI', 'RCB', etc.)
};
```

### 8.2 Defensive Ingestion Hygiene (The Anti-Crash Shield)
To guarantee the app never crashes from malformed upstream feeds:

1. **`stripMeta(doc)` Normalizer:**
   Strip MongoDB metadata (`__v`, `_id`, timestamps) and ensures `copy.toss` is stringified. If `toss` arrives as `{ text: "...", winner: "..." }`, it extracts `.text` or `.display`.
2. **Defensive Source Hierarchy in `SET_LATEST_FINISHED`:**
   Prevents hardcoded fallback data from overriding verified live API or MongoDB data. Valid verified sources: `['espn-scraped', 'json', 'liveMatch', 'mongo']`.
3. **Stale LocalStorage Sanitizer:**
   On boot, checks `localStorage['ipl_last_finished']`. If older than 12 hours or tagged with legacy hardcoded placeholders (e.g. historical PBKS vs LSG), it automatically purges the key to prevent ghost match displays.

---

## 9. EXHAUSTIVE PAGE-BY-PAGE & COMPONENT-BY-COMPONENT DOCUMENTARY

### 9.1 Global Overlays & Navigation

#### 9.1.1 `Navbar.jsx`
- **Location:** Sticky top header with glassmorphic backdrop (`backdrop-blur-xl bg-[#070913]/85`).
- **Elements:**
  1. *Brand Crest:* Scalable SVG logo + "IPL 2026" neon typography. Clicking returns to `/`.
  2. *Live Indicator Pill:* Pulsing red dot + "Live Now" link with current match counter.
  3. *Primary Navigation Links:* Fixtures, Teams, Players, Stats, Points, Stadiums, and Play (Bat Icon).
  4. *Live Marquee Ticker Strip:* Displays running scores and active overs for all ongoing games.
  5. *Command Palette Search Button:* Magnifying glass icon (triggers `Ctrl+K` quick search).
  6. *Franchise Theme Switcher:* Dropdown allowing users to switch the entire application's neon color scheme to their favorite IPL franchise (CSK Gold, MI Blue, RCB Red, etc.).

#### 9.1.2 `CommandPalette.jsx`
- **Behavior:** Global keyboard-accessible search modal triggered via `Cmd+K`, `Ctrl+K`, or search icon.
- **Search Scope:** Instant fuzzy search across all 10 IPL Teams, 250+ Players, Stadiums, and 74 Fixtures.

#### 9.1.3 `ErrorBoundary.jsx`
- **Behavior:** Wraps the entire `<App />` tree in `main.jsx`.
- **Functionality:** Intercepts uncaught JavaScript exceptions (e.g. React Error #31), displays an IPL-themed diagnostic recovery card ("We encountered a temporary rendering issue while processing live match data"), and provides a single-click "Reload Match Feed" button without crashing to a blank screen.

#### 9.1.4 `Footer.jsx`
- **Elements:**
  1. *Dynamic Statistics Ticker Band:* Pulls live tournament milestones from `/api/v1/data/season/2026/quick-stats` (total boundaries, sixes, Orange Cap leader).
  2. *Franchise Grid:* Clickable crests for all 10 teams leading to team rosters.
  3. *Legal & Data Transparency:* Disclaimer regarding BCCI/IPL trademark ownership and confirmation of 100% free educational architecture.
  4. *API Engine Status Pill:* Displays real-time health of the scraping daemon.

---

### 9.2 Home Page (`/`) — The Central Live Hub
The home page (`pages/Home.jsx`) is the heart of the platform, composed of four vertical tiers:

#### 9.2.1 Hero Section / Match Day Panel (`MatchDayPanel.jsx` & `Hero.jsx`)
Renders the 3-Box Architecture:

- **Box 1 (3:30 PM Slot) & Box 2 (7:30 PM Slot):**
  - *Header Strip:* Slot time label, match number, venue pin, and live status badge.
  - *Status Badges:* Dynamic pulse colors:
    - `LIVE` (Neon Green pulse)
    - `INNINGS BREAK` (Amber badge)
    - `RAIN DELAY` (Blue badge)
    - `STRATEGIC TIMEOUT` (Purple badge)
    - `UPCOMING` (Subtle gray badge with countdown timer)
  - *Team Scorecards:* High-contrast team crests, abbreviation, total runs, wickets lost, and completed overs.
  - *Toss Chip:* Formatted string with coin icon (`🪙 RCB won toss, elected to field`).
  - *Last 6 Balls Ribbon:* Horizontal sequence of animated dots colored by event:
    - Dots (`·`) = Gray
    - 1s, 2s, 3s = White / Blue
    - Fours (`4`) = Neon Green
    - Sixes (`6`) = Neon Cyan / Purple
    - Wickets (`W`) = Bright Red
  - *Live Batsmen & Bowler Strip:* Current strikers with runs, balls, strike rates, and active bowler figures.
  - *Win Probability Bar:* Real-time dual-colored probability bar showing live AI win projections (e.g. CSK 65% vs MI 35%).
  - *Scorecard Button:* Launches the comprehensive 40-over modal.

- **Box 3 (Latest Finished Result):**
  - *Header Strip:* Green trophy badge + "LATEST RESULT" label.
  - *Winner Highlighting:* Winning team highlighted with gold trophy; losing team subtly dimmed.
  - *Margin of Victory:* Bold italic victory text (e.g. *"KKR won by 24 runs"*).
  - *Scorecard Modal Trigger:* Opens full final match breakdown.

---

### 9.3 Interactive Scorecard Modal (`ScorecardModal.jsx`)
An overlay modal presenting the official 40-over match scorecard:
- **Tabs:** Innings 1 (Team A) vs Innings 2 (Team B).
- **Batting Table:** Columns for Batter Name, Dismissal Info (c & b), Runs, Balls, Fours, Sixes, and Strike Rate.
- **Bowling Table:** Columns for Bowler Name, Overs, Maidens, Runs Conceded, Wickets, and Economy.
- **Fall of Wickets (FOW):** Sequential timeline listing score at each dismissal, over, and dismissed batsman.
- **Match Information:** Umpires, Match Referee, Player of the Match, and Venue.

---

### 9.4 Predictor Widget & Live Fan Voting (`PredictorWidget.jsx`)
- **Behavior:** Interactive prediction card synced directly with MongoDB `Poll` documents via WebSockets.
- **Double-Header Support:** Automatically displays two prediction cards if both Slot 1 and Slot 2 are active.
- **Voting Mechanism:** Users click Team A or Team B. The click sends `socket.emit('castPollVote')` with a client fingerprint.
- **Live Gauge:** As votes arrive from other fans across the globe, the percentage bar animates smoothly via Framer Motion without page reloads.

---

### 9.5 Data Lab & Visual Analytics (`MatchInsights.jsx`)
An analytical suite powered by SVG charts computed directly from live match scorecards:
- **Over-by-Over Manhattan Chart:** Vertical bar chart showing runs scored in every individual over (1 to 20), highlighting overs with wickets (red dots) or high scoring (green bars).
- **Cumulative Worm Chart:** Dual-line graph comparing the run progression of Team A vs Team B over 20 overs.
- **Head-to-Head Radar:** Historical win-loss records between the two competing franchises across all IPL seasons.
- **Pitch & Weather Widget:** Temperature, humidity, surface speed, and historical batting first vs chasing win percentages at the current venue.

---

### 9.6 Pulse Engagement & Commentary Feed (`PulseEngagement.jsx`)
- **Ball-by-Ball Commentary:** High-speed scrollable feed of text commentary.
- **Visual Tags:** Deliveries tagged with colored badges (`WICKET!`, `FOUR!`, `MAXIMUM 6!`, `MILESTONE`).
- **Interactive Emoji Reactions:** Fans can click instant reaction emojis (🔥, 🏏, 👏, 😱) that burst on screen using canvas particle animations.

---

### 9.7 AI Intel Hub & Gemini Tactical Engine (`IntelHub.jsx`)
- **Integration:** Powered by Google's Gemini AI (`gemini-1.5-flash`).
- **Functionality:** Every 90 seconds during live play, the backend feeds current match state (runs, wickets, overs, required run rate, pitch conditions) to Gemini.
- **Outputs:**
  1. *Tactical Game State:* Concise explanation of who holds the advantage and why.
  2. *Key Matchup:* Identification of critical batter vs bowler duel.
  3. *Momentum Indicator:* Qualitative assessment of shifting pressure.

---

### 9.8 Fixtures & Match Results (`/fixtures`)
- **Season Dropdown:** Allows exploration of all 18 IPL seasons (2008 through 2026).
- **Filters:** All Matches, League Stage, Playoffs, Completed, and filter by individual Franchise.
- **Card Elements:** Match number, date/time in IST, venue, teams, scores, result summary, and full scorecard launcher.
- **Data Source:** Dynamic API route `GET /api/v1/data/season/:year/fixtures`.

---

### 9.9 Teams & Franchise Profiles (`/teams` and `/teams/:id`)
- **Franchise Directory (`/teams`):** Cards for all 10 franchises (CSK, DC, GT, KKR, LSG, MI, PBKS, RR, RCB, SRH) with official colors, crests, and stadium details.
- **Dynamic Trophy Cabinet:** Displays total championship titles won, dynamically calculated from tournament history.
- **Team Squad Dossier (`/teams/:id`):** Full player roster segmented into Batsmen, All-Rounders, Wicketkeepers, and Bowlers, highlighting Captain and overseas players.

---

### 9.10 Players Directory & In-Depth Player Dossier (`/players` and `/player/:id`)
- **Directory (`/players`):** Search by player name, filter by team, playing role, or overseas status.
- **Player Dossier (`/player/:id`):**
  - *Header:* Player portrait, active team crest, role icon, batting and bowling styles.
  - *Career Metrics:* Matches, innings, runs, high score, average, strike rate, centuries, wickets, economy.
  - *Season 2026 Performance:* Live tournament runs and wickets.
  - *Match Progression Chart:* Line graph of runs scored across the player's last 5 matches.
  - *Radar Spider Comparison:* Multi-axis radar chart benchmarking the player against the IPL league median.

---

### 9.11 Tournament Statistics & Cap Leaders (`/stats`)
- **Orange Cap Podium:** Top 10 run-scorers with runs, matches, strike rates, fours, and sixes.
- **Purple Cap Podium:** Top 10 wicket-takers with wickets, overs bowled, economy, and best figures.
- **Tournament Records Strip:** Most Sixes in the season, Highest Individual Innings, and Best Team Totals.

---

### 9.12 Points Table & Standings (`/points`)
- **Table Columns:** Rank, Team Crest, Played (P), Won (W), Lost (L), Tied (T), No Result (NR), Points (PTS), Net Run Rate (NRR), and Last 5 Form (`W`, `L`, `NR`).
- **Playoff Boundary:** Visual demarcation highlighting the Top 4 qualification zone.
- **Qualification Indicators:** Dynamic `'Q'` badge rendered when a team mathematically clinches a playoff spot.

---

### 9.13 Stadiums & Venue Intelligence (`/stadiums`)
- Comprehensive profiles for all 10+ official venues (Wankhede, Eden Gardens, M. Chinnaswamy, Narendra Modi Stadium, Chepauk, etc.).
- Includes pitch profile (e.g. "Pace & Bounce", "Red Soil Spinner's Delight"), boundary lengths, seating capacity, average 1st and 2nd innings totals, and chasing win ratios.

---

### 9.14 Real-Time Multiplayer Hand Cricket Game (`/play`)
A complete, browser-based recreation of the classic schoolyard "Hand Cricket" game powered by `Socket.io`:
- **Game Lobby:** Create a private room with a 5-letter alphanumeric code or join an existing room.
- **Odd / Even Digital Toss:** Players choose a number between 1 and 6. The sum determines the toss winner, who selects Batting or Bowling.
- **In-Game Action:** Both players tap numbers 1 to 6 simultaneously.
  - If picks match $\longrightarrow$ **OUT! (Wicket falls)**.
  - If picks differ $\longrightarrow$ Batsman scores their chosen number of runs.
- **Chasing & Target HUD:** Realistic target chasing tracker, commentary stream, and celebratory victory animations.

---

## 10. DESIGN SYSTEM, DYNAMIC FRANCHISE THEMING & AUDIO ENGINE

### 10.1 Aesthetic Foundation
The application uses a **Cyberpunk Stadium** aesthetic featuring:
- Background base: Deepest cosmic navy (`#070913` / `#0a0e27`).
- Glassmorphism: `backdrop-blur-xl` combined with translucent borders (`border-white/10`).
- Micro-Animations: Spring physics and layout transitions powered by `framer-motion`.

### 10.2 Dynamic Franchise Color System
The platform features an interactive theme engine that transforms the application's accent lighting into the color palette of any chosen IPL franchise:

| Franchise | Neon Primary (`--ipl-neon`) | Accent Secondary (`--ipl-accent`) |
| :--- | :--- | :--- |
| **CSK** (Chennai Super Kings) | `#F7B111` (Super King Gold) | `#004BA0` (Cobalt Blue) |
| **MI** (Mumbai Indians) | `#004BA0` (Indian Navy) | `#F7B111` (Gold Glow) |
| **RCB** (Royal Challengers Bengaluru) | `#CC0000` (Challenger Crimson) | `#1B2133` (Obsidian Gold) |
| **KKR** (Kolkata Knight Riders) | `#914BE3` (Knight Purple) | `#F7B111` (Vintage Gold) |
| **RR** (Rajasthan Royals) | `#EA1A85` (Royal Pink) | `#0057E2` (Navy Blue) |
| **SRH** (Sunrisers Hyderabad) | `#FF822A` (Sunrise Orange) | `#000000` (Shadow Black) |
| **DC** (Delhi Capitals) | `#005CA5` (Capital Azure) | `#EF1B23` (Roar Red) |
| **PBKS** (Punjab Kings) | `#ED1B24` (Crimson Sadda) | `#D7C15C` (Lion Gold) |
| **GT** (Gujarat Titans) | `#B59453` (Titan Gold) | `#1B2133` (Deep Navy) |
| **LSG** (Lucknow Super Giants) | `#0ea5e9` (Super Cyan) | `#F26522` (Fiery Orange) |

### 10.3 Audio Soundscape
The platform includes subtle web audio feedback triggers (toggleable via the audio icon in the Navbar):
- **Boundary Sound:** Plays a celebratory stadium cheer when a 4 or 6 is registered in live play.
- **Wicket Alarm:** Plays a sharp umpire whistle sound effect upon a dismissal.
- **Toss Coin Chime:** Plays a realistic coin flip sound during the Hand Cricket toss phase.

---

## 11. CRITICAL PRODUCTION PITFALLS, BUG HISTORY & DEFENSIVE GUIDELINES

Every developer or AI modifying this project must be aware of past resolved bugs to prevent regressions:

### 11.1 The Minified React Error #31 Incident (Blank Blue Page)
- **Symptom:** After a production build, `https://ipl2026t20.vercel.app` displayed a completely blank dark blue screen.
- **Root Cause:** Upstream MongoDB `Match` records and ESPN feeds return `toss` as an object: `{ text: "...", winner: "...", decision: "..." }`. Components were rendering `{match.toss}` directly in JSX children (`<p>🪙 {match.toss}</p>`). React threw `Error #31: Objects are not valid as a React child (found: object with keys {text})`, unmounting the entire React DOM.
- **Defensive Rule:** Always pass toss fields through `getTossText(toss)`:
  ```javascript
  const getTossText = (t) => t ? (typeof t === 'object' ? (t.text || t.display || null) : String(t)) : null;
  ```
  Additionally, the entire app is now guarded by `ErrorBoundary.jsx` in `main.jsx`.

### 11.2 The Double Polling Disaster
- **Symptom:** Express server CPU usage spiked to 100% and MongoDB connections saturated.
- **Root Cause:** `MatchContext.jsx` was connected to WebSockets while simultaneously running a 5-second `setInterval` HTTP polling loop.
- **Defensive Rule:** HTTP polling is strictly gated: it only activates if `!isSocketConnected`. When WebSockets are connected, HTTP live score polling is completely dormant.

### 11.3 Memory Crashes on Render Free Tier (<512MB RAM)
- **Symptom:** Backend process randomly restarted during scraping cycles with exit code 137 (OOM Killer).
- **Root Cause:** A legacy scraper utility invoked Puppeteer and Chromium in the background, instantly exhausting 512MB RAM.
- **Defensive Rule:** No headless browser binaries may be installed or spawned. All scraping must use pure Node.js `fetch`.

### 11.4 Destructive Database Queries
- **Symptom:** Previous versions executed `LiveMatch.deleteMany({})` when an ESPN feed had a missing identifier, wiping current live game scores from MongoDB.
- **Defensive Rule:** Never use `deleteMany` in live match ingestion routines. All database updates must use immutable atomic upserts (`findOneAndUpdate` with `{ upsert: true }`).

---

## 12. CLOUD INFRASTRUCTURE, DEPLOYMENT & ENVIRONMENT CONFIGURATION

### 12.1 Frontend Hosting: Vercel
- **Production URL:** `https://ipl2026t20.vercel.app`
- **Connected Git Branch:** `main`
- **Build Command:** `npm run build` (runs Vite compiler)
- **Output Directory:** `dist`
- **SPA Routing Configuration (`vercel.json`):**
  ```json
  {
    "rewrites": [
      { "source": "/(.*)", "destination": "/index.html" }
    ]
  }
  ```

### 12.2 Backend Hosting: Render Web Service
- **Build Command:** `npm install`
- **Start Command:** `node server.js`
- **Environment Variables:**
  - `PORT`: `5000` (or dynamically assigned by Render)
  - `NODE_ENV`: `production`
  - `MONGODB_URI`: Connection string to MongoDB Atlas replica set (`mongodb+srv://...`)
  - `CLIENT_URL`: `https://ipl2026t20.vercel.app` (used for CORS and Socket.io whitelist)
  - `GEMINI_API_KEY`: Google AI Studio API key for `gemini-1.5-flash` tactical generation

### 12.3 Frontend Environment Variables (`frontend/.env`)
- `VITE_API_URL`: Points to the production Render backend URL (e.g. `https://ipl-2026-h136.onrender.com`).
- During local development, defaults automatically to `http://localhost:5000`.

---

## 13. FUTURE ROADMAP & AI AGENT EXTENSIBILITY GUIDELINES

When extending this platform in future development cycles, adhere to these guidelines:

1. **Adding a New Page or Section:**
   - Define the route in `frontend/src/App.jsx`.
   - Add the navigation link in `frontend/src/components/Navbar.jsx`.
   - Register the item in `frontend/src/components/CommandPalette.jsx` so it is immediately searchable via `Ctrl+K`.
   - Ensure all subcomponents wrap external data lookups with default fallbacks (`data?.field || '—'`) to prevent rendering crashes.

2. **Adding a New Live Telemetry Field:**
   - Add the field to `matchSchema` in `backend/models/Match.js`.
   - Update `scraperService.js` to extract and normalize the field from ESPN CDN JSON.
   - Update `stripMeta` in `frontend/src/context/MatchContext.jsx` if the field is a nested object requiring stringification.
   - Bind the field in `frontend/src/components/MatchDayPanel.jsx` or `ScorecardModal.jsx`.

3. **Database Migration / Reseeding:**
   - If historical rosters or schedules are updated, run `backend/scripts/seedDatabase.js`.
   - The script uses non-destructive upserts keyed by unique IDs, preserving user-submitted fan polls and ongoing live matches.

---
*Document Authenticated & Maintained for the IPL 2026 Universe Project.*
