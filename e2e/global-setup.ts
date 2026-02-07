/**
 * Global Setup for E2E Tests
 *
 * Runs once before all tests to:
 * 1. Verify test isolation from production database
 * 2. Create a fresh test database
 * 3. Run migrations
 * 4. Seed initial test data
 *
 * The database path is stored for use by the server and tests.
 *
 * SAFETY: Uses dedicated ports (3099/5199) to prevent accidentally connecting
 * to dev server. Never reuses existing servers.
 */

import { execSync } from 'child_process';
import { existsSync, unlinkSync, writeFileSync, readFileSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname replacement
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = resolve(__dirname, '..');
// Use /tmp to avoid macOS file system interference (iCloud, Spotlight, extended attributes)
// This also provides better isolation from the project directory
const TEST_DB_PATH = '/tmp/contextual-clarity-e2e-test.db';
const PROD_DB_PATH = join(PROJECT_ROOT, 'contextual-clarity.db');
const ENV_FILE = join(__dirname, '.test-env.json');

// Ports used for e2e tests - must match playwright.config.ts
const E2E_API_PORT = process.env.E2E_API_PORT || '3099';
const E2E_WEB_PORT = process.env.E2E_WEB_PORT || '5199';

export default async function globalSetup() {
  console.log('\n[E2E Setup] Starting e2e test setup...');
  console.log(`[E2E Setup] Test API port: ${E2E_API_PORT}, Web port: ${E2E_WEB_PORT}`);

  // SAFETY CHECK: Verify test database path is different from production
  if (TEST_DB_PATH === PROD_DB_PATH) {
    throw new Error(
      `[E2E Setup] FATAL: Test database path matches production database!\n` +
      `Test: ${TEST_DB_PATH}\nProd: ${PROD_DB_PATH}\n` +
      `This would corrupt production data. Aborting.`
    );
  }

  // SAFETY CHECK: Verify we're using test ports, not dev ports
  if (E2E_API_PORT === '3011' || E2E_WEB_PORT === '5173') {
    throw new Error(
      `[E2E Setup] FATAL: E2E tests are configured to use dev server ports!\n` +
      `API: ${E2E_API_PORT}, Web: ${E2E_WEB_PORT}\n` +
      `This could cause test data to leak into production. Aborting.\n` +
      `Expected test ports: API=3099, Web=5199`
    );
  }

  // Check if test server is already running (user started it manually)
  let serverAlreadyRunning = false;
  try {
    const response = await fetch(`http://localhost:${E2E_API_PORT}/health`, {
      signal: AbortSignal.timeout(2000)
    });
    if (response.ok) {
      serverAlreadyRunning = true;
      console.log('[E2E Setup] Test server already running - skipping database reset');
      console.log('[E2E Setup] Note: Using existing database from running server');
    }
  } catch {
    // Server not running, we'll need to set up the database
  }

  // Only create fresh database if server isn't already running
  // If server is running, it's already connected to the test database
  if (!serverAlreadyRunning) {
    console.log('[E2E Setup] Creating test database...');

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
          // IMPORTANT: Must be DATABASE_URL (not DATABASE_PATH) to match config.ts
          DATABASE_URL: TEST_DB_PATH,
        },
        stdio: 'pipe',
      });
      console.log('[E2E Setup] Migrations complete');
    } catch (error: any) {
      console.error('[E2E Setup] Migration failed:', error.message);
      throw error;
    }

    console.log('[E2E Setup] Test database ready at:', TEST_DB_PATH);
  }

  // Store the database path for other parts of the test suite
  writeFileSync(ENV_FILE, JSON.stringify({ dbPath: TEST_DB_PATH }));
}
