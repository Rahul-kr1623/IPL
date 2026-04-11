import express from 'express';
import Comment from '../models/Comment.js';

const router = express.Router();

// GET /api/comments
// Fetch latest 50 comments
router.get('/', async (req, res) => {
  try {
    const comments = await Comment.find()
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(comments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// POST /api/comments
router.post('/', async (req, res) => {
  try {
    const { username, text, teamBadge } = req.body;
    
    if (!username || !text) {
      return res.status(400).json({ error: 'Username and text are required' });
    }

    const newComment = new Comment({
      username,
      text,
      teamBadge
    });

    const savedComment = await newComment.save();
    res.status(201).json(savedComment);
  } catch (error) {
    console.error('Error posting comment:', error);
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

export default router;
