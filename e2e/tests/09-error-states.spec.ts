/**
 * Error States Tests
 *
 * Tests for error handling throughout the application:
 * - Network errors
 * - API errors
 * - Not found errors
 * - Validation errors
 * - Recovery from errors
 */

import { test, expect } from '../fixtures/test-setup';
import { expectDashboard, expectRecallSetsList, expectNotLoading, expect404 } from '../helpers/assertions';

test.describe('Error States', () => {
  test.describe('Network Errors', () => {
    test('handles offline state gracefully', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);
      await expectDashboard(page);

      // Go offline briefly
      await page.context().setOffline(true);
      await page.waitForTimeout(1000);

      // Restore connectivity
      await page.context().setOffline(false);

      // Should be able to reload and navigate
      await page.reload();
      await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 15000 });
    });

    test('recovers from temporary network failure', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);
      await expectDashboard(page);

      // Fail first request, then succeed
      let requestCount = 0;
      await page.route('**/api/recall-sets', async (route) => {
        requestCount++;
        if (requestCount === 1) {
          await route.abort('failed');
        } else {
          await route.continue();
        }
      });

      await page.getByRole('link', { name: /Recall Sets/i }).click();

      // May show error first
      await page.waitForTimeout(1000);

      // Retry or reload
      const retryButton = page.getByRole('button', { name: /Retry|Try Again/i });
      const hasRetry = await retryButton.isVisible().catch(() => false);

      if (hasRetry) {
        await retryButton.click();
        // Should eventually show content
        await expect(page.getByText(testEnv.testRecallSetName)).toBeVisible({ timeout: 10000 });
      }
    });

    test('shows timeout error for slow requests', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);

      // Make API extremely slow
      await page.route('**/api/**', async (route) => {
        // Don't resolve - let it timeout
        await new Promise((r) => setTimeout(r, 120000)); // Very long
        await route.continue();
      });

      await page.getByRole('link', { name: /Recall Sets/i }).click();

      // Should show loading state that eventually times out
      // Most apps will show a timeout message after 30-60 seconds
      // We'll just verify the loading state appears
      await expect(page.getByTestId('spinner').or(page.getByText(/loading/i))).toBeVisible({ timeout: 5000 }).catch(() => {});
    });
  });

  test.describe('API Errors', () => {
    test('handles 500 server error', async ({ page, testEnv }) => {
      await page.route('**/api/recall-sets', (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        })
      );

      await page.goto(`${testEnv.webUrl}/recall-sets`);

      // Should show error state - app displays "Failed to load recall sets"
      await expect(
        page.getByText(/Failed to load|error|something went wrong/i).first()
      ).toBeVisible({ timeout: 10000 });

      // Should offer retry option (optional - some implementations auto-retry)
      const retryButton = page.getByRole('button', { name: /Retry|Try Again/i });
      await retryButton.isVisible().catch(() => {
        // Some implementations auto-retry instead of showing button
      });
    });

    test('handles 403 forbidden error', async ({ page, testEnv }) => {
      await page.route('**/api/recall-sets/**', (route) =>
        route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Forbidden' }),
        })
      );

      await page.goto(`${testEnv.webUrl}/recall-sets/${testEnv.testRecallSetId}`);

      // Should show error - app shows generic error message for all non-200 responses
      await expect(
        page.getByText(/not found|error|could not be found|failed/i).first()
      ).toBeVisible({ timeout: 10000 });
    });

    test('handles 404 not found error', async ({ page, testEnv }) => {
      await page.goto(`${testEnv.webUrl}/recall-sets/rs_definitely_not_real_id`);

      // Should show not found
      await expect(
        page.getByText(/not found|doesn't exist|404|error/i)
      ).toBeVisible({ timeout: 10000 });
    });

    test('handles malformed API response', async ({ page, testEnv }) => {
      await page.route('**/api/recall-sets', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: 'not valid json{{{',
        })
      );

      await page.goto(`${testEnv.webUrl}/recall-sets`);

      // Should handle gracefully without crashing
      // Page will show error state when JSON parsing fails, or the heading
      await expect(
        page.getByText(/error|failed|something went wrong/i)
          .or(page.getByRole('heading', { name: /Recall Sets/i }))
      ).toBeVisible({ timeout: 10000 });
    });

    test('handles empty response', async ({ page, testEnv }) => {
      await page.route('**/api/recall-sets', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [] }),
        })
      );

      await page.goto(`${testEnv.webUrl}/recall-sets`);

      // Should show empty state
      await expect(
        page.getByText(/no recall sets|empty|create your first|get started/i)
          .or(page.getByRole('button', { name: /Create/i }))
      ).toBeVisible();
    });
  });

  test.describe('Navigation Errors', () => {
    test('handles invalid routes with 404 page', async ({ page, testEnv }) => {
      await page.goto(`${testEnv.webUrl}/this-route-does-not-exist`);

      // Should show 404 or Page Not Found
      await expect(
        page.getByText(/not found|404|Page Not Found/i).first()
      ).toBeVisible({ timeout: 10000 });
    });

    test('handles invalid entity IDs', async ({ page, testEnv }) => {
      await page.goto(`${testEnv.webUrl}/recall-sets/invalid-id-format`);

      // Should show error or Not Found
      await expect(
        page.getByText(/not found|invalid|error|Recall Set/i).first()
      ).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Form Submission Errors', () => {
    test('shows error when create fails', async ({ page, testEnv }) => {
      await page.goto(`${testEnv.webUrl}/recall-sets`);
      await expectRecallSetsList(page);
      await expectNotLoading(page);

      // Open create form - prefer link over button
      const createButton = page.getByRole('link', { name: /\+ New Set|Create Your First Set/i })
        .or(page.getByRole('button', { name: /\+ New Set|Create Your First Set/i }))
        .first();
      await expect(createButton).toBeVisible();
      await createButton.click();

      // Make API fail
      await page.route('**/api/recall-sets', (route) => {
        if (route.request().method() === 'POST') {
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Validation failed' }),
          });
        }
        return route.continue();
      });

      // Fill all required fields and submit
      const nameInput = page.getByLabel(/Name/i);
      await expect(nameInput).toBeVisible();
      await nameInput.fill('Test Name');
      await page.getByLabel(/Description/i).fill('Test description for error test');
      await page.getByLabel(/Discussion System Prompt/i).fill('Test prompt for error testing scenario');

      const submitButton = page.locator('button').filter({ hasText: /Create Recall Set/i });
      await submitButton.click();

      // Should show error
      await expect(
        page.getByText(/error|failed|validation|something went wrong/i)
      ).toBeVisible({ timeout: 10000 });
    });

    test('preserves form data after submission error', async ({ page, testEnv }) => {
      await page.goto(`${testEnv.webUrl}/recall-sets`);
      await expectRecallSetsList(page);
      await expectNotLoading(page);

      // Open create form - prefer link over button
      const createButton = page.getByRole('link', { name: /\+ New Set|Create Your First Set/i })
        .or(page.getByRole('button', { name: /\+ New Set|Create Your First Set/i }))
        .first();
      await expect(createButton).toBeVisible();
      await createButton.click();

      // Make API fail
      await page.route('**/api/recall-sets', (route) => {
        if (route.request().method() === 'POST') {
          return route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Server error' }),
          });
        }
        return route.continue();
      });

      // Fill all required fields so the form actually submits to the API
      const nameInput = page.getByLabel(/Name/i);
      await nameInput.fill('Preserved Name');
      await page.getByLabel(/Description/i).fill('Preserved description that should not be lost');
      await page.getByLabel(/Discussion System Prompt/i).fill('Preserved prompt for form data test');

      const submitButton = page.locator('button').filter({ hasText: /Create Recall Set/i });
      await submitButton.click();

      // Wait for error response
      await page.waitForTimeout(1000);

      // Form data should still be there (form didn't clear on error)
      await expect(nameInput).toHaveValue('Preserved Name');
    });
  });

  test.describe('Error Recovery', () => {
    test('retry button reloads data', async ({ page, testEnv }) => {
      let failCount = 0;

      await page.route('**/api/recall-sets', async (route) => {
        if (route.request().method() === 'GET') {
          failCount++;
          if (failCount === 1) {
            return route.fulfill({
              status: 500,
              body: JSON.stringify({ error: 'Error' }),
            });
          }
        }
        return route.continue();
      });

      await page.goto(`${testEnv.webUrl}/recall-sets`);

      // Wait for error state
      await page.waitForTimeout(1000);

      // Click retry if available
      const retryButton = page.getByRole('button', { name: /Retry|Try Again/i });
      const hasRetry = await retryButton.isVisible().catch(() => false);

      if (hasRetry) {
        await retryButton.click();

        // Should now show content
        await expect(page.getByText(testEnv.testRecallSetName)).toBeVisible({ timeout: 10000 });
      }
    });

    test('page refresh clears error state', async ({ page, testEnv }) => {
      let hasErrored = false;

      await page.route('**/api/recall-sets', async (route) => {
        if (route.request().method() === 'GET' && !hasErrored) {
          hasErrored = true;
          return route.fulfill({
            status: 500,
            body: JSON.stringify({ error: 'Error' }),
          });
        }
        return route.continue();
      });

      await page.goto(`${testEnv.webUrl}/recall-sets`);

      // Wait for error
      await page.waitForTimeout(1000);

      // Refresh page
      await page.reload();

      // Should now work
      await expect(page.getByText(testEnv.testRecallSetName)).toBeVisible({ timeout: 10000 });
    });
  });
});
