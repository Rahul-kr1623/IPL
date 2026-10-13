import mongoose from 'mongoose';

const playerSchema = new mongoose.Schema({
  playerId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, index: true },
  fullName: { type: String, default: '' },
  image: { type: String, default: '/players/default_avatar.png' },
  activeTeam: { type: String, required: true, index: true },
  currentTeam: { type: String, index: true },
  teamsPlayedFor: [String],
  role: { 
    type: String, 
    default: 'Batter'
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
