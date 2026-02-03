/**
 * Data Export Types for Contextual Clarity
 *
 * This module defines types for exporting session data in JSON and CSV formats.
 * These types structure the export output for external analysis tools while
 * maintaining consistency with the internal domain models.
 *
 * Export types support three levels of granularity:
 * 1. SessionExport - Complete data for a single session
 * 2. RecallSetExport - Aggregated data for all sessions in a recall set
 * 3. AnalyticsExport - Analytics-only export without session details
 *
 * The export options allow consumers to customize what data is included,
 * balancing detail against file size and processing requirements.
 */

import type { RecallSetAnalytics } from '../analytics/types';
import type { SessionMetricsSummary } from '../../storage/repositories/session-metrics.repository';
import type { SessionMessage } from '../models/session';
import type {
  RecallOutcome as DbRecallOutcome,
  RabbitholeEvent as DbRabbitholeEvent,
  MessageTiming as DbMessageTiming,
} from '../../storage/schema';

/**
 * Configuration options for data export operations.
 *
 * These options control what data is included in exports and the output format.
 * Different options have different performance implications - larger exports
 * with more data take longer to generate and produce bigger files.
 *
 * @example
 * ```typescript
 * // Full export with all details for deep analysis
 * const fullOptions: ExportOptions = {
 *   format: 'json',
 *   includeMessages: true,
 *   includeRabbitholes: true,
 *   includeTimings: true,
 * };
 *
 * // Lightweight export for quick overview
 * const lightOptions: ExportOptions = {
 *   format: 'csv',
 *   includeMessages: false,
 *   includeRabbitholes: false,
 *   includeTimings: false,
 *   dateRange: {
 *     start: new Date('2024-01-01'),
 *     end: new Date('2024-01-31'),
 *   },
 * };
 * ```
 */
export interface ExportOptions {
  /**
   * Output format for the export.
   * - 'json': Structured JSON with full nesting and data types preserved
   * - 'csv': Flat CSV format suitable for spreadsheet import
   *
   * Note: CSV format may flatten or omit complex nested data structures.
   */
  format: 'json' | 'csv';

  /**
   * Whether to include the full conversation transcript.
   * When true, all session messages (user, assistant, system) are included.
   * This can significantly increase export size for sessions with long conversations.
   */
  includeMessages: boolean;

  /**
   * Whether to include rabbithole (tangent) event data.
   * Rabbitholes track when conversations diverge from the main topic.
   * Useful for analyzing engagement patterns and learning curiosity.
   */
  includeRabbitholes: boolean;

  /**
   * Whether to include per-message timing data.
   * Timing data includes response latencies and token counts per message.
   * Useful for performance analysis and cost optimization.
   */
  includeTimings: boolean;

  /**
   * Optional date range filter for exports.
   * When specified, only sessions within this range are included.
   * Both start and end dates are inclusive.
   */
  dateRange?: {
    /** Start of the date range (inclusive) */
    start: Date;
    /** End of the date range (inclusive) */
    end: Date;
  };
}

/**
 * Exported recall outcome data.
 *
 * Represents the result of a single recall attempt during a session.
 * Contains both the assessment result and metadata about the attempt.
 */
export interface RecallOutcomeExport {
  /** Unique identifier for this outcome */
  id: string;
  /** ID of the recall point that was tested */
  recallPointId: string;
  /** Whether the recall was successful */
  success: boolean;
  /** Confidence level in the assessment (0.0 to 1.0) */
  confidence: number;
  /** User's self-rating of difficulty (forgot, hard, good, easy) */
  rating: string | null;
  /** AI reasoning for the assessment */
  reasoning: string | null;
  /** Time spent on this recall attempt in milliseconds */
  timeSpentMs: number;
  /** When this outcome was recorded */
  createdAt: Date;
}

/**
 * Exported rabbithole event data.
 *
 * Represents a conversational tangent that occurred during a session.
 * Tracks when the conversation diverged from the main recall topic.
 */
export interface RabbitholeEventExport {
  /** Unique identifier for this event */
  id: string;
  /** The tangent topic */
  topic: string;
  /** Message index where the tangent started */
  triggerMessageIndex: number;
  /** Message index where conversation returned (null if still active/abandoned) */
  returnMessageIndex: number | null;
  /** Depth of the tangent (1-3 scale) */
  depth: number;
  /** IDs of recall points related to this tangent */
  relatedRecallPointIds: string[];
  /** Whether the user initiated this tangent */
  userInitiated: boolean;
  /** Status of the rabbithole (active, returned, abandoned) */
  status: string;
  /** When this event was detected */
  createdAt: Date;
}

/**
 * Exported message timing data.
 *
 * Contains timing information for a single message in the conversation.
 * Useful for performance analysis and cost attribution.
 */
export interface MessageTimingExport {
  /** Unique identifier for this timing record */
  id: string;
  /** ID of the message this timing relates to */
  messageId: string;
  /** Role of the message sender (user, assistant, system) */
  role: string;
  /** When the message was sent */
  timestamp: Date;
  /** Time taken to generate this message after the previous one (milliseconds) */
  responseLatencyMs: number | null;
  /** Number of tokens in this message */
  tokenCount: number;
}

/**
 * Exported session message data.
 *
 * Represents a single message in the session conversation.
 * Simplified from the internal model for export purposes.
 */
export interface SessionMessageExport {
  /** Unique identifier for this message */
  id: string;
  /** Role of the sender (user, assistant, system) */
  role: string;
  /** The text content of the message */
  content: string;
  /** When the message was sent */
  timestamp: Date;
  /** Number of tokens in the message (may be null) */
  tokenCount: number | null;
}

/**
 * Complete export of a single session's data.
 *
 * SessionExport contains all data associated with a recall session,
 * including metrics, outcomes, and optionally messages/rabbitholes/timings.
 * This is the primary export type for analyzing individual sessions.
 *
 * @example
 * ```typescript
 * const sessionData: SessionExport = {
 *   session: {
 *     id: 'sess_abc123',
 *     recallSetId: 'rs_spanish_vocab',
 *     recallSetName: 'Spanish Vocabulary',
 *     startedAt: new Date('2024-01-15T10:00:00Z'),
 *     endedAt: new Date('2024-01-15T10:15:00Z'),
 *     status: 'completed',
 *   },
 *   metrics: { ... },
 *   recallOutcomes: [...],
 *   messages: [...],
 *   rabbitholes: [...],
 *   timings: [...],
 * };
 * ```
 */
export interface SessionExport {
  /**
   * Core session information.
   * Contains identifying information and lifecycle status.
   */
  session: {
    /** Unique identifier for the session */
    id: string;
    /** ID of the recall set this session belongs to */
    recallSetId: string;
    /** Name of the recall set (for convenience) */
    recallSetName: string;
    /** When the session started */
    startedAt: Date;
    /** When the session ended (null if still in progress) */
    endedAt: Date | null;
    /** Current status of the session */
    status: string;
  };

  /**
   * Session metrics summary.
   * Contains aggregate performance data for the session.
   * May be null if metrics haven't been calculated yet.
   */
  metrics: SessionMetricsSummary | null;

  /**
   * Individual recall outcomes for this session.
   * Contains the result of each recall point tested.
   */
  recallOutcomes: RecallOutcomeExport[];

  /**
   * Full conversation transcript.
   * Only included when ExportOptions.includeMessages is true.
   */
  messages?: SessionMessageExport[];

  /**
   * Rabbithole (tangent) events.
   * Only included when ExportOptions.includeRabbitholes is true.
   */
  rabbitholes?: RabbitholeEventExport[];

  /**
   * Per-message timing data.
   * Only included when ExportOptions.includeTimings is true.
   */
  timings?: MessageTimingExport[];
}

/**
 * Complete export of a recall set with all sessions.
 *
 * RecallSetExport provides a comprehensive view of a recall set,
 * including aggregate analytics and all individual sessions.
 * This is the primary export type for analyzing learning progress over time.
 *
 * @example
 * ```typescript
 * const recallSetData: RecallSetExport = {
 *   recallSet: {
 *     id: 'rs_spanish_vocab',
 *     name: 'Spanish Vocabulary',
 *     description: 'Common Spanish words and phrases',
 *     status: 'active',
 *     createdAt: new Date('2024-01-01T00:00:00Z'),
 *   },
 *   analytics: { ... },
 *   sessions: [...],
 * };
 * ```
 */
export interface RecallSetExport {
  /**
   * Core recall set information.
   * Contains identifying information and status.
   */
  recallSet: {
    /** Unique identifier for the recall set */
    id: string;
    /** Human-readable name */
    name: string;
    /** Description of what this set covers */
    description: string;
    /** Current status (active, paused, archived) */
    status: string;
    /** When the recall set was created */
    createdAt: Date;
  };

  /**
   * Aggregate analytics for the recall set.
   * Contains trends, point analytics, and summary statistics.
   */
  analytics: RecallSetAnalytics;

  /**
   * All sessions for this recall set.
   * May be filtered by date range if specified in options.
   */
  sessions: SessionExport[];
}

/**
 * Analytics-only export without session details.
 *
 * Provides aggregate analytics for a recall set without including
 * individual session data. Useful for quick overviews and dashboards.
 */
export interface AnalyticsExport {
  /**
   * Basic recall set identification.
   */
  recallSet: {
    /** Unique identifier */
    id: string;
    /** Human-readable name */
    name: string;
  };

  /**
   * Full analytics data.
   */
  analytics: RecallSetAnalytics;

  /**
   * When this export was generated.
   */
  exportedAt: Date;
}

/**
 * Maps a database recall outcome to an export format.
 *
 * @param outcome - The database recall outcome record
 * @returns The outcome formatted for export
 */
export function mapRecallOutcomeToExport(
  outcome: DbRecallOutcome
): RecallOutcomeExport {
  return {
    id: outcome.id,
    recallPointId: outcome.recallPointId,
    success: outcome.success,
    confidence: outcome.confidence,
    rating: outcome.rating,
    reasoning: outcome.reasoning,
    timeSpentMs: outcome.timeSpentMs,
    createdAt: outcome.createdAt,
  };
}

/**
 * Maps a database rabbithole event to an export format.
 *
 * @param event - The database rabbithole event record
 * @returns The event formatted for export
 */
export function mapRabbitholeEventToExport(
  event: DbRabbitholeEvent
): RabbitholeEventExport {
  return {
    id: event.id,
    topic: event.topic,
    triggerMessageIndex: event.triggerMessageIndex,
    returnMessageIndex: event.returnMessageIndex,
    depth: event.depth,
    relatedRecallPointIds: event.relatedRecallPointIds,
    userInitiated: event.userInitiated,
    status: event.status,
    createdAt: event.createdAt,
  };
}

/**
 * Maps a database message timing to an export format.
 *
 * @param timing - The database message timing record
 * @returns The timing formatted for export
 */
export function mapMessageTimingToExport(
  timing: DbMessageTiming
): MessageTimingExport {
  return {
    id: timing.id,
    messageId: timing.messageId,
    role: timing.role,
    timestamp: timing.timestamp,
    responseLatencyMs: timing.responseLatencyMs,
    tokenCount: timing.tokenCount,
  };
}

/**
 * Maps a domain session message to an export format.
 *
 * @param message - The session message
 * @returns The message formatted for export
 */
export function mapSessionMessageToExport(
  message: SessionMessage
): SessionMessageExport {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    tokenCount: message.tokenCount,
  };
}
