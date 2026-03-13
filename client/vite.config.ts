import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to the Express server during dev so we avoid CORS issues
      '/api': 'http://localhost:3001',
      '/auth': 'http://localhost:3001',
    },
  },
});
