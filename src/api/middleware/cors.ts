/**
 * CORS Middleware Configuration for Contextual Clarity API
 *
 * This middleware handles Cross-Origin Resource Sharing (CORS) to allow
 * the frontend development server (Vite on localhost:5173) to communicate
 * with the API server. In production, this would be configured to allow
 * only the deployed frontend domain.
 *
 * CORS headers set:
 * - Access-Control-Allow-Origin: Allowed origins for requests
 * - Access-Control-Allow-Methods: HTTP methods permitted for cross-origin requests
 * - Access-Control-Allow-Headers: Request headers permitted in cross-origin requests
 * - Access-Control-Max-Age: How long preflight results can be cached
 * - Access-Control-Allow-Credentials: Whether credentials are supported
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { corsMiddleware } from '@/api/middleware/cors';
 *
 * const app = new Hono();
 * app.use('*', corsMiddleware());
 * ```
 */

import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono';

/**
 * Configuration options for CORS middleware
 */
export interface CorsConfig {
  /** Origins allowed to make cross-origin requests */
  allowedOrigins: string[];
  /** HTTP methods allowed for cross-origin requests */
  allowedMethods: string[];
  /** Headers allowed in cross-origin requests */
  allowedHeaders: string[];
  /** Whether credentials (cookies, authorization headers) are allowed */
  credentials: boolean;
  /** How long preflight responses can be cached (seconds) */
  maxAge: number;
}

/**
 * Default CORS configuration for development environment.
 * Allows the Vite dev server on localhost:5173 to communicate with the API.
 */
const DEFAULT_CORS_CONFIG: CorsConfig = {
  allowedOrigins: [
    'http://localhost:5173', // Vite dev server (default port)
    'http://127.0.0.1:5173', // Alternative localhost reference
    'http://localhost:5174', // Vite fallback port
    'http://localhost:4173', // Vite preview mode
  ],
  allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-ID',
    'X-Session-ID',
  ],
  credentials: true,
  maxAge: 86400, // 24 hours - preflight cache duration
};

/**
 * Creates a CORS middleware handler with the specified configuration.
 *
 * Uses Hono's built-in CORS middleware but wraps it to provide
 * a consistent configuration interface for the application.
 *
 * @param config - Optional CORS configuration overrides
 * @returns Hono middleware handler that applies CORS headers
 *
 * @example
 * // Use default config (recommended for development)
 * app.use('*', corsMiddleware());
 *
 * @example
 * // Custom configuration for production
 * app.use('*', corsMiddleware({
 *   allowedOrigins: ['https://app.contextual-clarity.com'],
 *   credentials: true,
 * }));
 */
export function corsMiddleware(
  config: Partial<CorsConfig> = {}
): MiddlewareHandler {
  // Merge provided config with defaults
  const finalConfig: CorsConfig = {
    ...DEFAULT_CORS_CONFIG,
    ...config,
  };

  // Use Hono's CORS middleware with our configuration
  return cors({
    origin: finalConfig.allowedOrigins,
    allowMethods: finalConfig.allowedMethods,
    allowHeaders: finalConfig.allowedHeaders,
    credentials: finalConfig.credentials,
    maxAge: finalConfig.maxAge,
  });
}

/**
 * Production-ready CORS configuration that only allows the deployed frontend.
 * Use this when deploying to production by setting ALLOWED_ORIGINS env var.
 *
 * @example
 * ```typescript
 * // In production, set ALLOWED_ORIGINS environment variable
 * // ALLOWED_ORIGINS=https://app.example.com,https://www.example.com
 *
 * app.use('*', corsMiddleware(getProductionCorsConfig()));
 * ```
 */
export function getProductionCorsConfig(): Partial<CorsConfig> {
  // Parse allowed origins from environment variable
  const originsEnv = process.env.ALLOWED_ORIGINS;

  if (!originsEnv) {
    // Fall back to defaults in development
    console.warn(
      '[CORS] No ALLOWED_ORIGINS env var set, using development defaults'
    );
    return {};
  }

  return {
    allowedOrigins: originsEnv.split(',').map((origin) => origin.trim()),
  };
}

export { DEFAULT_CORS_CONFIG };
