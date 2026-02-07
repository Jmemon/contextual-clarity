/**
 * Playwright Configuration
 *
 * Configures end-to-end tests for the Contextual Clarity web application.
 * Runs tests across multiple browsers and viewports to ensure broad compatibility.
 */

import { defineConfig, devices } from '@playwright/test';

// Read environment variables for configuration
// API defaults to 3011 per .env, web defaults to 5173
const API_PORT = process.env.API_PORT || '3011';
const WEB_PORT = process.env.WEB_PORT || '5173';
const BASE_URL = process.env.BASE_URL || `http://localhost:${WEB_PORT}`;

export default defineConfig({
  // Global setup/teardown for database management
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',

  // Directory containing test files
  testDir: './tests',

  // Run tests in parallel for faster execution
  // Disabled in CI to ensure database isolation between tests
  fullyParallel: !process.env.CI,

  // Fail the build on CI if test.only is accidentally left in
  forbidOnly: !!process.env.CI,

  // Retry failed tests in CI for flakiness resilience
  retries: process.env.CI ? 2 : 0,

  // Number of parallel workers
  // Limit to 2 to avoid overwhelming the API during parallel test execution
  // Use 1 in CI to ensure database isolation
  workers: process.env.CI ? 1 : 2,

  // Reporter configuration
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results.json' }],
  ],

  // Global timeout for each test (60 seconds)
  timeout: 60000,

  // Timeout for expect assertions (10 seconds)
  expect: {
    timeout: 10000,
  },

  // Shared settings for all tests
  use: {
    // Base URL for navigation
    baseURL: BASE_URL,

    // Capture trace on first retry for debugging
    trace: 'on-first-retry',

    // Take screenshot only on failure
    screenshot: 'only-on-failure',

    // Record video only on failure
    video: 'retain-on-failure',

    // Action timeout (clicking, filling, etc.)
    actionTimeout: 10000,

    // Navigation timeout
    navigationTimeout: 30000,
  },

  // Browser/device configurations to test
  projects: [
    // Desktop Chrome - Primary browser
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Store state for faster subsequent tests
        storageState: undefined,
      },
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

    // Mobile Chrome (Android)
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },

    // Mobile Safari (iOS)
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },

    // Tablet viewport
    {
      name: 'tablet',
      use: {
        viewport: { width: 768, height: 1024 },
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      },
    },
  ],

  // Web server configuration
  // Starts the API server and Vite dev server before running tests
  webServer: [
    {
      // API server
      command: `cd .. && DATABASE_PATH=./e2e-test.db bun run server`,
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
      env: {
        PORT: API_PORT,
        DATABASE_PATH: './e2e-test.db',
        // Use mock LLM for deterministic tests
        LLM_MOCK_MODE: 'true',
      },
    },
    {
      // Vite dev server
      command: `cd ../web && bun run dev --port ${WEB_PORT}`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});
