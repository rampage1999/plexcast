import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import styles from './Dashboard.module.css';

function ProgressBar({ startTime, endTime }) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    function update() {
      const now = Date.now() / 1000;
      const total = endTime - startTime;
      const elapsed = now - startTime;
      setPct(Math.min(100, Math.max(0, (elapsed / total) * 100)));
    }
    update();
    const t = setInterval(update, 5000);
    return () => clearInterval(t);
  }, [startTime, endTime]);

  return (
    <div className={styles.progressTrack}>
      <div className={styles.progressFill} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ChannelCard({ channel }) {
  const [nowPlaying, setNowPlaying] = useState(null);
  const [upNext, setUpNext] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [now, schedule] = await Promise.all([
          api.getNowPlaying(channel.id),
          api.getChannelSchedule(channel.id),
        ]);
        setNowPlaying(now);
        if (schedule.length > 1) setUpNext(schedule[1]);
      } catch {}
    }
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [channel.id]);

  const logoSrc = nowPlaying?.media_thumb || null;

  return (
    <div className={styles.channelCard}>
      <div className={styles.channelHeader}>
        <div className={styles.channelNum}>CH {channel.number}</div>
        <div className={styles.channelName}>{channel.name}</div>
        <Link to={`/watch?ch=${channel.id}`} className={styles.watchBtn} title="Watch">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polygon points="10 8 16 12 10 16 10 8" />
          </svg>
        </Link>
        <Link to={`/channels/${channel.id}/edit`} className={styles.editBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </Link>
      </div>

      <div className={styles.nowPlaying}>
        {logoSrc && <img src={logoSrc} alt="" className={styles.thumb} />}
        <div className={styles.nowInfo}>
          <div className={styles.nowLabel}>
            <span className="live-dot" />
            NOW PLAYING
          </div>
          <div className={styles.nowTitle}>{nowPlaying?.media_title || 'Loading…'}</div>
          {nowPlaying && (
            <ProgressBar startTime={nowPlaying.start_time} endTime={nowPlaying.end_time} />
          )}
        </div>
      </div>

      {upNext && (
        <div className={styles.upNext}>
          <span className={styles.upNextLabel}>Up next:</span>
          <span className={styles.upNextTitle}>{upNext.media_title}</span>
        </div>
      )}

      {channel.logo && (
        <img src={channel.logo} alt="" className={styles.channelLogo} />
      )}
    </div>
  );
}

export default function Dashboard() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.getChannels();
      setChannels(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className={styles.center}>
        <div className="spinner" />
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>📺</div>
        <h2>No channels yet</h2>
        <p>Create your first channel from your Plex library</p>
        <Link to="/channels/new" className="btn-primary">Create First Channel</Link>
      </div>
    );
  }

  return (
    <div className={styles.page + ' animate-fade-up'}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Live Channels</h1>
          <p className={styles.sub}>{channels.length} channel{channels.length !== 1 ? 's' : ''} broadcasting</p>
        </div>
        <Link to="/channels/new" className="btn-primary">+ New Channel</Link>
      </div>

      <div className={styles.grid}>
        {channels.map((ch) => (
          <ChannelCard key={ch.id} channel={ch} />
        ))}
      </div>
    </div>
  );
}
