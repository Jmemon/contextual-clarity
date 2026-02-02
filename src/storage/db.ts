/**
 * Database Connection Factory for Contextual Clarity
 *
 * This module provides database connection utilities using Bun's native SQLite
 * driver with Drizzle ORM. It creates properly configured database instances
 * with foreign key enforcement enabled.
 *
 * Usage:
 *   // Use the default database instance
 *   import { db } from '@/storage/db';
 *   const sets = await db.select().from(recallSets);
 *
 *   // Or create a custom instance with a specific path
 *   import { createDatabase } from '@/storage/db';
 *   const testDb = createDatabase(':memory:'); // in-memory for tests
 */

import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from './schema';

/**
 * Creates a new Drizzle ORM database instance connected to the specified SQLite file.
 *
 * This factory function:
 * 1. Opens/creates an SQLite database file at the given path
 * 2. Enables foreign key constraint enforcement (disabled by default in SQLite)
 * 3. Wraps the connection with Drizzle ORM for type-safe queries
 *
 * @param dbPath - Path to the SQLite database file.
 *                 Defaults to 'contextual-clarity.db' in the current directory.
 *                 Use ':memory:' for an in-memory database (useful for testing).
 * @returns A Drizzle ORM database instance with full schema awareness
 *
 * @example
 * // Production usage with default path
 * const db = createDatabase();
 *
 * @example
 * // Testing with in-memory database
 * const testDb = createDatabase(':memory:');
 *
 * @example
 * // Custom database file location
 * const db = createDatabase('/var/data/app.db');
 */
export function createDatabase(dbPath: string = 'contextual-clarity.db') {
  // Create or open the SQLite database file using Bun's native driver
  const sqlite = new Database(dbPath);

  // Enable foreign key constraint enforcement
  // SQLite has this disabled by default for backwards compatibility,
  // but we need it enabled to maintain referential integrity between:
  // - recallPoints -> recallSets
  // - sessions -> recallSets
  // - sessionMessages -> sessions
  sqlite.run('PRAGMA foreign_keys = ON');

  // Wrap the SQLite connection with Drizzle ORM for type-safe queries
  // The schema import provides full type inference for all tables
  return drizzle(sqlite, { schema });
}

/**
 * Default database instance for convenience.
 *
 * Uses DATABASE_PATH environment variable if set, otherwise defaults to
 * 'contextual-clarity.db' in the current working directory.
 *
 * This instance is created lazily on first import and reused throughout
 * the application lifecycle.
 */
export const db = createDatabase(
  process.env.DATABASE_PATH || 'contextual-clarity.db'
);

/**
 * Type alias for the Drizzle database instance.
 *
 * Use this type when you need to pass the database as a parameter
 * or store it in a variable with proper typing.
 *
 * @example
 * function getUserData(database: AppDatabase) {
 *   return database.select().from(recallSets);
 * }
 */
export type AppDatabase = ReturnType<typeof createDatabase>;
