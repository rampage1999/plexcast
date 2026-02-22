import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname),
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8989',
      '/uploads': 'http://localhost:8989',
      '/channels.m3u': 'http://localhost:8989',
      '/epg.xml': 'http://localhost:8989',
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
});
