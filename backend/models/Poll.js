import mongoose from 'mongoose';

const pollSchema = new mongoose.Schema({
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', index: true },
  matchKey: { type: String, index: true }, // e.g. "CSK_MI_2026_1" for resilient lookup
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

pollSchema.index({ matchKey: 1, 'voters.clientHash': 1 });

export default mongoose.model('Poll', pollSchema);
