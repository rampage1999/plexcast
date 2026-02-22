const { getDb } = require('../db');
const { create } = require('xmlbuilder2');

module.exports = function epgHandler(req, res) {
  const db = getDb();
  const channels = db.prepare('SELECT * FROM channels WHERE active = 1 ORDER BY number ASC').all();
  const baseUrl = `http://${req.headers.host || 'localhost:8989'}`;

  const now = Math.floor(Date.now() / 1000);
  const end = now + 24 * 3600; // 24 hours ahead

  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('tv', { 'source-info-name': 'PlexCast', 'generator-info-name': 'PlexCast' });

  for (const ch of channels) {
    const logoUrl = ch.logo ? `${baseUrl}${ch.logo}` : null;
    const chNode = root.ele('channel', { id: `ch${ch.number}` });
    chNode.ele('display-name').txt(ch.name);
    if (logoUrl) chNode.ele('icon', { src: logoUrl });
  }

  for (const ch of channels) {
    const schedule = db.prepare(`
      SELECT * FROM schedule
      WHERE channel_id = ? AND end_time > ? AND start_time < ?
      ORDER BY start_time ASC
    `).all(ch.id, now - 3600, end);

    for (const item of schedule) {
      const start = formatXmltvTime(item.start_time);
      const stop = formatXmltvTime(item.end_time);

      const prog = root.ele('programme', {
        start,
        stop,
        channel: `ch${ch.number}`,
      });
      prog.ele('title', { lang: 'en' }).txt(item.media_title || 'Unknown');
      if (item.media_thumb) {
        prog.ele('icon', { src: item.media_thumb });
      }
    }
  }

  const xml = root.end({ prettyPrint: false });

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.send(xml);
};

function formatXmltvTime(unixTimestamp) {
  const d = new Date(unixTimestamp * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    ' +0000'
  );
}
