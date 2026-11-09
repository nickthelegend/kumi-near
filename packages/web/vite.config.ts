import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Kumi server (chat, sign-in, relayer) runs on 15196; the web app proxies to it.
const server = process.env.KUMI_SERVER_URL ?? 'http://127.0.0.1:15196';
export default defineConfig({
  plugins: [react()],
  define: { global: 'globalThis' },
  server: { port: 5196, proxy: { '/api': server, '/ws': { target: server.replace('http', 'ws'), ws: true } } },
  preview: { port: 5196, proxy: { '/api': server, '/ws': { target: server.replace('http', 'ws'), ws: true } } },
  build: { chunkSizeWarningLimit: 1600 },
});
