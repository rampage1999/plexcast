const { getDb } = require('../db');

module.exports = function m3uHandler(req, res) {
  const db = getDb();
  const channels = db.prepare('SELECT * FROM channels WHERE active = 1 ORDER BY number ASC').all();

  const baseUrl = `http://${req.headers.host || 'localhost:8989'}`;

  let m3u = '#EXTM3U x-tvg-url="' + baseUrl + '/epg.xml"\n\n';

  for (const ch of channels) {
    const logoUrl = ch.logo ? `${baseUrl}${ch.logo}` : `${baseUrl}/api/channels/${ch.id}/logo-default`;
    m3u += `#EXTINF:-1 tvg-id="ch${ch.number}" tvg-name="${ch.name}" tvg-logo="${logoUrl}" group-title="PlexCast",${ch.name}\n`;
    m3u += `${baseUrl}/api/stream/${ch.id}\n\n`;
  }

  res.setHeader('Content-Type', 'application/x-mpegurl');
  res.setHeader('Content-Disposition', 'inline; filename="plexcast.m3u"');
  res.send(m3u);
};
