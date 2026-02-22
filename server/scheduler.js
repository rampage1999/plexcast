const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('./db');

const SCHEDULE_AHEAD_HOURS = 48; // Build 48 hours of schedule at a time

function getPlexConfig() {
  const db = getDb();
  const url = db.prepare('SELECT value FROM settings WHERE key = ?').get('plex_url');
  const token = db.prepare('SELECT value FROM settings WHERE key = ?').get('plex_token');
  return { url: url?.value, token: token?.value };
}

function plexHeaders(token) {
  return {
    'X-Plex-Token': token,
    Accept: 'application/json',
  };
}

async function fetchLibraryItems(libraryId, playbackMode, genreFilter) {
  const { url, token } = getPlexConfig();
  if (!url || !token) throw new Error('Plex not configured');

  const params = { 'X-Plex-Token': token, 'X-Plex-Container-Size': 500 };
  if (genreFilter) params['genre'] = genreFilter;

  const response = await axios.get(`${url}/library/sections/${libraryId}/all`, {
    headers: plexHeaders(token),
    params,
  });

  let metadata = response.data?.MediaContainer?.Metadata || [];

  // If the library contains shows rather than movies, fetch individual episodes instead.
  // Note: genre filtering is NOT supported by the Plex API at the episode level (type=4),
  // so we omit genre here and filter episodes by their parent show below.
  if (metadata.length > 0 && metadata[0].type === 'show') {
    const epRes = await axios.get(`${url}/library/sections/${libraryId}/all`, {
      headers: plexHeaders(token),
      params: { 'X-Plex-Token': token, 'X-Plex-Container-Size': 500, type: 4 },
    });
    metadata = epRes.data?.MediaContainer?.Metadata || [];
  }

  // If genre filter was applied and we fetched episodes, restrict to shows that matched genre
  let allowedShowKeys = null;
  if (genreFilter && metadata.length > 0 && metadata[0].type === 'episode') {
    // metadata currently holds episodes (type=4); the original show-level fetch
    // already filtered by genre — collect those show ratingKeys
    const showRes = await axios.get(`${url}/library/sections/${libraryId}/all`, {
      headers: plexHeaders(token),
      params: { 'X-Plex-Token': token, 'X-Plex-Container-Size': 500, genre: genreFilter },
    });
    const shows = showRes.data?.MediaContainer?.Metadata || [];
    allowedShowKeys = new Set(shows.map((s) => String(s.ratingKey)));
  }

  let items = metadata
    .filter((item) => {
      if (item.duration <= 0 || !item.Media?.[0]?.Part?.[0]) return false;
      if (allowedShowKeys && item.grandparentRatingKey) {
        return allowedShowKeys.has(String(item.grandparentRatingKey));
      }
      return true;
    })
    .map((item) => ({
      id: item.ratingKey,
      title: item.grandparentTitle
        ? `${item.grandparentTitle} - S${String(item.parentIndex).padStart(2,'0')}E${String(item.index).padStart(2,'0')} - ${item.title}`
        : item.title,
      year: item.year || item.parentYear,
      duration: Math.floor(item.duration / 1000), // convert ms to seconds
      thumb: item.thumb ? `${url}${item.thumb}?X-Plex-Token=${token}` : null,
    }));

  if (items.length === 0) return [];

  // Sort/shuffle based on playback mode
  switch (playbackMode) {
    case 'shuffle':
      items = shuffleArray(items);
      break;
    case 'chronological':
      items.sort((a, b) => (a.year || 0) - (b.year || 0));
      break;
    case 'reverse_chronological':
      items.sort((a, b) => (b.year || 0) - (a.year || 0));
      break;
    case 'alphabetical':
      items.sort((a, b) => a.title.localeCompare(b.title));
      break;
    default:
      items = shuffleArray(items);
  }

  return items;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function buildSchedule(channelId) {
  const db = getDb();
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
  if (!channel) return;

  const now = Math.floor(Date.now() / 1000);
  const scheduleEnd = now + SCHEDULE_AHEAD_HOURS * 3600;

  // Find where current schedule ends
  const lastEntry = db
    .prepare('SELECT MAX(end_time) as last FROM schedule WHERE channel_id = ?')
    .get(channelId);
  let cursor = Math.max(now, lastEntry?.last || now);

  if (cursor >= scheduleEnd) return; // Already scheduled ahead enough

  let items = await fetchLibraryItems(channel.library_id, channel.playback_mode, channel.genre_filter);
  if (items.length === 0) return;

  let itemIndex = 0;
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO schedule (id, channel_id, media_id, media_title, media_thumb, media_duration, start_time, end_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const entries = [];

  while (cursor < scheduleEnd) {
    if (itemIndex >= items.length) {
      items = await fetchLibraryItems(channel.library_id, channel.playback_mode, channel.genre_filter);
      itemIndex = 0;
      if (items.length === 0) break;
    }

    const item = items[itemIndex++];
    const duration = item.duration || 1800;

    entries.push({
      id: uuidv4(),
      channel_id: channelId,
      media_id: item.id,
      media_title: item.title,
      media_thumb: item.thumb,
      duration,
      start_time: cursor,
      end_time: cursor + duration,
    });

    cursor += duration;
  }

  // Insert all entries
  for (const entry of entries) {
    insertStmt.run([entry.id, entry.channel_id, entry.media_id, entry.media_title, entry.media_thumb, entry.duration, entry.start_time, entry.end_time]);
  }
  console.log(`Built schedule for channel ${channel.name}: ${entries.length} items`);
}

async function buildAllSchedules() {
  const db = getDb();
  const channels = db.prepare('SELECT id FROM channels WHERE active = 1').all();
  for (const ch of channels) {
    await buildSchedule(ch.id).catch((err) => console.error(`Schedule error for ${ch.id}:`, err));
  }
}

// Clean old schedule entries every hour
function startScheduleManager() {
  // Initial build
  buildAllSchedules();

  // Refresh every 6 hours
  setInterval(() => buildAllSchedules(), 6 * 60 * 60 * 1000);

  // Clean entries older than 2 hours every hour
  setInterval(() => {
    const db = getDb();
    const cutoff = Math.floor(Date.now() / 1000) - 7200;
    db.prepare('DELETE FROM schedule WHERE end_time < ?').run([cutoff]);
  }, 60 * 60 * 1000);
}

module.exports = { buildSchedule, buildAllSchedules, startScheduleManager };
