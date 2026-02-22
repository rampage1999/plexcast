import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import styles from './ChannelForm.module.css';

const PLAYBACK_MODES = [
  { value: 'shuffle', label: '🔀 Shuffle', desc: 'Random order, always different' },
  { value: 'chronological', label: '📅 Oldest First', desc: 'Start from the beginning' },
  { value: 'reverse_chronological', label: '🆕 Newest First', desc: 'Most recent content first' },
  { value: 'alphabetical', label: '🔤 Alphabetical', desc: 'A to Z order' },
];

export default function EditChannel() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [libraries, setLibraries] = useState([]);
  const [genres, setGenres] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [form, setForm] = useState(null);

  useEffect(() => {
    Promise.all([api.getChannel(id), api.plexLibraries()]).then(([ch, libs]) => {
      setForm({
        number: ch.number,
        name: ch.name,
        library_id: ch.library_id,
        library_name: ch.library_name,
        playback_mode: ch.playback_mode,
        genre_filter: ch.genre_filter || '',
      });
      if (ch.logo) setLogoPreview(`http://localhost:8989${ch.logo}`);
      setLibraries(libs);
    });
  }, [id]);

  useEffect(() => {
    if (form?.library_id) {
      api.plexGenres(form.library_id).then(setGenres).catch(() => setGenres([]));
    }
  }, [form?.library_id]);

  function handleLogoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.updateChannel(id, { ...form, number: parseInt(form.number, 10) });
      if (logoFile) await api.uploadLogo(id, logoFile);
      navigate('/');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete channel ${form?.name}? This cannot be undone.`)) return;
    setDeleting(true);
    await api.deleteChannel(id);
    navigate('/channels');
  }

  if (!form) return <div style={{ padding: 32 }}><div className="spinner" /></div>;

  return (
    <div className={styles.page + ' animate-fade-up'}>
      <div className={styles.header}>
        <button className="btn-ghost" onClick={() => navigate(-1)}>← Back</button>
        <h1 className={styles.title}>Edit Channel</h1>
        <button className="btn-danger" onClick={handleDelete} disabled={deleting} style={{ marginLeft: 'auto' }}>
          {deleting ? 'Deleting…' : 'Delete Channel'}
        </button>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.grid}>
          <div className={styles.col}>
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Channel Info</h2>
              <div className={styles.row2}>
                <div className={styles.field}>
                  <label>Channel Number</label>
                  <input type="number" min="1" value={form.number}
                    onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} required />
                </div>
                <div className={styles.field} style={{ flex: 2 }}>
                  <label>Channel Name</label>
                  <input type="text" value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Plex Library</h2>
              <div className={styles.libraryGrid}>
                {libraries.map((lib) => (
                  <button key={lib.id} type="button"
                    className={`${styles.libCard} ${form.library_id === lib.id ? styles.libSelected : ''}`}
                    onClick={() => setForm((f) => ({ ...f, library_id: lib.id, library_name: lib.name }))}>
                    {lib.thumb && <img src={lib.thumb} alt="" className={styles.libThumb} />}
                    <div className={styles.libInfo}>
                      <div className={styles.libName}>{lib.name}</div>
                      <div className={styles.libMeta}>{lib.type} · {lib.count} items</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Playback Mode</h2>
              <div className={styles.modeGrid}>
                {PLAYBACK_MODES.map((m) => (
                  <button key={m.value} type="button"
                    className={`${styles.modeCard} ${form.playback_mode === m.value ? styles.modeSelected : ''}`}
                    onClick={() => setForm((f) => ({ ...f, playback_mode: m.value }))}>
                    <div className={styles.modeLabel}>{m.label}</div>
                    <div className={styles.modeDesc}>{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.col}>
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Channel Logo</h2>
              <label className={styles.logoDropzone} htmlFor="logo-input">
                {logoPreview
                  ? <img src={logoPreview} alt="Logo" className={styles.logoPreview} />
                  : <div className={styles.logoPlaceholder}><span>Click to upload logo</span></div>
                }
              </label>
              <input id="logo-input" type="file" accept="image/*" onChange={handleLogoChange} style={{ display: 'none' }} />
            </div>

            {genres.length > 0 && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Genre Filter</h2>
                <div className={styles.field}>
                  <select value={form.genre_filter} onChange={(e) => setForm((f) => ({ ...f, genre_filter: e.target.value }))}>
                    <option value="">All Genres</option>
                    {genres.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
