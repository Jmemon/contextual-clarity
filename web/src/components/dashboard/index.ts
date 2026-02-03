/**
 * Dashboard Components - Barrel Export
 *
 * This file re-exports all dashboard-specific components from a single entry point.
 * Import components like:
 *
 * ```typescript
 * import {
 *   OverviewStats,
 *   DuePointsCard,
 *   RecentSessionsList,
 *   UpcomingReviewsCard,
 *   StreakDisplay
 * } from '@/components/dashboard';
 * ```
 *
 * Available components:
 * - OverviewStats: Grid of StatCards showing key metrics
 * - DuePointsCard: Card highlighting points due for review today
 * - RecentSessionsList: List of recent study sessions with navigation
 * - UpcomingReviewsCard: Summary and list of upcoming reviews
 * - StreakDisplay: Current and longest streak visualization
 */

// Overview statistics grid component
export { OverviewStats, type OverviewStatsProps } from './OverviewStats';

// Due points today card component
export { DuePointsCard, type DuePointsCardProps } from './DuePointsCard';

// Recent sessions list component
export { RecentSessionsList, type RecentSessionsListProps } from './RecentSessionsList';

// Upcoming reviews card component
export { UpcomingReviewsCard, type UpcomingReviewsCardProps } from './UpcomingReviewsCard';

// Streak visualization component
export { StreakDisplay, type StreakDisplayProps } from './StreakDisplay';
