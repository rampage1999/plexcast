import React, { useState } from 'react';
import { api } from '../api';
import styles from './Links.module.css';

function CopyField({ label, value, hint }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={styles.field}>
      <div className={styles.fieldLabel}>{label}</div>
      <div className={styles.fieldRow}>
        <code className={styles.url}>{value}</code>
        <button className={`btn-primary ${copied ? styles.copied : ''}`} onClick={copy}>
          {copied ? '✓ Copied!' : 'Copy'}
        </button>
      </div>
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}

export default function Links() {
  const m3u = api.m3uUrl();
  const epg = api.epgUrl();

  return (
    <div className={styles.page + ' animate-fade-up'}>
      <h1 className={styles.title}>My URLs</h1>
      <p className={styles.sub}>
        Add these URLs to any IPTV app to watch your channels. Works with TiviMate, Kodi, VLC, and more.
      </p>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Playlist & Guide</h2>
        <CopyField
          label="M3U Playlist"
          value={m3u}
          hint="Add this as your playlist URL in TiviMate, Kodi, or any IPTV app"
        />
        <CopyField
          label="EPG (Program Guide)"
          value={epg}
          hint="Add this as your EPG/XMLTV source to see show names and times"
        />
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>How to set up TiviMate</h2>
        <ol className={styles.steps}>
          <li>Open TiviMate on your Android TV or phone</li>
          <li>Go to <strong>Settings → Playlists → Add playlist</strong></li>
          <li>Paste the M3U URL above and tap <strong>Next</strong></li>
          <li>When asked for EPG, paste the EPG URL above</li>
          <li>Your PlexCast channels will appear in the TV guide</li>
        </ol>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>How to set up Kodi / IPTV Simple</h2>
        <ol className={styles.steps}>
          <li>Install the <strong>IPTV Simple Client</strong> add-on</li>
          <li>Go to its settings and paste the M3U URL</li>
          <li>Add the EPG URL in the EPG settings tab</li>
          <li>Restart Kodi — your channels will be in Live TV</li>
        </ol>
      </div>

      <div className={styles.note}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p>
          Your Windows PC must be on and PlexCast must be running for channels to work. 
          The IPTV app and your PC must be on the same local network, or you can set up port forwarding for remote access.
        </p>
      </div>
    </div>
  );
}
