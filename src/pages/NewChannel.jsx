import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import styles from './ChannelForm.module.css';

const PLAYBACK_MODES = [
  { value: 'shuffle', label: '🔀 Shuffle', desc: 'Random order, always different' },
  { value: 'chronological', label: '📅 Oldest First', desc: 'Start from the beginning' },
  { value: 'reverse_chronological', label: '🆕 Newest First', desc: 'Most recent content first' },
  { value: 'alphabetical', label: '🔤 Alphabetical', desc: 'A to Z order' },
];

export default function NewChannel() {
  const navigate = useNavigate();
  const [libraries, setLibraries] = useState([]);
  const [genres, setGenres] = useState([]);
  const [loadingLibraries, setLoadingLibraries] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    number: '',
    name: '',
    library_id: '',
    library_name: '',
    playback_mode: 'shuffle',
    genre_filter: '',
    decade_filter: '',
  });

  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);

  useEffect(() => {
    api.plexLibraries().then(setLibraries).finally(() => setLoadingLibraries(false));
    // Suggest next channel number
    api.getChannels().then((chs) => {
      const nums = chs.map((c) => c.number);
      let next = 1;
      while (nums.includes(next)) next++;
      setForm((f) => ({ ...f, number: next }));
    });
  }, []);

  useEffect(() => {
    if (form.library_id) {
      api.plexGenres(form.library_id).then(setGenres).catch(() => setGenres([]));
    }
  }, [form.library_id]);

  function handleLibraryChange(e) {
    const lib = libraries.find((l) => l.id === e.target.value);
    setForm((f) => ({ ...f, library_id: e.target.value, library_name: lib?.name || '', genre_filter: '' }));
  }

  function handleLogoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.library_id) return setError('Please select a library');
    setSaving(true);
    setError('');

    try {
      const channel = await api.createChannel({
        ...form,
        number: parseInt(form.number, 10),
      });

      // Upload logo if selected
      if (logoFile && channel.id) {
        await api.uploadLogo(channel.id, logoFile);
      }

      navigate('/');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  const decades = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];

  return (
    <div className={styles.page + ' animate-fade-up'}>
      <div className={styles.header}>
        <button className="btn-ghost" onClick={() => navigate(-1)}>← Back</button>
        <h1 className={styles.title}>New Channel</h1>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.grid}>
          {/* Left column */}
          <div className={styles.col}>
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Channel Info</h2>

              <div className={styles.row2}>
                <div className={styles.field}>
                  <label>Channel Number</label>
                  <input
                    type="number"
                    min="1"
                    max="9999"
                    value={form.number}
                    onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                    required
                  />
                </div>
                <div className={styles.field} style={{ flex: 2 }}>
                  <label>Channel Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. 80s Movies, Sci-Fi Channel"
                    required
                  />
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Plex Library</h2>
              {loadingLibraries ? (
                <div className={styles.loadingLibs}><div className="spinner" /> Loading libraries…</div>
              ) : (
                <div className={styles.libraryGrid}>
                  {libraries.map((lib) => (
                    <button
                      key={lib.id}
                      type="button"
                      className={`${styles.libCard} ${form.library_id === lib.id ? styles.libSelected : ''}`}
                      onClick={() => handleLibraryChange({ target: { value: lib.id } })}
                    >
                      {lib.thumb && <img src={lib.thumb} alt="" className={styles.libThumb} />}
                      <div className={styles.libInfo}>
                        <div className={styles.libName}>{lib.name}</div>
                        <div className={styles.libMeta}>{lib.type} · {lib.count} items</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Playback Mode</h2>
              <div className={styles.modeGrid}>
                {PLAYBACK_MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    className={`${styles.modeCard} ${form.playback_mode === m.value ? styles.modeSelected : ''}`}
                    onClick={() => setForm((f) => ({ ...f, playback_mode: m.value }))}
                  >
                    <div className={styles.modeLabel}>{m.label}</div>
                    <div className={styles.modeDesc}>{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className={styles.col}>
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Channel Logo</h2>
              <label className={styles.logoDropzone} htmlFor="logo-input">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo preview" className={styles.logoPreview} />
                ) : (
                  <div className={styles.logoPlaceholder}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span>Click to upload logo</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>PNG, JPG · Max 5MB</span>
                  </div>
                )}
              </label>
              <input id="logo-input" type="file" accept="image/*" onChange={handleLogoChange} style={{ display: 'none' }} />
              {logoPreview && (
                <button type="button" className="btn-ghost" style={{ marginTop: 8, fontSize: 12 }}
                  onClick={() => { setLogoFile(null); setLogoPreview(null); }}>
                  Remove logo
                </button>
              )}
            </div>

            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Filters (Optional)</h2>

              {genres.length > 0 && (
                <div className={styles.field}>
                  <label>Genre Filter</label>
                  <select value={form.genre_filter} onChange={(e) => setForm((f) => ({ ...f, genre_filter: e.target.value }))}>
                    <option value="">All Genres</option>
                    {genres.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Preview</h2>
              <div className={styles.preview}>
                <div className={styles.previewNum}>CH {form.number || '?'}</div>
                <div className={styles.previewName}>{form.name || 'Channel Name'}</div>
                <div className={styles.previewLib}>{form.library_name || 'No library selected'}</div>
                <div className={styles.previewMode}>
                  {PLAYBACK_MODES.find((m) => m.value === form.playback_mode)?.label}
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="spinner" style={{ width: 14, height: 14 }} /> Creating channel…
              </span>
            ) : 'Create Channel ✓'}
          </button>
        </div>
      </form>
    </div>
  );
}
