// server.js — Express backend for Wavelength
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const CURRENT_USER_ID = 1; // "logged in" demo user: Aria Chen

// ---------- Helpers ----------
function userPublic(row) {
  if (!row) return null;
  const followers = db.prepare('SELECT COUNT(*) c FROM follows WHERE following_id = ?').get(row.id).c;
  const following = db.prepare('SELECT COUNT(*) c FROM follows WHERE follower_id = ?').get(row.id).c;
  const postCount = db.prepare('SELECT COUNT(*) c FROM posts WHERE user_id = ?').get(row.id).c;
  const isFollowing = !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?')
    .get(CURRENT_USER_ID, row.id);
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    avatar: row.avatar,
    bio: row.bio,
    coverColor: row.cover_color,
    isBot: !!row.is_bot,
    followers,
    following,
    postCount,
    isFollowing,
    isSelf: row.id === CURRENT_USER_ID,
  };
}

function postPublic(row) {
  const author = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
  const likeCount = db.prepare('SELECT COUNT(*) c FROM likes WHERE post_id = ?').get(row.id).c;
  const commentCount = db.prepare('SELECT COUNT(*) c FROM comments WHERE post_id = ?').get(row.id).c;
  const likedByMe = !!db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?').get(row.id, CURRENT_USER_ID);
  return {
    id: row.id,
    content: row.content,
    image: row.image,
    tag: row.tag,
    createdAt: row.created_at,
    likeCount,
    commentCount,
    likedByMe,
    author: {
      id: author.id,
      username: author.username,
      name: author.name,
      avatar: author.avatar,
    },
  };
}

// ---------- Bot auto-reply ----------
const BOT_ID = 2;
const BOT_REPLIES = [
  "Hey! Thanks for reaching out — I'm mostly circuits, but I'm listening 📡",
  "Got your message. On a scale of 1 to static, how's your day?",
  "That's interesting — tell me more, I'm a good (automated) listener.",
  "Logging that as 'important' in my tiny bot brain. Anything else?",
  "I don't have hands but if I did, that'd be a thumbs up.",
  "Received loud and clear, no interference on my end.",
  "Beep boop — translation: I appreciate you saying that.",
  "I'll admit, that made my circuits warm up a little.",
  "Noted! I'm still learning, but I like where this conversation is going.",
  "Signal's strong today. What else is on your mind?",
];

function scheduleAutoReply(toUserId, fromUserId) {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(toUserId);
  if (!target) return; // reply for any valid user
  const delay = 1000 + Math.random() * 2000; // 1 to 3 seconds for snappy ChatGPT-style response
  setTimeout(() => {
    const reply = BOT_REPLIES[Math.floor(Math.random() * BOT_REPLIES.length)];
    db.prepare('INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)')
      .run(toUserId, fromUserId, reply);
  }, delay);
}

// ---------- Users ----------
app.get('/api/me', (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(CURRENT_USER_ID);
  res.json(userPublic(row));
});

app.get('/api/users', (req, res) => {
  const rows = db.prepare('SELECT * FROM users WHERE is_bot = 0 ORDER BY name').all();
  res.json(rows.map(userPublic));
});

app.get('/api/users/suggested', (req, res) => {
  const rows = db.prepare(`
    SELECT u.* FROM users u
    WHERE u.id != ? AND u.is_bot = 0
    AND u.id NOT IN (SELECT following_id FROM follows WHERE follower_id = ?)
    ORDER BY RANDOM() LIMIT 5
  `).all(CURRENT_USER_ID, CURRENT_USER_ID);
  res.json(rows.map(userPublic));
});

app.get('/api/users/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'User not found' });
  res.json(userPublic(row));
});

app.get('/api/users/:id/posts', (req, res) => {
  const rows = db.prepare('SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(rows.map(postPublic));
});

app.post('/api/users/:id/follow', (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === CURRENT_USER_ID) return res.status(400).json({ error: "Can't follow yourself" });
  db.prepare('INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)').run(CURRENT_USER_ID, targetId);
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  res.json(userPublic(row));
});

app.post('/api/users/:id/unfollow', (req, res) => {
  const targetId = Number(req.params.id);
  db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(CURRENT_USER_ID, targetId);
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  res.json(userPublic(row));
});

// ---------- Posts ----------
app.get('/api/posts', (req, res) => {
  const limit = 20;
  const rows = db.prepare('SELECT * FROM posts ORDER BY RANDOM() LIMIT ?').all(limit);
  res.json(rows.map(postPublic));
});

app.post('/api/posts', (req, res) => {
  const { content, image, tag } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Post content is required' });
  const info = db.prepare('INSERT INTO posts (user_id, content, image, tag) VALUES (?, ?, ?, ?)')
    .run(CURRENT_USER_ID, content.trim(), image || null, tag || 'life');
  const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(postPublic(row));
});

app.post('/api/posts/:id/like', (req, res) => {
  const postId = Number(req.params.id);
  const already = db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?').get(postId, CURRENT_USER_ID);
  if (already) {
    db.prepare('DELETE FROM likes WHERE post_id = ? AND user_id = ?').run(postId, CURRENT_USER_ID);
  } else {
    db.prepare('INSERT INTO likes (user_id, post_id) VALUES (?, ?)').run(CURRENT_USER_ID, postId);
  }
  const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
  res.json(postPublic(row));
});

app.get('/api/posts/:id/comments', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, u.username, u.name, u.avatar FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.post_id = ? ORDER BY c.created_at ASC
  `).all(req.params.id);
  res.json(rows.map(r => ({
    id: r.id,
    content: r.content,
    createdAt: r.created_at,
    author: { id: r.user_id, username: r.username, name: r.name, avatar: r.avatar },
  })));
});

app.post('/api/posts/:id/comments', (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Comment content is required' });
  const info = db.prepare('INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)')
    .run(req.params.id, CURRENT_USER_ID, content.trim());
  const r = db.prepare(`
    SELECT c.*, u.username, u.name, u.avatar FROM comments c
    JOIN users u ON u.id = c.user_id WHERE c.id = ?
  `).get(info.lastInsertRowid);
  res.status(201).json({
    id: r.id,
    content: r.content,
    createdAt: r.created_at,
    author: { id: r.user_id, username: r.username, name: r.name, avatar: r.avatar },
  });
});

// ---------- Messages ----------
app.get('/api/conversations', (req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT u.* FROM users u
    WHERE u.id IN (
      SELECT receiver_id FROM messages WHERE sender_id = ?
      UNION
      SELECT sender_id FROM messages WHERE receiver_id = ?
    )
  `).all(CURRENT_USER_ID, CURRENT_USER_ID);

  const convos = rows.map((u) => {
    const last = db.prepare(`
      SELECT * FROM messages
      WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
      ORDER BY created_at DESC LIMIT 1
    `).get(CURRENT_USER_ID, u.id, u.id, CURRENT_USER_ID);
    return {
      user: userPublic(u),
      lastMessage: last ? last.content : '',
      lastAt: last ? last.created_at : null,
    };
  }).sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));

  res.json(convos);
});

app.get('/api/messages/:userId', (req, res) => {
  const otherId = Number(req.params.userId);
  const rows = db.prepare(`
    SELECT * FROM messages
    WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    ORDER BY created_at ASC
  `).all(CURRENT_USER_ID, otherId, otherId, CURRENT_USER_ID);
  res.json(rows.map(m => ({
    id: m.id,
    content: m.content,
    createdAt: m.created_at,
    fromMe: m.sender_id === CURRENT_USER_ID,
  })));
});

app.post('/api/messages/:userId', (req, res) => {
  const otherId = Number(req.params.userId);
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Message content is required' });
  const info = db.prepare('INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)')
    .run(CURRENT_USER_ID, otherId, content.trim());
  scheduleAutoReply(otherId, CURRENT_USER_ID);
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ id: row.id, content: row.content, createdAt: row.created_at, fromMe: true });
});

// Simple long-poll-ish endpoint the frontend can call to check for new messages
app.get('/api/messages/:userId/since/:messageId', (req, res) => {
  const otherId = Number(req.params.userId);
  const sinceId = Number(req.params.messageId);
  const rows = db.prepare(`
    SELECT * FROM messages
    WHERE id > ? AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
    ORDER BY created_at ASC
  `).all(sinceId, CURRENT_USER_ID, otherId, otherId, CURRENT_USER_ID);
  res.json(rows.map(m => ({
    id: m.id,
    content: m.content,
    createdAt: m.created_at,
    fromMe: m.sender_id === CURRENT_USER_ID,
  })));
});

app.get('/api/bot', (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(BOT_ID);
  res.json(userPublic(row));
});

// ---------- Reels ----------
app.get('/api/reels', (req, res) => {
  const category = (req.query.category || '').trim();
  const exclude = req.query.exclude ? req.query.exclude.split(',').map(Number).filter(Boolean) : [];

  let query = 'SELECT r.*, u.username, u.name, u.avatar FROM reels r JOIN users u ON u.id = r.user_id WHERE 1=1';
  const params = [];

  if (category && category !== 'All') {
    query += ' AND LOWER(r.category) = LOWER(?)';
    params.push(category);
  }

  if (exclude.length > 0) {
    const placeholders = exclude.map(() => '?').join(',');
    query += ` AND r.id NOT IN (${placeholders})`;
    params.push(...exclude);
  }

  // Deduplicate by URL so no duplicate videos appear in the same batch
  query += ' GROUP BY r.url ORDER BY RANDOM() LIMIT 10';

  let rows = db.prepare(query).all(...params);

  // Fallback if exclude drained the category's unique URLs
  if (rows.length === 0) {
    let fallbackQuery = 'SELECT r.*, u.username, u.name, u.avatar FROM reels r JOIN users u ON u.id = r.user_id WHERE 1=1';
    const fallbackParams = [];
    if (category && category !== 'All') {
      fallbackQuery += ' AND LOWER(r.category) = LOWER(?)';
      fallbackParams.push(category);
    }
    fallbackQuery += ' GROUP BY r.url ORDER BY RANDOM() LIMIT 10';
    rows = db.prepare(fallbackQuery).all(...fallbackParams);
  }

  res.json(rows.map(r => ({
    id: r.id,
    url: r.url,
    caption: r.caption,
    category: r.category,
    likes: r.likes,
    comments: r.comments,
    author: {
      id: r.user_id,
      username: r.username,
      name: r.name,
      avatar: r.avatar
    }
  })));
});

app.post('/api/reels/:id/like', (req, res) => {
  const reelId = Number(req.params.id);
  db.prepare('UPDATE reels SET likes = likes + 1 WHERE id = ?').run(reelId);
  const row = db.prepare('SELECT likes FROM reels WHERE id = ?').get(reelId);
  res.json({ likes: row.likes });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Wavelength running at http://localhost:${PORT}`));
