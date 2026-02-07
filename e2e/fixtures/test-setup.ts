/**
 * Test Setup Fixtures
 *
 * Provides test fixtures for e2e tests.
 * The database is created and cleaned up by global-setup.ts and global-teardown.ts.
 * Each test gets its own unique recall set to avoid conflicts between parallel tests.
 *
 * Key responsibilities:
 * - Wait for API server to be ready
 * - Seed test data via API for each test
 * - Provide utilities for creating additional test data
 */

import { test as base, expect, type Page } from '@playwright/test';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname replacement
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Types
// ============================================================================

/**
 * Test environment containing all context needed for e2e tests.
 */
export interface TestEnvironment {
  /** Path to the test database file */
  dbPath: string;
  /** Base URL for the web application */
  webUrl: string;
  /** Base URL for the API server */
  apiUrl: string;
  /** Port the API server is running on */
  apiPort: number;
  /** Port the web server is running on */
  webPort: number;
  /** Test recall set ID (created during setup) */
  testRecallSetId: string;
  /** Test recall set name */
  testRecallSetName: string;
  /** Test recall point IDs */
  testRecallPointIds: string[];
  /** Test session ID (if created) */
  testSessionId?: string;
}

/**
 * Extended test fixtures available in all tests.
 */
export interface TestFixtures {
  /** Test environment with database and server info */
  testEnv: TestEnvironment;
  /** Utility to seed a recall set */
  seedRecallSet: (name?: string) => Promise<string>;
  /** Utility to seed recall points */
  seedRecallPoints: (setId: string, count: number) => Promise<string[]>;
  /** Utility to start a session */
  startSession: (setId: string) => Promise<string>;
  /** Utility to query the database directly */
  queryDb: <T>(query: string) => Promise<T>;
  /** Utility to execute raw SQL */
  execDb: (sql: string) => Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

const PROJECT_ROOT = resolve(__dirname, '../..');
// IMPORTANT: Must match ports in playwright.config.ts to ensure test isolation
const API_PORT = parseInt(process.env.E2E_API_PORT || '3099');
const WEB_PORT = parseInt(process.env.E2E_WEB_PORT || '5199');

// ============================================================================
// API Seeding Functions
// ============================================================================

/**
 * Seeds a test recall set into the database via API.
 */
async function seedTestRecallSet(
  apiUrl: string,
  name: string = 'E2E Test Recall Set',
  description: string = 'A recall set created for e2e testing purposes'
): Promise<{ id: string; name: string }> {
  const response = await fetch(`${apiUrl}/api/recall-sets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      description,
      discussionSystemPrompt: `You are a helpful tutor for the "${name}" recall set. Keep responses brief and focused.`,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to seed recall set: ${error}`);
  }

  const result = await response.json();
  return { id: result.data.id, name };
}

/**
 * Seeds recall points into a recall set via API.
 */
async function seedRecallPoints(
  apiUrl: string,
  recallSetId: string,
  count: number
): Promise<string[]> {
  const testPoints = [
    {
      content: 'The mitochondria is the powerhouse of the cell, producing ATP through cellular respiration.',
      context: 'Basic cell biology - energy production in eukaryotic cells.',
    },
    {
      content: 'Water freezes at 0 degrees Celsius (32 degrees Fahrenheit) under standard atmospheric pressure.',
      context: 'Basic physics - phase transitions of water.',
    },
    {
      content: 'E = mc² represents the mass-energy equivalence, where E is energy, m is mass, and c is the speed of light.',
      context: 'Einstein\'s special relativity - the relationship between mass and energy.',
    },
    {
      content: 'The speed of light in a vacuum is approximately 299,792,458 meters per second.',
      context: 'Fundamental physics constant - the maximum speed at which information can travel.',
    },
    {
      content: 'DNA stands for deoxyribonucleic acid and contains genetic instructions for all living organisms.',
      context: 'Molecular biology - the blueprint of life.',
    },
  ];

  const pointIds: string[] = [];

  for (let i = 0; i < count && i < testPoints.length; i++) {
    const point = testPoints[i];
    const response = await fetch(`${apiUrl}/api/recall-sets/${recallSetId}/points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(point),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to seed recall point: ${error}`);
    }

    const result = await response.json();
    pointIds.push(result.data.id);
  }

  return pointIds;
}

/**
 * Starts a session for a recall set via API.
 */
async function startTestSession(
  apiUrl: string,
  recallSetId: string
): Promise<string> {
  const response = await fetch(`${apiUrl}/api/sessions/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recallSetId }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to start session: ${error}`);
  }

  const result = await response.json();
  return result.data.sessionId;
}

// ============================================================================
// Test Fixture Definition
// ============================================================================

/**
 * Extended Playwright test with custom fixtures for e2e testing.
 *
 * Usage:
 * ```typescript
 * import { test, expect } from '../fixtures/test-setup';
 *
 * test('my test', async ({ page, testEnv }) => {
 *   await page.goto(testEnv.webUrl);
 *   // ...
 * });
 * ```
 */
export const test = base.extend<TestFixtures>({
  // Test environment fixture
  testEnv: async ({}, use, testInfo) => {
    // Database is managed by global-setup.ts / global-teardown.ts
    // Must match path in global-setup.ts
    const dbPath = '/tmp/contextual-clarity-e2e-test.db';

    // Calculate URLs
    const apiUrl = `http://localhost:${API_PORT}`;
    const webUrl = `http://localhost:${WEB_PORT}`;

    // Wait for API to be ready (started by playwright.config.ts webServer)
    let apiReady = false;
    for (let i = 0; i < 30; i++) {
      try {
        const response = await fetch(`${apiUrl}/health`);
        if (response.ok) {
          apiReady = true;
          break;
        }
      } catch {
        // Server not ready yet
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    if (!apiReady) {
      throw new Error(`API server not ready at ${apiUrl}`);
    }

    // Create a unique test recall set for this specific test to avoid conflicts
    // between parallel tests
    const uniqueName = `E2E - ${testInfo.title.slice(0, 40)} - ${Date.now()}`;
    const recallSet = await seedTestRecallSet(apiUrl, uniqueName);
    const recallPointIds = await seedRecallPoints(apiUrl, recallSet.id, 2);

    const env: TestEnvironment = {
      dbPath,
      webUrl,
      apiUrl,
      apiPort: API_PORT,
      webPort: WEB_PORT,
      testRecallSetId: recallSet.id,
      testRecallSetName: recallSet.name,
      testRecallPointIds: recallPointIds,
    };

    // Provide the environment to the test
    await use(env);

    // Cleanup is handled by global-teardown.ts which removes the entire database
  },

  // Seed recall set utility
  seedRecallSet: async ({ testEnv }, use) => {
    await use(async (name?: string) => {
      const result = await seedTestRecallSet(
        testEnv.apiUrl,
        name || `Test Set ${Date.now()}`
      );
      return result.id;
    });
  },

  // Seed recall points utility
  seedRecallPoints: async ({ testEnv }, use) => {
    await use(async (setId: string, count: number) => {
      return await seedRecallPoints(testEnv.apiUrl, setId, count);
    });
  },

  // Start session utility
  startSession: async ({ testEnv }, use) => {
    await use(async (setId: string) => {
      const sessionId = await startTestSession(testEnv.apiUrl, setId);
      testEnv.testSessionId = sessionId;
      return sessionId;
    });
  },

  // Database query utility (via API)
  queryDb: async ({ testEnv }, use) => {
    await use(async <T>(endpoint: string): Promise<T> => {
      const response = await fetch(`${testEnv.apiUrl}${endpoint}`);
      if (!response.ok) {
        throw new Error(`Query failed: ${await response.text()}`);
      }
      const result = await response.json();
      return result.data as T;
    });
  },

  // Database execute utility
  execDb: async ({ testEnv }, use) => {
    await use(async (endpoint: string) => {
      console.warn('execDb not implemented - use API endpoints instead');
    });
  },
});

// Re-export expect for convenience
export { expect };

// ============================================================================
// Test Data Constants
// ============================================================================

/**
 * Known test data that can be referenced in tests.
 */
export const TEST_DATA = {
  recallSet: {
    name: 'E2E Test Set',
    description: 'A recall set created for e2e testing purposes',
  },
  recallPoints: [
    {
      content: 'The mitochondria is the powerhouse of the cell, producing ATP through cellular respiration.',
      context: 'Basic cell biology - energy production in eukaryotic cells.',
    },
    {
      content: 'Water freezes at 0 degrees Celsius (32 degrees Fahrenheit) under standard atmospheric pressure.',
      context: 'Basic physics - phase transitions of water.',
    },
  ],
} as const;
