/**
 * Data Export Service for Contextual Clarity
 *
 * This service provides functionality for exporting session data in JSON and CSV
 * formats for external analysis. It supports exporting individual sessions, complete
 * recall sets (with all their sessions), and analytics-only summaries.
 *
 * The export service aggregates data from multiple repositories to build comprehensive
 * export packages, then formats them according to the requested output format.
 *
 * Key features:
 * - JSON export preserves full data structure and types
 * - CSV export flattens data for spreadsheet compatibility
 * - Optional inclusion of messages, rabbitholes, and timings
 * - Date range filtering for large datasets
 * - Efficient streaming for large exports (when possible)
 *
 * @example
 * ```typescript
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
 * const json = await exportService.exportSession('sess_abc123', {
 *   format: 'json',
 *   includeMessages: true,
 *   includeRabbitholes: true,
 *   includeTimings: false,
 * });
 *
 * // Export a recall set as CSV
 * const csv = await exportService.exportRecallSet('rs_spanish_vocab', {
 *   format: 'csv',
 *   includeMessages: false,
 *   includeRabbitholes: false,
 *   includeTimings: false,
 *   dateRange: { start: new Date('2024-01-01'), end: new Date('2024-01-31') },
 * });
 * ```
 */

import type { SessionRepository } from '../../storage/repositories/session.repository';
import type { RecallSetRepository } from '../../storage/repositories/recall-set.repository';
import type { SessionMessageRepository } from '../../storage/repositories/session-message.repository';
import type { SessionMetricsRepository } from '../../storage/repositories/session-metrics.repository';
import type { RecallOutcomeRepository } from '../../storage/repositories/recall-outcome.repository';
import type { RabbitholeEventRepository } from '../../storage/repositories/rabbithole-event.repository';
import type { AnalyticsCalculator } from '../analytics/analytics-calculator';
import type {
  ExportOptions,
  SessionExport,
  RecallSetExport,
  AnalyticsExport,
  RecallOutcomeExport,
} from './types';
import {
  mapRecallOutcomeToExport,
  mapRabbitholeEventToExport,
  mapSessionMessageToExport,
} from './types';

/**
 * Service for exporting session data in various formats.
 *
 * ExportService coordinates data retrieval from multiple repositories and
 * transforms it into export-friendly formats. It handles the complexity of
 * aggregating related data and formatting it for JSON or CSV output.
 *
 * The service is designed to be efficient:
 * - Only fetches data that is requested (based on options)
 * - Uses date range filtering when specified
 * - Processes data incrementally where possible
 */
export class ExportService {
  /**
   * Creates a new ExportService instance.
   *
   * @param sessionRepo - Repository for session data access
   * @param recallSetRepo - Repository for recall set data access
   * @param messageRepo - Repository for session message data access
   * @param metricsRepo - Repository for session metrics data access
   * @param outcomeRepo - Repository for recall outcome data access
   * @param rabbitholeRepo - Repository for rabbithole event data access
   * @param analyticsCalc - Calculator for aggregate analytics
   */
  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly recallSetRepo: RecallSetRepository,
    private readonly messageRepo: SessionMessageRepository,
    private readonly metricsRepo: SessionMetricsRepository,
    private readonly outcomeRepo: RecallOutcomeRepository,
    private readonly rabbitholeRepo: RabbitholeEventRepository,
    private readonly analyticsCalc: AnalyticsCalculator
  ) {}

  /**
   * Export a single session's data.
   *
   * Fetches all data associated with a session and converts it to the requested
   * format. The export includes session metadata, metrics, and recall outcomes.
   * Optionally includes messages, rabbitholes, and timing data based on options.
   *
   * @param sessionId - The unique identifier of the session to export
   * @param options - Export configuration options
   * @returns Stringified JSON or CSV data
   * @throws Error if the session is not found
   *
   * @example
   * ```typescript
   * // Full JSON export
   * const json = await exportService.exportSession('sess_abc123', {
   *   format: 'json',
   *   includeMessages: true,
   *   includeRabbitholes: true,
   *   includeTimings: true,
   * });
   *
   * // Minimal CSV export
   * const csv = await exportService.exportSession('sess_abc123', {
   *   format: 'csv',
   *   includeMessages: false,
   *   includeRabbitholes: false,
   *   includeTimings: false,
   * });
   * ```
   */
  async exportSession(
    sessionId: string,
    options: ExportOptions
  ): Promise<string> {
    // Fetch the session to verify it exists
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new Error(`Session with id '${sessionId}' not found`);
    }

    // Fetch the recall set to get the name for the export
    const recallSet = await this.recallSetRepo.findById(session.recallSetId);
    if (!recallSet) {
      throw new Error(
        `RecallSet with id '${session.recallSetId}' not found for session '${sessionId}'`
      );
    }

    // Build the session export object
    const sessionExport = await this.buildSessionExport(
      session,
      recallSet.name,
      options
    );

    // Convert to requested format
    if (options.format === 'json') {
      return this.sessionToJSON(sessionExport);
    } else {
      return this.sessionToCSV(sessionExport);
    }
  }

  /**
   * Export all sessions for a recall set.
   *
   * Fetches the recall set, its analytics, and all associated sessions
   * (optionally filtered by date range). Builds a comprehensive export
   * package with aggregate data and individual session details.
   *
   * @param recallSetId - The unique identifier of the recall set to export
   * @param options - Export configuration options
   * @returns Stringified JSON or CSV data
   * @throws Error if the recall set is not found
   *
   * @example
   * ```typescript
   * // Export all sessions from January
   * const data = await exportService.exportRecallSet('rs_spanish_vocab', {
   *   format: 'json',
   *   includeMessages: true,
   *   includeRabbitholes: true,
   *   includeTimings: false,
   *   dateRange: {
   *     start: new Date('2024-01-01'),
   *     end: new Date('2024-01-31'),
   *   },
   * });
   * ```
   */
  async exportRecallSet(
    recallSetId: string,
    options: ExportOptions
  ): Promise<string> {
    // Fetch the recall set to verify it exists
    const recallSet = await this.recallSetRepo.findById(recallSetId);
    if (!recallSet) {
      throw new Error(`RecallSet with id '${recallSetId}' not found`);
    }

    // Calculate analytics for the recall set
    const analytics =
      await this.analyticsCalc.calculateRecallSetAnalytics(recallSetId);

    // Get sessions - either filtered by date range or all
    const sessions = await this.getSessionsForRecallSet(recallSetId, options);

    // Build export objects for each session
    // Process sessions one at a time to avoid excessive memory usage
    const sessionExports: SessionExport[] = [];
    for (const session of sessions) {
      const sessionExport = await this.buildSessionExport(
        session,
        recallSet.name,
        options
      );
      sessionExports.push(sessionExport);
    }

    // Build the recall set export
    const recallSetExport: RecallSetExport = {
      recallSet: {
        id: recallSet.id,
        name: recallSet.name,
        description: recallSet.description,
        status: recallSet.status,
        createdAt: recallSet.createdAt,
      },
      analytics,
      sessions: sessionExports,
    };

    // Convert to requested format
    if (options.format === 'json') {
      return this.recallSetToJSON(recallSetExport);
    } else {
      return this.recallSetToCSV(recallSetExport);
    }
  }

  /**
   * Export aggregate analytics only (no session details).
   *
   * Provides a lightweight export containing just the analytics summary
   * for a recall set, without individual session data. Useful for quick
   * overview reports and dashboard exports.
   *
   * @param recallSetId - The unique identifier of the recall set
   * @param options - Export configuration options (format only)
   * @returns Stringified JSON or CSV data
   * @throws Error if the recall set is not found
   *
   * @example
   * ```typescript
   * const analytics = await exportService.exportAnalytics('rs_spanish_vocab', {
   *   format: 'json',
   *   includeMessages: false,
   *   includeRabbitholes: false,
   *   includeTimings: false,
   * });
   * ```
   */
  async exportAnalytics(
    recallSetId: string,
    options: ExportOptions
  ): Promise<string> {
    // Fetch the recall set to verify it exists
    const recallSet = await this.recallSetRepo.findById(recallSetId);
    if (!recallSet) {
      throw new Error(`RecallSet with id '${recallSetId}' not found`);
    }

    // Calculate analytics for the recall set
    const analytics =
      await this.analyticsCalc.calculateRecallSetAnalytics(recallSetId);

    // Build the analytics export
    const analyticsExport: AnalyticsExport = {
      recallSet: {
        id: recallSet.id,
        name: recallSet.name,
      },
      analytics,
      exportedAt: new Date(),
    };

    // Convert to requested format
    if (options.format === 'json') {
      return JSON.stringify(analyticsExport, this.jsonDateReplacer, 2);
    } else {
      return this.analyticsToCSV(analyticsExport);
    }
  }

  /**
   * Build a SessionExport object from a session.
   *
   * Fetches all related data for a session (metrics, outcomes, and optionally
   * messages, rabbitholes, timings) and assembles them into an export object.
   *
   * @param session - The session domain model
   * @param recallSetName - The name of the recall set (for convenience)
   * @param options - Export options controlling what data to include
   * @returns Complete SessionExport object
   */
  private async buildSessionExport(
    session: { id: string; recallSetId: string; status: string; startedAt: Date; endedAt: Date | null },
    recallSetName: string,
    options: ExportOptions
  ): Promise<SessionExport> {
    // Fetch session metrics (may be null if session is still in progress)
    const metrics = await this.metricsRepo.findBySessionId(session.id);

    // Fetch recall outcomes for this session
    const outcomes = await this.outcomeRepo.findBySessionId(session.id);
    const recallOutcomes: RecallOutcomeExport[] = outcomes.map(
      mapRecallOutcomeToExport
    );

    // Build the base export object
    const sessionExport: SessionExport = {
      session: {
        id: session.id,
        recallSetId: session.recallSetId,
        recallSetName,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        status: session.status,
      },
      metrics: metrics
        ? {
            sessionId: metrics.sessionId,
            durationMs: metrics.durationMs,
            recallRate: metrics.overallRecallRate,
            engagementScore: metrics.engagementScore,
            recallPointsAttempted: metrics.recallPointsAttempted,
            recallPointsSuccessful: metrics.recallPointsSuccessful,
            costUsd: metrics.estimatedCostUsd,
            rabbitholeCount: metrics.rabbitholeCount,
            calculatedAt: metrics.calculatedAt,
          }
        : null,
      recallOutcomes,
    };

    // Optionally include messages
    if (options.includeMessages) {
      const messages = await this.messageRepo.findBySessionId(session.id);
      sessionExport.messages = messages.map(mapSessionMessageToExport);
    }

    // Optionally include rabbitholes
    if (options.includeRabbitholes) {
      const rabbitholes = await this.rabbitholeRepo.findBySessionId(session.id);
      sessionExport.rabbitholes = rabbitholes.map(mapRabbitholeEventToExport);
    }

    // Note: Message timings would require a MessageTimingsRepository
    // which doesn't exist yet. Leave timings undefined for now.
    // When the repository is added, this can be populated similarly.
    if (options.includeTimings) {
      // Timings repository not yet implemented
      // sessionExport.timings = await this.fetchTimings(session.id);
      sessionExport.timings = [];
    }

    return sessionExport;
  }

  /**
   * Get sessions for a recall set, optionally filtered by date range.
   *
   * When a date range is specified, uses the metrics repository to filter
   * sessions by their completion date. Otherwise returns all sessions.
   *
   * @param recallSetId - The recall set to get sessions for
   * @param options - Export options with optional date range
   * @returns Array of session objects
   */
  private async getSessionsForRecallSet(
    recallSetId: string,
    options: ExportOptions
  ): Promise<Array<{ id: string; recallSetId: string; status: string; startedAt: Date; endedAt: Date | null }>> {
    // Get all sessions for this recall set
    const allSessions = await this.sessionRepo.findAll();
    const recallSetSessions = allSessions.filter(
      (s) => s.recallSetId === recallSetId
    );

    // If no date range specified, return all sessions
    if (!options.dateRange) {
      return recallSetSessions;
    }

    // Filter by date range using the startedAt timestamp
    const { start, end } = options.dateRange;
    return recallSetSessions.filter((session) => {
      const sessionDate = session.startedAt;
      return sessionDate >= start && sessionDate <= end;
    });
  }

  /**
   * Convert a session export to JSON string.
   *
   * Uses a custom replacer to handle Date serialization consistently.
   *
   * @param session - The session export object
   * @returns Pretty-printed JSON string
   */
  private sessionToJSON(session: SessionExport): string {
    return JSON.stringify(session, this.jsonDateReplacer, 2);
  }

  /**
   * Convert a recall set export to JSON string.
   *
   * @param recallSet - The recall set export object
   * @returns Pretty-printed JSON string
   */
  private recallSetToJSON(recallSet: RecallSetExport): string {
    return JSON.stringify(recallSet, this.jsonDateReplacer, 2);
  }

  /**
   * JSON replacer function for consistent Date serialization.
   *
   * Converts Date objects to ISO 8601 strings for interoperability.
   *
   * @param _key - The property key being serialized (unused but required by replacer signature)
   * @param value - The value to serialize
   * @returns The serialized value
   */
  private jsonDateReplacer(_key: string, value: unknown): unknown {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }

  /**
   * Convert a session export to CSV format.
   *
   * Creates multiple CSV sections for different data types:
   * - Session info section
   * - Metrics section
   * - Recall outcomes section
   * - Optional: Messages, Rabbitholes, Timings sections
   *
   * @param session - The session export object
   * @returns CSV string with sections separated by blank lines
   */
  private sessionToCSV(session: SessionExport): string {
    const sections: string[] = [];

    // Session info section
    sections.push('# Session Info');
    sections.push(
      ['id', 'recallSetId', 'recallSetName', 'startedAt', 'endedAt', 'status'].join(',')
    );
    sections.push(
      [
        this.escapeCSV(session.session.id),
        this.escapeCSV(session.session.recallSetId),
        this.escapeCSV(session.session.recallSetName),
        this.escapeCSV(this.formatDate(session.session.startedAt)),
        this.escapeCSV(this.formatDate(session.session.endedAt)),
        this.escapeCSV(session.session.status),
      ].join(',')
    );

    // Metrics section
    sections.push('');
    sections.push('# Session Metrics');
    if (session.metrics) {
      sections.push(
        [
          'durationMs',
          'recallRate',
          'engagementScore',
          'recallPointsAttempted',
          'recallPointsSuccessful',
          'costUsd',
          'rabbitholeCount',
          'calculatedAt',
        ].join(',')
      );
      sections.push(
        [
          this.escapeCSV(session.metrics.durationMs),
          this.escapeCSV(session.metrics.recallRate),
          this.escapeCSV(session.metrics.engagementScore),
          this.escapeCSV(session.metrics.recallPointsAttempted),
          this.escapeCSV(session.metrics.recallPointsSuccessful),
          this.escapeCSV(session.metrics.costUsd),
          this.escapeCSV(session.metrics.rabbitholeCount),
          this.escapeCSV(this.formatDate(session.metrics.calculatedAt)),
        ].join(',')
      );
    } else {
      sections.push('No metrics available');
    }

    // Recall outcomes section
    sections.push('');
    sections.push('# Recall Outcomes');
    sections.push(
      [
        'id',
        'recallPointId',
        'success',
        'confidence',
        'rating',
        'timeSpentMs',
        'createdAt',
      ].join(',')
    );
    for (const outcome of session.recallOutcomes) {
      sections.push(
        [
          this.escapeCSV(outcome.id),
          this.escapeCSV(outcome.recallPointId),
          this.escapeCSV(outcome.success),
          this.escapeCSV(outcome.confidence),
          this.escapeCSV(outcome.rating),
          this.escapeCSV(outcome.timeSpentMs),
          this.escapeCSV(this.formatDate(outcome.createdAt)),
        ].join(',')
      );
    }

    // Optional: Messages section
    if (session.messages && session.messages.length > 0) {
      sections.push('');
      sections.push('# Messages');
      sections.push(['id', 'role', 'content', 'timestamp', 'tokenCount'].join(','));
      for (const message of session.messages) {
        sections.push(
          [
            this.escapeCSV(message.id),
            this.escapeCSV(message.role),
            this.escapeCSV(message.content),
            this.escapeCSV(this.formatDate(message.timestamp)),
            this.escapeCSV(message.tokenCount),
          ].join(',')
        );
      }
    }

    // Optional: Rabbitholes section
    if (session.rabbitholes && session.rabbitholes.length > 0) {
      sections.push('');
      sections.push('# Rabbitholes');
      sections.push(
        [
          'id',
          'topic',
          'triggerMessageIndex',
          'returnMessageIndex',
          'depth',
          'userInitiated',
          'status',
          'createdAt',
        ].join(',')
      );
      for (const rh of session.rabbitholes) {
        sections.push(
          [
            this.escapeCSV(rh.id),
            this.escapeCSV(rh.topic),
            this.escapeCSV(rh.triggerMessageIndex),
            this.escapeCSV(rh.returnMessageIndex),
            this.escapeCSV(rh.depth),
            this.escapeCSV(rh.userInitiated),
            this.escapeCSV(rh.status),
            this.escapeCSV(this.formatDate(rh.createdAt)),
          ].join(',')
        );
      }
    }

    // Optional: Timings section
    if (session.timings && session.timings.length > 0) {
      sections.push('');
      sections.push('# Message Timings');
      sections.push(
        ['id', 'messageId', 'role', 'timestamp', 'responseLatencyMs', 'tokenCount'].join(
          ','
        )
      );
      for (const timing of session.timings) {
        sections.push(
          [
            this.escapeCSV(timing.id),
            this.escapeCSV(timing.messageId),
            this.escapeCSV(timing.role),
            this.escapeCSV(this.formatDate(timing.timestamp)),
            this.escapeCSV(timing.responseLatencyMs),
            this.escapeCSV(timing.tokenCount),
          ].join(',')
        );
      }
    }

    return sections.join('\n');
  }

  /**
   * Convert a recall set export to CSV format.
   *
   * Creates multiple CSV sections:
   * - Recall set info section
   * - Analytics summary section
   * - Point analytics section
   * - Top rabbithole topics section
   * - Sessions summary section
   *
   * @param recallSet - The recall set export object
   * @returns CSV string with sections separated by blank lines
   */
  private recallSetToCSV(recallSet: RecallSetExport): string {
    const sections: string[] = [];

    // Recall set info section
    sections.push('# Recall Set Info');
    sections.push(['id', 'name', 'description', 'status', 'createdAt'].join(','));
    sections.push(
      [
        this.escapeCSV(recallSet.recallSet.id),
        this.escapeCSV(recallSet.recallSet.name),
        this.escapeCSV(recallSet.recallSet.description),
        this.escapeCSV(recallSet.recallSet.status),
        this.escapeCSV(this.formatDate(recallSet.recallSet.createdAt)),
      ].join(',')
    );

    // Analytics summary section
    sections.push('');
    sections.push('# Analytics Summary');
    sections.push(
      [
        'totalSessions',
        'totalTimeSpentMs',
        'overallRecallRate',
        'avgEngagementScore',
        'totalCostUsd',
      ].join(',')
    );
    sections.push(
      [
        this.escapeCSV(recallSet.analytics.totalSessions),
        this.escapeCSV(recallSet.analytics.totalTimeSpentMs),
        this.escapeCSV(recallSet.analytics.overallRecallRate),
        this.escapeCSV(recallSet.analytics.avgEngagementScore),
        this.escapeCSV(recallSet.analytics.totalCostUsd),
      ].join(',')
    );

    // Point analytics section
    if (recallSet.analytics.pointAnalytics.length > 0) {
      sections.push('');
      sections.push('# Point Analytics');
      sections.push(
        [
          'recallPointId',
          'content',
          'successRate',
          'avgConfidence',
          'avgTimeToRecallMs',
          'currentStability',
          'currentDifficulty',
          'daysUntilDue',
          'isStruggling',
        ].join(',')
      );
      for (const point of recallSet.analytics.pointAnalytics) {
        sections.push(
          [
            this.escapeCSV(point.recallPointId),
            this.escapeCSV(point.content),
            this.escapeCSV(point.successRate),
            this.escapeCSV(point.avgConfidence),
            this.escapeCSV(point.avgTimeToRecallMs),
            this.escapeCSV(point.currentStability),
            this.escapeCSV(point.currentDifficulty),
            this.escapeCSV(point.daysUntilDue),
            this.escapeCSV(point.isStruggling),
          ].join(',')
        );
      }
    }

    // Top rabbithole topics section
    if (recallSet.analytics.topRabbitholeTopics.length > 0) {
      sections.push('');
      sections.push('# Top Rabbithole Topics');
      sections.push(['topic', 'count', 'avgDepth'].join(','));
      for (const topic of recallSet.analytics.topRabbitholeTopics) {
        sections.push(
          [
            this.escapeCSV(topic.topic),
            this.escapeCSV(topic.count),
            this.escapeCSV(topic.avgDepth),
          ].join(',')
        );
      }
    }

    // Sessions summary section (brief overview of each session)
    sections.push('');
    sections.push('# Sessions');
    sections.push(
      [
        'sessionId',
        'startedAt',
        'endedAt',
        'status',
        'durationMs',
        'recallRate',
        'engagementScore',
        'outcomeCount',
      ].join(',')
    );
    for (const session of recallSet.sessions) {
      sections.push(
        [
          this.escapeCSV(session.session.id),
          this.escapeCSV(this.formatDate(session.session.startedAt)),
          this.escapeCSV(this.formatDate(session.session.endedAt)),
          this.escapeCSV(session.session.status),
          this.escapeCSV(session.metrics?.durationMs ?? ''),
          this.escapeCSV(session.metrics?.recallRate ?? ''),
          this.escapeCSV(session.metrics?.engagementScore ?? ''),
          this.escapeCSV(session.recallOutcomes.length),
        ].join(',')
      );
    }

    return sections.join('\n');
  }

  /**
   * Convert an analytics export to CSV format.
   *
   * Creates sections for analytics summary, point analytics, and trends.
   *
   * @param analytics - The analytics export object
   * @returns CSV string with sections separated by blank lines
   */
  private analyticsToCSV(analytics: AnalyticsExport): string {
    const sections: string[] = [];

    // Header section
    sections.push('# Analytics Export');
    sections.push(['recallSetId', 'recallSetName', 'exportedAt'].join(','));
    sections.push(
      [
        this.escapeCSV(analytics.recallSet.id),
        this.escapeCSV(analytics.recallSet.name),
        this.escapeCSV(this.formatDate(analytics.exportedAt)),
      ].join(',')
    );

    // Summary section
    sections.push('');
    sections.push('# Summary');
    sections.push(
      [
        'totalSessions',
        'totalTimeSpentMs',
        'overallRecallRate',
        'avgEngagementScore',
        'totalCostUsd',
      ].join(',')
    );
    sections.push(
      [
        this.escapeCSV(analytics.analytics.totalSessions),
        this.escapeCSV(analytics.analytics.totalTimeSpentMs),
        this.escapeCSV(analytics.analytics.overallRecallRate),
        this.escapeCSV(analytics.analytics.avgEngagementScore),
        this.escapeCSV(analytics.analytics.totalCostUsd),
      ].join(',')
    );

    // Recall rate trend section
    if (analytics.analytics.recallRateTrend.length > 0) {
      sections.push('');
      sections.push('# Recall Rate Trend');
      sections.push(['date', 'recallRate'].join(','));
      for (const point of analytics.analytics.recallRateTrend) {
        sections.push(
          [
            this.escapeCSV(this.formatDate(point.date)),
            this.escapeCSV(point.value),
          ].join(',')
        );
      }
    }

    // Engagement trend section
    if (analytics.analytics.engagementTrend.length > 0) {
      sections.push('');
      sections.push('# Engagement Trend');
      sections.push(['date', 'engagementScore'].join(','));
      for (const point of analytics.analytics.engagementTrend) {
        sections.push(
          [
            this.escapeCSV(this.formatDate(point.date)),
            this.escapeCSV(point.value),
          ].join(',')
        );
      }
    }

    // Point analytics section
    if (analytics.analytics.pointAnalytics.length > 0) {
      sections.push('');
      sections.push('# Point Analytics');
      sections.push(
        [
          'recallPointId',
          'content',
          'successRate',
          'avgConfidence',
          'avgTimeToRecallMs',
          'currentStability',
          'currentDifficulty',
          'daysUntilDue',
          'isStruggling',
        ].join(',')
      );
      for (const point of analytics.analytics.pointAnalytics) {
        sections.push(
          [
            this.escapeCSV(point.recallPointId),
            this.escapeCSV(point.content),
            this.escapeCSV(point.successRate),
            this.escapeCSV(point.avgConfidence),
            this.escapeCSV(point.avgTimeToRecallMs),
            this.escapeCSV(point.currentStability),
            this.escapeCSV(point.currentDifficulty),
            this.escapeCSV(point.daysUntilDue),
            this.escapeCSV(point.isStruggling),
          ].join(',')
        );
      }
    }

    // Top rabbithole topics section
    if (analytics.analytics.topRabbitholeTopics.length > 0) {
      sections.push('');
      sections.push('# Top Rabbithole Topics');
      sections.push(['topic', 'count', 'avgDepth'].join(','));
      for (const topic of analytics.analytics.topRabbitholeTopics) {
        sections.push(
          [
            this.escapeCSV(topic.topic),
            this.escapeCSV(topic.count),
            this.escapeCSV(topic.avgDepth),
          ].join(',')
        );
      }
    }

    return sections.join('\n');
  }

  /**
   * Safely escape a value for CSV output.
   *
   * Handles special cases:
   * - null/undefined -> empty string
   * - Values containing commas, quotes, or newlines get quoted
   * - Quotes within values get doubled (standard CSV escaping)
   *
   * @param value - The value to escape
   * @returns CSV-safe string representation
   */
  private escapeCSV(
    value: string | number | boolean | null | undefined
  ): string {
    // Handle null/undefined
    if (value === null || value === undefined) {
      return '';
    }

    // Convert to string
    const str = String(value);

    // Check if escaping is needed
    // Escape if contains comma, double quote, newline, or carriage return
    if (
      str.includes(',') ||
      str.includes('"') ||
      str.includes('\n') ||
      str.includes('\r')
    ) {
      // Double any existing quotes and wrap in quotes
      return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
  }

  /**
   * Format a Date for CSV output.
   *
   * Converts Date objects to ISO 8601 strings for consistent formatting.
   * Handles null values by returning an empty string.
   *
   * @param date - The date to format
   * @returns ISO 8601 string or empty string if null
   */
  private formatDate(date: Date | null): string {
    if (!date) {
      return '';
    }
    return date.toISOString();
  }
}
