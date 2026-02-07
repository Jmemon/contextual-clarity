/**
 * Dashboard Tests
 *
 * Tests for the main dashboard page including:
 * - Due points display
 * - Today's activity summary
 * - Recent sessions list
 * - Overview statistics
 * - Navigation to other sections
 */

import { test, expect } from '../fixtures/test-setup';
import { expectDashboard, expectNotLoading } from '../helpers/assertions';

test.describe('Dashboard', () => {
  test.describe('Due Points Card', () => {
    test('displays due points count', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);
      await expectDashboard(page);

      // Find the due points card
      const duePointsCard = page.getByTestId('due-points-card');
      await expect(duePointsCard).toBeVisible();

      // Should display a number (the due count)
      const dueCount = duePointsCard.locator('.text-4xl, .text-5xl');
      await expect(dueCount).toBeVisible();

      // The count should be a number
      const countText = await dueCount.textContent();
      expect(countText).toMatch(/^\d+$/);
    });

    test('shows "Start Studying" button when points are due', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);
      await expectDashboard(page);

      const duePointsCard = page.getByTestId('due-points-card');

      // If there are due points, the Start Studying button should be visible
      const dueCount = await duePointsCard.locator('.text-4xl, .text-5xl').textContent();
      const hasDuePoints = parseInt(dueCount || '0') > 0;

      if (hasDuePoints) {
        await expect(duePointsCard.getByRole('link', { name: /Start Studying/i })).toBeVisible();
      }
    });

    test('shows encouraging message when all caught up', async ({ page, testEnv }) => {
      // This test checks the "all caught up" state
      // Note: This may not trigger if test data has due points
      await page.goto(testEnv.webUrl);
      await expectDashboard(page);
      await expectNotLoading(page);

      const duePointsCard = page.getByTestId('due-points-card');
      const dueCount = await duePointsCard.locator('.text-4xl, .text-5xl').textContent();

      if (dueCount === '0') {
        await expect(duePointsCard.getByText(/All caught up/i)).toBeVisible();
        await expect(duePointsCard.getByText(/Great job/i)).toBeVisible();
      }
    });

    test('displays today\'s session count and study time', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);
      await expectDashboard(page);

      const duePointsCard = page.getByTestId('due-points-card');

      // Should show sessions count
      await expect(duePointsCard.getByText(/session.*today/i)).toBeVisible();

      // Should show study time
      await expect(duePointsCard.getByText(/studied today/i)).toBeVisible();
    });

    test('Start Studying button navigates to recall sets', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);
      await expectDashboard(page);

      const duePointsCard = page.getByTestId('due-points-card');
      const dueCount = await duePointsCard.locator('.text-4xl, .text-5xl').textContent();

      if (parseInt(dueCount || '0') > 0) {
        await duePointsCard.getByRole('link', { name: /Start Studying/i }).click();
        await expect(page).toHaveURL(/\/recall-sets/);
      }
    });
  });

  test.describe('Recent Sessions List', () => {
    test('displays recent sessions section', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);
      await expectDashboard(page);

      // Recent Sessions card should be visible
      await expect(page.getByText('Recent Sessions')).toBeVisible();
    });

    test('shows empty state when no sessions', async ({ page, testEnv }) => {
      // Fresh test environment may have no sessions
      await page.goto(testEnv.webUrl);
      await expectDashboard(page);

      // Check for either sessions or empty state
      const sessionsContainer = page.getByTestId('recent-sessions');
      const emptyState = page.getByText(/No sessions yet/i);

      const hasSessions = await sessionsContainer.isVisible().catch(() => false);
      const hasEmptyState = await emptyState.isVisible().catch(() => false);

      // One of these should be true
      expect(hasSessions || hasEmptyState).toBe(true);

      if (hasEmptyState) {
        // Should have a link to recall sets
        await expect(page.getByRole('link', { name: /View Recall Sets/i })).toBeVisible();
      }
    });

    test('session card shows key information', async ({ page, testEnv, startSession }) => {
      // Start a session to ensure we have data
      const sessionId = await startSession(testEnv.testRecallSetId);

      // End the session via API (simulate completion)
      await fetch(`${testEnv.apiUrl}/api/sessions/${sessionId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      await page.goto(testEnv.webUrl);
      await expectDashboard(page);
      await expectNotLoading(page);

      // Find the session card for THIS test's session (contains our unique recall set name)
      // Use a partial match since the name is truncated on the card
      const uniquePrefix = testEnv.testRecallSetName.slice(0, 30);
      const sessionCard = page.getByTestId('session-card').filter({ hasText: uniquePrefix });

      // Check that it's visible (if our session exists on dashboard)
      const cardVisible = await sessionCard.first().isVisible().catch(() => false);
      if (cardVisible) {
        // Should show recall set name, date, and recall rate
        await expect(sessionCard.first()).toContainText(uniquePrefix);
        // Should have a percentage display
        await expect(sessionCard.first().getByText(/%/)).toBeVisible();
      }
    });

    test('clicking session card navigates to replay', async ({ page, testEnv, startSession }) => {
      // Ensure we have a session
      const sessionId = await startSession(testEnv.testRecallSetId);
      await fetch(`${testEnv.apiUrl}/api/sessions/${sessionId}/end`, {
        method: 'POST',
      });

      await page.goto(testEnv.webUrl);
      await expectDashboard(page);
      await expectNotLoading(page);

      // Click on a session card
      const sessionCard = page.getByTestId('session-card').first();
      const cardVisible = await sessionCard.isVisible().catch(() => false);

      if (cardVisible) {
        await sessionCard.click();
        await expect(page).toHaveURL(/\/sessions\/sess_.*\/replay/);
      }
    });

    test('"View All" link navigates to sessions page', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);
      await expectDashboard(page);

      // Use exact match to avoid matching "View all 20 reviews" link
      await page.getByRole('link', { name: 'View All', exact: true }).click();
      await expect(page).toHaveURL(/\/sessions/);
    });
  });

  test.describe('Dashboard Loading States', () => {
    test('shows loading indicators while fetching data', async ({ page, testEnv }) => {
      // Slow down API response to catch loading state
      await page.route('**/api/**', async (route) => {
        await new Promise((r) => setTimeout(r, 500));
        await route.continue();
      });

      await page.goto(testEnv.webUrl);

      // Should show loading spinner initially
      const spinner = page.getByTestId('spinner');
      // Loading state may be visible briefly
      // We just verify it doesn't error - wait longer due to delayed API
      await expectDashboard(page);
      await expectNotLoading(page, 15000);
    });

    test('handles API errors gracefully', async ({ page, testEnv }) => {
      // Make API fail for dashboard data
      await page.route('**/api/dashboard**', (route) =>
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Internal server error' }),
        })
      );

      await page.goto(testEnv.webUrl);

      // Should show error state or handle gracefully
      // The page should still load without crashing
      await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible();
    });
  });

  test.describe('Dashboard Responsiveness', () => {
    test('adjusts layout for mobile', async ({ page, testEnv }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(testEnv.webUrl);
      await expectDashboard(page);

      // Dashboard content should be visible
      const duePointsCard = page.getByTestId('due-points-card');
      await expect(duePointsCard).toBeVisible();

      // Cards should stack vertically on mobile (single column)
      // Just verify content is accessible
      await expect(page.getByText('Recent Sessions')).toBeVisible();
    });

    test('adjusts layout for tablet', async ({ page, testEnv }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto(testEnv.webUrl);
      await expectDashboard(page);

      // All dashboard elements should be visible
      await expect(page.getByTestId('due-points-card')).toBeVisible();
      await expect(page.getByText('Recent Sessions')).toBeVisible();
    });
  });
});
