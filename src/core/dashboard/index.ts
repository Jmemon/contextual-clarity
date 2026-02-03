/**
 * Core Dashboard Module - Barrel Export
 *
 * This module provides data aggregation services for the Phase 3 web dashboard.
 * It consolidates recall set analytics, session metrics, and recall point status
 * into dashboard-ready data structures suitable for API responses.
 *
 * The dashboard module supports two main views:
 * - Overview: System-wide summary across all recall sets
 * - RecallSetDashboard: Detailed analytics for a single recall set
 *
 * @example
 * ```typescript
 * import {
 *   DashboardDataAggregator,
 *   type DashboardOverview,
 *   type RecallSetDashboard,
 *   type SessionSummary,
 *   type UpcomingReview,
 * } from '@/core/dashboard';
 *
 * // Create the aggregator with required repositories
 * const aggregator = new DashboardDataAggregator(
 *   recallSetRepo,
 *   recallPointRepo,
 *   sessionRepo,
 *   metricsRepo,
 *   analyticsCalc
 * );
 *
 * // Get main dashboard overview
 * const overview = await aggregator.getOverview();
 * console.log(`Current streak: ${overview.currentStreak} days`);
 *
 * // Get detailed analytics for a specific recall set
 * const setDashboard = await aggregator.getRecallSetDashboard('rs_spanish_vocab');
 * console.log(`Mastered points: ${setDashboard.points.mastered}`);
 * ```
 */

// Dashboard data aggregator service
export { DashboardDataAggregator } from './dashboard-data';

// Dashboard types for API response shapes
export type {
  SessionSummary,
  UpcomingReview,
  ChartDataPoint,
  DashboardOverview,
  PointStatusBreakdown,
  RecallPointSummary,
  RecallSetDashboard,
} from './types';
