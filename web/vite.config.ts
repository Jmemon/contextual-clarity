/**
 * Vite Configuration for Contextual Clarity Frontend
 *
 * This configuration sets up:
 * - React plugin for JSX transformation and Fast Refresh
 * - Path alias (@/) for cleaner imports
 * - Development server on port 5173
 * - API proxy to forward /api and /health requests to the backend server
 * - Production build output to dist/
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // Path alias resolution - enables @/ imports that map to src/
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // React plugin enables JSX transformation and React Fast Refresh for HMR
  plugins: [react()],

  server: {
    // Development server port - standard Vite default
    port: 5173,

    // Proxy configuration forwards API requests to the backend server
    // This allows the frontend to make relative API calls (/api/...)
    // that get forwarded to the backend during development
    proxy: {
      // Forward all /api/* requests to the backend server
      '/api': 'http://localhost:3000',
      // Forward health check endpoint to backend
      '/health': 'http://localhost:3000',
    },
  },

  build: {
    // Output directory for production builds
    outDir: 'dist',
    // Generate source maps for debugging production issues
    sourcemap: true,
  },
});
