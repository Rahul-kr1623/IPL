import mongoose from 'mongoose';

const headToHeadSchema = new mongoose.Schema({
  team1: { type: String, required: true, index: true },
  team2: { type: String, required: true, index: true },
  team1Wins: { type: Number, default: 0 },
  team2Wins: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  noResult: { type: Number, default: 0 },
  recentForm: { type: [String], default: [] }
}, { timestamps: true });

headToHeadSchema.index({ team1: 1, team2: 1 }, { unique: true });

export default mongoose.model('HeadToHead', headToHeadSchema);
