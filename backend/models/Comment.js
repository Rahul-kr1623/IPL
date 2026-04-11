import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true,
  },
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 300,
  },
  teamBadge: {
    type: String,
    default: 'NEUTRAL',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

export default mongoose.model('Comment', commentSchema);
