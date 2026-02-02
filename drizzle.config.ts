/**
 * Drizzle ORM Configuration
 *
 * This configuration file is used by drizzle-kit for:
 * - Generating migrations from schema changes
 * - Running Drizzle Studio for database inspection
 *
 * The schema is defined in src/storage/schema.ts
 */
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  // Path to the schema file containing table definitions
  schema: './src/storage/schema.ts',

  // Output directory for generated migrations
  out: './drizzle',

  // Database driver - using Bun's native SQLite for development
  dialect: 'sqlite',

  // Database connection configuration
  dbCredentials: {
    // Use environment variable or default to local file
    url: process.env.DATABASE_URL || './contextual-clarity.db',
  },

  // Enable verbose logging during migrations
  verbose: true,

  // Require confirmation for destructive operations
  strict: true,
});
