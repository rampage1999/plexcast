import React, { useState } from 'react';
import { api } from '../api';
import styles from './Setup.module.css';

export default function Setup({ onConnected }) {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleConnect(e) {
    e.preventDefault();
    if (!url || !token) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.plexConnect(url.trim(), token.trim());
      if (result.success) onConnected();
    } catch (err) {
      setError(err.message || 'Could not connect. Check your URL and token.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.glow} />
      <div className={styles.card + ' animate-fade-up'}>
        <div className={styles.logoWrap}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="3" width="8" height="6" rx="1.5" fill="var(--accent)" />
            <rect x="12" y="3" width="10" height="6" rx="1.5" fill="var(--accent)" opacity="0.6" />
            <rect x="2" y="11" width="14" height="6" rx="1.5" fill="var(--accent)" opacity="0.8" />
            <rect x="18" y="11" width="4" height="6" rx="1.5" fill="var(--accent)" opacity="0.4" />
            <rect x="2" y="19" width="6" height="2" rx="1" fill="var(--accent)" opacity="0.5" />
            <rect x="10" y="19" width="12" height="2" rx="1" fill="var(--accent)" opacity="0.3" />
          </svg>
        </div>

        <h1 className={styles.heading}>Connect to Plex</h1>
        <p className={styles.sub}>
          Enter your Plex server address and token to get started. Your data stays on your machine.
        </p>

        <form onSubmit={handleConnect} className={styles.form}>
          <div className={styles.field}>
            <label>Plex Server URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://192.168.1.100:32400"
              autoFocus
            />
            <span className={styles.hint}>Your local Plex server address and port</span>
          </div>

          <div className={styles.field}>
            <label>Plex Token</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="••••••••••••••••••••"
            />
            <span className={styles.hint}>
              Find it in Plex Web → Settings → Account → XML TV Token, or check{' '}
              <a
                href="https://support.plex.tv/articles/204059436"
                target="_blank"
                rel="noreferrer"
                className={styles.link}
              >
                this guide
              </a>
            </span>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading || !url || !token}>
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="spinner" style={{ width: 14, height: 14 }} /> Connecting…
              </span>
            ) : (
              'Connect to Plex →'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
