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
const TEST_DB_PATH = join(PROJECT_ROOT, 'e2e-test.db');
const ENV_FILE = join(__dirname, '.test-env.json');

export default async function globalTeardown() {
  console.log('\n[E2E Teardown] Cleaning up...');

  // Remove test database
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

  // Remove env file
  if (existsSync(ENV_FILE)) {
    unlinkSync(ENV_FILE);
  }

  console.log('[E2E Teardown] Cleanup complete');
}
