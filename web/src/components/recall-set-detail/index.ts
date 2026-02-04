/**
 * Recall Set Detail Components - Barrel Export
 *
 * This file re-exports all components for the recall set detail page.
 * Import components like:
 *
 * ```typescript
 * import {
 *   SetHeader,
 *   StatsOverview,
 *   PointStatusBreakdown,
 *   RecallRateChart,
 *   PointsList,
 *   SessionHistoryTable,
 * } from '@/components/recall-set-detail';
 * ```
 *
 * Available components:
 * - SetHeader: Name, description, status, and action buttons
 * - StatsOverview: Summary statistics row with stat cards
 * - PointStatusBreakdown: Pie chart showing point status distribution
 * - RecallRateChart: Line chart of recall success over time
 * - PointsList: Table of all recall points with CRUD actions
 * - SessionHistoryTable: Recent sessions for this recall set
 */

// SetHeader - displays name, description, status, edit/delete buttons
export { SetHeader, type SetHeaderProps } from './SetHeader';

// StatsOverview - summary statistics row
export { StatsOverview, type StatsOverviewProps } from './StatsOverview';

// PointStatusBreakdown - pie chart of point statuses
export { PointStatusBreakdown, type PointStatusBreakdownProps } from './PointStatusBreakdown';

// RecallRateChart - line chart of recall rate over time
export {
  RecallRateChart,
  type RecallRateChartProps,
  type RecallRateDataPoint,
} from './RecallRateChart';

// PointsList - table of recall points with actions
export { PointsList, type PointsListProps } from './PointsList';

// SessionHistoryTable - table of recent sessions
export { SessionHistoryTable, type SessionHistoryTableProps } from './SessionHistoryTable';
