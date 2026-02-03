/**
 * Dashboard Query Hooks
 *
 * This module provides React Query hooks for fetching dashboard data.
 * These hooks handle loading states, caching, and automatic refetching.
 *
 * Available Hooks:
 * - useDashboardOverview() - Complete dashboard data
 * - useRecentSessions(limit?) - Recent session list
 * - useUpcomingReviews(days?) - Upcoming reviews list
 *
 * @example
 * ```tsx
 * function DashboardPage() {
 *   const { data, isLoading, error } = useDashboardOverview();
 *
 *   if (isLoading) return <Spinner />;
 *   if (error) return <ErrorMessage error={error} />;
 *
 *   return (
 *     <div>
 *       <h1>Welcome back!</h1>
 *       <p>You have {data.pointsDueToday} items due today.</p>
 *       <p>Current streak: {data.currentStreak} days</p>
 *     </div>
 *   );
 * }
 * ```
 */

import { useQuery } from '@tanstack/react-query';
import {
  getDashboardOverview,
  getRecentSessions,
  getUpcomingReviews,
} from '@/lib/api-client';
import type {
  DashboardOverview,
  RecentSessionsResponse,
  UpcomingReviewsResponse,
} from '@/types/api';

// ============================================================================
// Query Keys
// ============================================================================

/**
 * Query key factory for dashboard queries.
 * Using a factory pattern ensures consistent key structure and easy invalidation.
 */
export const dashboardKeys = {
  /** Base key for all dashboard queries */
  all: ['dashboard'] as const,

  /** Key for the dashboard overview query */
  overview: () => [...dashboardKeys.all, 'overview'] as const,

  /** Key for recent sessions query with optional limit */
  recentSessions: (limit?: number) =>
    [...dashboardKeys.all, 'recent-sessions', { limit }] as const,

  /** Key for upcoming reviews query with optional days parameter */
  upcomingReviews: (days?: number) =>
    [...dashboardKeys.all, 'upcoming-reviews', { days }] as const,
};

// ============================================================================
// Dashboard Overview Hook
// ============================================================================

/**
 * Hook to fetch the complete dashboard overview.
 *
 * Returns aggregated data including:
 * - Global statistics (total sets, sessions, study time)
 * - Today's activity summary
 * - Due recall points count
 * - Recent session history
 * - Upcoming reviews
 * - Current and longest study streaks
 *
 * @returns Query result with dashboard overview data
 *
 * @example
 * ```tsx
 * function StatsCards() {
 *   const { data, isLoading } = useDashboardOverview();
 *
 *   if (isLoading) return <SkeletonCards />;
 *
 *   return (
 *     <>
 *       <StatCard title="Due Today" value={data?.pointsDueToday ?? 0} />
 *       <StatCard title="Total Sets" value={data?.totalRecallSets ?? 0} />
 *       <StatCard title="Streak" value={`${data?.currentStreak ?? 0} days`} />
 *     </>
 *   );
 * }
 * ```
 */
export function useDashboardOverview() {
  return useQuery<DashboardOverview, Error>({
    queryKey: dashboardKeys.overview(),
    queryFn: getDashboardOverview,
  });
}

// ============================================================================
// Recent Sessions Hook
// ============================================================================

/**
 * Hook to fetch recent study sessions.
 *
 * @param limit - Maximum number of sessions to return (default: 5, max: 50)
 * @returns Query result with recent sessions and total count
 *
 * @example
 * ```tsx
 * function RecentSessionsList() {
 *   const { data, isLoading } = useRecentSessions(10);
 *
 *   if (isLoading) return <SkeletonList />;
 *
 *   return (
 *     <ul>
 *       {data?.sessions.map(session => (
 *         <li key={session.id}>
 *           {session.recallSetName} - {Math.round(session.recallRate * 100)}%
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useRecentSessions(limit?: number) {
  return useQuery<RecentSessionsResponse, Error>({
    queryKey: dashboardKeys.recentSessions(limit),
    queryFn: () => getRecentSessions(limit),
  });
}

// ============================================================================
// Upcoming Reviews Hook
// ============================================================================

/**
 * Hook to fetch upcoming recall point reviews.
 *
 * @param days - Number of days ahead to look (default: 7, max: 90)
 * @returns Query result with upcoming reviews and summary counts
 *
 * @example
 * ```tsx
 * function UpcomingReviewsList() {
 *   const { data, isLoading } = useUpcomingReviews(14);
 *
 *   if (isLoading) return <SkeletonList />;
 *
 *   return (
 *     <div>
 *       <p>Overdue: {data?.summary.overdue}</p>
 *       <p>Due Today: {data?.summary.dueToday}</p>
 *       <ul>
 *         {data?.reviews.map(review => (
 *           <li key={review.recallPointId}>
 *             {review.recallPointContent} ({review.priority})
 *           </li>
 *         ))}
 *       </ul>
 *     </div>
 *   );
 * }
 * ```
 */
export function useUpcomingReviews(days?: number) {
  return useQuery<UpcomingReviewsResponse, Error>({
    queryKey: dashboardKeys.upcomingReviews(days),
    queryFn: () => getUpcomingReviews(days),
  });
}
