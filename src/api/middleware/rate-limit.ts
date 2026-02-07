/**
 * Rate Limiting Middleware for Contextual Clarity API
 *
 * This middleware implements token bucket rate limiting to protect the API
 * from abuse and ensure fair resource allocation. It uses an in-memory Map
 * for tracking request counts per client.
 *
 * Two rate limit tiers are available:
 * 1. General endpoints: 100 requests per minute
 * 2. LLM/Session endpoints: 10 requests per minute (due to high cost)
 *
 * Rate limit information is communicated via HTTP headers:
 * - X-RateLimit-Limit: Maximum requests allowed in window
 * - X-RateLimit-Remaining: Requests remaining in current window
 * - X-RateLimit-Reset: Unix timestamp when the window resets
 *
 * When rate limited, returns 429 Too Many Requests with JSON body:
 * ```json
 * {
 *   "success": false,
 *   "error": {
 *     "code": "RATE_LIMITED",
 *     "message": "Too many requests. Please try again later.",
 *     "details": { "retryAfter": 45 }
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { rateLimiter, RATE_LIMITS } from '@/api/middleware/rate-limit';
 *
 * const app = new Hono();
 *
 * // Apply general rate limit to all routes
 * app.use('/api/*', rateLimiter(RATE_LIMITS.GENERAL));
 *
 * // Apply stricter limit to LLM endpoints
 * app.use('/api/sessions/*', rateLimiter(RATE_LIMITS.LLM));
 * ```
 */

import type { MiddlewareHandler, Context } from 'hono';

/**
 * Rate limit configuration options
 */
export interface RateLimitConfig {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Custom key generator function (defaults to IP-based) */
  keyGenerator?: (c: Context) => string;
  /** Message returned when rate limited */
  message?: string;
  /** Skip rate limiting for certain conditions */
  skip?: (c: Context) => boolean;
}

/**
 * Internal structure for tracking request counts per client
 */
interface RateLimitEntry {
  /** Number of requests made in current window */
  count: number;
  /** Timestamp when the current window started */
  windowStart: number;
}

/**
 * Pre-configured rate limits for different endpoint types.
 * Use these constants for consistency across the application.
 */
export const RATE_LIMITS = {
  /**
   * General API endpoints: 1000 requests per minute.
   * Suitable for most CRUD operations and read-heavy endpoints.
   * Set high to support parallel e2e testing across multiple browsers.
   */
  GENERAL: {
    windowMs: 60_000, // 1 minute
    maxRequests: 1000,
  },

  /**
   * LLM/Session endpoints: 100 requests per minute.
   * More restrictive due to:
   * - High computational cost of LLM calls
   * - API rate limits from LLM providers
   * - Expensive token usage
   */
  LLM: {
    windowMs: 60_000, // 1 minute
    maxRequests: 100,
  },

  /**
   * Authentication endpoints: 50 requests per minute.
   * Restrictive to prevent brute force attacks.
   */
  AUTH: {
    windowMs: 60_000, // 1 minute
    maxRequests: 50,
  },
} as const;

/**
 * In-memory store for rate limit tracking.
 *
 * Uses a Map with client keys (typically IP addresses) as keys
 * and RateLimitEntry objects as values. Entries are automatically
 * cleaned up when windows expire.
 *
 * Note: In a multi-instance deployment, this should be replaced
 * with a shared store like Redis. For single-instance deployments,
 * this in-memory approach is simple and efficient.
 */
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Cleans up expired entries from the rate limit store.
 * Called periodically to prevent memory leaks from accumulated entries.
 *
 * @param windowMs - The window duration in milliseconds
 */
function cleanupExpiredEntries(windowMs: number): void {
  const now = Date.now();

  // Use Array.from to avoid iterator compatibility issues
  const entries = Array.from(rateLimitStore.entries());
  for (const [key, entry] of entries) {
    if (now - entry.windowStart >= windowMs) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Default key generator that uses the client's IP address.
 * Falls back to a generic key if IP cannot be determined.
 *
 * @param c - Hono context
 * @returns Client identifier string
 */
function defaultKeyGenerator(c: Context): string {
  // Try various headers for the real IP (behind proxies)
  const forwardedFor = c.req.header('x-forwarded-for');
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs; use the first (client IP)
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = c.req.header('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback: use a generic key (useful in development)
  // In production behind a proxy, this should rarely be hit
  return 'unknown-client';
}

/**
 * Creates a rate limiting middleware with the specified configuration.
 *
 * Implements a sliding window algorithm:
 * 1. When a request arrives, check if we have an entry for this client
 * 2. If no entry exists, or the window has expired, start a new window
 * 3. If the request count exceeds maxRequests, reject with 429
 * 4. Otherwise, increment the count and allow the request
 *
 * @param config - Rate limit configuration
 * @returns Hono middleware handler for rate limiting
 *
 * @example
 * ```typescript
 * // Apply to all API routes
 * app.use('/api/*', rateLimiter({
 *   windowMs: 60000,
 *   maxRequests: 100,
 * }));
 *
 * // Custom key generator (e.g., by API key)
 * app.use('/api/*', rateLimiter({
 *   windowMs: 60000,
 *   maxRequests: 1000,
 *   keyGenerator: (c) => c.req.header('x-api-key') || 'anonymous',
 * }));
 * ```
 */
export function rateLimiter(config: RateLimitConfig): MiddlewareHandler {
  const {
    windowMs,
    maxRequests,
    keyGenerator = defaultKeyGenerator,
    message = 'Too many requests. Please try again later.',
    skip,
  } = config;

  // Periodically clean up expired entries (every 5 minutes)
  // Using setInterval is fine here since this is a long-running server
  const cleanupInterval = setInterval(
    () => cleanupExpiredEntries(windowMs),
    5 * 60 * 1000 // 5 minutes
  );

  // Prevent the cleanup interval from keeping the process alive
  cleanupInterval.unref?.();

  return async (c: Context, next) => {
    // Check if this request should skip rate limiting
    if (skip?.(c)) {
      return next();
    }

    const now = Date.now();
    const clientKey = keyGenerator(c);

    // Get or create the rate limit entry for this client
    let entry = rateLimitStore.get(clientKey);

    if (!entry || now - entry.windowStart >= windowMs) {
      // No entry exists or window has expired; start a new window
      entry = {
        count: 0,
        windowStart: now,
      };
      rateLimitStore.set(clientKey, entry);
    }

    // Calculate remaining requests and reset time
    const remaining = Math.max(0, maxRequests - entry.count - 1);
    const resetTime = Math.ceil((entry.windowStart + windowMs) / 1000);

    // Set rate limit headers on the response
    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(resetTime));

    // Check if rate limit exceeded
    if (entry.count >= maxRequests) {
      const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);

      c.header('Retry-After', String(retryAfter));

      return c.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message,
            details: { retryAfter },
          },
        },
        429
      );
    }

    // Increment the request count
    entry.count++;

    // Process the request
    return next();
  };
}

/**
 * Creates a rate limiter for general API endpoints.
 * Convenience function using RATE_LIMITS.GENERAL configuration.
 *
 * @param overrides - Optional configuration overrides
 * @returns Configured rate limiter middleware
 */
export function generalRateLimiter(
  overrides?: Partial<RateLimitConfig>
): MiddlewareHandler {
  return rateLimiter({
    ...RATE_LIMITS.GENERAL,
    ...overrides,
  });
}

/**
 * Creates a rate limiter for LLM/session endpoints.
 * Convenience function using RATE_LIMITS.LLM configuration.
 *
 * @param overrides - Optional configuration overrides
 * @returns Configured rate limiter middleware
 */
export function llmRateLimiter(
  overrides?: Partial<RateLimitConfig>
): MiddlewareHandler {
  return rateLimiter({
    ...RATE_LIMITS.LLM,
    ...overrides,
  });
}

/**
 * Clears all rate limit entries.
 * Useful for testing or administrative reset.
 */
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}
