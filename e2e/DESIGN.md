# Comprehensive E2E Test Suite Design

## Executive Summary

This document specifies a rigorous, browser-based end-to-end test suite using Playwright that will validate the entire Contextual Clarity web application works correctly. These tests interact with the actual UI in a real browser, verifying that all user interactions produce the expected results both in the UI and in the database.

**Philosophy: Healthy Paranoia**
- If these tests pass, developers should be **completely confident** the web app works
- Every user-facing feature must be tested
- Every critical path must be verified end-to-end
- Database state changes must be validated
- Error states and edge cases must be covered
- WebSocket connections must be tested for reliability

---

## Test Isolation (CRITICAL)

Tests are completely isolated from development/production data using multiple safety layers:

### Port Isolation
| Environment | API Port | Web Port |
|-------------|----------|----------|
| Development | 3011     | 5173     |
| **E2E Tests** | **3099** | **5199** |

Tests use dedicated ports that differ from dev server ports. This ensures tests **never** accidentally connect to a running dev server using production data.

### Database Isolation
- Tests use `e2e-test.db` (separate from `contextual-clarity.db`)
- Fresh database created before each test run
- Automatically deleted after tests complete

### Server Isolation
- `reuseExistingServer: false` - tests always start fresh servers
- Fail-fast checks in `global-setup.ts` verify port and database isolation

### Safety Checks
The following assertions run before any tests:
1. Test database path ≠ production database path
2. Test ports ≠ dev server ports (3011/5173 blocked)
3. Migrations run against isolated test database only

---

## Test Infrastructure

### 1. Test Database Setup

```typescript
// e2e/fixtures/test-database.ts

/**
 * Test Database Management
 *
 * Each test file gets a fresh SQLite database:
 * 1. Create a new .db file in a temp directory
 * 2. Run all migrations
 * 3. Seed with known test data
 * 4. Clean up after tests complete
 */

const TEST_DB_DIR = '/tmp/contextual-clarity-e2e-tests';

export async function createTestDatabase(testName: string): Promise<{
  dbPath: string;
  cleanup: () => Promise<void>;
}> {
  const dbPath = `${TEST_DB_DIR}/${testName}-${Date.now()}.db`;

  // 1. Create directory if needed
  await fs.mkdir(TEST_DB_DIR, { recursive: true });

  // 2. Run migrations
  await runMigrations(dbPath);

  // 3. Return cleanup function
  return {
    dbPath,
    cleanup: async () => {
      await fs.unlink(dbPath);
    },
  };
}

export async function seedTestRecallSet(dbPath: string): Promise<{
  recallSetId: string;
  recallPointIds: string[];
}> {
  // Create a known recall set for testing
  const recallSetId = 'test-rs-' + crypto.randomUUID();

  const db = createDatabase(dbPath);

  // Insert recall set
  await db.insert(recallSets).values({
    id: recallSetId,
    name: 'E2E Test Set',
    description: 'A recall set for automated e2e testing',
    status: 'active',
    discussionSystemPrompt: 'You are a test tutor. Keep responses brief.',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Insert recall points (due immediately)
  const pointIds = [];
  const points = [
    {
      content: 'The mitochondria is the powerhouse of the cell.',
      context: 'Basic cell biology fact commonly used in testing.',
    },
    {
      content: 'Water freezes at 0 degrees Celsius.',
      context: 'Basic physics fact for testing.',
    },
  ];

  for (const point of points) {
    const id = 'test-rp-' + crypto.randomUUID();
    pointIds.push(id);

    await db.insert(recallPoints).values({
      id,
      recallSetId,
      content: point.content,
      context: point.context,
      // FSRS state: due immediately (new card)
      fsrsDifficulty: 0,
      fsrsStability: 0,
      fsrsDue: new Date(), // Due now
      fsrsLastReview: null,
      fsrsReps: 0,
      fsrsLapses: 0,
      fsrsState: 'new',
      recallHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return { recallSetId, recallPointIds: pointIds };
}
```

### 2. Server Management

```typescript
// e2e/fixtures/server.ts

/**
 * Server Process Management
 *
 * Starts the backend server with the test database
 * and frontend dev server.
 */

export async function startTestServers(dbPath: string): Promise<{
  apiPort: number;
  webPort: number;
  cleanup: () => Promise<void>;
}> {
  // Find available ports
  const apiPort = await findAvailablePort(3100);
  const webPort = await findAvailablePort(5100);

  // Start API server with test database
  const apiProcess = Bun.spawn({
    cmd: ['bun', 'run', 'src/api/server.ts'],
    env: {
      ...process.env,
      DATABASE_PATH: dbPath,
      PORT: String(apiPort),
      // Use mock LLM for deterministic tests
      LLM_MOCK_MODE: 'true',
    },
    stdout: 'inherit',
    stderr: 'inherit',
  });

  // Start Vite dev server
  const webProcess = Bun.spawn({
    cmd: ['bun', 'run', 'dev'],
    cwd: './web',
    env: {
      ...process.env,
      VITE_API_URL: `http://localhost:${apiPort}`,
      PORT: String(webPort),
    },
    stdout: 'inherit',
    stderr: 'inherit',
  });

  // Wait for servers to be ready
  await waitForServer(`http://localhost:${apiPort}/api/health`, 30000);
  await waitForServer(`http://localhost:${webPort}`, 30000);

  return {
    apiPort,
    webPort,
    cleanup: async () => {
      apiProcess.kill();
      webProcess.kill();
    },
  };
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}
```

### 3. Mock LLM for Deterministic Tests

```typescript
// src/llm/mock-client.ts

/**
 * Mock LLM Client for E2E Tests
 *
 * Provides deterministic responses for testing without calling the real API.
 * Activated via LLM_MOCK_MODE=true environment variable.
 */

export class MockAnthropicClient {
  async complete(messages: LLMMessage[]): Promise<LLMResponse> {
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();

    // Simulate evaluation
    if (lastUserMessage?.content.includes('EVALUATE_POINT')) {
      return {
        text: JSON.stringify({
          success: true,
          confidence: 0.85,
          reasoning: 'User demonstrated understanding',
        }),
        usage: { inputTokens: 100, outputTokens: 50 },
        stopReason: 'end_turn',
      };
    }

    // Default conversational response
    return {
      text: "That's a great point! Can you tell me more about what you know about this topic?",
      usage: { inputTokens: 100, outputTokens: 30 },
      stopReason: 'end_turn',
    };
  }

  async stream(messages: LLMMessage[], callbacks: StreamCallbacks): Promise<void> {
    const response = "Let's explore this together. What do you already know?";

    // Simulate streaming with small chunks
    for (let i = 0; i < response.length; i += 10) {
      const chunk = response.slice(i, i + 10);
      callbacks.onText?.(chunk);
      await new Promise(r => setTimeout(r, 50));
    }

    callbacks.onComplete?.(response);
  }
}
```

---

## Test Suite Organization

```
e2e/
├── DESIGN.md                          # This document
├── playwright.config.ts               # Playwright configuration
├── fixtures/
│   ├── test-database.ts              # Database setup/teardown
│   ├── server.ts                     # Server management
│   ├── pages.ts                      # Page object models
│   └── data.ts                       # Test data factories
├── tests/
│   ├── 01-smoke.spec.ts              # Critical path smoke tests
│   ├── 02-navigation.spec.ts         # All navigation flows
│   ├── 03-dashboard.spec.ts          # Dashboard functionality
│   ├── 04-recall-sets.spec.ts        # Recall set CRUD
│   ├── 05-recall-points.spec.ts      # Recall point management
│   ├── 06-sessions.spec.ts           # Session history/replay
│   ├── 07-live-session.spec.ts       # Live session WebSocket
│   ├── 08-forms.spec.ts              # Form validation
│   ├── 09-error-states.spec.ts       # Error handling
│   ├── 10-responsive.spec.ts         # Mobile/tablet layouts
│   └── 11-database-integrity.spec.ts # DB state verification
└── helpers/
    ├── assertions.ts                 # Custom assertions
    ├── db-queries.ts                 # Direct DB verification
    └── websocket.ts                  # WebSocket test helpers
```

---

## Test Specifications

### 01. Smoke Tests (Critical Path)

**Purpose:** Verify the most critical user flows work end-to-end.

```typescript
// e2e/tests/01-smoke.spec.ts

import { test, expect } from '@playwright/test';
import { setupTestEnvironment, teardownTestEnvironment } from '../fixtures';

test.describe('Smoke Tests - Critical Path', () => {
  let env: TestEnvironment;

  test.beforeAll(async () => {
    env = await setupTestEnvironment('smoke-tests');
  });

  test.afterAll(async () => {
    await teardownTestEnvironment(env);
  });

  test('complete user journey: create set → add points → run session → verify FSRS', async ({ page }) => {
    // This is THE critical test. If this passes, the core app works.

    // 1. Navigate to app
    await page.goto(env.webUrl);
    await expect(page).toHaveTitle(/Contextual Clarity/);

    // 2. Dashboard loads
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // 3. Navigate to Recall Sets
    await page.getByRole('link', { name: 'Recall Sets' }).click();
    await expect(page).toHaveURL(/\/recall-sets$/);

    // 4. Create new recall set
    await page.getByRole('link', { name: '+ New Set' }).click();
    await expect(page).toHaveURL(/\/recall-sets\/new$/);

    // Fill form
    await page.getByLabel('Name').fill('E2E Critical Path Test');
    await page.getByLabel('Description').fill('Testing the critical user journey');
    await page.getByLabel('Discussion System Prompt').fill('You are a helpful tutor for testing. Keep responses brief.');

    // Submit
    await page.getByRole('button', { name: 'Create Recall Set' }).click();

    // Verify redirect to detail page
    await expect(page).toHaveURL(/\/recall-sets\/rs_/);
    await expect(page.getByRole('heading', { name: 'E2E Critical Path Test' })).toBeVisible();

    // Extract set ID from URL
    const setUrl = page.url();
    const setId = setUrl.split('/').pop()!;

    // 5. Add recall point
    await page.getByRole('button', { name: 'Add Point' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByLabel('Content').fill('The mitochondria is the powerhouse of the cell.');
    await page.getByLabel('Context').fill('Basic biology fact for testing purposes.');
    await page.getByRole('button', { name: 'Add Recall Point' }).click();

    // Verify point appears in list
    await expect(page.getByText('The mitochondria is the powerhouse')).toBeVisible();

    // 6. Verify point in database is due for review
    const point = await env.db.query.recallPoints.findFirst({
      where: eq(recallPoints.recallSetId, setId),
    });
    expect(point).toBeDefined();
    expect(point!.fsrsState).toBe('new');
    expect(point!.fsrsReps).toBe(0);
    const dueDateIsNow = new Date(point!.fsrsDue) <= new Date();
    expect(dueDateIsNow).toBe(true);

    // 7. Start session
    await page.getByRole('button', { name: 'Start Session' }).click();

    // Should redirect to live session
    await expect(page).toHaveURL(/\/session\//);

    // 8. Wait for WebSocket connection and opening message
    await expect(page.getByText(/Connected/)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="message-assistant"]').first()).toBeVisible({ timeout: 10000 });

    // 9. Respond to tutor
    await page.getByRole('textbox', { name: 'Type your response' }).fill(
      'The mitochondria is the powerhouse of the cell - it produces ATP through cellular respiration.'
    );
    await page.keyboard.press('Enter');

    // Wait for assistant response
    await expect(page.locator('[data-testid="message-assistant"]').nth(1)).toBeVisible({ timeout: 15000 });

    // 10. Trigger evaluation
    await page.getByRole('button', { name: "I've got it!" }).click();

    // Wait for evaluation result
    await expect(page.getByText(/Great recall!|Keep practicing/)).toBeVisible({ timeout: 15000 });

    // 11. Session should complete (only 1 point)
    await expect(page.getByText('Session Complete!')).toBeVisible({ timeout: 20000 });

    // 12. Verify FSRS state updated in database
    const updatedPoint = await env.db.query.recallPoints.findFirst({
      where: eq(recallPoints.recallSetId, setId),
    });

    expect(updatedPoint!.fsrsReps).toBe(1); // Should have 1 rep now
    expect(updatedPoint!.fsrsState).not.toBe('new'); // State should transition
    expect(updatedPoint!.fsrsLastReview).not.toBeNull(); // Last review set

    // Due date should be in the future now
    const newDueDate = new Date(updatedPoint!.fsrsDue);
    expect(newDueDate.getTime()).toBeGreaterThan(Date.now());

    // Recall history should have 1 entry
    expect(updatedPoint!.recallHistory).toHaveLength(1);

    // 13. Navigate back to dashboard
    await page.getByRole('link', { name: 'Back to Dashboard' }).click();
    await expect(page).toHaveURL('/');

    // 14. Verify session appears in recent sessions
    await expect(page.getByText('E2E Critical Path Test')).toBeVisible();
  });

  test('app loads without errors', async ({ page }) => {
    await page.goto(env.webUrl);

    // No console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Wait for dashboard to load
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // Allow some time for any async errors
    await page.waitForTimeout(2000);

    // Filter out expected errors (if any)
    const unexpectedErrors = errors.filter(e => !e.includes('expected-error'));
    expect(unexpectedErrors).toHaveLength(0);
  });

  test('API health check passes', async ({ page }) => {
    const response = await page.request.get(`${env.apiUrl}/api/health`);
    expect(response.ok()).toBe(true);

    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('ok');
  });
});
```

### 02. Navigation Tests

```typescript
// e2e/tests/02-navigation.spec.ts

test.describe('Navigation', () => {
  test('sidebar navigation works on all routes', async ({ page }) => {
    await page.goto(env.webUrl);

    // Dashboard link
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // Recall Sets link
    await page.getByRole('link', { name: 'Recall Sets' }).click();
    await expect(page).toHaveURL('/recall-sets');
    await expect(page.getByRole('heading', { name: 'Recall Sets' })).toBeVisible();

    // Sessions link
    await page.getByRole('link', { name: 'Sessions' }).click();
    await expect(page).toHaveURL('/sessions');
    await expect(page.getByRole('heading', { name: 'Session History' })).toBeVisible();
  });

  test('browser back/forward navigation works', async ({ page }) => {
    await page.goto(env.webUrl);

    // Navigate forward
    await page.getByRole('link', { name: 'Recall Sets' }).click();
    await expect(page).toHaveURL('/recall-sets');

    await page.getByRole('link', { name: 'Sessions' }).click();
    await expect(page).toHaveURL('/sessions');

    // Go back
    await page.goBack();
    await expect(page).toHaveURL('/recall-sets');

    // Go back again
    await page.goBack();
    await expect(page).toHaveURL('/');

    // Go forward
    await page.goForward();
    await expect(page).toHaveURL('/recall-sets');
  });

  test('deep linking works for all routes', async ({ page }) => {
    // Dashboard
    await page.goto(env.webUrl + '/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // Recall Sets list
    await page.goto(env.webUrl + '/recall-sets');
    await expect(page.getByRole('heading', { name: 'Recall Sets' })).toBeVisible();

    // Sessions list
    await page.goto(env.webUrl + '/sessions');
    await expect(page.getByRole('heading', { name: 'Session History' })).toBeVisible();

    // 404 for invalid route
    await page.goto(env.webUrl + '/invalid-route-xyz');
    await expect(page.getByText(/not found|404/i)).toBeVisible();
  });

  test('current route is highlighted in sidebar', async ({ page }) => {
    await page.goto(env.webUrl);

    // Dashboard should be highlighted
    const dashboardLink = page.getByRole('link', { name: 'Dashboard' });
    await expect(dashboardLink).toHaveClass(/bg-clarity-100|active/);

    // Navigate to Recall Sets
    await page.getByRole('link', { name: 'Recall Sets' }).click();
    const recallSetsLink = page.getByRole('link', { name: 'Recall Sets' });
    await expect(recallSetsLink).toHaveClass(/bg-clarity-100|active/);
  });
});
```

### 03. Dashboard Tests

```typescript
// e2e/tests/03-dashboard.spec.ts

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Seed database with test data
    await env.seedTestData({
      recallSets: 3,
      pointsPerSet: 5,
      sessionsPerSet: 2,
    });
    await page.goto(env.webUrl);
  });

  test('displays overview statistics correctly', async ({ page }) => {
    // Wait for data to load
    await expect(page.getByText('Loading your dashboard...')).not.toBeVisible({ timeout: 10000 });

    // Check stat cards are visible
    await expect(page.getByText('Total Sets')).toBeVisible();
    await expect(page.getByText('Active Sets')).toBeVisible();
    await expect(page.getByText('Total Sessions')).toBeVisible();
    await expect(page.getByText('Study Time')).toBeVisible();
    await expect(page.getByText('Recall Rate')).toBeVisible();

    // Verify values match database
    const stats = await env.db.query.recallSets.findMany();
    const totalSets = stats.length;
    const activeSets = stats.filter(s => s.status === 'active').length;

    await expect(page.getByTestId('stat-total-sets')).toContainText(String(totalSets));
    await expect(page.getByTestId('stat-active-sets')).toContainText(String(activeSets));
  });

  test('displays due points card correctly', async ({ page }) => {
    const duePointsCard = page.getByTestId('due-points-card');
    await expect(duePointsCard).toBeVisible();

    // Should show number of due points
    await expect(duePointsCard.getByText(/\d+ points? due/)).toBeVisible();

    // Start session button should work
    await duePointsCard.getByRole('button', { name: /start studying/i }).click();
    await expect(page).toHaveURL(/\/session/);
  });

  test('displays recent sessions list', async ({ page }) => {
    const recentSessions = page.getByTestId('recent-sessions');
    await expect(recentSessions).toBeVisible();

    // Should show session cards
    const sessionCards = recentSessions.locator('[data-testid="session-card"]');
    await expect(sessionCards.first()).toBeVisible();

    // Click on session navigates to replay
    await sessionCards.first().click();
    await expect(page).toHaveURL(/\/sessions\//);
  });

  test('displays upcoming reviews', async ({ page }) => {
    const upcomingReviews = page.getByTestId('upcoming-reviews');
    await expect(upcomingReviews).toBeVisible();

    // Should categorize by priority
    // (overdue, due-today, upcoming)
    await expect(upcomingReviews).toContainText(/overdue|due today|upcoming/i);
  });

  test('displays streak information', async ({ page }) => {
    const streakDisplay = page.getByTestId('streak-display');
    await expect(streakDisplay).toBeVisible();

    await expect(streakDisplay.getByText('Current Streak')).toBeVisible();
    await expect(streakDisplay.getByText('Longest Streak')).toBeVisible();
  });

  test('handles empty state gracefully', async ({ page }) => {
    // Clear all data
    await env.clearTestData();
    await page.reload();

    // Should show appropriate empty states
    await expect(page.getByText(/no recall sets|get started/i)).toBeVisible();
    await expect(page.getByText(/no recent sessions/i)).toBeVisible();
  });

  test('refresh button refetches data', async ({ page }) => {
    // Get initial value
    const initialSessions = page.getByTestId('stat-total-sessions');
    const initialValue = await initialSessions.textContent();

    // Add a session directly to DB
    await env.seedSession(env.testRecallSetId);

    // Click refresh (if available) or reload
    const refreshButton = page.getByRole('button', { name: /refresh|retry/i });
    if (await refreshButton.isVisible()) {
      await refreshButton.click();
    } else {
      await page.reload();
    }

    // Value should update
    await expect(initialSessions).not.toHaveText(initialValue!);
  });
});
```

### 04. Recall Sets CRUD Tests

```typescript
// e2e/tests/04-recall-sets.spec.ts

test.describe('Recall Sets CRUD', () => {
  test.describe('Create', () => {
    test('creates a new recall set with valid data', async ({ page }) => {
      await page.goto(env.webUrl + '/recall-sets');

      // Click create button
      await page.getByRole('link', { name: '+ New Set' }).click();
      await expect(page).toHaveURL('/recall-sets/new');

      // Fill form
      await page.getByLabel('Name').fill('Physics 101');
      await page.getByLabel('Description').fill('Fundamental physics concepts');
      await page.getByLabel('Discussion System Prompt').fill('You are a physics tutor helping students understand mechanics.');

      // Submit
      await page.getByRole('button', { name: 'Create Recall Set' }).click();

      // Verify redirect to detail page
      await expect(page).toHaveURL(/\/recall-sets\/rs_/);
      await expect(page.getByRole('heading', { name: 'Physics 101' })).toBeVisible();

      // Verify in database
      const set = await env.db.query.recallSets.findFirst({
        where: eq(recallSets.name, 'Physics 101'),
      });
      expect(set).toBeDefined();
      expect(set!.description).toBe('Fundamental physics concepts');
      expect(set!.status).toBe('active');
    });

    test('shows validation errors for invalid data', async ({ page }) => {
      await page.goto(env.webUrl + '/recall-sets/new');

      // Submit empty form
      await page.getByRole('button', { name: 'Create Recall Set' }).click();

      // Should show validation errors
      await expect(page.getByText('Name is required')).toBeVisible();
      await expect(page.getByText('Description is required')).toBeVisible();
      await expect(page.getByText('Discussion system prompt is required')).toBeVisible();

      // Should not navigate
      await expect(page).toHaveURL('/recall-sets/new');
    });

    test('validates minimum prompt length', async ({ page }) => {
      await page.goto(env.webUrl + '/recall-sets/new');

      await page.getByLabel('Name').fill('Test');
      await page.getByLabel('Description').fill('Test description');
      await page.getByLabel('Discussion System Prompt').fill('Short'); // Too short

      await page.getByRole('button', { name: 'Create Recall Set' }).click();

      await expect(page.getByText(/at least 10 characters/)).toBeVisible();
    });

    test('cancel button returns to list', async ({ page }) => {
      await page.goto(env.webUrl + '/recall-sets/new');

      await page.getByLabel('Name').fill('Will be cancelled');
      await page.getByRole('button', { name: 'Cancel' }).click();

      await expect(page).toHaveURL('/recall-sets');

      // Should not have created the set
      const set = await env.db.query.recallSets.findFirst({
        where: eq(recallSets.name, 'Will be cancelled'),
      });
      expect(set).toBeUndefined();
    });
  });

  test.describe('Read', () => {
    test.beforeEach(async () => {
      await env.seedTestRecallSets(3);
    });

    test('displays all recall sets in list', async ({ page }) => {
      await page.goto(env.webUrl + '/recall-sets');

      const cards = page.locator('[data-testid="recall-set-card"]');
      await expect(cards).toHaveCount(3);
    });

    test('filters by status work correctly', async ({ page }) => {
      // Make one set paused, one archived
      await env.updateRecallSetStatus(env.testRecallSetIds[1], 'paused');
      await env.updateRecallSetStatus(env.testRecallSetIds[2], 'archived');

      await page.goto(env.webUrl + '/recall-sets');

      // All filter (default)
      await expect(page.locator('[data-testid="recall-set-card"]')).toHaveCount(3);

      // Active filter
      await page.getByRole('button', { name: /active/i }).click();
      await expect(page.locator('[data-testid="recall-set-card"]')).toHaveCount(1);

      // Paused filter
      await page.getByRole('button', { name: /paused/i }).click();
      await expect(page.locator('[data-testid="recall-set-card"]')).toHaveCount(1);

      // Archived filter
      await page.getByRole('button', { name: /archived/i }).click();
      await expect(page.locator('[data-testid="recall-set-card"]')).toHaveCount(1);
    });

    test('card shows correct summary statistics', async ({ page }) => {
      // Add points to first set
      await env.seedRecallPoints(env.testRecallSetIds[0], 5);

      await page.goto(env.webUrl + '/recall-sets');

      const card = page.locator('[data-testid="recall-set-card"]').first();
      await expect(card.getByText(/5 points/)).toBeVisible();
    });

    test('clicking card navigates to detail page', async ({ page }) => {
      await page.goto(env.webUrl + '/recall-sets');

      await page.locator('[data-testid="recall-set-card"]').first().click();
      await expect(page).toHaveURL(/\/recall-sets\/rs_/);
    });
  });

  test.describe('Update', () => {
    test('edits recall set name and description', async ({ page }) => {
      await env.seedTestRecallSet();
      await page.goto(env.webUrl + `/recall-sets/${env.testRecallSetId}`);

      // Click edit button
      await page.getByRole('button', { name: /edit/i }).click();

      // Modify fields
      await page.getByLabel('Name').fill('Updated Name');
      await page.getByLabel('Description').fill('Updated description');

      // Save
      await page.getByRole('button', { name: 'Save Changes' }).click();

      // Verify UI updates
      await expect(page.getByRole('heading', { name: 'Updated Name' })).toBeVisible();

      // Verify database
      const set = await env.db.query.recallSets.findFirst({
        where: eq(recallSets.id, env.testRecallSetId),
      });
      expect(set!.name).toBe('Updated Name');
      expect(set!.description).toBe('Updated description');
    });

    test('changes recall set status (pause/resume)', async ({ page }) => {
      await env.seedTestRecallSet();
      await page.goto(env.webUrl + `/recall-sets/${env.testRecallSetId}`);

      // Pause the set
      await page.getByRole('button', { name: /pause/i }).click();
      await expect(page.getByText('Paused')).toBeVisible();

      // Verify database
      let set = await env.db.query.recallSets.findFirst({
        where: eq(recallSets.id, env.testRecallSetId),
      });
      expect(set!.status).toBe('paused');

      // Resume the set
      await page.getByRole('button', { name: /resume|activate/i }).click();
      await expect(page.getByText('Active')).toBeVisible();

      set = await env.db.query.recallSets.findFirst({
        where: eq(recallSets.id, env.testRecallSetId),
      });
      expect(set!.status).toBe('active');
    });
  });

  test.describe('Delete', () => {
    test('archives recall set with confirmation', async ({ page }) => {
      await env.seedTestRecallSet();
      await page.goto(env.webUrl + `/recall-sets/${env.testRecallSetId}`);

      // Click archive button
      await page.getByRole('button', { name: /archive|delete/i }).click();

      // Confirmation dialog should appear
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByText(/are you sure/i)).toBeVisible();

      // Confirm deletion
      await page.getByRole('button', { name: /confirm|yes|archive/i }).click();

      // Should redirect to list
      await expect(page).toHaveURL('/recall-sets');

      // Verify database
      const set = await env.db.query.recallSets.findFirst({
        where: eq(recallSets.id, env.testRecallSetId),
      });
      expect(set!.status).toBe('archived');
    });

    test('cancel in confirmation modal does not delete', async ({ page }) => {
      await env.seedTestRecallSet();
      await page.goto(env.webUrl + `/recall-sets/${env.testRecallSetId}`);

      await page.getByRole('button', { name: /archive|delete/i }).click();
      await page.getByRole('button', { name: /cancel|no/i }).click();

      // Modal should close
      await expect(page.getByRole('dialog')).not.toBeVisible();

      // Still on detail page
      await expect(page).toHaveURL(/\/recall-sets\//);

      // Database unchanged
      const set = await env.db.query.recallSets.findFirst({
        where: eq(recallSets.id, env.testRecallSetId),
      });
      expect(set!.status).toBe('active');
    });
  });
});
```

### 05. Recall Points Management Tests

```typescript
// e2e/tests/05-recall-points.spec.ts

test.describe('Recall Points Management', () => {
  test.beforeEach(async () => {
    await env.seedTestRecallSet();
  });

  test('adds a new recall point', async ({ page }) => {
    await page.goto(env.webUrl + `/recall-sets/${env.testRecallSetId}`);

    // Click add point
    await page.getByRole('button', { name: 'Add Point' }).click();

    // Modal should open
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill form
    await page.getByLabel('Content').fill('E = mc²');
    await page.getByLabel('Context').fill('Einstein\'s mass-energy equivalence formula');

    // Submit
    await page.getByRole('button', { name: 'Add Recall Point' }).click();

    // Modal should close
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Point should appear in list
    await expect(page.getByText('E = mc²')).toBeVisible();

    // Verify database
    const point = await env.db.query.recallPoints.findFirst({
      where: eq(recallPoints.content, 'E = mc²'),
    });
    expect(point).toBeDefined();
    expect(point!.recallSetId).toBe(env.testRecallSetId);
    expect(point!.fsrsState).toBe('new');
  });

  test('validates recall point form', async ({ page }) => {
    await page.goto(env.webUrl + `/recall-sets/${env.testRecallSetId}`);
    await page.getByRole('button', { name: 'Add Point' }).click();

    // Submit empty
    await page.getByRole('button', { name: 'Add Recall Point' }).click();

    // Validation errors
    await expect(page.getByText(/content is required/i)).toBeVisible();
    await expect(page.getByText(/context is required/i)).toBeVisible();
  });

  test('edits an existing recall point', async ({ page }) => {
    await env.seedRecallPoints(env.testRecallSetId, 1);
    await page.goto(env.webUrl + `/recall-sets/${env.testRecallSetId}`);

    // Click edit on point
    const pointRow = page.locator('[data-testid="recall-point-row"]').first();
    await pointRow.getByRole('button', { name: /edit/i }).click();

    // Modal opens with existing data
    await expect(page.getByRole('dialog')).toBeVisible();

    // Modify
    await page.getByLabel('Content').fill('Updated content');
    await page.getByRole('button', { name: 'Save Changes' }).click();

    // Verify update
    await expect(page.getByText('Updated content')).toBeVisible();

    const point = await env.db.query.recallPoints.findFirst({
      where: eq(recallPoints.recallSetId, env.testRecallSetId),
    });
    expect(point!.content).toBe('Updated content');
  });

  test('deletes a recall point', async ({ page }) => {
    await env.seedRecallPoints(env.testRecallSetId, 2);
    await page.goto(env.webUrl + `/recall-sets/${env.testRecallSetId}`);

    // Get initial count
    await expect(page.locator('[data-testid="recall-point-row"]')).toHaveCount(2);

    // Delete first point
    const firstPoint = page.locator('[data-testid="recall-point-row"]').first();
    await firstPoint.getByRole('button', { name: /delete/i }).click();

    // Confirm
    await page.getByRole('button', { name: /confirm|yes/i }).click();

    // Should have 1 point now
    await expect(page.locator('[data-testid="recall-point-row"]')).toHaveCount(1);

    // Verify database
    const points = await env.db.query.recallPoints.findMany({
      where: eq(recallPoints.recallSetId, env.testRecallSetId),
    });
    expect(points).toHaveLength(1);
  });

  test('shows point FSRS status', async ({ page }) => {
    await env.seedRecallPoints(env.testRecallSetId, 1);
    await page.goto(env.webUrl + `/recall-sets/${env.testRecallSetId}`);

    const pointRow = page.locator('[data-testid="recall-point-row"]').first();

    // Should show status badge
    await expect(pointRow.getByText(/new|due|review/i)).toBeVisible();
  });
});
```

### 06. Sessions Tests

```typescript
// e2e/tests/06-sessions.spec.ts

test.describe('Session History', () => {
  test.beforeEach(async () => {
    await env.seedTestRecallSetWithSessions(3);
  });

  test('displays session list', async ({ page }) => {
    await page.goto(env.webUrl + '/sessions');

    await expect(page.getByRole('heading', { name: 'Session History' })).toBeVisible();
    await expect(page.locator('[data-testid="session-row"]')).toHaveCount(3);
  });

  test('filters by recall set', async ({ page }) => {
    await env.seedTestRecallSetWithSessions(2);
    await page.goto(env.webUrl + '/sessions');

    // Initially shows all
    const allCount = await page.locator('[data-testid="session-row"]').count();
    expect(allCount).toBe(5);

    // Filter by first set
    await page.getByRole('combobox', { name: /recall set/i }).selectOption(env.testRecallSetId);

    await expect(page.locator('[data-testid="session-row"]')).toHaveCount(3);
  });

  test('pagination works', async ({ page }) => {
    // Seed many sessions
    await env.seedSessions(env.testRecallSetId, 25);
    await page.goto(env.webUrl + '/sessions');

    // First page should show limited rows
    const firstPageRows = await page.locator('[data-testid="session-row"]').count();
    expect(firstPageRows).toBeLessThan(25);

    // Navigate to next page
    await page.getByRole('button', { name: /next/i }).click();

    // Should show different sessions
    await expect(page.locator('[data-testid="session-row"]')).toHaveCount(greaterThan(0));
  });

  test('session row shows correct data', async ({ page }) => {
    await page.goto(env.webUrl + '/sessions');

    const row = page.locator('[data-testid="session-row"]').first();

    // Should show recall set name
    await expect(row.getByText(env.testRecallSetName)).toBeVisible();

    // Should show status
    await expect(row.getByText(/completed|in progress|abandoned/i)).toBeVisible();

    // Should show date
    await expect(row.getByText(/\d{1,2}\/\d{1,2}\/\d{4}|\d+ hours? ago|today/i)).toBeVisible();
  });

  test('clicking row navigates to replay', async ({ page }) => {
    await page.goto(env.webUrl + '/sessions');

    await page.locator('[data-testid="session-row"]').first().click();
    await expect(page).toHaveURL(/\/sessions\/s_/);
  });
});

test.describe('Session Replay', () => {
  test('displays session summary', async ({ page }) => {
    await env.seedTestSessionWithMessages();
    await page.goto(env.webUrl + `/sessions/${env.testSessionId}`);

    // Summary card should be visible
    const summary = page.getByTestId('session-summary');
    await expect(summary).toBeVisible();

    await expect(summary.getByText(/duration/i)).toBeVisible();
    await expect(summary.getByText(/recall rate/i)).toBeVisible();
    await expect(summary.getByText(/points attempted/i)).toBeVisible();
  });

  test('displays transcript messages', async ({ page }) => {
    await env.seedTestSessionWithMessages(10);
    await page.goto(env.webUrl + `/sessions/${env.testSessionId}`);

    // Should show messages
    const messages = page.locator('[data-testid="transcript-message"]');
    await expect(messages.first()).toBeVisible();
    expect(await messages.count()).toBeGreaterThan(0);
  });

  test('shows evaluation markers', async ({ page }) => {
    await env.seedTestSessionWithEvaluation();
    await page.goto(env.webUrl + `/sessions/${env.testSessionId}`);

    // Evaluation marker should be visible
    await expect(page.getByTestId('evaluation-marker')).toBeVisible();
    await expect(page.getByText(/success|failed/i)).toBeVisible();
  });

  test('404 for invalid session ID', async ({ page }) => {
    await page.goto(env.webUrl + '/sessions/invalid-id-xyz');
    await expect(page.getByText(/not found|404/i)).toBeVisible();
  });
});
```

### 07. Live Session Tests (WebSocket)

```typescript
// e2e/tests/07-live-session.spec.ts

test.describe('Live Session', () => {
  test.beforeEach(async () => {
    await env.seedTestRecallSetWithPoints(2);
  });

  test('complete live session flow', async ({ page }) => {
    await page.goto(env.webUrl + '/session');

    // Start screen should show
    await expect(page.getByText('Start a Study Session')).toBeVisible();

    // Select recall set
    await page.getByText(env.testRecallSetName).click();

    // Click start
    await page.getByRole('button', { name: 'Start Session' }).click();

    // Should redirect to live session
    await expect(page).toHaveURL(/\/session\/s_/);

    // Wait for WebSocket connection
    await expect(page.getByText(/connected/i)).toBeVisible({ timeout: 10000 });

    // Opening message should appear
    const assistantMessage = page.locator('[data-testid="message-assistant"]').first();
    await expect(assistantMessage).toBeVisible({ timeout: 15000 });

    // Send user message
    await page.getByRole('textbox').fill('I know the answer!');
    await page.keyboard.press('Enter');

    // User message should appear
    await expect(page.locator('[data-testid="message-user"]').first()).toBeVisible();

    // Wait for response
    await expect(page.locator('[data-testid="message-assistant"]').nth(1)).toBeVisible({ timeout: 15000 });

    // Trigger evaluation
    await page.getByRole('button', { name: "I've got it!" }).click();

    // Evaluation result should show
    await expect(page.getByText(/great recall|keep practicing/i)).toBeVisible({ timeout: 15000 });

    // Continue to second point
    await page.getByRole('textbox').fill('Second answer!');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: "I've got it!" }).click();

    // Session should complete
    await expect(page.getByText('Session Complete!')).toBeVisible({ timeout: 30000 });
  });

  test('WebSocket reconnection on disconnect', async ({ page }) => {
    await page.goto(env.webUrl + `/session/${env.testSessionId}`);
    await expect(page.getByText(/connected/i)).toBeVisible({ timeout: 10000 });

    // Simulate disconnect by closing the WebSocket
    await page.evaluate(() => {
      // @ts-ignore
      window.__testWebSocket?.close();
    });

    // Should show reconnecting
    await expect(page.getByText(/reconnecting/i)).toBeVisible({ timeout: 5000 });

    // Should reconnect automatically
    await expect(page.getByText(/connected/i)).toBeVisible({ timeout: 15000 });
  });

  test('session can be abandoned', async ({ page }) => {
    await env.startTestSession();
    await page.goto(env.webUrl + `/session/${env.testSessionId}`);
    await expect(page.getByText(/connected/i)).toBeVisible({ timeout: 10000 });

    // Click exit button
    await page.getByRole('link', { name: 'Exit' }).click();

    // Should navigate away
    await expect(page).toHaveURL('/');

    // Verify session abandoned in DB
    const session = await env.db.query.sessions.findFirst({
      where: eq(sessions.id, env.testSessionId),
    });
    expect(session!.status).toBe('abandoned');
  });

  test('streaming messages display incrementally', async ({ page }) => {
    await env.startTestSession();
    await page.goto(env.webUrl + `/session/${env.testSessionId}`);
    await expect(page.getByText(/connected/i)).toBeVisible({ timeout: 10000 });

    // Send message to trigger response
    await page.getByRole('textbox').fill('Test message');
    await page.keyboard.press('Enter');

    // Should see streaming indicator
    await expect(page.getByTestId('streaming-indicator')).toBeVisible({ timeout: 5000 });

    // Content should update as it streams
    const streamingMessage = page.getByTestId('streaming-message');
    const initialText = await streamingMessage.textContent();

    // Wait a bit for more content
    await page.waitForTimeout(500);

    const updatedText = await streamingMessage.textContent();
    expect(updatedText!.length).toBeGreaterThanOrEqual(initialText!.length);
  });

  test('progress indicator updates during session', async ({ page }) => {
    await env.seedTestRecallSetWithPoints(3);
    await env.startTestSession();
    await page.goto(env.webUrl + `/session/${env.testSessionId}`);

    // Initial progress
    await expect(page.getByText('1 of 3')).toBeVisible({ timeout: 10000 });

    // Complete first point
    await page.getByRole('textbox').fill('Answer');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: "I've got it!" }).click();

    // Progress should update
    await expect(page.getByText('2 of 3')).toBeVisible({ timeout: 15000 });
  });

  test('timer displays correctly', async ({ page }) => {
    await env.startTestSession();
    await page.goto(env.webUrl + `/session/${env.testSessionId}`);

    // Timer should show 00:00 initially
    await expect(page.getByText('00:00')).toBeVisible({ timeout: 10000 });

    // Wait and verify timer increments
    await page.waitForTimeout(2000);
    await expect(page.getByText('00:01')).toBeVisible();
  });
});
```

### 08. Form Validation Tests

```typescript
// e2e/tests/08-forms.spec.ts

test.describe('Form Validation', () => {
  test.describe('Recall Set Form', () => {
    test('shows all required field errors', async ({ page }) => {
      await page.goto(env.webUrl + '/recall-sets/new');

      await page.getByRole('button', { name: 'Create Recall Set' }).click();

      await expect(page.getByText('Name is required')).toBeVisible();
      await expect(page.getByText('Description is required')).toBeVisible();
      await expect(page.getByText('Discussion system prompt is required')).toBeVisible();
    });

    test('validates name max length', async ({ page }) => {
      await page.goto(env.webUrl + '/recall-sets/new');

      // Try to type 101 characters
      const longName = 'a'.repeat(101);
      await page.getByLabel('Name').fill(longName);

      // Should be truncated or show error
      const value = await page.getByLabel('Name').inputValue();
      expect(value.length).toBeLessThanOrEqual(100);
    });

    test('validates description max length', async ({ page }) => {
      await page.goto(env.webUrl + '/recall-sets/new');

      await page.getByLabel('Description').fill('a'.repeat(1001));
      await page.getByRole('button', { name: 'Create Recall Set' }).click();

      await expect(page.getByText(/1000 characters or less/)).toBeVisible();
    });

    test('validates prompt minimum length', async ({ page }) => {
      await page.goto(env.webUrl + '/recall-sets/new');

      await page.getByLabel('Name').fill('Test');
      await page.getByLabel('Description').fill('Test desc');
      await page.getByLabel('Discussion System Prompt').fill('Too short');

      await page.getByRole('button', { name: 'Create Recall Set' }).click();

      await expect(page.getByText(/at least 10 characters/)).toBeVisible();
    });

    test('clears errors on valid input', async ({ page }) => {
      await page.goto(env.webUrl + '/recall-sets/new');

      // Trigger errors
      await page.getByRole('button', { name: 'Create Recall Set' }).click();
      await expect(page.getByText('Name is required')).toBeVisible();

      // Fix the error
      await page.getByLabel('Name').fill('Valid Name');

      // Error should clear
      await expect(page.getByText('Name is required')).not.toBeVisible();
    });

    test('shows loading state during submission', async ({ page }) => {
      await page.goto(env.webUrl + '/recall-sets/new');

      await page.getByLabel('Name').fill('Test Set');
      await page.getByLabel('Description').fill('Test description');
      await page.getByLabel('Discussion System Prompt').fill('You are a test tutor.');

      // Start submission
      const submitButton = page.getByRole('button', { name: 'Create Recall Set' });
      await submitButton.click();

      // Should show loading
      await expect(submitButton).toBeDisabled();
      await expect(page.getByText(/creating|loading/i)).toBeVisible();
    });

    test('prevents double submission', async ({ page }) => {
      await page.goto(env.webUrl + '/recall-sets/new');

      await page.getByLabel('Name').fill('Double Submit Test');
      await page.getByLabel('Description').fill('Testing double submission');
      await page.getByLabel('Discussion System Prompt').fill('You are a test tutor.');

      // Click rapidly multiple times
      const submitButton = page.getByRole('button', { name: 'Create Recall Set' });
      await submitButton.click();
      await submitButton.click();
      await submitButton.click();

      // Wait for completion
      await page.waitForURL(/\/recall-sets\/rs_/);

      // Should only create one set
      const sets = await env.db.query.recallSets.findMany({
        where: eq(recallSets.name, 'Double Submit Test'),
      });
      expect(sets).toHaveLength(1);
    });
  });

  test.describe('Recall Point Form', () => {
    test.beforeEach(async () => {
      await env.seedTestRecallSet();
    });

    test('validates content min length', async ({ page }) => {
      await page.goto(env.webUrl + `/recall-sets/${env.testRecallSetId}`);
      await page.getByRole('button', { name: 'Add Point' }).click();

      await page.getByLabel('Content').fill('Short');
      await page.getByLabel('Context').fill('Valid context');
      await page.getByRole('button', { name: 'Add Recall Point' }).click();

      await expect(page.getByText(/at least 10 characters/)).toBeVisible();
    });

    test('validates context min length', async ({ page }) => {
      await page.goto(env.webUrl + `/recall-sets/${env.testRecallSetId}`);
      await page.getByRole('button', { name: 'Add Point' }).click();

      await page.getByLabel('Content').fill('Valid content here');
      await page.getByLabel('Context').fill('Short');
      await page.getByRole('button', { name: 'Add Recall Point' }).click();

      await expect(page.getByText(/at least 10 characters/)).toBeVisible();
    });
  });
});
```

### 09. Error State Tests

```typescript
// e2e/tests/09-error-states.spec.ts

test.describe('Error Handling', () => {
  test('dashboard shows error state on API failure', async ({ page }) => {
    // Stop the API server temporarily
    await env.stopApiServer();

    await page.goto(env.webUrl);

    // Should show error state
    await expect(page.getByText(/failed to load|error/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /retry|try again/i })).toBeVisible();

    // Restart server
    await env.startApiServer();

    // Retry should work
    await page.getByRole('button', { name: /retry|try again/i }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('404 page displays correctly', async ({ page }) => {
    await page.goto(env.webUrl + '/definitely-not-a-real-route');

    await expect(page.getByText(/not found|404/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /home|dashboard/i })).toBeVisible();
  });

  test('recall set detail shows 404 for invalid ID', async ({ page }) => {
    await page.goto(env.webUrl + '/recall-sets/rs_invalid_id_xyz');

    await expect(page.getByText(/not found|doesn't exist/i)).toBeVisible();
  });

  test('session shows error on WebSocket failure', async ({ page }) => {
    await env.seedTestRecallSetWithPoints(1);
    await env.startTestSession();

    // Block WebSocket connections
    await page.route(/\/api\/session\/ws/, route => route.abort());

    await page.goto(env.webUrl + `/session/${env.testSessionId}`);

    // Should show connection error
    await expect(page.getByText(/connection error|failed to connect/i)).toBeVisible({ timeout: 15000 });

    // Retry button should be visible
    await expect(page.getByRole('button', { name: /try again|retry/i })).toBeVisible();
  });

  test('form submission shows error on API failure', async ({ page }) => {
    await page.goto(env.webUrl + '/recall-sets/new');

    // Fill form
    await page.getByLabel('Name').fill('Test');
    await page.getByLabel('Description').fill('Test description');
    await page.getByLabel('Discussion System Prompt').fill('You are a test tutor.');

    // Block the API
    await page.route('**/api/recall-sets', route => route.abort());

    // Submit
    await page.getByRole('button', { name: 'Create Recall Set' }).click();

    // Should show error
    await expect(page.getByText(/error|failed/i)).toBeVisible({ timeout: 5000 });

    // Should stay on form (not navigate)
    await expect(page).toHaveURL('/recall-sets/new');
  });

  test('network timeout shows appropriate message', async ({ page }) => {
    // Slow down all requests
    await page.route('**/api/**', async route => {
      await new Promise(r => setTimeout(r, 30000));
      await route.continue();
    });

    await page.goto(env.webUrl);

    // Should show loading initially, then timeout error
    await expect(page.getByText(/loading/i)).toBeVisible();
    await expect(page.getByText(/timeout|taking too long/i)).toBeVisible({ timeout: 35000 });
  });
});
```

### 10. Responsive Design Tests

```typescript
// e2e/tests/10-responsive.spec.ts

test.describe('Responsive Design', () => {
  test.describe('Mobile (375px)', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('hamburger menu works', async ({ page }) => {
      await page.goto(env.webUrl);

      // Sidebar should be hidden on mobile
      const sidebar = page.getByTestId('sidebar');
      await expect(sidebar).not.toBeVisible();

      // Hamburger should be visible
      const hamburger = page.getByRole('button', { name: /menu/i });
      await expect(hamburger).toBeVisible();

      // Open menu
      await hamburger.click();
      await expect(sidebar).toBeVisible();

      // Navigate
      await page.getByRole('link', { name: 'Recall Sets' }).click();
      await expect(page).toHaveURL('/recall-sets');

      // Menu should close
      await expect(sidebar).not.toBeVisible();
    });

    test('cards stack vertically', async ({ page }) => {
      await env.seedTestRecallSets(3);
      await page.goto(env.webUrl + '/recall-sets');

      const cards = page.locator('[data-testid="recall-set-card"]');
      const boxes = await cards.evaluateAll(els =>
        els.map(el => el.getBoundingClientRect())
      );

      // All cards should have same x position (stacked)
      const xPositions = boxes.map(b => b.x);
      expect(new Set(xPositions).size).toBe(1);
    });

    test('forms are usable', async ({ page }) => {
      await page.goto(env.webUrl + '/recall-sets/new');

      // All inputs should be reachable and fillable
      await page.getByLabel('Name').fill('Mobile Test');
      await page.getByLabel('Description').fill('Testing on mobile');
      await page.getByLabel('Discussion System Prompt').fill('Mobile test prompt here');

      // Buttons should be tappable (min 44x44)
      const submitButton = page.getByRole('button', { name: 'Create Recall Set' });
      const box = await submitButton.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    });

    test('live session works on mobile', async ({ page }) => {
      await env.seedTestRecallSetWithPoints(1);
      await env.startTestSession();
      await page.goto(env.webUrl + `/session/${env.testSessionId}`);

      // Should be able to type and send
      await expect(page.getByRole('textbox')).toBeVisible();
      await page.getByRole('textbox').fill('Mobile message');
      await page.keyboard.press('Enter');

      // Message should appear
      await expect(page.getByTestId('message-user')).toBeVisible();
    });
  });

  test.describe('Tablet (768px)', () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test('sidebar is visible', async ({ page }) => {
      await page.goto(env.webUrl);

      const sidebar = page.getByTestId('sidebar');
      await expect(sidebar).toBeVisible();
    });

    test('cards show in 2-column grid', async ({ page }) => {
      await env.seedTestRecallSets(4);
      await page.goto(env.webUrl + '/recall-sets');

      const cards = page.locator('[data-testid="recall-set-card"]');
      const boxes = await cards.evaluateAll(els =>
        els.map(el => el.getBoundingClientRect())
      );

      // First two should be on same row (same y)
      expect(boxes[0].y).toBe(boxes[1].y);
      // Third should be on next row (different y)
      expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
    });
  });

  test.describe('Desktop (1440px)', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('cards show in 3-column grid', async ({ page }) => {
      await env.seedTestRecallSets(6);
      await page.goto(env.webUrl + '/recall-sets');

      const cards = page.locator('[data-testid="recall-set-card"]');
      const boxes = await cards.evaluateAll(els =>
        els.map(el => el.getBoundingClientRect())
      );

      // First three should be on same row
      expect(boxes[0].y).toBe(boxes[1].y);
      expect(boxes[1].y).toBe(boxes[2].y);
      // Fourth should be on next row
      expect(boxes[3].y).toBeGreaterThan(boxes[0].y);
    });

    test('wide content areas use max-width', async ({ page }) => {
      await page.goto(env.webUrl);

      const main = page.locator('main');
      const box = await main.boundingBox();

      // Should not stretch to full width
      expect(box!.width).toBeLessThan(1440);
    });
  });
});
```

### 11. Database Integrity Tests

```typescript
// e2e/tests/11-database-integrity.spec.ts

test.describe('Database Integrity', () => {
  test('creating a recall set persists all fields correctly', async ({ page }) => {
    await page.goto(env.webUrl + '/recall-sets/new');

    const testData = {
      name: 'DB Integrity Test',
      description: 'Testing that all fields persist correctly',
      discussionSystemPrompt: 'You are a test tutor. This is a longer prompt to test.',
    };

    await page.getByLabel('Name').fill(testData.name);
    await page.getByLabel('Description').fill(testData.description);
    await page.getByLabel('Discussion System Prompt').fill(testData.discussionSystemPrompt);
    await page.getByRole('button', { name: 'Create Recall Set' }).click();

    // Wait for navigation
    await page.waitForURL(/\/recall-sets\/rs_/);
    const setId = page.url().split('/').pop()!;

    // Verify all fields in database
    const set = await env.db.query.recallSets.findFirst({
      where: eq(recallSets.id, setId),
    });

    expect(set).toBeDefined();
    expect(set!.name).toBe(testData.name);
    expect(set!.description).toBe(testData.description);
    expect(set!.discussionSystemPrompt).toBe(testData.discussionSystemPrompt);
    expect(set!.status).toBe('active');
    expect(set!.createdAt).toBeDefined();
    expect(set!.updatedAt).toBeDefined();
  });

  test('creating a recall point initializes FSRS state correctly', async ({ page }) => {
    await env.seedTestRecallSet();
    await page.goto(env.webUrl + `/recall-sets/${env.testRecallSetId}`);

    await page.getByRole('button', { name: 'Add Point' }).click();
    await page.getByLabel('Content').fill('Test FSRS initialization');
    await page.getByLabel('Context').fill('Testing that FSRS state is correct');
    await page.getByRole('button', { name: 'Add Recall Point' }).click();

    // Wait for point to appear
    await expect(page.getByText('Test FSRS initialization')).toBeVisible();

    // Verify FSRS state
    const point = await env.db.query.recallPoints.findFirst({
      where: eq(recallPoints.content, 'Test FSRS initialization'),
    });

    expect(point).toBeDefined();
    expect(point!.fsrsState).toBe('new');
    expect(point!.fsrsReps).toBe(0);
    expect(point!.fsrsLapses).toBe(0);
    expect(point!.fsrsDifficulty).toBe(0);
    expect(point!.fsrsStability).toBe(0);
    expect(point!.fsrsLastReview).toBeNull();
    expect(point!.recallHistory).toEqual([]);

    // Due date should be now or past
    expect(new Date(point!.fsrsDue).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  test('completing a session updates FSRS state correctly', async ({ page }) => {
    await env.seedTestRecallSetWithPoints(1);

    // Get initial state
    const initialPoint = await env.db.query.recallPoints.findFirst({
      where: eq(recallPoints.recallSetId, env.testRecallSetId),
    });

    expect(initialPoint!.fsrsState).toBe('new');
    expect(initialPoint!.fsrsReps).toBe(0);

    // Complete a session
    await page.goto(env.webUrl + '/session');
    await page.getByText(env.testRecallSetName).click();
    await page.getByRole('button', { name: 'Start Session' }).click();

    await expect(page).toHaveURL(/\/session\/s_/);
    await expect(page.getByText(/connected/i)).toBeVisible({ timeout: 10000 });

    // Wait for opening message
    await expect(page.locator('[data-testid="message-assistant"]')).toBeVisible({ timeout: 15000 });

    // Respond and trigger evaluation
    await page.getByRole('textbox').fill('My answer');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: "I've got it!" }).click();

    // Wait for completion
    await expect(page.getByText('Session Complete!')).toBeVisible({ timeout: 30000 });

    // Verify FSRS updated
    const updatedPoint = await env.db.query.recallPoints.findFirst({
      where: eq(recallPoints.id, initialPoint!.id),
    });

    expect(updatedPoint!.fsrsState).not.toBe('new');
    expect(updatedPoint!.fsrsReps).toBe(1);
    expect(updatedPoint!.fsrsLastReview).not.toBeNull();
    expect(new Date(updatedPoint!.fsrsDue).getTime()).toBeGreaterThan(Date.now());
    expect(updatedPoint!.recallHistory).toHaveLength(1);
    expect(updatedPoint!.recallHistory[0].success).toBeDefined();
  });

  test('session messages are persisted correctly', async ({ page }) => {
    await env.seedTestRecallSetWithPoints(1);
    await env.startTestSession();

    await page.goto(env.webUrl + `/session/${env.testSessionId}`);
    await expect(page.getByText(/connected/i)).toBeVisible({ timeout: 10000 });

    // Wait for opening message
    await expect(page.locator('[data-testid="message-assistant"]')).toBeVisible({ timeout: 15000 });

    // Send a specific message
    const testMessage = 'This is a test message at ' + Date.now();
    await page.getByRole('textbox').fill(testMessage);
    await page.keyboard.press('Enter');

    // Wait for it to appear
    await expect(page.getByText(testMessage)).toBeVisible();

    // Verify in database
    const messages = await env.db.query.sessionMessages.findMany({
      where: eq(sessionMessages.sessionId, env.testSessionId),
    });

    const userMessages = messages.filter(m => m.role === 'user');
    const ourMessage = userMessages.find(m => m.content === testMessage);

    expect(ourMessage).toBeDefined();
    expect(ourMessage!.role).toBe('user');
    expect(ourMessage!.timestamp).toBeDefined();
  });

  test('archiving a set does not delete associated data', async ({ page }) => {
    await env.seedTestRecallSetWithPoints(3);
    await env.seedTestSession();

    // Get counts before archive
    const pointsBefore = await env.db.query.recallPoints.findMany({
      where: eq(recallPoints.recallSetId, env.testRecallSetId),
    });
    expect(pointsBefore).toHaveLength(3);

    // Archive the set
    await page.goto(env.webUrl + `/recall-sets/${env.testRecallSetId}`);
    await page.getByRole('button', { name: /archive/i }).click();
    await page.getByRole('button', { name: /confirm/i }).click();

    // Verify set is archived
    const archivedSet = await env.db.query.recallSets.findFirst({
      where: eq(recallSets.id, env.testRecallSetId),
    });
    expect(archivedSet!.status).toBe('archived');

    // Verify points still exist
    const pointsAfter = await env.db.query.recallPoints.findMany({
      where: eq(recallPoints.recallSetId, env.testRecallSetId),
    });
    expect(pointsAfter).toHaveLength(3);

    // Verify session still exists
    const session = await env.db.query.sessions.findFirst({
      where: eq(sessions.recallSetId, env.testRecallSetId),
    });
    expect(session).toBeDefined();
  });

  test('abandoning session sets correct status and timestamp', async ({ page }) => {
    await env.seedTestRecallSetWithPoints(1);
    await env.startTestSession();

    // Get session before
    const sessionBefore = await env.db.query.sessions.findFirst({
      where: eq(sessions.id, env.testSessionId),
    });
    expect(sessionBefore!.status).toBe('in_progress');
    expect(sessionBefore!.endedAt).toBeNull();

    // Start the session
    await page.goto(env.webUrl + `/session/${env.testSessionId}`);
    await expect(page.getByText(/connected/i)).toBeVisible({ timeout: 10000 });

    // Exit (abandon)
    await page.getByRole('link', { name: 'Exit' }).click();

    // Verify status updated
    const sessionAfter = await env.db.query.sessions.findFirst({
      where: eq(sessions.id, env.testSessionId),
    });
    expect(sessionAfter!.status).toBe('abandoned');
    expect(sessionAfter!.endedAt).not.toBeNull();
  });
});
```

---

## Playwright Configuration

```typescript
// e2e/playwright.config.ts

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined, // Serial in CI for database isolation
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results.json' }],
  ],

  // Global timeout for each test
  timeout: 60000,

  // Assertion timeout
  expect: {
    timeout: 10000,
  },

  use: {
    // Base URL will be set by fixtures
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // Desktop Chrome
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // Desktop Firefox
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    // Desktop Safari
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // Mobile Chrome
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },

    // Mobile Safari
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },

    // Tablet
    {
      name: 'Tablet',
      use: {
        viewport: { width: 768, height: 1024 },
      },
    },
  ],

  // Global setup/teardown
  globalSetup: require.resolve('./fixtures/global-setup'),
  globalTeardown: require.resolve('./fixtures/global-teardown'),
});
```

---

## Required data-testid Attributes

The following `data-testid` attributes must be added to the codebase for reliable test selection:

### Dashboard
- `stat-total-sets`
- `stat-active-sets`
- `stat-total-sessions`
- `due-points-card`
- `recent-sessions`
- `session-card`
- `upcoming-reviews`
- `streak-display`

### Recall Sets
- `recall-set-card`
- `recall-point-row`

### Sessions
- `session-row`
- `session-summary`
- `transcript-message`
- `evaluation-marker`

### Live Session
- `message-assistant`
- `message-user`
- `streaming-indicator`
- `streaming-message`

### Layout
- `sidebar`

---

## Test Data Factories

```typescript
// e2e/fixtures/data.ts

export const testRecallSetData = {
  basic: {
    name: 'E2E Test Set',
    description: 'A recall set for automated e2e testing',
    discussionSystemPrompt: 'You are a test tutor. Keep responses brief.',
  },
  physics: {
    name: 'Physics Fundamentals',
    description: 'Basic physics concepts',
    discussionSystemPrompt: 'You are a physics tutor helping students understand mechanics.',
  },
};

export const testRecallPointData = {
  mitochondria: {
    content: 'The mitochondria is the powerhouse of the cell.',
    context: 'Basic cell biology fact commonly used in testing.',
  },
  waterFreezing: {
    content: 'Water freezes at 0 degrees Celsius.',
    context: 'Basic physics fact for testing.',
  },
  emc2: {
    content: 'E = mc² represents the relationship between energy and mass.',
    context: 'Einstein\'s famous equation from special relativity.',
  },
};
```

---

## Running the Tests

```bash
# Install Playwright
cd e2e
bun add -d @playwright/test
bunx playwright install

# Run all tests
bunx playwright test

# Run specific test file
bunx playwright test tests/01-smoke.spec.ts

# Run in headed mode (watch browser)
bunx playwright test --headed

# Run in debug mode
bunx playwright test --debug

# Generate HTML report
bunx playwright show-report

# Run only critical smoke tests
bunx playwright test tests/01-smoke.spec.ts
```

---

## CI/CD Integration

```yaml
# .github/workflows/e2e.yml

name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: |
          bun install
          cd web && bun install
          cd ../e2e && bun install

      - name: Install Playwright browsers
        run: cd e2e && bunx playwright install --with-deps

      - name: Run E2E tests
        run: cd e2e && bunx playwright test

      - name: Upload test report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: e2e/playwright-report/
          retention-days: 7
```

---

## Confidence Guarantee

When all tests in this suite pass:

1. **Core Functionality**: Every major feature works end-to-end
2. **Data Integrity**: All database operations persist correctly
3. **FSRS Integration**: Spaced repetition scheduling works as designed
4. **WebSocket Reliability**: Real-time sessions connect and communicate
5. **Form Validation**: All user input is properly validated
6. **Error Handling**: Failures are handled gracefully
7. **Responsive Design**: App works on mobile, tablet, and desktop
8. **Navigation**: All routes are accessible and functional
9. **Empty States**: App handles no-data scenarios gracefully
10. **Edge Cases**: Concurrent access, double submissions, etc.

**If these tests pass, the web application is ready for production use.**
