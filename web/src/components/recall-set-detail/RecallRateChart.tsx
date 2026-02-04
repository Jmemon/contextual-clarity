/**
 * RecallRateChart Component
 *
 * Displays a line chart showing recall success rate over time.
 * Uses recharts to render a responsive line chart with:
 * - X-axis: Date/time
 * - Y-axis: Recall rate (0-100%)
 * - Tooltip showing exact values on hover
 *
 * If no historical data is available from the API, generates mock data
 * to demonstrate the chart functionality.
 *
 * @example
 * ```tsx
 * <RecallRateChart
 *   data={[
 *     { date: '2024-01-01', recallRate: 0.75 },
 *     { date: '2024-01-02', recallRate: 0.82 },
 *   ]}
 * />
 * ```
 */

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardHeader, CardBody, Spinner } from '@/components/ui';

export interface RecallRateDataPoint {
  /** Date string (ISO 8601 or displayable format) */
  date: string;
  /** Recall rate as decimal (0.0 to 1.0) */
  recallRate: number;
}

export interface RecallRateChartProps {
  /** Array of recall rate data points over time */
  data?: RecallRateDataPoint[];
  /** Whether the data is currently loading */
  isLoading?: boolean;
}

/**
 * Generates mock recall rate data for demonstration.
 * Creates 14 days of sample data with realistic-looking variations.
 */
function generateMockData(): RecallRateDataPoint[] {
  const data: RecallRateDataPoint[] = [];
  const today = new Date();

  // Generate data for the past 14 days
  for (let i = 13; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);

    // Create a realistic-looking recall rate curve
    // Starts lower, generally improves over time with some variation
    const baseRate = 0.65 + (13 - i) * 0.02; // Gradual improvement
    const variation = (Math.random() - 0.5) * 0.1; // Random variation
    const recallRate = Math.max(0.5, Math.min(1, baseRate + variation));

    data.push({
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      recallRate,
    });
  }

  return data;
}

/**
 * Custom tooltip component for the chart.
 * Shows formatted date and recall rate percentage.
 */
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  const value = payload[0]?.value ?? 0;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
      <p className="text-sm text-gray-600 mb-1">{label}</p>
      <p className="text-lg font-semibold text-clarity-600">
        {(value * 100).toFixed(1)}%
      </p>
    </div>
  );
}

/**
 * Recall rate line chart component.
 * Shows how recall success has changed over time.
 */
export function RecallRateChart({
  data,
  isLoading = false,
}: RecallRateChartProps) {
  // Use provided data or generate mock data for demonstration
  const chartData = useMemo(() => {
    if (data && data.length > 0) {
      return data;
    }
    // Generate mock data if no data provided
    return generateMockData();
  }, [data]);

  // Determine if we're showing mock data
  const isMockData = !data || data.length === 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <span>Recall Rate Over Time</span>
          {/* Indicator if showing sample data */}
          {isMockData && !isLoading && (
            <span className="text-xs text-gray-400 font-normal">
              Sample data
            </span>
          )}
        </div>
      </CardHeader>
      <CardBody>
        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center h-64">
            <Spinner size="lg" label="Loading chart..." />
          </div>
        )}

        {/* Chart display */}
        {!isLoading && (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                {/* Grid lines for readability */}
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />

                {/* X-axis with date labels */}
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  tickLine={{ stroke: '#e5e7eb' }}
                  axisLine={{ stroke: '#e5e7eb' }}
                />

                {/* Y-axis with percentage scale (0-100%) */}
                <YAxis
                  domain={[0, 1]}
                  tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  tickLine={{ stroke: '#e5e7eb' }}
                  axisLine={{ stroke: '#e5e7eb' }}
                  width={50}
                />

                {/* Custom tooltip on hover */}
                <Tooltip content={<CustomTooltip />} />

                {/* Main line showing recall rate */}
                <Line
                  type="monotone"
                  dataKey="recallRate"
                  stroke="#7c3aed" // Clarity purple
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#7c3aed' }}
                  activeDot={{ r: 6, fill: '#7c3aed', stroke: '#fff', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Legend/description below chart */}
        {!isLoading && (
          <p className="text-xs text-gray-500 mt-4 text-center">
            {isMockData
              ? 'Chart shows sample data. Complete more study sessions to see your actual progress.'
              : 'Chart shows your recall success rate over the selected time period.'}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

// Display name for React DevTools
RecallRateChart.displayName = 'RecallRateChart';
