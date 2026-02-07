/**
 * Global Teardown for E2E Tests
 *
 * Runs once after all tests complete to clean up:
 * 1. Remove the test database
 * 2. Clean up any temporary files
 */

import { existsSync, unlinkSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname replacement
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = resolve(__dirname, '..');
// Must match the path in global-setup.ts
const TEST_DB_PATH = '/tmp/contextual-clarity-e2e-test.db';
const ENV_FILE = join(__dirname, '.test-env.json');

// Port used for e2e tests - must match playwright.config.ts
const E2E_API_PORT = process.env.E2E_API_PORT || '3099';

export default async function globalTeardown() {
  console.log('\n[E2E Teardown] Cleaning up...');

  // Check if test server is still running (user started it manually)
  let serverStillRunning = false;
  try {
    const response = await fetch(`http://localhost:${E2E_API_PORT}/health`, {
      signal: AbortSignal.timeout(2000)
    });
    if (response.ok) {
      serverStillRunning = true;
    }
  } catch {
    // Server not running
  }

  // Only remove test database if server isn't running
  // If user started server manually, they're managing the database lifecycle
  if (!serverStillRunning) {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
      console.log('[E2E Teardown] Removed test database');
    }

    // Remove WAL and SHM files
    if (existsSync(`${TEST_DB_PATH}-wal`)) {
      unlinkSync(`${TEST_DB_PATH}-wal`);
    }
    if (existsSync(`${TEST_DB_PATH}-shm`)) {
      unlinkSync(`${TEST_DB_PATH}-shm`);
    }
  } else {
    console.log('[E2E Teardown] Test server still running - keeping database');
  }

  // Remove env file
  if (existsSync(ENV_FILE)) {
    unlinkSync(ENV_FILE);
  }

  console.log('[E2E Teardown] Cleanup complete');
}
