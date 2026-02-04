/**
 * Vite Configuration for Contextual Clarity Frontend
 *
 * This configuration sets up:
 * - React plugin for JSX transformation and Fast Refresh
 * - Path alias (@/) for cleaner imports
 * - Development server on port 5173
 * - API proxy to forward /api and /health requests to the backend server
 * - Production build output to dist/
 *
 * The proxy reads PORT from the root .env file so frontend and backend
 * stay in sync automatically.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import * as dotenv from 'dotenv';

// Load the root .env file to get the backend PORT
// This ensures the proxy target stays in sync with the backend configuration
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Get the backend port from environment, defaulting to 3000 if not set
const BACKEND_PORT = process.env.PORT || '3000';
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

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
    // The target is read from the root .env PORT variable
    proxy: {
      // Forward all /api/* requests to the backend server
      '/api': {
        target: BACKEND_URL,
        changeOrigin: true,
        // WebSocket support for session connections
        ws: true,
      },
      // Forward health check endpoint to backend
      '/health': {
        target: BACKEND_URL,
        changeOrigin: true,
      },
    },
  },

  build: {
    // Output directory for production builds
    outDir: 'dist',
    // Generate source maps for debugging production issues
    sourcemap: true,
  },
});
