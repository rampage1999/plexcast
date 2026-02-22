import React from 'react';
import styles from './TitleBar.module.css';

export default function TitleBar({ minimal = false }) {
  const isElectron = typeof window !== 'undefined' && window.electron;

  return (
    <div className={`${styles.bar} ${minimal ? styles.minimal : ''}`} data-electron-drag>
      <div className={styles.left}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={styles.logo}>
          <rect x="2" y="3" width="8" height="6" rx="1.5" fill="var(--accent)" />
          <rect x="12" y="3" width="10" height="6" rx="1.5" fill="var(--accent)" opacity="0.6" />
          <rect x="2" y="11" width="14" height="6" rx="1.5" fill="var(--accent)" opacity="0.8" />
          <rect x="18" y="11" width="4" height="6" rx="1.5" fill="var(--accent)" opacity="0.4" />
          <rect x="2" y="19" width="6" height="2" rx="1" fill="var(--accent)" opacity="0.5" />
          <rect x="10" y="19" width="12" height="2" rx="1" fill="var(--accent)" opacity="0.3" />
        </svg>
        <span className={styles.title}>PLEXCAST</span>
        {!minimal && <span className={styles.badge}>LIVE</span>}
      </div>

      {isElectron && (
        <div className={styles.controls}>
          <button className={styles.ctrl} onClick={() => window.electron.minimize()} title="Minimize">
            <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor" /></svg>
          </button>
          <button className={styles.ctrl} onClick={() => window.electron.maximize()} title="Maximize">
            <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
          </button>
          <button className={`${styles.ctrl} ${styles.closeBtn}`} onClick={() => window.electron.close()} title="Close to tray">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5" />
              <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
