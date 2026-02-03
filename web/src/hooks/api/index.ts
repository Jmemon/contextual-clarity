/**
 * API Hooks Barrel Export
 *
 * This module re-exports all API hooks and query keys for convenient imports.
 * Import from '@/hooks/api' instead of individual files.
 *
 * @example
 * ```typescript
 * import {
 *   useDashboardOverview,
 *   useRecallSets,
 *   useCreateRecallSet,
 *   useSessions,
 *   useStartSession,
 *   dashboardKeys,
 *   recallSetKeys,
 *   sessionKeys,
 * } from '@/hooks/api';
 * ```
 */

// ============================================================================
// Dashboard Hooks
// ============================================================================

export {
  // Query keys
  dashboardKeys,
  // Hooks
  useDashboardOverview,
  useRecentSessions,
  useUpcomingReviews,
} from './use-dashboard';

// ============================================================================
// Recall Sets and Points Hooks
// ============================================================================

export {
  // Query keys
  recallSetKeys,
  // Recall set query hooks
  useRecallSets,
  useRecallSet,
  // Recall set mutation hooks
  useCreateRecallSet,
  useUpdateRecallSet,
  useDeleteRecallSet,
  // Recall point query hooks
  useRecallPoints,
  // Recall point mutation hooks
  useCreateRecallPoint,
  useUpdateRecallPoint,
  useDeleteRecallPoint,
} from './use-recall-sets';

// ============================================================================
// Sessions Hooks
// ============================================================================

export {
  // Query keys
  sessionKeys,
  // Query hooks
  useSessions,
  useSession,
  useSessionTranscript,
  // Mutation hooks
  useStartSession,
  useAbandonSession,
} from './use-sessions';
