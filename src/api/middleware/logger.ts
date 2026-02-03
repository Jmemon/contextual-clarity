/**
 * Request Logger Middleware for Contextual Clarity API
 *
 * This middleware logs HTTP requests with key information for debugging
 * and monitoring. Each request log includes:
 *
 * - HTTP method (GET, POST, etc.)
 * - Request path
 * - Response status code
 * - Response time in milliseconds
 *
 * Log format:
 * ```
 * [API] GET /api/recall-sets 200 - 15ms
 * [API] POST /api/sessions 201 - 234ms
 * [API] GET /api/not-found 404 - 3ms
 * ```
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { loggerMiddleware } from '@/api/middleware/logger';
 *
 * const app = new Hono();
 * app.use('*', loggerMiddleware());
 * ```
 */

import type { MiddlewareHandler, Context } from 'hono';

/**
 * Configuration options for the logger middleware
 */
export interface LoggerConfig {
  /** Prefix for log messages */
  prefix: string;
  /** Whether to include timestamp in logs */
  includeTimestamp: boolean;
  /** Paths to skip logging (e.g., health checks) */
  skipPaths: string[];
  /** Whether to log in color (for terminal output) */
  colorize: boolean;
}

/**
 * Default logger configuration
 */
const DEFAULT_LOGGER_CONFIG: LoggerConfig = {
  prefix: '[API]',
  includeTimestamp: false,
  skipPaths: ['/health', '/healthz', '/ready'],
  colorize: process.env.NODE_ENV !== 'production',
};

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

/**
 * Returns the appropriate color for a status code.
 * - 2xx: Green (success)
 * - 3xx: Cyan (redirect)
 * - 4xx: Yellow (client error)
 * - 5xx: Red (server error)
 *
 * @param status - HTTP status code
 * @returns ANSI color code
 */
function getStatusColor(status: number): string {
  if (status >= 500) return colors.red;
  if (status >= 400) return colors.yellow;
  if (status >= 300) return colors.cyan;
  if (status >= 200) return colors.green;
  return colors.dim;
}

/**
 * Returns the appropriate color for an HTTP method.
 *
 * @param method - HTTP method string
 * @returns ANSI color code
 */
function getMethodColor(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
      return colors.cyan;
    case 'POST':
      return colors.green;
    case 'PUT':
    case 'PATCH':
      return colors.yellow;
    case 'DELETE':
      return colors.red;
    default:
      return colors.magenta;
  }
}

/**
 * Formats the response time for display.
 * Shows milliseconds for times under 1 second,
 * seconds for longer times.
 *
 * @param ms - Response time in milliseconds
 * @returns Formatted time string
 */
function formatResponseTime(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Creates a logger middleware that logs request information.
 *
 * Logs each request with method, path, status code, and response time.
 * Supports colored output for terminal readability and configurable
 * paths to skip (e.g., health checks that would spam the logs).
 *
 * @param config - Optional configuration overrides
 * @returns Hono middleware handler for request logging
 *
 * @example
 * ```typescript
 * const app = new Hono();
 *
 * // Use default config
 * app.use('*', loggerMiddleware());
 *
 * // Or customize
 * app.use('*', loggerMiddleware({
 *   prefix: '[MyAPI]',
 *   skipPaths: ['/health', '/metrics'],
 * }));
 * ```
 */
export function loggerMiddleware(
  config: Partial<LoggerConfig> = {}
): MiddlewareHandler {
  // Merge provided config with defaults
  const finalConfig: LoggerConfig = {
    ...DEFAULT_LOGGER_CONFIG,
    ...config,
  };

  return async (c: Context, next) => {
    // Skip logging for configured paths (e.g., health checks)
    const path = c.req.path;
    if (finalConfig.skipPaths.some((skip) => path.startsWith(skip))) {
      return next();
    }

    // Record start time for response time calculation
    const startTime = performance.now();

    // Process the request
    await next();

    // Calculate response time
    const endTime = performance.now();
    const responseTime = Math.round(endTime - startTime);

    // Extract request/response info
    const method = c.req.method;
    const status = c.res.status;

    // Build the log message
    let logMessage: string;

    if (finalConfig.colorize) {
      // Colorized output for development
      const methodColor = getMethodColor(method);
      const statusColor = getStatusColor(status);

      logMessage = [
        finalConfig.prefix,
        `${methodColor}${method.padEnd(7)}${colors.reset}`,
        path,
        `${statusColor}${status}${colors.reset}`,
        '-',
        `${colors.dim}${formatResponseTime(responseTime)}${colors.reset}`,
      ].join(' ');
    } else {
      // Plain output for production (structured logging)
      logMessage = `${finalConfig.prefix} ${method} ${path} ${status} - ${formatResponseTime(responseTime)}`;
    }

    // Add timestamp if configured
    if (finalConfig.includeTimestamp) {
      const timestamp = new Date().toISOString();
      logMessage = `[${timestamp}] ${logMessage}`;
    }

    // Output the log
    console.log(logMessage);
  };
}

export { DEFAULT_LOGGER_CONFIG };
