/**
 * Core Analytics Module - Barrel Export
 *
 * This module provides analytics utilities for the Contextual Clarity
 * learning application, including token cost calculation, usage tracking,
 * and comprehensive session analytics.
 *
 * The analytics module supports:
 * - Token cost calculation for different Claude models
 * - Session cost tracking and budgeting
 * - Usage monitoring and optimization
 * - Aggregate analytics across sessions and recall sets
 * - Trend analysis for recall rates and engagement
 * - Identification of struggling recall points
 *
 * @example
 * ```typescript
 * import {
 *   calculateCost,
 *   TOKEN_COSTS,
 *   AnalyticsCalculator,
 *   type ClaudeModel,
 *   type RecallSetAnalytics,
 * } from '@/core/analytics';
 *
 * // Calculate the cost of a session
 * const cost = calculateCost('claude-3-5-sonnet-20241022', 2500, 1800);
 * console.log(`Session cost: $${cost.toFixed(4)}`);
 *
 * // Calculate comprehensive analytics for a recall set
 * const calculator = new AnalyticsCalculator(...repos);
 * const analytics = await calculator.calculateRecallSetAnalytics('rs_abc123');
 * console.log(`Overall recall rate: ${analytics.overallRecallRate * 100}%`);
 * ```
 */

// Token cost constants and calculation utilities
export { TOKEN_COSTS, calculateCost } from './token-costs';
export type { ModelPricing, ClaudeModel } from './token-costs';

// Session analytics calculator for aggregate insights
export { AnalyticsCalculator } from './analytics-calculator';

// Analytics types for trend data and aggregate statistics
export type {
  TrendData,
  RecallSetAnalytics,
  RecallPointAnalytics,
  GlobalAnalytics,
} from './types';
