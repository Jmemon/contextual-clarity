/**
 * Custom Test Assertions
 *
 * Provides domain-specific assertions for testing Contextual Clarity.
 * These helpers make tests more readable and provide better error messages.
 */

import { expect, type Page, type Locator } from '@playwright/test';

// ============================================================================
// Page Assertions
// ============================================================================

/**
 * Asserts that the page is showing the dashboard.
 * Waits for loading to complete before checking for the heading.
 */
export async function expectDashboard(page: Page): Promise<void> {
  await expect(page).toHaveURL('/');
  // Wait for loading to finish (dashboard shows "Loading dashboard..." while loading)
  await expect(page.getByText('Loading dashboard...')).not.toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

/**
 * Asserts that the page is showing the recall sets list.
 */
export async function expectRecallSetsList(page: Page): Promise<void> {
  await expect(page).toHaveURL('/recall-sets');
  // Use exact match for the main h1 heading to avoid matching recall set card headings
  await expect(
    page.getByRole('heading', { name: 'Recall Sets', exact: true, level: 1 })
  ).toBeVisible();
}

/**
 * Asserts that the page is showing a recall set detail page.
 */
export async function expectRecallSetDetail(page: Page, name?: string): Promise<void> {
  await expect(page).toHaveURL(/\/recall-sets\/rs_/);
  if (name) {
    await expect(page.getByRole('heading', { name })).toBeVisible();
  }
}

/**
 * Asserts that the page is showing the sessions list.
 */
export async function expectSessionsList(page: Page): Promise<void> {
  await expect(page).toHaveURL('/sessions');
  await expect(page.getByRole('heading', { name: /Session History|Sessions/i })).toBeVisible();
}

/**
 * Asserts that the page is showing a session replay.
 */
export async function expectSessionReplay(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/sessions\/sess_/);
  await expect(page.getByTestId('session-summary')).toBeVisible();
}

/**
 * Asserts that the page is showing a live session.
 */
export async function expectLiveSession(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/session\/sess_/);
  await expect(page.getByText(/Connected|Connecting/i)).toBeVisible({ timeout: 15000 });
}

/**
 * Asserts that the page is showing a 404 error.
 */
export async function expect404(page: Page): Promise<void> {
  await expect(page.getByText(/not found|404/i)).toBeVisible();
}

// ============================================================================
// Component Assertions
// ============================================================================

/**
 * Asserts that a loading spinner is visible.
 */
export async function expectLoading(page: Page): Promise<void> {
  await expect(page.getByText(/loading/i).or(page.locator('[data-testid="spinner"]'))).toBeVisible();
}

/**
 * Asserts that loading has completed (no spinner visible).
 */
export async function expectNotLoading(page: Page, timeout = 30000): Promise<void> {
  // Wait for the specific loading spinner to disappear
  // Use first() to handle cases where multiple spinners exist
  const spinner = page.locator('[data-testid="spinner"]').first();

  // Wait for any "Loading..." status messages to disappear
  // These include "Loading dashboard...", "Loading recall sets...", etc.
  const loadingStatus = page.locator('[role="status"]').filter({ hasText: /^Loading/ }).first();

  // Wait for both loading indicators to disappear
  await expect(spinner).not.toBeVisible({ timeout });
  await expect(loadingStatus).not.toBeVisible({ timeout });
}

/**
 * Asserts that an error message is displayed.
 */
export async function expectError(page: Page, message?: string | RegExp): Promise<void> {
  if (message) {
    await expect(page.getByText(message)).toBeVisible();
  } else {
    await expect(page.getByText(/error|failed/i)).toBeVisible();
  }
}

/**
 * Asserts that a toast notification is visible.
 */
export async function expectToast(page: Page, text?: string | RegExp): Promise<void> {
  const toast = page.locator('[data-testid="toast"]').or(page.locator('[role="alert"]'));
  await expect(toast).toBeVisible();
  if (text) {
    await expect(toast).toContainText(text);
  }
}

/**
 * Asserts that a modal/dialog is visible.
 */
export async function expectModal(page: Page, title?: string | RegExp): Promise<void> {
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  if (title) {
    await expect(modal.getByRole('heading')).toContainText(title);
  }
}

/**
 * Asserts that no modal/dialog is visible.
 */
export async function expectNoModal(page: Page): Promise<void> {
  await expect(page.getByRole('dialog')).not.toBeVisible();
}

// ============================================================================
// Form Assertions
// ============================================================================

/**
 * Asserts that a form field has a validation error.
 */
export async function expectFieldError(page: Page, fieldName: string, error?: string | RegExp): Promise<void> {
  const field = page.getByLabel(fieldName);
  await expect(field).toHaveAttribute('aria-invalid', 'true');

  if (error) {
    // Look for error message near the field
    const errorText = page.getByText(error);
    await expect(errorText).toBeVisible();
  }
}

/**
 * Asserts that a form field has no validation error.
 */
export async function expectNoFieldError(page: Page, fieldName: string): Promise<void> {
  const field = page.getByLabel(fieldName);
  const ariaInvalid = await field.getAttribute('aria-invalid');
  expect(ariaInvalid).not.toBe('true');
}

/**
 * Asserts that a submit button is in loading state.
 */
export async function expectSubmitLoading(page: Page, buttonText?: string): Promise<void> {
  const button = buttonText
    ? page.getByRole('button', { name: buttonText })
    : page.getByRole('button', { name: /submit|create|save/i });

  await expect(button).toBeDisabled();
}

// ============================================================================
// Data Assertions
// ============================================================================

/**
 * Asserts that a specific number of items are visible in a list.
 */
export async function expectItemCount(
  locator: Locator,
  count: number,
  options?: { timeout?: number }
): Promise<void> {
  await expect(locator).toHaveCount(count, options);
}

/**
 * Asserts that a stat card displays a specific value.
 */
export async function expectStatValue(
  page: Page,
  testId: string,
  value: string | number | RegExp
): Promise<void> {
  const stat = page.getByTestId(testId);
  await expect(stat).toContainText(String(value));
}

// ============================================================================
// Navigation Assertions
// ============================================================================

/**
 * Asserts that a navigation link is active (highlighted).
 */
export async function expectNavActive(page: Page, linkText: string): Promise<void> {
  const link = page.getByRole('link', { name: linkText });
  // Check for active class or aria-current
  const classes = await link.getAttribute('class');
  const ariaCurrent = await link.getAttribute('aria-current');

  expect(
    classes?.includes('active') ||
    classes?.includes('bg-clarity') ||
    ariaCurrent === 'page'
  ).toBe(true);
}

// ============================================================================
// WebSocket Assertions
// ============================================================================

/**
 * Asserts that WebSocket is connected.
 */
export async function expectWebSocketConnected(page: Page, timeout = 15000): Promise<void> {
  await expect(page.getByText(/connected/i)).toBeVisible({ timeout });
}

/**
 * Asserts that WebSocket is reconnecting.
 */
export async function expectWebSocketReconnecting(page: Page): Promise<void> {
  await expect(page.getByText(/reconnecting/i)).toBeVisible();
}

/**
 * Asserts that WebSocket is disconnected.
 */
export async function expectWebSocketDisconnected(page: Page): Promise<void> {
  await expect(page.getByText(/disconnected|connection error/i)).toBeVisible();
}

// ============================================================================
// Session Assertions
// ============================================================================

/**
 * Asserts that a session is in progress.
 */
export async function expectSessionInProgress(page: Page): Promise<void> {
  await expect(page.getByTestId('message-input')).toBeVisible();
  await expect(
    page.getByTestId('trigger-evaluation-btn')
      .or(page.getByRole('button', { name: /I've got it/i }))
  ).toBeVisible();
}

/**
 * Asserts that a session is complete.
 */
export async function expectSessionComplete(page: Page, timeout = 30000): Promise<void> {
  await expect(page.getByText('Session Complete!')).toBeVisible({ timeout });
}

/**
 * Asserts that the session progress shows correct point count.
 */
export async function expectSessionProgress(
  page: Page,
  current: number,
  total: number
): Promise<void> {
  await expect(page.getByText(`${current} of ${total}`)).toBeVisible();
}
