import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BACKEND_PORT=3002 npm run dev  → connects to live backend
const backendPort = process.env.VITE_BACKEND_PORT || 3001;

export default defineConfig({
  plugins: [react()],
  server: {
    port: process.env.VITE_BACKEND_PORT ? 5174 : 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true
      },
      '/socket.io': {
        target: `http://localhost:${backendPort}`,
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist'
  }
});
