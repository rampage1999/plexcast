import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import styles from './Channels.module.css';

export default function Channels() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getChannels().then(setChannels).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 32 }}><div className="spinner" /></div>;

  return (
    <div className={styles.page + ' animate-fade-up'}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>My Channels</h1>
          <p className={styles.sub}>Manage your TV channels</p>
        </div>
        <Link to="/channels/new" className="btn-primary">+ New Channel</Link>
      </div>

      {channels.length === 0 ? (
        <div className={styles.empty}>
          <p>No channels yet. Create one to get started!</p>
          <Link to="/channels/new" className="btn-primary" style={{ marginTop: 12 }}>Create Channel</Link>
        </div>
      ) : (
        <div className={styles.list}>
          {channels.map((ch) => (
            <div key={ch.id} className={styles.row}>
              <div className={styles.num}>CH {ch.number}</div>
              {ch.logo && <img src={`http://localhost:8989${ch.logo}`} alt="" className={styles.logo} />}
              <div className={styles.info}>
                <div className={styles.name}>{ch.name}</div>
                <div className={styles.meta}>{ch.library_name} · {ch.playback_mode}</div>
              </div>
              <div className={styles.rowActions}>
                <Link to={`/channels/${ch.id}/edit`} className="btn-ghost">Edit</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
