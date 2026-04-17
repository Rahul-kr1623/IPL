import mongoose from 'mongoose';

const LiveMatchSchema = new mongoose.Schema({
  team1: { name: { type: String, required: true }, color: String, logo: String },
  team2: { name: { type: String, required: true }, color: String, logo: String },
  score:        { type: String, default: '0' },
  wickets:      { type: String, default: '0' },
  overs:        { type: String, default: '0.0' },
  team1Score:   { type: String, default: null },
  team1Wickets: { type: String, default: null },
  team1Overs:   { type: String, default: null },
  target:       { type: Number, default: null },
  crr:          { type: Number, default: null },
  rrr:          { type: Number, default: null },
  status:       { type: String, default: 'LIVE' },
  result:       { type: String, default: '' },
  toss:         { type: String, default: null },
  winProb:      { type: Number, default: 50 },
  winProbT1:    { type: Number, default: 50 },
  winProbT2:    { type: Number, default: 50 },
  recent:       [{ type: String }],
  commentary: [{
    over: String, text: String,
    type: { type: String, enum: ['normal','wicket','boundary'], default: 'normal' },
    generated: { type: Boolean, default: false },
  }],
  batsmen: [{
    name: String, runs: Number, balls: Number,
    fours: { type: Number, default: 0 }, sixes: { type: Number, default: 0 },
    sr: String, onStrike: { type: Boolean, default: false },
  }],
  bowlers: [{
    name: String, overs: String,
    maidens: { type: Number, default: 0 },
    runs: Number, wickets: Number, economy: String,
  }],
  source:      { type: String, default: 'unknown' },
  // ── espnId: used by Fixtures page to deduplicate when teams play each other ──
  // ── twice in a season. Stored from scraperService espnGetScore return value. ──
  // ── Also add  espnId: d.espnId || null  inside saveToDb() in index.js.      ──
  espnId:      { type: String, default: null },
  lastUpdated: { type: Date, default: Date.now },
}, { timestamps: true });

export default mongoose.model('LiveMatch', LiveMatchSchema);