import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the same build works at a domain root, under a
  // GitHub Pages sub-path (/<repo>/), and inside the Capacitor APK.
  base: './',
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
