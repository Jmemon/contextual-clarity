/**
 * PointStatusBreakdown Component
 *
 * Displays a visual breakdown of recall points by their FSRS learning state.
 * Uses recharts to render a pie chart showing the distribution of:
 * - New: Points never reviewed
 * - Learning: Points in initial learning phase
 * - Review: Points in review phase (known but need reinforcement)
 * - Relearning: Points that were forgotten and need relearning
 *
 * The component also displays a legend with counts for each status.
 *
 * @example
 * ```tsx
 * <PointStatusBreakdown
 *   newCount={10}
 *   learningCount={5}
 *   reviewCount={8}
 *   relearnCount={2}
 * />
 * ```
 */

import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Card, CardHeader, CardBody, Spinner } from '@/components/ui';

export interface PointStatusBreakdownProps {
  /** Count of points in 'new' state */
  newCount: number;
  /** Count of points in 'learning' state */
  learningCount: number;
  /** Count of points in 'review' state */
  reviewCount: number;
  /** Count of points in 'relearning' state */
  relearnCount: number;
  /** Whether the data is currently loading */
  isLoading?: boolean;
}

/**
 * Color palette for each FSRS learning state.
 * Colors are chosen to be visually distinct and semantically meaningful:
 * - Blue: New (neutral, unexplored)
 * - Amber: Learning (in progress, attention needed)
 * - Green: Review (known, positive)
 * - Red: Relearning (needs attention, warning)
 */
const STATUS_COLORS = {
  new: '#3B82F6',       // Blue-500
  learning: '#F59E0B',  // Amber-500
  review: '#10B981',    // Emerald-500
  relearning: '#EF4444', // Red-500
};

/**
 * Custom label component for pie chart segments.
 * Shows percentage if the segment is large enough.
 */
interface LabelProps {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
  name: string;
}

function renderLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: LabelProps) {
  // Don't show label for very small segments
  if (percent < 0.05) return null;

  // Calculate position for label
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      className="text-xs font-medium"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

/**
 * Point status breakdown chart component.
 * Renders a pie chart with legend showing point distribution by FSRS state.
 */
export function PointStatusBreakdown({
  newCount,
  learningCount,
  reviewCount,
  relearnCount,
  isLoading = false,
}: PointStatusBreakdownProps) {
  // Prepare data for the pie chart
  const chartData = useMemo(
    () => [
      { name: 'New', value: newCount, color: STATUS_COLORS.new },
      { name: 'Learning', value: learningCount, color: STATUS_COLORS.learning },
      { name: 'Review', value: reviewCount, color: STATUS_COLORS.review },
      { name: 'Relearning', value: relearnCount, color: STATUS_COLORS.relearning },
    ],
    [newCount, learningCount, reviewCount, relearnCount]
  );

  // Calculate total for displaying when there's no data
  const total = newCount + learningCount + reviewCount + relearnCount;

  return (
    <Card>
      <CardHeader>Point Status Breakdown</CardHeader>
      <CardBody>
        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center h-64">
            <Spinner size="lg" label="Loading chart..." />
          </div>
        )}

        {/* Empty state when no points exist */}
        {!isLoading && total === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <svg
              className="w-12 h-12 mb-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"
              />
            </svg>
            <p className="text-sm">No recall points yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Add points to see the status breakdown
            </p>
          </div>
        )}

        {/* Chart with data */}
        {!isLoading && total > 0 && (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderLabel}
                  outerRadius={80}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                {/* Tooltip shows name and value on hover */}
                <Tooltip
                  formatter={(value: number, name: string) => [value, name]}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  }}
                />
                {/* Legend at the bottom */}
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value: string) => (
                    <span className="text-sm text-gray-700">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Status summary row below chart */}
        {!isLoading && total > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-200">
            {chartData.map(({ name, value, color }) => (
              <div key={name} className="text-center">
                <div
                  className="w-3 h-3 rounded-full mx-auto mb-1"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <p className="text-xs text-gray-500">{name}</p>
                <p className="text-lg font-semibold text-gray-900">{value}</p>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// Display name for React DevTools
PointStatusBreakdown.displayName = 'PointStatusBreakdown';
