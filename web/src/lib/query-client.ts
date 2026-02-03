/**
 * TanStack Query Client Configuration
 *
 * This module configures and exports a QueryClient instance with:
 * - QueryCache with error logging and toast event dispatch
 * - MutationCache with error logging and toast event dispatch
 * - Default options for stale time and retry logic
 *
 * Error Handling Strategy:
 * - All errors are logged to console for debugging
 * - A CustomEvent ('toast') is dispatched so ToastContext can display notifications
 * - 4xx errors (client errors) are not retried since they indicate bad requests
 * - Other errors (network, 5xx) are retried up to 3 times with exponential backoff
 *
 * @example
 * ```typescript
 * // In App.tsx
 * import { QueryClientProvider } from '@tanstack/react-query';
 * import { queryClient } from '@/lib/query-client';
 *
 * function App() {
 *   return (
 *     <QueryClientProvider client={queryClient}>
 *       <AppRouter />
 *     </QueryClientProvider>
 *   );
 * }
 * ```
 */

import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { ApiError } from './api-client';

// ============================================================================
// Toast Event Dispatcher
// ============================================================================

/**
 * Custom event detail for toast notifications.
 * Components listening to this event can display toast messages to users.
 */
interface ToastEventDetail {
  /** Toast type for styling */
  type: 'error' | 'success' | 'info' | 'warning';
  /** Main toast title */
  title: string;
  /** Optional description */
  description?: string;
}

/**
 * Dispatches a toast event to notify the UI of an error.
 * The ToastContext or similar component should listen for these events.
 *
 * @param title - Toast title
 * @param description - Optional description with more details
 */
function dispatchToastEvent(
  type: ToastEventDetail['type'],
  title: string,
  description?: string
): void {
  const event = new CustomEvent<ToastEventDetail>('toast', {
    detail: { type, title, description },
  });
  window.dispatchEvent(event);
}

// ============================================================================
// Error Handling Helpers
// ============================================================================

/**
 * Determines if an error is a client error (4xx status) that should not be retried.
 * Client errors indicate problems with the request itself (validation, not found, etc.)
 * and retrying won't help.
 *
 * @param error - The error to check
 * @returns True if this is a 4xx error
 */
function isClientError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status >= 400 && error.status < 500;
  }
  return false;
}

/**
 * Extracts a user-friendly error message from an error.
 *
 * @param error - The error to extract message from
 * @returns Human-readable error message
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}

/**
 * Logs an error to the console with context.
 *
 * @param context - Where the error occurred (query/mutation)
 * @param error - The error object
 */
function logError(context: string, error: unknown): void {
  console.error(`[${context}] Error:`, error);

  // Log additional details for ApiError
  if (error instanceof ApiError) {
    console.error(`  Code: ${error.code}`);
    console.error(`  Status: ${error.status}`);
    if (error.details) {
      console.error(`  Details:`, error.details);
    }
  }
}

// ============================================================================
// Query Cache Configuration
// ============================================================================

/**
 * QueryCache handles caching and error handling for all queries (data fetching).
 *
 * When a query fails:
 * 1. The error is logged to console with full details
 * 2. A toast event is dispatched for user notification
 */
const queryCache = new QueryCache({
  onError: (error, query) => {
    // Log the error with query context
    const queryKey = Array.isArray(query.queryKey)
      ? query.queryKey.join('/')
      : String(query.queryKey);
    logError(`Query: ${queryKey}`, error);

    // Dispatch toast event for user notification
    dispatchToastEvent('error', 'Failed to load data', getErrorMessage(error));
  },
});

// ============================================================================
// Mutation Cache Configuration
// ============================================================================

/**
 * MutationCache handles caching and error handling for all mutations
 * (create, update, delete operations).
 *
 * When a mutation fails:
 * 1. The error is logged to console with full details
 * 2. A toast event is dispatched for user notification
 */
const mutationCache = new MutationCache({
  onError: (error, _variables, _context, mutation) => {
    // Log the error with mutation context
    const mutationKey = mutation.options.mutationKey
      ? Array.isArray(mutation.options.mutationKey)
        ? mutation.options.mutationKey.join('/')
        : String(mutation.options.mutationKey)
      : 'unnamed';
    logError(`Mutation: ${mutationKey}`, error);

    // Dispatch toast event for user notification
    dispatchToastEvent('error', 'Operation failed', getErrorMessage(error));
  },
});

// ============================================================================
// Query Client Configuration
// ============================================================================

/**
 * Configured QueryClient instance for the application.
 *
 * Default Options:
 * - staleTime: 5000ms (5 seconds) - Data is fresh for 5 seconds before refetching
 * - retry: Custom function - No retry for 4xx errors, up to 3 retries for others
 * - refetchOnWindowFocus: true (default) - Refetch when window regains focus
 * - refetchOnReconnect: true (default) - Refetch when network reconnects
 *
 * This configuration balances freshness with performance by allowing
 * short-term caching while ensuring data stays relatively current.
 */
export const queryClient = new QueryClient({
  queryCache,
  mutationCache,
  defaultOptions: {
    queries: {
      /**
       * staleTime determines how long fetched data is considered "fresh".
       * During this time, the cached data is returned immediately without refetching.
       * After staleTime, the data is still returned but a background refetch is triggered.
       */
      staleTime: 5000, // 5 seconds

      /**
       * Custom retry function:
       * - Never retry 4xx errors (client errors won't be fixed by retrying)
       * - Retry other errors (network, 5xx) up to 3 times
       */
      retry: (failureCount, error) => {
        // Don't retry client errors (4xx)
        if (isClientError(error)) {
          return false;
        }
        // Retry up to 3 times for other errors
        return failureCount < 3;
      },

      /**
       * Exponential backoff delay between retries.
       * First retry: ~1 second, second: ~2 seconds, third: ~4 seconds
       */
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },

    mutations: {
      /**
       * Mutations don't retry by default since they may have side effects.
       * Users should explicitly retry failed operations.
       */
      retry: false,
    },
  },
});
