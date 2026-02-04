/**
 * Database Migration Runner for Contextual Clarity
 *
 * This script applies pending Drizzle ORM migrations to the SQLite database.
 * It should be run whenever the schema changes to keep the database in sync.
 *
 * Usage:
 *   bun run db:migrate                    # Uses default database path
 *   DATABASE_URL=/path/to/db bun run db:migrate  # Custom database path
 *
 * The script will:
 * 1. Connect to the database (creating it if it doesn't exist)
 * 2. Apply any pending migrations from the ./drizzle folder
 * 3. Report success or failure with descriptive messages
 *
 * Migrations are tracked in a __drizzle_migrations table, so running this
 * script multiple times is safe - it will only apply new migrations.
 */

import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database } from 'bun:sqlite';
import { resolve } from 'path';
import { getDatabaseURL } from '../config';

// Determine database path from environment or use default
const dbPath = getDatabaseURL();

console.log(`[migrate] Database path: ${dbPath}`);
console.log('[migrate] Connecting to database...');

// Create the raw SQLite connection first (for verification queries)
const sqlite = new Database(dbPath);

// Enable foreign key constraint enforcement
// SQLite has this disabled by default for backwards compatibility
sqlite.run('PRAGMA foreign_keys = ON');

// Import drizzle here to wrap the existing connection
const { drizzle } = await import('drizzle-orm/bun-sqlite');
const db = drizzle(sqlite);

// Resolve the migrations folder path relative to the project root
// This ensures the script works regardless of where it's invoked from
const migrationsFolder = resolve(import.meta.dir, '../../drizzle');

console.log(`[migrate] Migrations folder: ${migrationsFolder}`);
console.log('[migrate] Running migrations...');

try {
  // Apply all pending migrations
  // This will:
  // - Create the __drizzle_migrations table if it doesn't exist
  // - Read all .sql files from the migrations folder
  // - Execute any migrations that haven't been applied yet
  // - Record successful migrations to prevent re-running
  migrate(db, { migrationsFolder });

  console.log('[migrate] Migrations completed successfully.');

  // Verify that tables were created by listing them
  // Using raw SQLite queries for verification
  // Note: We exclude sqlite internal tables and drizzle migrations table
  const tablesResult = sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' ORDER BY name"
    )
    .all();

  console.log('[migrate] Tables in database:');
  for (const table of tablesResult) {
    console.log(`  - ${table.name}`);
  }

  // Verify foreign keys are enabled
  // The PRAGMA query returns { foreign_keys: 0 | 1 }
  const fkResult = sqlite.query<{ foreign_keys: number }, []>('PRAGMA foreign_keys').get();

  console.log(
    `[migrate] Foreign key enforcement: ${fkResult?.foreign_keys === 1 ? 'ENABLED' : 'DISABLED'}`
  );
} catch (error) {
  console.error('[migrate] Migration failed:', error);
  process.exit(1);
}
