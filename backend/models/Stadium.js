import mongoose from 'mongoose';

const stadiumSchema = new mongoose.Schema({
  stadiumId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  city: { type: String, required: true },
  state: String,
  country: { type: String, default: 'India' },
  capacity: Number,
  homeTeam: String,
  pitchType: { 
    type: String, 
    enum: ['Batting', 'Spin', 'Pace', 'Balanced', 'Batting Paradise', 'Spin Friendly'], 
    default: 'Balanced' 
  },
  dimensions: {
    straightBoundary: String,
    squareBoundary: String
  },
  stats: {
    totalMatches: { type: Number, default: 0 },
    battingFirstWins: { type: Number, default: 0 },
    chasingWins: { type: Number, default: 0 },
    avgFirstInningsScore: { type: Number, default: 0 },
    avgSecondInningsScore: { type: Number, default: 0 },
    highestTotal: { type: String, default: '0/0' },
    lowestTotal: { type: String, default: '0/0' },
    highestSuccessfulChase: { type: String, default: '0/0' }
  }
}, { timestamps: true });

export default mongoose.model('Stadium', stadiumSchema);
