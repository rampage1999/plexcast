const express = require('express');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const { getDb } = require('../db');
const { buildSchedule } = require('../scheduler');

const router = express.Router();

// Use system ffmpeg; in packaged Electron app this will be overridden via electron/main.js
if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}

// Cache partKey lookups so repeated client reconnects don't hammer the Plex API
const partKeyCache = new Map(); // media_id → { partKey, expires }
const PART_KEY_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getPartKey(mediaId, plexUrl, token) {
  const cached = partKeyCache.get(mediaId);
  if (cached && cached.expires > Date.now()) return cached.partKey;

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const metaRes = await axios.get(`${plexUrl}/library/metadata/${mediaId}`, {
        headers: { 'X-Plex-Token': token, Accept: 'application/json' },
        timeout: 12000,
      });
      const partKey = metaRes.data?.MediaContainer?.Metadata?.[0]?.Media?.[0]?.Part?.[0]?.key;
      if (partKey) {
        partKeyCache.set(mediaId, { partKey, expires: Date.now() + PART_KEY_TTL_MS });
        return partKey;
      }
      return null;
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await new Promise(r => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}

function getPlexConfig() {
  const db = getDb();
  const url = db.prepare('SELECT value FROM settings WHERE key = ?').get('plex_url');
  const token = db.prepare('SELECT value FROM settings WHERE key = ?').get('plex_token');
  return { url: url?.value, token: token?.value };
}

// Debug endpoint — returns diagnostic info without streaming
router.get('/:channelId/debug', async (req, res) => {
  const db = getDb();
  const { channelId } = req.params;
  const now = Math.floor(Date.now() / 1000);
  const result = { channelId, now, steps: {} };

  // 1. Schedule lookup
  const item = db.prepare(`
    SELECT * FROM schedule
    WHERE channel_id = ? AND start_time <= ? AND end_time > ?
    LIMIT 1
  `).get(channelId, now, now);
  result.steps.schedule = item
    ? { ok: true, title: item.media_title, media_id: item.media_id, elapsed: now - item.start_time }
    : { ok: false, error: 'No current schedule item found' };

  if (!item) return res.json(result);

  // 2. Plex config
  const { url, token } = getPlexConfig();
  result.steps.plexConfig = (url && token)
    ? { ok: true, url }
    : { ok: false, error: 'Plex URL or token missing' };

  if (!url || !token) return res.json(result);

  // 3. Plex metadata fetch
  try {
    const metaRes = await axios.get(`${url}/library/metadata/${item.media_id}`, {
      headers: { 'X-Plex-Token': token, Accept: 'application/json' },
      timeout: 8000,
    });
    const media = metaRes.data?.MediaContainer?.Metadata?.[0]?.Media?.[0];
    const part = media?.Part?.[0];
    const streams = part?.Stream || [];
    const videoStream = streams.find(s => s.streamType === 1);
    const audioStreams = streams.filter(s => s.streamType === 2);
    result.steps.plexMeta = part
      ? {
          ok: true,
          partKey: part.key,
          file: part.file,
          size: part.size,
          container: media.container,
          video: videoStream ? {
            codec: videoStream.codec,
            profile: videoStream.profile,
            bitDepth: videoStream.bitDepth,
            width: videoStream.width,
            height: videoStream.height,
            frameRate: videoStream.frameRate,
            scanType: videoStream.scanType,
          } : null,
          audio: audioStreams.map(s => ({
            codec: s.codec,
            channels: s.channels,
            language: s.languageTag,
          })),
        }
      : { ok: false, error: 'No media part in Plex response', raw: metaRes.data?.MediaContainer?.Metadata?.[0] };
  } catch (err) {
    result.steps.plexMeta = { ok: false, error: err.message };
  }

  // 4. ffmpeg availability
  const ffmpegPath = ffmpeg.path || 'from PATH';
  result.steps.ffmpeg = { path: ffmpegPath };

  return res.json(result);
});

// Web player stream — fragmented MP4 for native Electron/browser <video> playback
router.get('/web/:channelId', async (req, res) => {
  const db = getDb();
  const { channelId } = req.params;
  const now = Math.floor(Date.now() / 1000);

  let item = db.prepare(`
    SELECT * FROM schedule
    WHERE channel_id = ? AND start_time <= ? AND end_time > ?
    LIMIT 1
  `).get(channelId, now, now);

  if (!item) {
    await buildSchedule(channelId).catch(() => {});
    const retryNow = Math.floor(Date.now() / 1000);
    item = db.prepare(`
      SELECT * FROM schedule
      WHERE channel_id = ? AND start_time <= ? AND end_time > ?
      LIMIT 1
    `).get(channelId, retryNow, retryNow);
    if (!item) return res.status(503).json({ error: 'Channel schedule not ready. Try again in a moment.' });
  }

  const { url, token } = getPlexConfig();
  if (!url || !token) return res.status(503).json({ error: 'Plex not connected' });

  try {
    const partKey = await getPartKey(item.media_id, url, token);
    if (!partKey) return res.status(404).json({ error: 'Media part not found in Plex' });

    const elapsedSeconds = Math.max(0, now - item.start_time);
    const streamUrl = `${url}${partKey}?X-Plex-Token=${token}`;

    console.log(`[webstream] CH${channelId} → ${item.media_title} @ +${elapsedSeconds}s`);

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    // Prevent the browser from pipelining the next channel's request onto this
    // same TCP connection — otherwise aborting CH1 can fire req 'close' on CH2.
    res.setHeader('Connection', 'close');

    const proc = ffmpeg(streamUrl)
      .inputOptions([
        `-ss ${elapsedSeconds}`,
        '-re',
        '-fflags +discardcorrupt',
      ])
      .outputOptions([
        // Explicitly select first video + audio only (avoids extra/subtitle streams)
        // '?' makes audio optional so files with no audio track don't abort
        '-map 0:v:0', '-map 0:a:0?',
        // Full transcode: shared encoder clock eliminates A/V drift
        // Force High Profile Level 4.0 so client codec string is deterministic
        // -pix_fmt yuv420p: force 8-bit output — 10-bit sources (Hi10P, HDR) render black in MSE
        // -g 48: keyframe every 48 frames (~2 s) so MSE fragments flow within 2 s of startup
        '-c:v libx264', '-preset ultrafast', '-tune zerolatency', '-crf 23',
        '-profile:v high', '-level:v 4.0', '-pix_fmt yuv420p', '-g 48',
        '-c:a aac', '-ac 2', '-b:a 192k',
        '-f mp4',
        '-movflags frag_keyframe+empty_moov+default_base_moof',
      ])
      .on('start', (cmd) => console.log('[webstream] ffmpeg start:', cmd))
      .on('error', (err, stdout, stderr) => {
        console.error('[webstream] ffmpeg error:', err.message);
        if (stderr) console.error('[webstream] stderr:', stderr.slice(-500));
        if (!res.headersSent) res.status(500).end();
        else res.end();
      });

    proc.pipe(res, { end: true });
    // Use res 'close' (fires when client disconnects before response ends)
    // rather than req 'close', which can misfire during keep-alive reuse.
    res.on('close', () => proc.kill('SIGKILL'));
  } catch (err) {
    console.error('[webstream] error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Stream failed: ' + err.message });
  }
});

// Stream a channel — seeks to the correct live position via ffmpeg
router.get('/:channelId', async (req, res) => {
  const db = getDb();
  const { channelId } = req.params;
  const now = Math.floor(Date.now() / 1000);

  let item = db.prepare(`
    SELECT * FROM schedule
    WHERE channel_id = ? AND start_time <= ? AND end_time > ?
    LIMIT 1
  `).get(channelId, now, now);

  if (!item) {
    await buildSchedule(channelId).catch(() => {});
    const retryNow = Math.floor(Date.now() / 1000);
    item = db.prepare(`
      SELECT * FROM schedule
      WHERE channel_id = ? AND start_time <= ? AND end_time > ?
      LIMIT 1
    `).get(channelId, retryNow, retryNow);
    if (!item) return res.status(503).json({ error: 'Channel schedule not ready. Try again in a moment.' });
  }

  const { url, token } = getPlexConfig();
  if (!url || !token) return res.status(503).json({ error: 'Plex not connected' });

  try {
    const partKey = await getPartKey(item.media_id, url, token);
    if (!partKey) return res.status(404).json({ error: 'Media part not found in Plex' });

    const elapsedSeconds = Math.max(0, now - item.start_time);
    const streamUrl = `${url}${partKey}?X-Plex-Token=${token}`;

    console.log(`[stream] CH${channelId} → ${item.media_title} @ +${elapsedSeconds}s`);

    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.setHeader('Transfer-Encoding', 'chunked');

    const proc = ffmpeg(streamUrl)
      .inputOptions([
        `-ss ${elapsedSeconds}`,       // seek before input (fast byte-range seek)
        '-re',                         // read input at native playback speed (1×) — prevents buffer flooding
        '-fflags +discardcorrupt',
      ])
      .outputOptions([
        '-c:v copy',                   // copy video stream — no re-encode
        '-c:a aac',                    // re-encode audio for MPEG-TS compat
        '-b:a 192k',
        '-f mpegts',                   // MPEG-TS container for live streaming
        '-avoid_negative_ts make_zero',
        '-muxdelay 0',
      ])
      .on('start', (cmd) => console.log('[ffmpeg] start:', cmd))
      .on('error', (err, stdout, stderr) => {
        console.error('[ffmpeg] error:', err.message);
        if (stderr) console.error('[ffmpeg] stderr:', stderr.slice(-500));
        if (!res.headersSent) res.status(500).end();
        else res.end();
      });

    proc.pipe(res, { end: true });

    req.on('close', () => {
      proc.kill('SIGKILL');
    });
  } catch (err) {
    console.error('[stream] error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Stream failed: ' + err.message });
  }
});

module.exports = router;
