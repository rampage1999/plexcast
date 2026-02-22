const express = require('express');
const axios = require('axios');
const { getDb } = require('../db');
const router = express.Router();

function getPlexConfig() {
  const db = getDb();
  const url = db.prepare('SELECT value FROM settings WHERE key = ?').get('plex_url');
  const token = db.prepare('SELECT value FROM settings WHERE key = ?').get('plex_token');
  return {
    url: url?.value,
    token: token?.value,
  };
}

function plexHeaders(token) {
  return {
    'X-Plex-Token': token,
    'X-Plex-Client-Identifier': 'plexcast-app',
    'X-Plex-Product': 'PlexCast',
    Accept: 'application/json',
  };
}

// Test connection & save credentials
router.post('/connect', async (req, res) => {
  const { url, token } = req.body;
  if (!url || !token) return res.status(400).json({ error: 'URL and token required' });

  try {
    const baseUrl = url.replace(/\/$/, '');
    const response = await axios.get(`${baseUrl}/identity`, {
      headers: plexHeaders(token),
      timeout: 8000,
    });

    const db = getDb();
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(['plex_url', baseUrl]);
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(['plex_token', token]);

    res.json({
      success: true,
      server: response.data?.MediaContainer?.friendlyName || 'Plex Server',
    });
  } catch (err) {
    res.status(400).json({ error: 'Could not connect to Plex. Check your URL and token.' });
  }
});

// Get connection status
router.get('/status', async (req, res) => {
  const { url, token } = getPlexConfig();
  if (!url || !token) return res.json({ connected: false });

  try {
    const response = await axios.get(`${url}/identity`, {
      headers: plexHeaders(token),
      timeout: 5000,
    });
    res.json({
      connected: true,
      server: response.data?.MediaContainer?.friendlyName,
      url,
    });
  } catch {
    res.json({ connected: false });
  }
});

// Get all libraries
router.get('/libraries', async (req, res) => {
  const { url, token } = getPlexConfig();
  if (!url || !token) return res.status(401).json({ error: 'Not connected to Plex' });

  try {
    const response = await axios.get(`${url}/library/sections`, {
      headers: plexHeaders(token),
    });
    const sections = response.data?.MediaContainer?.Directory || [];
    const libraries = sections
      .filter((s) => ['movie', 'show'].includes(s.type))
      .map((s) => ({
        id: s.key,
        name: s.title,
        type: s.type,
        count: s.count,
        thumb: s.thumb ? `${url}${s.thumb}?X-Plex-Token=${token}` : null,
      }));
    res.json(libraries);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch libraries' });
  }
});

// Get items from a library
router.get('/libraries/:id/items', async (req, res) => {
  const { url, token } = getPlexConfig();
  if (!url || !token) return res.status(401).json({ error: 'Not connected to Plex' });

  const { genre, decade, limit = 200 } = req.query;

  try {
    let apiUrl = `${url}/library/sections/${req.params.id}/all`;
    const params = { 'X-Plex-Token': token, 'X-Plex-Container-Size': limit };
    if (genre) params['genre'] = genre;

    const response = await axios.get(apiUrl, { headers: plexHeaders(token), params });
    const items = (response.data?.MediaContainer?.Metadata || []).map((item) => ({
      id: item.ratingKey,
      title: item.title,
      year: item.year,
      duration: item.duration, // milliseconds
      thumb: item.thumb ? `${url}${item.thumb}?X-Plex-Token=${token}` : null,
      type: item.type,
      genres: item.Genre?.map((g) => g.tag) || [],
    }));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch library items' });
  }
});

// Get stream URL for a media item
router.get('/stream/:mediaId', async (req, res) => {
  const { url, token } = getPlexConfig();
  if (!url || !token) return res.status(401).json({ error: 'Not connected' });

  try {
    // Get media info to find the actual file part
    const response = await axios.get(`${url}/library/metadata/${req.params.mediaId}`, {
      headers: plexHeaders(token),
    });
    const metadata = response.data?.MediaContainer?.Metadata?.[0];
    const partKey = metadata?.Media?.[0]?.Part?.[0]?.key;

    if (!partKey) return res.status(404).json({ error: 'Media not found' });

    const streamUrl = `${url}${partKey}?X-Plex-Token=${token}`;
    res.json({ url: streamUrl, duration: metadata?.duration });
  } catch {
    res.status(500).json({ error: 'Failed to get stream URL' });
  }
});

// Get genres for a library
router.get('/libraries/:id/genres', async (req, res) => {
  const { url, token } = getPlexConfig();
  if (!url || !token) return res.status(401).json({ error: 'Not connected' });

  try {
    const response = await axios.get(`${url}/library/sections/${req.params.id}/genre`, {
      headers: plexHeaders(token),
    });
    const genres = (response.data?.MediaContainer?.Directory || []).map((g) => g.title);
    res.json(genres);
  } catch {
    res.json([]);
  }
});

module.exports = router;
