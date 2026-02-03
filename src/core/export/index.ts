/**
 * Data Export Module - Barrel Export
 *
 * This module provides functionality for exporting session data in JSON and CSV
 * formats for external analysis. It supports exporting individual sessions,
 * complete recall sets with all their sessions, and analytics-only summaries.
 *
 * The export module is designed for:
 * - Researchers analyzing learning patterns
 * - Users wanting to back up their data
 * - Integration with external analytics tools
 * - Generating reports for progress tracking
 *
 * @example
 * ```typescript
 * import {
 *   ExportService,
 *   type ExportOptions,
 *   type SessionExport,
 *   type RecallSetExport,
 * } from '@/core/export';
 *
 * // Create the export service with required repositories
 * const exportService = new ExportService(
 *   sessionRepo,
 *   recallSetRepo,
 *   messageRepo,
 *   metricsRepo,
 *   outcomeRepo,
 *   rabbitholeRepo,
 *   analyticsCalc
 * );
 *
 * // Export a single session as JSON
 * const sessionJson = await exportService.exportSession('sess_abc123', {
 *   format: 'json',
 *   includeMessages: true,
 *   includeRabbitholes: true,
 *   includeTimings: false,
 * });
 *
 * // Export a recall set as CSV
 * const recallSetCsv = await exportService.exportRecallSet('rs_spanish_vocab', {
 *   format: 'csv',
 *   includeMessages: false,
 *   includeRabbitholes: false,
 *   includeTimings: false,
 *   dateRange: {
 *     start: new Date('2024-01-01'),
 *     end: new Date('2024-01-31'),
 *   },
 * });
 *
 * // Export analytics only
 * const analyticsJson = await exportService.exportAnalytics('rs_spanish_vocab', {
 *   format: 'json',
 *   includeMessages: false,
 *   includeRabbitholes: false,
 *   includeTimings: false,
 * });
 * ```
 */

// Export service for data export operations
export { ExportService } from './export-service';

// Export types for configuring exports
export type {
  ExportOptions,
  SessionExport,
  RecallSetExport,
  AnalyticsExport,
  RecallOutcomeExport,
  RabbitholeEventExport,
  MessageTimingExport,
  SessionMessageExport,
} from './types';

// Export mapping functions for converting DB records to export format
export {
  mapRecallOutcomeToExport,
  mapRabbitholeEventToExport,
  mapMessageTimingToExport,
  mapSessionMessageToExport,
} from './types';
