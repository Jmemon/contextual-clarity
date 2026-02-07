/**
 * Smoke Tests
 *
 * Basic connectivity and rendering tests to verify the application starts
 * correctly and essential elements are visible. These tests run first and
 * must pass before more complex tests are meaningful.
 *
 * Tests verify:
 * - Application loads successfully
 * - Core navigation elements are present
 * - API health endpoint responds
 * - No JavaScript console errors
 */

import { test, expect } from '../fixtures/test-setup';

test.describe('Smoke Tests', () => {
  test('homepage loads successfully', async ({ page, testEnv }) => {
    // Navigate to the homepage
    await page.goto(testEnv.webUrl);

    // Verify the page title contains the app name
    await expect(page).toHaveTitle(/Contextual Clarity/i);

    // Verify the main heading is visible
    await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible();
  });

  test('sidebar navigation is visible on desktop', async ({ page, testEnv }) => {
    await page.goto(testEnv.webUrl);

    // On desktop, sidebar should be visible
    await page.setViewportSize({ width: 1280, height: 800 });

    const sidebar = page.getByTestId('sidebar');
    await expect(sidebar).toBeVisible();

    // Verify all main navigation links are present
    await expect(page.getByRole('link', { name: /Dashboard/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Recall Sets/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Sessions/i })).toBeVisible();
  });

  test('API health check responds successfully', async ({ testEnv }) => {
    // Directly test the API health endpoint (at /health, not /api/health)
    const response = await fetch(`${testEnv.apiUrl}/health`);

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);

    const data = await response.json();
    // Response format: { success: true, data: { status: 'ok', ... } }
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('ok');
  });

  test('no console errors on page load', async ({ page, testEnv }) => {
    // Collect console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(testEnv.webUrl);

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    // Filter out known acceptable errors (e.g., third-party scripts)
    const criticalErrors = consoleErrors.filter(
      (error) =>
        !error.includes('favicon') && // favicon not found is acceptable
        !error.includes('net::') // network errors during test setup
    );

    // No critical JavaScript errors should occur
    expect(criticalErrors).toHaveLength(0);
  });

  test('page renders within acceptable time', async ({ page, testEnv }) => {
    // Record start time
    const startTime = Date.now();

    await page.goto(testEnv.webUrl);

    // Wait for meaningful content
    await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible();

    // Check that page rendered within 5 seconds
    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(5000);
  });

  test('static assets load correctly', async ({ page, testEnv }) => {
    // Track failed requests
    const failedRequests: string[] = [];
    page.on('requestfailed', (request) => {
      failedRequests.push(request.url());
    });

    await page.goto(testEnv.webUrl);
    await page.waitForLoadState('networkidle');

    // Filter out expected failures (external resources, etc.)
    const criticalFailures = failedRequests.filter(
      (url) =>
        url.includes(testEnv.webUrl) || url.includes(testEnv.apiUrl)
    );

    expect(criticalFailures).toHaveLength(0);
  });

  test('app branding is displayed', async ({ page, testEnv }) => {
    // Set desktop viewport to ensure sidebar is visible
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(testEnv.webUrl);

    // Check for app logo/branding - heading in sidebar
    await expect(page.getByRole('heading', { name: 'Contextual' })).toBeVisible();
    // Check sidebar is visible (which contains the branding)
    await expect(page.getByTestId('sidebar')).toBeVisible();
  });

  test('viewport meta tag is present for mobile', async ({ page, testEnv }) => {
    await page.goto(testEnv.webUrl);

    // Verify viewport meta tag exists for proper mobile rendering
    const viewportMeta = page.locator('meta[name="viewport"]');
    await expect(viewportMeta).toHaveAttribute('content', /width=device-width/);
  });
});
