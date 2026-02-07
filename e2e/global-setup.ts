/**
 * Global Setup for E2E Tests
 *
 * Runs once before all tests to:
 * 1. Create a fresh test database
 * 2. Run migrations
 * 3. Seed initial test data
 *
 * The database path is stored for use by the server and tests.
 */

import { execSync } from 'child_process';
import { existsSync, unlinkSync, writeFileSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname replacement
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = resolve(__dirname, '..');
const TEST_DB_PATH = join(PROJECT_ROOT, 'e2e-test.db');
const ENV_FILE = join(__dirname, '.test-env.json');

export default async function globalSetup() {
  console.log('\n[E2E Setup] Creating test database...');

  // Remove old test database if it exists
  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
    console.log('[E2E Setup] Removed old test database');
  }
  // Also remove WAL and SHM files
  if (existsSync(`${TEST_DB_PATH}-wal`)) {
    unlinkSync(`${TEST_DB_PATH}-wal`);
  }
  if (existsSync(`${TEST_DB_PATH}-shm`)) {
    unlinkSync(`${TEST_DB_PATH}-shm`);
  }

  // Run migrations to create fresh database schema
  console.log('[E2E Setup] Running migrations...');
  try {
    execSync('bun run db:migrate', {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        DATABASE_PATH: TEST_DB_PATH,
      },
      stdio: 'pipe',
    });
    console.log('[E2E Setup] Migrations complete');
  } catch (error: any) {
    console.error('[E2E Setup] Migration failed:', error.message);
    throw error;
  }

  // Store the database path for other parts of the test suite
  writeFileSync(ENV_FILE, JSON.stringify({ dbPath: TEST_DB_PATH }));

  console.log('[E2E Setup] Test database ready at:', TEST_DB_PATH);
}
