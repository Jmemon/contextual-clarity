/**
 * Sessions API Routes
 *
 * This module provides REST API endpoints for session management and history.
 * Sessions represent individual study encounters where users review recall points
 * through AI-powered Socratic dialogues.
 *
 * Endpoints:
 * - GET /sessions - List sessions with filters (pagination, recallSetId, dateRange, status)
 * - GET /sessions/:id - Get session details
 * - GET /sessions/:id/transcript - Get full transcript with messages and markers
 * - POST /sessions/start - Start a new session for a recall set
 * - POST /sessions/:id/abandon - Abandon an in-progress session
 *
 * This module works in conjunction with the WebSocket handler (T07) which
 * manages real-time session interactions after a session is started via POST /sessions/start.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '@/storage/db';
import {
  SessionRepository,
  SessionMessageRepository,
  SessionMetricsRepository,
  RecallSetRepository,
  RecallPointRepository,
  RecallOutcomeRepository,
  RabbitholeEventRepository,
} from '@/storage/repositories';
import { success, notFound, badRequest, internalError } from '../utils/response';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Query parameters for listing sessions with filters.
 */
interface SessionListQuery {
  /** Filter by recall set ID */
  recallSetId?: string;
  /** Filter by session start date (ISO 8601 format) */
  startDate?: string;
  /** Filter by session end date (ISO 8601 format) */
  endDate?: string;
  /** Page number for pagination (1-based) */
  page?: string;
  /** Number of items per page */
  limit?: string;
  /** Filter by session status */
  status?: 'completed' | 'abandoned' | 'in_progress';
}

/**
 * Response type for paginated session list.
 */
interface SessionListResponse {
  /** Array of sessions matching the filters */
  sessions: SessionWithMetrics[];
  /** Pagination metadata */
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Session with optional metrics summary for list views.
 */
interface SessionWithMetrics {
  /** Session ID */
  id: string;
  /** Associated recall set ID */
  recallSetId: string;
  /** Session lifecycle status */
  status: string;
  /** IDs of recall points targeted in this session */
  targetRecallPointIds: string[];
  /** When the session started */
  startedAt: Date;
  /** When the session ended (null if in progress) */
  endedAt: Date | null;
  /** Optional metrics summary for completed sessions */
  metrics?: {
    durationMs: number;
    recallRate: number;
    engagementScore: number;
    recallPointsAttempted: number;
    recallPointsSuccessful: number;
  } | null;
}

/**
 * Detailed session response including recall set name.
 */
interface SessionDetailResponse {
  /** Session data */
  session: {
    id: string;
    recallSetId: string;
    recallSetName: string;
    status: string;
    targetRecallPointIds: string[];
    startedAt: Date;
    endedAt: Date | null;
  };
  /** Session metrics if available */
  metrics?: {
    durationMs: number;
    activeTimeMs: number;
    recallRate: number;
    engagementScore: number;
    recallPointsAttempted: number;
    recallPointsSuccessful: number;
    recallPointsFailed: number;
    avgConfidence: number;
    totalMessages: number;
    rabbitholeCount: number;
    estimatedCostUsd: number;
  } | null;
}

/**
 * Transcript message with evaluation and rabbithole markers.
 */
interface TranscriptMessage {
  /** Message ID */
  id: string;
  /** Message role (user, assistant, system) */
  role: string;
  /** Message content */
  content: string;
  /** When the message was sent */
  timestamp: Date;
  /** Token count if available */
  tokenCount: number | null;
  /** Index of this message in the conversation */
  messageIndex: number;
  /** Evaluation marker if this message is part of a recall evaluation */
  evaluationMarker?: {
    recallPointId: string;
    isStart: boolean;
    isEnd: boolean;
    success?: boolean;
    confidence?: number;
  } | null;
  /** Rabbithole marker if this message is part of a tangent */
  rabbitholeMarker?: {
    eventId: string;
    topic: string;
    isTrigger: boolean;
    isReturn: boolean;
    depth: number;
  } | null;
}

/**
 * Full transcript response with messages and markers.
 */
interface TranscriptResponse {
  /** Session ID */
  sessionId: string;
  /** Array of messages with evaluation and rabbithole markers */
  messages: TranscriptMessage[];
  /** Total message count */
  totalMessages: number;
}

/**
 * Request body for starting a new session.
 */
const startSessionSchema = z.object({
  /** The recall set to study */
  recallSetId: z.string().min(1, 'recallSetId is required'),
});

// ============================================================================
// Repository Initialization
// ============================================================================

// Create repository instances with the default database connection
const sessionRepo = new SessionRepository(db);
const sessionMessageRepo = new SessionMessageRepository(db);
const sessionMetricsRepo = new SessionMetricsRepository(db);
const recallSetRepo = new RecallSetRepository(db);
const recallPointRepo = new RecallPointRepository(db);
const recallOutcomeRepo = new RecallOutcomeRepository(db);
const rabbitholeRepo = new RabbitholeEventRepository(db);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generates a unique session ID with prefix.
 * @returns A unique session ID in the format 'sess_<uuid>'
 */
function generateSessionId(): string {
  return `sess_${crypto.randomUUID()}`;
}

/**
 * Parses and validates a date string.
 * @param dateStr - ISO 8601 date string
 * @returns Date object or null if invalid
 */
function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

// ============================================================================
// Route Definitions
// ============================================================================

/**
 * Creates the sessions router with all session management endpoints.
 *
 * @returns Hono router instance with session routes
 */
export function sessionsRoutes(): Hono {
  const router = new Hono();

  // -------------------------------------------------------------------------
  // GET /sessions - List sessions with filters and pagination
  // -------------------------------------------------------------------------

  /**
   * Lists all sessions with optional filters for recallSetId, date range,
   * status, and pagination support.
   *
   * Query Parameters:
   * - recallSetId: Filter by recall set
   * - startDate: Filter sessions started after this date (ISO 8601)
   * - endDate: Filter sessions started before this date (ISO 8601)
   * - page: Page number (default: 1)
   * - limit: Items per page (default: 20, max: 100)
   * - status: Filter by status (completed, abandoned, in_progress)
   */
  router.get('/', async (c) => {
    try {
      const query = c.req.query() as SessionListQuery;

      // Parse pagination parameters with defaults
      const page = Math.max(1, parseInt(query.page || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));

      // Parse date filters
      const startDate = parseDate(query.startDate);
      const endDate = parseDate(query.endDate);

      // Validate status filter if provided
      const validStatuses = ['completed', 'abandoned', 'in_progress'];
      if (query.status && !validStatuses.includes(query.status)) {
        return badRequest(c, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
      }

      // Fetch all sessions (we'll filter in memory for simplicity)
      // In a production app with large datasets, you'd want database-level filtering
      let allSessions = await sessionRepo.findAll();

      // Apply filters
      if (query.recallSetId) {
        allSessions = allSessions.filter((s) => s.recallSetId === query.recallSetId);
      }

      if (query.status) {
        allSessions = allSessions.filter((s) => s.status === query.status);
      }

      if (startDate) {
        allSessions = allSessions.filter((s) => s.startedAt >= startDate);
      }

      if (endDate) {
        allSessions = allSessions.filter((s) => s.startedAt <= endDate);
      }

      // Sort by startedAt descending (most recent first)
      allSessions.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

      // Calculate pagination
      const total = allSessions.length;
      const totalPages = Math.ceil(total / limit);
      const offset = (page - 1) * limit;
      const paginatedSessions = allSessions.slice(offset, offset + limit);

      // Fetch metrics for each session to include summary data
      const sessionsWithMetrics: SessionWithMetrics[] = await Promise.all(
        paginatedSessions.map(async (session) => {
          const metrics = await sessionMetricsRepo.findBySessionId(session.id);
          return {
            id: session.id,
            recallSetId: session.recallSetId,
            status: session.status,
            targetRecallPointIds: session.targetRecallPointIds,
            startedAt: session.startedAt,
            endedAt: session.endedAt,
            metrics: metrics
              ? {
                  durationMs: metrics.durationMs,
                  recallRate: metrics.overallRecallRate,
                  engagementScore: metrics.engagementScore,
                  recallPointsAttempted: metrics.recallPointsAttempted,
                  recallPointsSuccessful: metrics.recallPointsSuccessful,
                }
              : null,
          };
        })
      );

      const response: SessionListResponse = {
        sessions: sessionsWithMetrics,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };

      return success(c, response);
    } catch (err) {
      console.error('Error listing sessions:', err);
      return internalError(c, 'Failed to list sessions');
    }
  });

  // -------------------------------------------------------------------------
  // GET /sessions/:id - Get session details
  // -------------------------------------------------------------------------

  /**
   * Retrieves detailed information about a specific session,
   * including metrics if available and the associated recall set name.
   */
  router.get('/:id', async (c) => {
    try {
      const id = c.req.param('id');

      // Fetch the session
      const session = await sessionRepo.findById(id);
      if (!session) {
        return notFound(c, 'Session', id);
      }

      // Fetch the associated recall set for its name
      const recallSet = await recallSetRepo.findById(session.recallSetId);
      const recallSetName = recallSet?.name || 'Unknown Recall Set';

      // Fetch metrics if available
      const metrics = await sessionMetricsRepo.findBySessionId(id);

      const response: SessionDetailResponse = {
        session: {
          id: session.id,
          recallSetId: session.recallSetId,
          recallSetName,
          status: session.status,
          targetRecallPointIds: session.targetRecallPointIds,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
        },
        metrics: metrics
          ? {
              durationMs: metrics.durationMs,
              activeTimeMs: metrics.activeTimeMs,
              recallRate: metrics.overallRecallRate,
              engagementScore: metrics.engagementScore,
              recallPointsAttempted: metrics.recallPointsAttempted,
              recallPointsSuccessful: metrics.recallPointsSuccessful,
              recallPointsFailed: metrics.recallPointsFailed,
              avgConfidence: metrics.avgConfidence,
              totalMessages: metrics.totalMessages,
              rabbitholeCount: metrics.rabbitholeCount,
              estimatedCostUsd: metrics.estimatedCostUsd,
            }
          : null,
      };

      return success(c, response);
    } catch (err) {
      console.error('Error fetching session:', err);
      return internalError(c, 'Failed to fetch session details');
    }
  });

  // -------------------------------------------------------------------------
  // GET /sessions/:id/transcript - Get full transcript with markers
  // -------------------------------------------------------------------------

  /**
   * Retrieves the full conversation transcript for a session,
   * including evaluation markers for recall outcomes and
   * rabbithole markers for tangent events.
   */
  router.get('/:id/transcript', async (c) => {
    try {
      const id = c.req.param('id');

      // Verify session exists
      const session = await sessionRepo.findById(id);
      if (!session) {
        return notFound(c, 'Session', id);
      }

      // Fetch all messages for this session
      const messages = await sessionMessageRepo.findBySessionId(id);

      // Fetch recall outcomes to create evaluation markers
      const recallOutcomes = await recallOutcomeRepo.findBySessionId(id);

      // Fetch rabbithole events to create rabbithole markers
      const rabbitholeEvents = await rabbitholeRepo.findBySessionId(id);

      // Build transcript messages with markers
      const transcriptMessages: TranscriptMessage[] = messages.map((msg, index) => {
        // Check if this message is part of a recall evaluation
        let evaluationMarker: TranscriptMessage['evaluationMarker'] = null;
        for (const outcome of recallOutcomes) {
          if (index >= outcome.messageIndexStart && index <= outcome.messageIndexEnd) {
            evaluationMarker = {
              recallPointId: outcome.recallPointId,
              isStart: index === outcome.messageIndexStart,
              isEnd: index === outcome.messageIndexEnd,
              // Only include success/confidence on the end message
              ...(index === outcome.messageIndexEnd && {
                success: outcome.success,
                confidence: outcome.confidence,
              }),
            };
            break;
          }
        }

        // Check if this message is part of a rabbithole tangent
        let rabbitholeMarker: TranscriptMessage['rabbitholeMarker'] = null;
        for (const event of rabbitholeEvents) {
          const returnIndex = event.returnMessageIndex ?? Infinity;
          if (index >= event.triggerMessageIndex && index <= returnIndex) {
            rabbitholeMarker = {
              eventId: event.id,
              topic: event.topic,
              isTrigger: index === event.triggerMessageIndex,
              isReturn: event.returnMessageIndex !== null && index === event.returnMessageIndex,
              depth: event.depth,
            };
            break;
          }
        }

        return {
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          tokenCount: msg.tokenCount,
          messageIndex: index,
          evaluationMarker,
          rabbitholeMarker,
        };
      });

      const response: TranscriptResponse = {
        sessionId: id,
        messages: transcriptMessages,
        totalMessages: messages.length,
      };

      return success(c, response);
    } catch (err) {
      console.error('Error fetching transcript:', err);
      return internalError(c, 'Failed to fetch session transcript');
    }
  });

  // -------------------------------------------------------------------------
  // POST /sessions/start - Start a new session
  // -------------------------------------------------------------------------

  /**
   * Starts a new recall session for a given recall set.
   * This creates a new session record in the database with status 'in_progress'
   * and returns the session ID for use with the WebSocket connection.
   *
   * Request Body:
   * - recallSetId: The ID of the recall set to study
   *
   * The session is initialized with all due recall points from the recall set.
   * If there are no due recall points, all recall points are included.
   */
  router.post('/start', async (c) => {
    try {
      // Parse and validate request body
      const body = await c.req.json();
      const parseResult = startSessionSchema.safeParse(body);

      if (!parseResult.success) {
        const errorMessage = parseResult.error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', ');
        return badRequest(c, errorMessage);
      }

      const { recallSetId } = parseResult.data;

      // Verify the recall set exists
      const recallSet = await recallSetRepo.findById(recallSetId);
      if (!recallSet) {
        return notFound(c, 'RecallSet', recallSetId);
      }

      // Check if recall set is active
      if (recallSet.status !== 'active') {
        return badRequest(c, `Cannot start session: recall set is ${recallSet.status}`);
      }

      // Check for existing in-progress session
      const existingSession = await sessionRepo.findInProgress(recallSetId);
      if (existingSession) {
        // Return the existing session ID instead of creating a new one
        return success(
          c,
          {
            sessionId: existingSession.id,
            message: 'Resuming existing in-progress session',
            isResume: true,
          },
          200
        );
      }

      // Get recall points due for review (or all if none are due)
      let duePoints = await recallPointRepo.findDuePoints(recallSetId);

      // If no points are due, include all points from the recall set
      if (duePoints.length === 0) {
        duePoints = await recallPointRepo.findByRecallSetId(recallSetId);
      }

      // Ensure there are recall points to study
      if (duePoints.length === 0) {
        return badRequest(c, 'No recall points available in this recall set');
      }

      // Create the new session
      const sessionId = generateSessionId();
      const targetRecallPointIds = duePoints.map((p) => p.id);

      await sessionRepo.create({
        id: sessionId,
        recallSetId,
        targetRecallPointIds,
        startedAt: new Date(),
      });

      return success(
        c,
        {
          sessionId,
          message: 'Session started successfully',
          targetRecallPointCount: targetRecallPointIds.length,
          isResume: false,
        },
        201
      );
    } catch (err) {
      console.error('Error starting session:', err);
      return internalError(c, 'Failed to start session');
    }
  });

  // -------------------------------------------------------------------------
  // POST /sessions/:id/abandon - Abandon an in-progress session
  // -------------------------------------------------------------------------

  /**
   * Abandons an in-progress session, marking it as abandoned and
   * recording the end time. Any active rabbithole events are also
   * marked as abandoned.
   *
   * This endpoint should be called when a user explicitly leaves
   * a session before completion.
   */
  router.post('/:id/abandon', async (c) => {
    try {
      const id = c.req.param('id');

      // Verify session exists
      const session = await sessionRepo.findById(id);
      if (!session) {
        return notFound(c, 'Session', id);
      }

      // Check if session is already finished
      if (session.status !== 'in_progress') {
        return badRequest(c, `Cannot abandon session: session is already ${session.status}`);
      }

      // Mark any active rabbitholes as abandoned
      await rabbitholeRepo.markActiveAsAbandoned(id);

      // Abandon the session
      await sessionRepo.abandon(id);

      return success(c, {
        sessionId: id,
        message: 'Session abandoned successfully',
        status: 'abandoned',
      });
    } catch (err) {
      console.error('Error abandoning session:', err);
      return internalError(c, 'Failed to abandon session');
    }
  });

  return router;
}

// ============================================================================
// Default Export
// ============================================================================

export default sessionsRoutes;
