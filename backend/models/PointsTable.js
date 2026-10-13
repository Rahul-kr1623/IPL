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
