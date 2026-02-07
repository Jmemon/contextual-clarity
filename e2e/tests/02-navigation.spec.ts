/**
 * Navigation Tests
 *
 * Tests for navigation behavior including:
 * - Sidebar navigation links
 * - Route transitions
 * - Mobile menu functionality
 * - Browser back/forward navigation
 * - Deep linking
 */

import { test, expect } from '../fixtures/test-setup';
import {
  expectDashboard,
  expectRecallSetsList,
  expectSessionsList,
} from '../helpers/assertions';

test.describe('Navigation', () => {
  test.describe('Desktop Navigation', () => {
    test.beforeEach(async ({ page }) => {
      // Ensure desktop viewport
      await page.setViewportSize({ width: 1280, height: 800 });
    });

    test('sidebar links navigate to correct pages', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);

      // Start on Dashboard
      await expectDashboard(page);

      // Navigate to Recall Sets
      await page.getByRole('link', { name: /Recall Sets/i }).click();
      await expectRecallSetsList(page);

      // Navigate to Sessions
      await page.getByRole('link', { name: /Sessions/i }).click();
      await expectSessionsList(page);

      // Navigate back to Dashboard
      await page.getByRole('link', { name: /Dashboard/i }).click();
      await expectDashboard(page);
    });

    test('active link is highlighted', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);

      // Dashboard link should be active
      const dashboardLink = page.getByRole('link', { name: /Dashboard/i });
      await expect(dashboardLink).toHaveClass(/bg-clarity/);

      // Navigate to Recall Sets
      await page.getByRole('link', { name: /Recall Sets/i }).click();

      // Now Recall Sets link should be active
      const recallSetsLink = page.getByRole('link', { name: /Recall Sets/i });
      await expect(recallSetsLink).toHaveClass(/bg-clarity/);

      // Dashboard link should no longer be active
      await expect(dashboardLink).not.toHaveClass(/bg-clarity-100/);
    });

    test('browser back/forward navigation works', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);
      await expectDashboard(page);

      // Navigate to Recall Sets
      await page.getByRole('link', { name: /Recall Sets/i }).click();
      await expectRecallSetsList(page);

      // Navigate to Sessions
      await page.getByRole('link', { name: /Sessions/i }).click();
      await expectSessionsList(page);

      // Go back - wait for URL to update
      await page.goBack();
      await page.waitForURL('**/recall-sets');
      await expect(page.locator('h1', { hasText: 'Recall Sets' })).toBeVisible();

      // Go back again
      await page.goBack();
      await page.waitForURL(/\/$/);
      await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible();

      // Go forward
      await page.goForward();
      await page.waitForURL('**/recall-sets');
      await expect(page.locator('h1', { hasText: 'Recall Sets' })).toBeVisible();
    });
  });

  test.describe('Mobile Navigation', () => {
    test.beforeEach(async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
    });

    test('hamburger menu opens sidebar', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);

      // Sidebar should be hidden initially on mobile
      const sidebar = page.getByTestId('sidebar');
      await expect(sidebar).toHaveClass(/-translate-x-full/);

      // Click hamburger menu
      await page.getByRole('button', { name: /Open navigation menu/i }).click();

      // Sidebar should now be visible
      await expect(sidebar).toHaveClass(/translate-x-0/);
    });

    test('clicking nav link closes mobile sidebar', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);

      // Open menu
      await page.getByRole('button', { name: /Open navigation menu/i }).click();

      const sidebar = page.getByTestId('sidebar');
      await expect(sidebar).toHaveClass(/translate-x-0/);

      // Click a nav link
      await page.getByRole('link', { name: /Recall Sets/i }).click();

      // Sidebar should close
      await expect(sidebar).toHaveClass(/-translate-x-full/);

      // Should be on Recall Sets page
      await expectRecallSetsList(page);
    });

    test('clicking outside closes mobile sidebar', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);

      // Open menu
      await page.getByRole('button', { name: /Open navigation menu/i }).click();

      const sidebar = page.getByTestId('sidebar');
      await expect(sidebar).toHaveClass(/translate-x-0/);

      // Click the backdrop overlay (outside sidebar)
      await page.locator('.bg-black\\/50').click();

      // Sidebar should close
      await expect(sidebar).toHaveClass(/-translate-x-full/);
    });

    test('pressing Escape closes mobile sidebar', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);

      // Open menu
      await page.getByRole('button', { name: /Open navigation menu/i }).click();

      const sidebar = page.getByTestId('sidebar');
      await expect(sidebar).toHaveClass(/translate-x-0/);

      // Press Escape
      await page.keyboard.press('Escape');

      // Sidebar should close
      await expect(sidebar).toHaveClass(/-translate-x-full/);
    });

    test('close button closes mobile sidebar', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);

      // Open menu
      await page.getByRole('button', { name: /Open navigation menu/i }).click();

      const sidebar = page.getByTestId('sidebar');
      await expect(sidebar).toHaveClass(/translate-x-0/);

      // Click close button
      await page.getByRole('button', { name: /Close navigation menu/i }).click();

      // Sidebar should close
      await expect(sidebar).toHaveClass(/-translate-x-full/);
    });
  });

  test.describe('Deep Linking', () => {
    test('direct URL to recall sets list works', async ({ page, testEnv }) => {
      await page.goto(`${testEnv.webUrl}/recall-sets`);
      await expectRecallSetsList(page);
    });

    test('direct URL to specific recall set works', async ({ page, testEnv }) => {
      await page.goto(`${testEnv.webUrl}/recall-sets/${testEnv.testRecallSetId}`);

      // Should show the recall set detail page
      await expect(page).toHaveURL(/\/recall-sets\/rs_/);
      await expect(page.getByText(testEnv.testRecallSetName)).toBeVisible();
    });

    test('direct URL to sessions list works', async ({ page, testEnv }) => {
      await page.goto(`${testEnv.webUrl}/sessions`);
      await expectSessionsList(page);
    });

    test('invalid URL shows 404 or redirects', async ({ page, testEnv }) => {
      await page.goto(`${testEnv.webUrl}/nonexistent-page`);

      // Should show 404 page - look for the heading specifically
      await expect(
        page.getByRole('heading', { name: 'Page Not Found' })
      ).toBeVisible();
    });
  });

  test.describe('Navigation Accessibility', () => {
    test('navigation can be operated with keyboard', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);

      // Tab to first nav link
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab'); // Skip logo area

      // Should be able to press Enter to navigate
      const recallSetsLink = page.getByRole('link', { name: /Recall Sets/i });

      // Focus the link and press Enter
      await recallSetsLink.focus();
      await page.keyboard.press('Enter');

      await expectRecallSetsList(page);
    });

    test('nav links have accessible names', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);

      // All nav links should have accessible names
      const navLinks = page.locator('nav').getByRole('link');
      const count = await navLinks.count();

      expect(count).toBeGreaterThan(0);

      for (let i = 0; i < count; i++) {
        const link = navLinks.nth(i);
        const name = await link.getAttribute('aria-label') || await link.textContent();
        expect(name).toBeTruthy();
      }
    });
  });
});
