const BASE = typeof window !== 'undefined' && window.api?.baseUrl
  ? window.api.baseUrl
  : 'http://localhost:8989';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

export const api = {
  // Plex
  plexConnect: (url, token) =>
    request('/api/plex/connect', { method: 'POST', body: JSON.stringify({ url, token }) }),
  plexStatus: () => request('/api/plex/status'),
  plexLibraries: () => request('/api/plex/libraries'),
  plexLibraryItems: (id, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/plex/libraries/${id}/items${qs ? '?' + qs : ''}`);
  },
  plexGenres: (id) => request(`/api/plex/libraries/${id}/genres`),
  plexStream: (mediaId) => request(`/api/plex/stream/${mediaId}`),

  // Channels
  getChannels: () => request('/api/channels'),
  getChannel: (id) => request(`/api/channels/${id}`),
  createChannel: (data) =>
    request('/api/channels', { method: 'POST', body: JSON.stringify(data) }),
  updateChannel: (id, data) =>
    request(`/api/channels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteChannel: (id) => request(`/api/channels/${id}`, { method: 'DELETE' }),
  uploadLogo: async (channelId, file) => {
    const form = new FormData();
    form.append('logo', file);
    const res = await fetch(`${BASE}/api/channels/${channelId}/logo`, {
      method: 'POST',
      body: form,
    });
    return res.json();
  },
  getChannelSchedule: (id) => request(`/api/channels/${id}/schedule`),
  getGuide: () => request('/api/channels/guide/all'),
  getNowPlaying: (id) => request(`/api/channels/${id}/now`),

  // URLs
  streamUrl: (channelId) => `${BASE}/api/stream/${channelId}`,
  webStreamUrl: (channelId) => `${BASE}/api/stream/web/${channelId}`,
  m3uUrl: () => `${BASE}/channels.m3u`,
  epgUrl: () => `${BASE}/epg.xml`,

  // Settings
  getSettings: () => request('/api/settings'),
  saveSettings: (data) =>
    request('/api/settings', { method: 'PUT', body: JSON.stringify(data) }),
};
