/**
 * Centralized Configuration Module
 *
 * This module provides a type-safe, validated configuration system for the
 * Contextual Clarity application. It loads configuration from environment
 * variables and validates that required values are present in production.
 *
 * Features:
 * - Type-safe configuration object with full TypeScript support
 * - Environment-aware validation (stricter in production)
 * - Clear error messages for missing required configuration
 * - Sensible defaults for optional values
 *
 * Usage:
 *   import { config, validateConfig } from './config';
 *
 *   // Access configuration values
 *   console.log(config.server.port);
 *   console.log(config.database.url);
 *
 *   // Validate configuration (throws if invalid)
 *   validateConfig();
 *
 * @module config
 */

import { z } from 'zod';

// =============================================================================
// Configuration Schema
// =============================================================================

/**
 * Zod schema for validating environment configuration.
 * This provides runtime validation and TypeScript type inference.
 */
const configSchema = z.object({
  // Server configuration
  server: z.object({
    port: z.number().int().positive().default(3000),
    host: z.string().default('0.0.0.0'),
    nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  }),

  // Database configuration
  database: z.object({
    type: z.enum(['sqlite', 'postgres']).default('sqlite'),
    url: z.string().optional(),
  }),

  // Anthropic API configuration
  anthropic: z.object({
    apiKey: z.string().optional(),
    model: z.string().default('claude-sonnet-4-5-20250929'),
    maxTokens: z.number().int().positive().default(32768),
  }),

  // Storage configuration
  storage: z.object({
    sourcesDir: z.string().default('./data/sources'),
  }),

  // Rate limiting configuration
  rateLimit: z.object({
    windowMs: z.number().int().positive().default(60000),
    maxRequests: z.number().int().positive().default(100),
    llmMaxRequests: z.number().int().positive().default(10),
  }),

  // CORS configuration
  cors: z.object({
    allowedOrigins: z.array(z.string()).default([]),
  }),
});

// TypeScript type inferred from the Zod schema
export type Config = z.infer<typeof configSchema>;

// =============================================================================
// Environment Variable Loading
// =============================================================================

/**
 * Parse a comma-separated string into an array of trimmed strings.
 * Returns an empty array if the input is undefined or empty.
 */
function parseCommaSeparated(value: string | undefined): string[] {
  if (!value || value.trim() === '') {
    return [];
  }
  return value.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Parse an integer from an environment variable string.
 * Returns undefined if the value is not a valid integer.
 */
function parseIntOrUndefined(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? undefined : parsed;
}

/**
 * Load configuration from environment variables.
 * This function reads from process.env and constructs a raw config object.
 */
function loadFromEnvironment(): z.input<typeof configSchema> {
  return {
    server: {
      port: parseIntOrUndefined(process.env.PORT) ?? 3000,
      host: process.env.HOST ?? '0.0.0.0',
      nodeEnv: (process.env.NODE_ENV as 'development' | 'production' | 'test') ?? 'development',
    },
    database: {
      type: (process.env.DATABASE_TYPE as 'sqlite' | 'postgres') ?? 'sqlite',
      url: process.env.DATABASE_URL,
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5-20250929',
      maxTokens: parseIntOrUndefined(process.env.ANTHROPIC_MAX_TOKENS) ?? 32768,
    },
    storage: {
      sourcesDir: process.env.SOURCES_DIR ?? './data/sources',
    },
    rateLimit: {
      windowMs: parseIntOrUndefined(process.env.RATE_LIMIT_WINDOW_MS) ?? 60000,
      maxRequests: parseIntOrUndefined(process.env.RATE_LIMIT_MAX_REQUESTS) ?? 100,
      llmMaxRequests: parseIntOrUndefined(process.env.RATE_LIMIT_LLM_MAX_REQUESTS) ?? 10,
    },
    cors: {
      allowedOrigins: parseCommaSeparated(process.env.ALLOWED_ORIGINS),
    },
  };
}

// =============================================================================
// Configuration Validation
// =============================================================================

/**
 * Configuration validation error with detailed information about missing/invalid values.
 */
export class ConfigValidationError extends Error {
  public readonly missingVars: string[];
  public readonly invalidVars: { name: string; reason: string }[];

  constructor(
    message: string,
    missingVars: string[] = [],
    invalidVars: { name: string; reason: string }[] = []
  ) {
    super(message);
    this.name = 'ConfigValidationError';
    this.missingVars = missingVars;
    this.invalidVars = invalidVars;
  }
}

/**
 * Validates the configuration and throws detailed errors for production requirements.
 *
 * In production mode, the following environment variables are REQUIRED:
 * - DATABASE_URL: PostgreSQL connection string
 * - ANTHROPIC_API_KEY: API key for Claude
 *
 * In development/test mode, these are optional (will use defaults or SQLite).
 *
 * @throws {ConfigValidationError} If required configuration is missing in production
 *
 * @example
 * ```typescript
 * try {
 *   validateConfig();
 *   console.log('Configuration is valid');
 * } catch (error) {
 *   if (error instanceof ConfigValidationError) {
 *     console.error('Missing vars:', error.missingVars);
 *   }
 *   process.exit(1);
 * }
 * ```
 */
export function validateConfig(): void {
  const isProduction = config.server.nodeEnv === 'production';

  const missingVars: string[] = [];
  const invalidVars: { name: string; reason: string }[] = [];

  // Production-only requirements
  if (isProduction) {
    // DATABASE_URL is required in production
    if (!config.database.url) {
      missingVars.push('DATABASE_URL');
    }

    // ANTHROPIC_API_KEY is required in production
    if (!config.anthropic.apiKey) {
      missingVars.push('ANTHROPIC_API_KEY');
    }

    // In production, database type should be postgres
    if (config.database.type === 'sqlite') {
      invalidVars.push({
        name: 'DATABASE_TYPE',
        reason: 'SQLite is not recommended for production. Use DATABASE_TYPE=postgres',
      });
    }

    // Validate DATABASE_URL format for postgres
    if (config.database.url && config.database.type === 'postgres') {
      if (!config.database.url.startsWith('postgres://') &&
          !config.database.url.startsWith('postgresql://')) {
        invalidVars.push({
          name: 'DATABASE_URL',
          reason: 'PostgreSQL URL must start with postgres:// or postgresql://',
        });
      }
    }

    // Validate ANTHROPIC_API_KEY format
    if (config.anthropic.apiKey && !config.anthropic.apiKey.startsWith('sk-ant-')) {
      invalidVars.push({
        name: 'ANTHROPIC_API_KEY',
        reason: 'Anthropic API key should start with sk-ant-',
      });
    }
  }

  // Throw if there are any validation errors
  if (missingVars.length > 0 || invalidVars.length > 0) {
    const errorParts: string[] = [];

    if (missingVars.length > 0) {
      errorParts.push(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    if (invalidVars.length > 0) {
      const invalidDescriptions = invalidVars
        .map((v) => `${v.name}: ${v.reason}`)
        .join('; ');
      errorParts.push(`Invalid configuration: ${invalidDescriptions}`);
    }

    const fullMessage = [
      '╔═══════════════════════════════════════════════════════════════════════╗',
      '║  CONFIGURATION ERROR                                                  ║',
      '╠═══════════════════════════════════════════════════════════════════════╣',
      `║  ${errorParts.join('\n║  ')}`,
      '║                                                                       ║',
      '║  Please check your .env.production file or environment variables.    ║',
      '║  See .env.production.example for required configuration.             ║',
      '╚═══════════════════════════════════════════════════════════════════════╝',
    ].join('\n');

    throw new ConfigValidationError(fullMessage, missingVars, invalidVars);
  }
}

// =============================================================================
// Configuration Export
// =============================================================================

/**
 * Load and parse configuration from environment variables.
 * This runs once at module load time.
 */
const rawConfig = loadFromEnvironment();

/**
 * Parse and validate the configuration against the schema.
 * This will throw a ZodError if the configuration is invalid.
 */
const parseResult = configSchema.safeParse(rawConfig);

if (!parseResult.success) {
  console.error('Invalid configuration schema:');
  console.error(parseResult.error.format());
  process.exit(1);
}

/**
 * The validated, type-safe configuration object.
 *
 * Access configuration values using dot notation:
 * - config.server.port
 * - config.database.url
 * - config.anthropic.apiKey
 *
 * @example
 * ```typescript
 * import { config } from './config';
 *
 * const app = new Hono();
 * app.listen(config.server.port);
 * ```
 */
export const config: Config = parseResult.data;

/**
 * Helper function to check if we're running in production mode.
 */
export function isProduction(): boolean {
  return config.server.nodeEnv === 'production';
}

/**
 * Helper function to check if we're running in development mode.
 */
export function isDevelopment(): boolean {
  return config.server.nodeEnv === 'development';
}

/**
 * Helper function to check if we're running in test mode.
 */
export function isTest(): boolean {
  return config.server.nodeEnv === 'test';
}

// Export default for convenience
export default config;
