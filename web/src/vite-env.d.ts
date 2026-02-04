/// <reference types="vite/client" />

/**
 * Vite Environment Types
 *
 * This file provides TypeScript type definitions for Vite-specific features:
 * - import.meta.env for environment variables
 * - import.meta.hot for HMR (Hot Module Replacement)
 *
 * @see https://vitejs.dev/guide/env-and-mode.html
 */

// Extend the ImportMetaEnv interface with our custom environment variables
interface ImportMetaEnv {
  /** The base URL the app is being served from */
  readonly BASE_URL: string;
  /** The current mode (development, production, or custom) */
  readonly MODE: string;
  /** Whether the app is running in development mode */
  readonly DEV: boolean;
  /** Whether the app is running in production mode */
  readonly PROD: boolean;
  /** Whether the app is being served in SSR mode */
  readonly SSR: boolean;

  // Custom environment variables can be added here:
  // readonly VITE_API_URL: string;
}

// Extend ImportMeta to include env property
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
