/**
 * Root Application Component
 *
 * This is the main App component that serves as the entry point for the
 * Contextual Clarity frontend. It sets up essential providers and renders
 * the application router.
 *
 * Provider Hierarchy:
 * 1. QueryClientProvider - TanStack Query for data fetching and caching
 * 2. ToastProvider - Toast notifications for user feedback
 * 3. AppRouter - React Router for page navigation
 *
 * Note: UserProvider is wrapped at a higher level in main.tsx.
 *
 * The router configuration includes:
 * - MainLayout wrapped routes (Dashboard, Recall Sets, Sessions)
 * - Full-screen routes (Live Session)
 * - 404 catch-all for unknown routes
 *
 * Toast Integration:
 * The QueryClient dispatches 'toast' CustomEvents when queries/mutations fail.
 * ToastProvider listens for these events and automatically shows error toasts.
 *
 * @see router.tsx for route configuration details
 * @see lib/query-client.ts for QueryClient configuration
 * @see context/ToastContext.tsx for toast state management
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { ToastProvider } from './context/ToastContext';
import { AppRouter } from './router';

/**
 * Main application component.
 *
 * Wraps the application with:
 * 1. QueryClientProvider for data fetching and caching
 * 2. ToastProvider for notification display
 *
 * The QueryClient is configured with:
 * - 5 second stale time for fresh data caching
 * - Smart retry logic (no retry on 4xx, up to 3 retries on other errors)
 * - Error logging and toast event dispatch for user notifications
 *
 * The ToastProvider:
 * - Listens for 'toast' CustomEvents from the query-client
 * - Automatically shows error toasts for failed API calls
 * - Renders a fixed-position toast container for notifications
 */
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider position="top-right">
        <AppRouter />
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
