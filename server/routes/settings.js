const express = require('express');
const { getDb } = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    if (row.key !== 'plex_token') settings[row.key] = row.value;
  }
  res.json(settings);
});

router.put('/', (req, res) => {
  const db = getDb();
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const update = db.transaction((pairs) => {
    for (const [k, v] of pairs) stmt.run([k, v]);
  });
  update(Object.entries(req.body));
  res.json({ success: true });
});

module.exports = router;
