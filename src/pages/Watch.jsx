import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../api';
import styles from './Watch.module.css';

// Must match ffmpeg -profile:v high -level:v 4.0 + -c:a aac
const MSE_MIME = 'video/mp4; codecs="avc1.640028,mp4a.40.2"';

function ProgressBar({ startTime, endTime }) {
  const [info, setInfo] = useState({ pct: 0, elapsed: 0, total: 0 });

  useEffect(() => {
    function update() {
      const now = Date.now() / 1000;
      const total = endTime - startTime;
      const elapsed = now - startTime;
      setInfo({ pct: Math.min(100, Math.max(0, (elapsed / total) * 100)), elapsed: Math.max(0, elapsed), total });
    }
    update();
    const t = setInterval(update, 5000);
    return () => clearInterval(t);
  }, [startTime, endTime]);

  function fmt(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  return (
    <div className={styles.progressWrap}>
      <div className={styles.progressTrack}>
        <div className={styles.progressFill} style={{ width: `${info.pct}%` }} />
      </div>
      <div className={styles.progressTimes}>
        <span>{fmt(info.elapsed)}</span>
        <span>{fmt(info.total)}</span>
      </div>
    </div>
  );
}

export default function Watch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [channels, setChannels] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [volume, setVolume] = useState(1);
  const [loading, setLoading] = useState(true);
  const [reloadCount, setReloadCount] = useState(0);

  const videoRef = useRef(null);
  const objectUrlRef = useRef(null); // tracks current blob URL so we can revoke on next switch

  // Load channels on mount
  useEffect(() => {
    api.getChannels().then((data) => {
      setChannels(data);
      const paramId = searchParams.get('ch');
      const initial = data.find((c) => c.id === paramId) ? paramId : data[0]?.id;
      if (initial) setActiveId(initial);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // MSE + fetch streaming — avoids Chromium progressive-download connection closing
  useEffect(() => {
    if (!activeId || !videoRef.current) return;

    const video = videoRef.current;
    const controller = new AbortController();
    const ms = new MediaSource();
    const objectUrl = URL.createObjectURL(ms);

    // Revoke the previous blob URL now that we have a new one
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    objectUrlRef.current = objectUrl;

    let isActive = true;  // set false in cleanup to stop all callbacks
    video.src = objectUrl;

    ms.addEventListener('sourceopen', async () => {
      if (!isActive) return;
      if (!MediaSource.isTypeSupported(MSE_MIME)) {
        console.error('[mse] codec not supported:', MSE_MIME);
        return;
      }

      let sb;
      try {
        sb = ms.addSourceBuffer(MSE_MIME);
      } catch (e) {
        console.error('[mse] addSourceBuffer failed:', e.message);
        return;
      }

      const queue = [];
      let appending = false;

      // Never throws — guards against SourceBuffer being removed after cleanup
      function processQueue() {
        if (!isActive || appending || sb.updating || queue.length === 0) return;
        if (ms.readyState !== 'open') return;
        appending = true;
        try {
          sb.appendBuffer(queue.shift());
        } catch {
          appending = false;
        }
      }

      sb.addEventListener('updateend', () => {
        if (!isActive) return;
        appending = false;
        try {
          if (video.currentTime > 60 && sb.buffered.length > 0) {
            const trimTo = Math.max(0, video.currentTime - 60);
            if (trimTo > sb.buffered.start(0)) {
              sb.remove(sb.buffered.start(0), trimTo);
              return; // another updateend fires after remove
            }
          }
        } catch { /* SourceBuffer gone */ }
        if (video.paused && video.readyState >= 2) video.play().catch(() => {});
        processQueue();
      });

      try {
        const response = await fetch(api.webStreamUrl(activeId), { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const reader = response.body.getReader();

        while (isActive) {
          const { done, value } = await reader.read();
          if (done) {
            // Current show finished — reload after a moment to get next scheduled item
            setTimeout(() => { if (isActive) setReloadCount((c) => c + 1); }, 1500);
            if (ms.readyState === 'open') ms.endOfStream();
            break;
          }
          queue.push(value);
          processQueue();
        }
      } catch (err) {
        if (err.name !== 'AbortError') console.error('[mse] fetch error:', err.message);
      }
    }, { once: true });

    return () => {
      isActive = false;
      controller.abort();
      // Don't set video.src = '' here — it causes a browser race when switching
      // channels (old MediaSource teardown races the new src assignment).
      // The next effect will set video.src to the new objectUrl, detaching this
      // MediaSource cleanly. objectUrlRef revocation happens in the next effect.
    };
  }, [activeId, reloadCount]);

  // Sync volume to video element whenever it changes
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume]);

  // Poll now playing for active channel
  const refreshNowPlaying = useCallback(async () => {
    if (!activeId) return;
    try {
      const np = await api.getNowPlaying(activeId);
      setNowPlaying(np);
    } catch {}
  }, [activeId]);

  useEffect(() => {
    setNowPlaying(null);
    refreshNowPlaying();
    const t = setInterval(refreshNowPlaying, 30000);
    return () => clearInterval(t);
  }, [refreshNowPlaying]);

  function switchChannel(id) {
    if (id === activeId) return;
    setActiveId(id);
    setSearchParams({ ch: id }, { replace: true });
  }

  function toggleFullscreen() {
    if (!videoRef.current) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else videoRef.current.requestFullscreen();
  }

  const activeChannel = channels.find((c) => c.id === activeId);

  if (loading) {
    return <div className={styles.center}><div className="spinner" /></div>;
  }

  if (channels.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>📺</div>
        <h2>No channels yet</h2>
        <p>Create a channel first to start watching</p>
        <Link to="/channels/new" className="btn-primary">Create Channel</Link>
      </div>
    );
  }

  return (
    <div className={styles.page + ' animate-fade-up'}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <div className={styles.topLeft}>
          {activeChannel && (
            <>
              <span className={styles.chBadge}>CH {activeChannel.number}</span>
              <span className={styles.chName}>{activeChannel.name}</span>
            </>
          )}
        </div>
        <div className={styles.topControls}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={styles.volIcon}>
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
          <input
            type="range" min="0" max="1" step="0.05"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className={styles.volSlider}
          />
          <button className={styles.iconBtn} onClick={toggleFullscreen} title="Fullscreen">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main: video + channel list */}
      <div className={styles.main}>
        <div className={styles.videoWrap}>
          <video ref={videoRef} className={styles.video} playsInline autoPlay />
        </div>

        <div className={styles.channelList}>
          <div className={styles.channelListTitle}>Channels</div>
          {channels.map((ch) => (
            <button
              key={ch.id}
              className={`${styles.chItem} ${ch.id === activeId ? styles.chItemActive : ''}`}
              onClick={() => switchChannel(ch.id)}
            >
              <div className={styles.chItemHeader}>
                {ch.id === activeId && <span className="live-dot" style={{ width: 6, height: 6, marginRight: 6 }} />}
                <span className={styles.chNum}>CH {ch.number}</span>
              </div>
              <div className={styles.chItemName}>{ch.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Now playing strip */}
      <div className={styles.nowPlaying}>
        {nowPlaying?.media_thumb && (
          <img src={nowPlaying.media_thumb} alt="" className={styles.thumb} />
        )}
        <div className={styles.nowInfo}>
          <div className={styles.nowLabel}>
            <span className={styles.liveBadge}>
              <span className={styles.liveDotInner} />
              LIVE
            </span>
            <span className={styles.nowLabelText}>NOW PLAYING</span>
          </div>
          <div className={styles.nowTitle}>{nowPlaying?.media_title || 'Loading…'}</div>
          {nowPlaying && (
            <ProgressBar startTime={nowPlaying.start_time} endTime={nowPlaying.end_time} />
          )}
        </div>
      </div>
    </div>
  );
}
