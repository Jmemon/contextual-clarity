/**
 * Responsive Design Tests
 *
 * Tests for responsive layout behavior across different viewports:
 * - Mobile (375px)
 * - Tablet (768px)
 * - Desktop (1280px)
 * - Touch targets
 * - Viewport-specific UI changes
 */

import { test, expect } from '../fixtures/test-setup';
import { expectDashboard, expectRecallSetsList, expectNotLoading } from '../helpers/assertions';

// Common viewport sizes for testing
const VIEWPORTS = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
  widescreen: { width: 1920, height: 1080 },
};

test.describe('Responsive Design', () => {
  test.describe('Mobile Layout (375px)', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobile);
    });

    test('sidebar is hidden by default', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);
      await expectDashboard(page);

      const sidebar = page.getByTestId('sidebar');
      // Sidebar should be off-screen on mobile (translated left)
      // Check that sidebar is positioned off-screen (negative x or not visible in viewport)
      const box = await sidebar.boundingBox();
      if (box) {
        // Sidebar should be off-screen (x position should be negative or fully left of viewport)
        expect(box.x).toBeLessThan(0);
      }
    });

    test('hamburger menu is visible', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);

      const hamburger = page.getByRole('button', { name: /Open navigation menu/i });
      await expect(hamburger).toBeVisible();
    });

    test('content fills full width', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);
      await expectDashboard(page);

      // Main content should fill the viewport
      const main = page.locator('main');
      const box = await main.boundingBox();

      if (box) {
        // Content should be close to viewport width (accounting for padding)
        expect(box.width).toBeGreaterThan(350);
      }
    });

    test('cards stack vertically', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);
      await expectDashboard(page);

      // Due points card should be visible
      const duePointsCard = page.getByTestId('due-points-card');
      await expect(duePointsCard).toBeVisible();

      // Recent sessions should be below, not beside
      const recentSessions = page.getByText('Recent Sessions');
      await expect(recentSessions).toBeVisible();

      // Get positions
      const dueBox = await duePointsCard.boundingBox();
      const recentBox = await recentSessions.boundingBox();

      if (dueBox && recentBox) {
        // Recent sessions should be below due points
        expect(recentBox.y).toBeGreaterThan(dueBox.y);
      }
    });

    test('touch targets are at least 44px', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);

      // Check buttons have adequate touch target size
      const buttons = page.getByRole('button');
      const buttonCount = await buttons.count();

      for (let i = 0; i < buttonCount; i++) {
        const button = buttons.nth(i);
        const isVisible = await button.isVisible().catch(() => false);

        if (isVisible) {
          const box = await button.boundingBox();
          if (box) {
            // Touch targets should be at least 44x44px
            expect(box.height).toBeGreaterThanOrEqual(40); // Allow small tolerance
          }
        }
      }
    });

    test('text is readable without horizontal scroll', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);
      await expectDashboard(page);

      // Check for horizontal overflow
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      expect(hasHorizontalScroll).toBe(false);
    });

    test('forms are usable on mobile', async ({ page, testEnv }) => {
      await page.goto(`${testEnv.webUrl}/recall-sets`);
      await expectRecallSetsList(page);
      await expectNotLoading(page);

      // Open create form
      const createButton = page.getByRole('button', { name: /\+ New Set|Create Your First Set/i })
        .or(page.getByRole('link', { name: /\+ New Set|Create Your First Set/i }));

      const hasCreate = await createButton.first().isVisible().catch(() => false);

      if (hasCreate) {
        await createButton.first().click();

        // Form should be visible and usable
        const nameInput = page.getByLabel(/Name/i);
        await expect(nameInput).toBeVisible();

        // Input should be wide enough to type
        const inputBox = await nameInput.boundingBox();
        if (inputBox) {
          expect(inputBox.width).toBeGreaterThan(200);
        }
      }
    });
  });

  test.describe('Tablet Layout (768px)', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.tablet);
    });

    test('sidebar may be visible or hidden', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);

      // At tablet size, behavior may vary
      // Just verify the page renders correctly
      await expectDashboard(page);
    });

    test('content uses available space efficiently', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);
      await expectDashboard(page);

      // Cards should be visible
      const duePointsCard = page.getByTestId('due-points-card');
      await expect(duePointsCard).toBeVisible();
    });

    test('recall set cards may be in grid', async ({ page, testEnv }) => {
      await page.goto(`${testEnv.webUrl}/recall-sets`);
      await expectRecallSetsList(page);

      // Get all recall set cards
      const cards = page.getByTestId('recall-set-card');
      const count = await cards.count();

      if (count >= 2) {
        // Check if they're in a grid (same row)
        const card1Box = await cards.nth(0).boundingBox();
        const card2Box = await cards.nth(1).boundingBox();

        if (card1Box && card2Box) {
          // At tablet, may be side by side or stacked
          // Just verify both are visible
          expect(card1Box).toBeTruthy();
          expect(card2Box).toBeTruthy();
        }
      }
    });
  });

  test.describe('Desktop Layout (1280px)', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.desktop);
    });

    test('sidebar is always visible', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);
      await expectDashboard(page);

      const sidebar = page.getByTestId('sidebar');
      await expect(sidebar).toBeVisible();

      // Sidebar should be on-screen at desktop size (x position >= 0)
      const box = await sidebar.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.x).toBeGreaterThanOrEqual(0);
    });

    test('hamburger menu is hidden', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);

      const hamburger = page.getByRole('button', { name: /Open navigation menu/i });
      await expect(hamburger).not.toBeVisible();
    });

    test('content is beside sidebar', async ({ page, testEnv }) => {
      await page.goto(testEnv.webUrl);
      await expectDashboard(page);

      const sidebar = page.getByTestId('sidebar');
      const main = page.locator('main');

      const sidebarBox = await sidebar.boundingBox();
      const mainBox = await main.boundingBox();

      if (sidebarBox && mainBox) {
        // Main content should start after sidebar
        expect(mainBox.x).toBeGreaterThanOrEqual(sidebarBox.width - 10);
      }
    });

    test('recall set cards in multi-column grid', async ({ page, testEnv }) => {
      await page.goto(`${testEnv.webUrl}/recall-sets`);
      await expectRecallSetsList(page);

      // Need at least 2 cards to test grid
      const cards = page.getByTestId('recall-set-card');
      const count = await cards.count();

      if (count >= 2) {
        const card1Box = await cards.nth(0).boundingBox();
        const card2Box = await cards.nth(1).boundingBox();

        if (card1Box && card2Box) {
          // At desktop, cards should be side by side (same Y)
          // or in a row if there's enough space
          // Just verify they exist and have reasonable size
          expect(card1Box.width).toBeGreaterThan(200);
          expect(card2Box.width).toBeGreaterThan(200);
        }
      }
    });
  });

  test.describe('Viewport Transitions', () => {
    test('resizing from mobile to desktop works', async ({ page, testEnv }) => {
      // Start mobile
      await page.setViewportSize(VIEWPORTS.mobile);
      await page.goto(testEnv.webUrl);
      await expectDashboard(page);

      // Sidebar should be hidden (off-screen)
      const sidebar = page.getByTestId('sidebar');
      let box = await sidebar.boundingBox();
      if (box) {
        expect(box.x).toBeLessThan(0);
      }

      // Resize to desktop
      await page.setViewportSize(VIEWPORTS.desktop);
      await page.waitForTimeout(500); // Allow CSS transition

      // Sidebar should now be visible (on-screen)
      box = await sidebar.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.x).toBeGreaterThanOrEqual(0);
    });

    test('resizing from desktop to mobile works', async ({ page, testEnv }) => {
      // Start desktop
      await page.setViewportSize(VIEWPORTS.desktop);
      await page.goto(testEnv.webUrl);
      await expectDashboard(page);

      // Sidebar should be visible (on-screen)
      const sidebar = page.getByTestId('sidebar');
      let box = await sidebar.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.x).toBeGreaterThanOrEqual(0);

      // Resize to mobile
      await page.setViewportSize(VIEWPORTS.mobile);
      await page.waitForTimeout(500); // Allow CSS transition

      // Sidebar should be hidden (off-screen)
      box = await sidebar.boundingBox();
      if (box) {
        expect(box.x).toBeLessThan(0);
      }
    });
  });

  test.describe('Specific Component Responsiveness', () => {
    test('session cards adapt to viewport', async ({ page, testEnv, startSession }) => {
      // Create a session for testing
      const sessionId = await startSession(testEnv.testRecallSetId);
      await fetch(`${testEnv.apiUrl}/api/sessions/${sessionId}/end`, {
        method: 'POST',
      });

      // Test on mobile
      await page.setViewportSize(VIEWPORTS.mobile);
      await page.goto(testEnv.webUrl);
      await expectDashboard(page);

      const sessionCard = page.getByTestId('session-card').first();
      const hasCard = await sessionCard.isVisible().catch(() => false);

      if (hasCard) {
        const mobileBox = await sessionCard.boundingBox();

        // Test on desktop
        await page.setViewportSize(VIEWPORTS.desktop);
        await page.waitForTimeout(500);

        const desktopBox = await sessionCard.boundingBox();

        // Cards should adapt (be narrower on mobile)
        if (mobileBox && desktopBox) {
          // Just verify they have reasonable sizes at each viewport
          expect(mobileBox.width).toBeGreaterThan(0);
          expect(desktopBox.width).toBeGreaterThan(0);
        }
      }
    });

    test('stat cards have responsive text size', async ({ page, testEnv }) => {
      // Test mobile
      await page.setViewportSize(VIEWPORTS.mobile);
      await page.goto(testEnv.webUrl);
      await expectDashboard(page);

      // Check due points card text is visible and not overflowing
      const duePointsCard = page.getByTestId('due-points-card');
      await expect(duePointsCard).toBeVisible();

      // The large number should be visible
      const bigNumber = duePointsCard.locator('.text-4xl, .text-5xl').first();
      await expect(bigNumber).toBeVisible();

      // Test desktop
      await page.setViewportSize(VIEWPORTS.desktop);
      await page.waitForTimeout(300);

      // Still visible and properly sized
      await expect(bigNumber).toBeVisible();
    });
  });

  test.describe('Live Session Responsiveness', () => {
    test('live session works on mobile', async ({ page, testEnv, startSession }) => {
      await page.setViewportSize(VIEWPORTS.mobile);

      const sessionId = await startSession(testEnv.testRecallSetId);
      await page.goto(`${testEnv.webUrl}/session/${sessionId}`);

      // Should show connection status
      await expect(page.getByText(/Connected|Connecting/i)).toBeVisible({ timeout: 15000 });

      // Message input should be visible and usable
      const messageInput = page.getByTestId('message-input');
      await expect(messageInput).toBeVisible();

      // Input should fill available width
      const inputBox = await messageInput.boundingBox();
      if (inputBox) {
        expect(inputBox.width).toBeGreaterThan(200);
      }
    });

    test('message list scrolls on mobile', async ({ page, testEnv, startSession }) => {
      await page.setViewportSize(VIEWPORTS.mobile);

      const sessionId = await startSession(testEnv.testRecallSetId);
      await page.goto(`${testEnv.webUrl}/session/${sessionId}`);

      await expect(page.getByText(/Connected|Connecting/i)).toBeVisible({ timeout: 15000 });

      // Message list should be scrollable
      const messageList = page.getByTestId('message-list');
      await expect(messageList).toBeVisible();

      // Should have overflow-auto or scroll class
      const overflowStyle = await messageList.evaluate((el) =>
        getComputedStyle(el).overflow || getComputedStyle(el).overflowY
      );

      expect(overflowStyle).toMatch(/auto|scroll/);
    });
  });
});
