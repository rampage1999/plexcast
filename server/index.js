const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 8989;

// Data directory — in production uses Electron's userData, in dev uses local folder
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Make dirs available to other modules
process.env.DATA_DIR = DATA_DIR;
process.env.UPLOADS_DIR = UPLOADS_DIR;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

// Routes
app.use('/api/plex', require('./routes/plex'));
app.use('/api/channels', require('./routes/channels'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/stream', require('./routes/stream'));

// M3U playlist endpoint
app.get('/channels.m3u', require('./routes/m3u'));

// XMLTV EPG endpoint
app.get('/epg.xml', require('./routes/epg'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', version: '1.0.0' }));

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`PlexCast server running on http://0.0.0.0:${PORT}`);
  // Init DB then start schedule manager
  const { initDb, getDb } = require('./db');
  const { startScheduleManager } = require('./scheduler');
  await initDb();
  // One-time migration: clear schedule built with show-level IDs (pre-episode fix)
  const db = getDb();
  const migrated = db.prepare('SELECT value FROM settings WHERE key = ?').get('schedule_episode_fix');
  if (!migrated) {
    db.exec('DELETE FROM schedule');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(['schedule_episode_fix', '1']);
    console.log('[migration] Cleared stale schedule — rebuilding with episode-level IDs');
  }
  startScheduleManager();
});

module.exports = app;
