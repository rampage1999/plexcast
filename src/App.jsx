import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Channels from './pages/Channels';
import NewChannel from './pages/NewChannel';
import EditChannel from './pages/EditChannel';
import Setup from './pages/Setup';
import Links from './pages/Links';
import Watch from './pages/Watch';
import Guide from './pages/Guide';
import { api } from './api';
import styles from './App.module.css';

export default function App() {
  const [plexConnected, setPlexConnected] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api.plexStatus()
      .then((s) => setPlexConnected(s.connected))
      .catch(() => setPlexConnected(false))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className={styles.loading}>
        <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        <p>Starting PlexCast…</p>
      </div>
    );
  }

  if (!plexConnected) {
    return (
      <div className={styles.app}>
        <TitleBar minimal />
        <Setup onConnected={() => setPlexConnected(true)} />
      </div>
    );
  }

  return (
    <div className={styles.app}>
      <TitleBar />
      <div className={styles.layout}>
        <Sidebar />
        <main className={styles.main}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/channels" element={<Channels />} />
            <Route path="/channels/new" element={<NewChannel />} />
            <Route path="/channels/:id/edit" element={<EditChannel />} />
            <Route path="/links" element={<Links />} />
            <Route path="/watch" element={<Watch />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
