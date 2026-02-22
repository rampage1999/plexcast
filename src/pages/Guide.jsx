import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import styles from './Guide.module.css';

const PX_PER_MIN = 5;          // pixels per minute of schedule
const GUIDE_BACK_MINS = 30;    // how far back from now to start the window
const GUIDE_TOTAL_MINS = 4.5 * 60; // total window width in minutes (4.5 hours)

function fmt(ts) {
  const d = new Date(ts * 1000);
  const h = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
  return `${h}:${m} ${ampm}`;
}

export default function Guide() {
  const [data, setData] = useState([]);    // [{ channel, schedule }]
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const scrollRef = useRef(null);
  const didScroll = useRef(false);

  // Round guide start down to the last 30-min boundary before (now - GUIDE_BACK_MINS)
  const guideStart = Math.floor((now - GUIDE_BACK_MINS * 60) / 1800) * 1800;
  const guideEnd = guideStart + GUIDE_TOTAL_MINS * 60;
  const totalWidth = GUIDE_TOTAL_MINS * PX_PER_MIN;

  const load = useCallback(async () => {
    try {
      const rows = await api.getGuide();
      setData(rows);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh now every minute
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60000);
    return () => clearInterval(t);
  }, []);

  // Auto-scroll to current time on first load
  useEffect(() => {
    if (!loading && scrollRef.current && !didScroll.current) {
      didScroll.current = true;
      scrollToNow(false);
    }
  }, [loading]);

  function scrollToNow(smooth = true) {
    if (!scrollRef.current) return;
    const nowPx = (now - guideStart) / 60 * PX_PER_MIN;
    scrollRef.current.scrollTo({
      left: Math.max(0, nowPx - 120),
      behavior: smooth ? 'smooth' : 'instant',
    });
  }

  // Build 30-min time slot headers
  const timeSlots = [];
  for (let t = guideStart; t < guideEnd; t += 1800) timeSlots.push(t);

  // Position helpers
  const tsToLeft = (ts) => (ts - guideStart) / 60 * PX_PER_MIN;
  const nowLeft = tsToLeft(now);

  if (loading) {
    return <div className={styles.center}><div className="spinner" /></div>;
  }

  if (data.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>📺</div>
        <h2>No channels</h2>
        <p>Create a channel first to see the guide</p>
        <Link to="/channels/new" className="btn-primary">Create Channel</Link>
      </div>
    );
  }

  return (
    <div className={styles.page + ' animate-fade-up'}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>TV Guide</h1>
          <p className={styles.sub}>What's on now and coming up</p>
        </div>
        <button className="btn-secondary" onClick={() => scrollToNow()}>Jump to Now</button>
      </div>

      <div className={styles.guideOuter}>
        {/* Fixed channel-name column */}
        <div className={styles.channelCol}>
          <div className={styles.cornerCell} />
          {data.map(({ channel }) => (
            <Link
              key={channel.id}
              to={`/watch?ch=${channel.id}`}
              className={styles.chCell}
              title={`Watch ${channel.name}`}
            >
              {channel.logo
                ? <img src={channel.logo} alt="" className={styles.chLogo} />
                : <span className={styles.chNum}>CH {channel.number}</span>
              }
              <span className={styles.chName}>{channel.name}</span>
            </Link>
          ))}
        </div>

        {/* Scrollable timeline */}
        <div className={styles.scrollArea} ref={scrollRef}>
          <div style={{ width: totalWidth, position: 'relative', minWidth: totalWidth }}>

            {/* Time header row */}
            <div className={styles.timeHeader}>
              {timeSlots.map((ts) => (
                <div
                  key={ts}
                  className={styles.timeSlot}
                  style={{ left: tsToLeft(ts), width: 1800 / 60 * PX_PER_MIN }}
                >
                  {fmt(ts)}
                </div>
              ))}
            </div>

            {/* Show rows */}
            {data.map(({ channel, schedule }) => (
              <div key={channel.id} className={styles.showRow}>
                {schedule.map((item) => {
                  const left = Math.max(0, tsToLeft(item.start_time));
                  const right = Math.min(totalWidth, tsToLeft(item.end_time));
                  const width = right - left;
                  if (width < 2) return null;
                  const isNow = item.start_time <= now && item.end_time > now;
                  const truncatedLeft = item.start_time < guideStart; // started before guide window
                  return (
                    <Link
                      key={item.id}
                      to={`/watch?ch=${channel.id}`}
                      className={`${styles.showBlock} ${isNow ? styles.showNow : ''} ${truncatedLeft ? styles.truncLeft : ''}`}
                      style={{ left, width: width - 2 }}
                      title={item.media_title}
                    >
                      <span className={styles.showTitle}>{item.media_title}</span>
                      {isNow && <span className={styles.liveDot}><span className="live-dot" style={{ width: 5, height: 5 }} /></span>}
                    </Link>
                  );
                })}
              </div>
            ))}

            {/* Current-time indicator — spans full height */}
            <div className={styles.nowBar} style={{ left: nowLeft }} />
          </div>
        </div>
      </div>
    </div>
  );
}
