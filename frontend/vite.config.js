import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,          // listen on 0.0.0.0 so the Cloudflare tunnel can reach it
    port: 5173,
    allowedHosts: true,  // trycloudflare.com hostnames change on every run
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
  preview: { host: true, port: 5173, allowedHosts: true },
});
