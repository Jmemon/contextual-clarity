/**
 * Root Application Component
 *
 * This is the main App component that serves as the entry point for the
 * Contextual Clarity frontend. It sets up essential providers and renders
 * the application router.
 *
 * Provider Hierarchy:
 * 1. QueryClientProvider - TanStack Query for data fetching and caching
 * 2. AppRouter - React Router for page navigation
 *
 * Note: UserProvider is wrapped at a higher level in main.tsx.
 *
 * The router configuration includes:
 * - MainLayout wrapped routes (Dashboard, Recall Sets, Sessions)
 * - Full-screen routes (Live Session)
 * - 404 catch-all for unknown routes
 *
 * @see router.tsx for route configuration details
 * @see lib/query-client.ts for QueryClient configuration
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { AppRouter } from './router';

/**
 * Main application component.
 *
 * Wraps the application with QueryClientProvider for data fetching capabilities
 * and renders the AppRouter which handles all routing logic.
 *
 * The QueryClient is configured with:
 * - 5 second stale time for fresh data caching
 * - Smart retry logic (no retry on 4xx, up to 3 retries on other errors)
 * - Error logging and toast event dispatch for user notifications
 */
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
    </QueryClientProvider>
  );
}

export default App;
