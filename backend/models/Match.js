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
      'STRATEGIC TIMEOUT', 'SUPER OVER', 'FINISHED', 'ABANDONED', 'RECENTLY FINISHED'
    ],
    default: 'UPCOMING',
    index: true
  },
  toss: {
    winner: String,
    decision: String,
    text: String
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
    team1Wickets: { type: Number, default: null },
    team1Overs: { type: String, default: null },
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
