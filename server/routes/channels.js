const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db');
const { buildSchedule } = require('../scheduler');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `logo-${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Get all channels
router.get('/', (req, res) => {
  const db = getDb();
  const channels = db.prepare('SELECT * FROM channels ORDER BY number ASC').all();
  res.json(channels);
});

// Get single channel
router.get('/:id', (req, res) => {
  const db = getDb();
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });
  res.json(channel);
});

// Create channel
router.post('/', async (req, res) => {
  const db = getDb();
  const { number, name, library_id, library_name, playback_mode = 'shuffle', genre_filter, decade_filter } = req.body;

  if (!number || !name || !library_id) {
    return res.status(400).json({ error: 'number, name, and library_id are required' });
  }

  // Check number not taken
  const existing = db.prepare('SELECT id FROM channels WHERE number = ?').get(number);
  if (existing) return res.status(409).json({ error: `Channel ${number} already exists` });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO channels (id, number, name, library_id, library_name, playback_mode, genre_filter, decade_filter)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run([id, number, name, library_id, library_name, playback_mode, genre_filter || null, decade_filter || null]);

  // Build initial schedule async
  buildSchedule(id).catch(console.error);

  res.status(201).json({ id, number, name });
});

// Update channel
router.put('/:id', async (req, res) => {
  const db = getDb();
  const { name, number, library_id, library_name, playback_mode, genre_filter, decade_filter, active } = req.body;

  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  db.prepare(`
    UPDATE channels SET
      name = COALESCE(?, name),
      number = COALESCE(?, number),
      library_id = COALESCE(?, library_id),
      library_name = COALESCE(?, library_name),
      playback_mode = COALESCE(?, playback_mode),
      genre_filter = ?,
      decade_filter = ?,
      active = COALESCE(?, active),
      updated_at = strftime('%s','now')
    WHERE id = ?
  `).run([
    name ?? null, number ?? null, library_id ?? null, library_name ?? null,
    playback_mode ?? null, genre_filter ?? null, decade_filter ?? null,
    active ?? null, req.params.id,
  ]);

  // Rebuild schedule if library changed
  if (library_id && library_id !== channel.library_id) {
    db.prepare('DELETE FROM schedule WHERE channel_id = ?').run([req.params.id]);
    buildSchedule(req.params.id).catch(console.error);
  }

  res.json({ success: true });
});

// Upload channel logo
router.post('/:id/logo', upload.single('logo'), (req, res) => {
  const db = getDb();
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const logoUrl = `/uploads/${req.file.filename}`;

  // Delete old logo
  const channel = db.prepare('SELECT logo FROM channels WHERE id = ?').get(req.params.id);
  if (channel?.logo) {
    const oldPath = path.join(process.env.UPLOADS_DIR, path.basename(channel.logo));
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  db.prepare('UPDATE channels SET logo = ? WHERE id = ?').run([logoUrl, req.params.id]);
  res.json({ logo: logoUrl });
});

// Delete channel
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM schedule WHERE channel_id = ?').run([req.params.id]);
  db.prepare('DELETE FROM channels WHERE id = ?').run([req.params.id]);
  res.json({ success: true });
});

// Manually rebuild schedule for a channel
router.post('/:id/rebuild', async (req, res) => {
  const db = getDb();
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  try {
    db.prepare('DELETE FROM schedule WHERE channel_id = ?').run([req.params.id]);
    await buildSchedule(req.params.id);
    const count = db.prepare('SELECT COUNT(*) as n FROM schedule WHERE channel_id = ?').get(req.params.id);
    res.json({ success: true, scheduled: count?.n || 0 });
  } catch (err) {
    console.error('Rebuild error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get current + upcoming schedule for a channel
router.get('/:id/schedule', (req, res) => {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const items = db.prepare(`
    SELECT * FROM schedule
    WHERE channel_id = ? AND end_time > ?
    ORDER BY start_time ASC
    LIMIT 20
  `).all(req.params.id, now);
  res.json(items);
});

// Get what's currently playing on a channel
router.get('/:id/now', (req, res) => {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const item = db.prepare(`
    SELECT s.*, c.name as channel_name, c.number as channel_number
    FROM schedule s
    JOIN channels c ON s.channel_id = c.id
    WHERE s.channel_id = ? AND s.start_time <= ? AND s.end_time > ?
  `).get(req.params.id, now, now);
  res.json(item || null);
});

// TV Guide — all channels with schedule items covering the next 4 hours
router.get('/guide/all', (req, res) => {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const guideEnd = now + 4 * 3600;

  const channels = db.prepare('SELECT * FROM channels WHERE active = 1 ORDER BY number ASC').all();

  const result = channels.map((ch) => {
    const schedule = db.prepare(`
      SELECT * FROM schedule
      WHERE channel_id = ? AND end_time > ? AND start_time < ?
      ORDER BY start_time ASC
    `).all(ch.id, now - 4 * 3600, guideEnd); // go back 4h to catch long currently-playing shows
    return { channel: ch, schedule };
  });

  res.json(result);
});

module.exports = router;
