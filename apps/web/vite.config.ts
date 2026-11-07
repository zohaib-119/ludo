import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: app updates don't make players re-download these.
        manualChunks: {
          react: ['react', 'react-dom', 'react-dom/client', 'scheduler', 'react-router'],
          motion: ['motion'],
          net: ['@colyseus/sdk'],
        },
      },
    },
  },
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
});
