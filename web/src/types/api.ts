/**
 * API Type Definitions for Contextual Clarity Web Frontend
 *
 * This module defines TypeScript interfaces that match the backend API response
 * structures. These types ensure type safety when working with API data throughout
 * the frontend application.
 *
 * Types are organized by domain:
 * - API Response wrappers
 * - Dashboard types (overview, sessions, reviews)
 * - Recall Sets and Points
 * - Sessions and transcripts
 *
 * All date fields from the API are represented as strings (ISO 8601 format)
 * since JSON.parse() does not automatically convert date strings to Date objects.
 * Components should use `new Date(dateString)` when Date objects are needed.
 */

// ============================================================================
// API Response Wrapper Types
// ============================================================================

/**
 * Standard success response wrapper from the API.
 * All successful API responses conform to this structure.
 *
 * @typeParam T - The type of data returned in the response
 */
export interface ApiResponse<T> {
  /** Indicates the request was successful */
  success: true;
  /** The response payload */
  data: T;
}

/**
 * Standard error response wrapper from the API.
 * All failed API requests return this structure.
 */
export interface ApiErrorResponse {
  /** Indicates the request failed */
  success: false;
  /** Error details */
  error: {
    /** Machine-readable error code (e.g., 'NOT_FOUND', 'VALIDATION_ERROR') */
    code: string;
    /** Human-readable error message */
    message: string;
    /** Additional error context (optional) */
    details?: unknown;
  };
}

/**
 * Union type for any API response, allowing discrimination via the success field.
 *
 * @typeParam T - The type of data for successful responses
 */
export type ApiResult<T> = ApiResponse<T> | ApiErrorResponse;

// ============================================================================
// Dashboard Types
// ============================================================================

/**
 * Summary of a single session for list views.
 * Contains key metrics for displaying session history.
 */
export interface SessionSummary {
  /** Unique session identifier */
  id: string;
  /** ID of the recall set studied */
  recallSetId: string;
  /** Human-readable name of the recall set */
  recallSetName: string;
  /** When the session started (ISO 8601 string) */
  startedAt: string;
  /** Total session duration in milliseconds */
  durationMs: number;
  /** Recall success rate (0.0 to 1.0) */
  recallRate: number;
  /** Engagement score (0-100) */
  engagementScore: number;
  /** Session lifecycle status */
  status: 'completed' | 'abandoned' | 'in_progress';
}

/**
 * Upcoming review information for a recall point.
 * Used to display items due for review with priority indicators.
 */
export interface UpcomingReview {
  /** Recall point identifier */
  recallPointId: string;
  /** Content of the recall point (for display) */
  recallPointContent: string;
  /** ID of the recall set containing this point */
  recallSetId: string;
  /** Human-readable name of the recall set */
  recallSetName: string;
  /** When this point is due for review (ISO 8601 string) */
  dueDate: string;
  /** Days until due (negative = overdue, 0 = today, positive = future) */
  daysUntilDue: number;
  /** Priority category for visual indicators */
  priority: 'overdue' | 'due-today' | 'upcoming';
}

/**
 * Complete dashboard overview data.
 * Aggregates key metrics across all recall sets.
 */
export interface DashboardOverview {
  /** Total number of recall sets */
  totalRecallSets: number;
  /** Number of active recall sets */
  activeRecallSets: number;
  /** Total sessions completed */
  totalSessions: number;
  /** Total study time in milliseconds */
  totalStudyTimeMs: number;
  /** Overall recall success rate (0.0 to 1.0) */
  overallRecallRate: number;
  /** Sessions completed today */
  todaysSessions: number;
  /** Study time today in milliseconds */
  todaysStudyTimeMs: number;
  /** Number of recall points due for review today */
  pointsDueToday: number;
  /** Recent session summaries */
  recentSessions: SessionSummary[];
  /** Upcoming reviews prioritized by urgency */
  upcomingReviews: UpcomingReview[];
  /** Current study streak in consecutive days */
  currentStreak: number;
  /** Longest study streak ever achieved */
  longestStreak: number;
}

/**
 * Response structure for the recent sessions endpoint.
 */
export interface RecentSessionsResponse {
  /** Array of recent sessions */
  sessions: SessionSummary[];
  /** Total number of sessions in the system */
  total: number;
  /** The limit that was applied */
  limit: number;
}

/**
 * Response structure for the upcoming reviews endpoint.
 */
export interface UpcomingReviewsResponse {
  /** Array of upcoming reviews */
  reviews: UpcomingReview[];
  /** Summary counts by priority */
  summary: {
    /** Total reviews in the response */
    total: number;
    /** Count of overdue items */
    overdue: number;
    /** Count of items due today */
    dueToday: number;
    /** Count of upcoming items */
    upcoming: number;
  };
  /** Number of days ahead that was requested */
  days: number;
}

// ============================================================================
// Recall Set Types
// ============================================================================

/**
 * Lifecycle status of a recall set.
 */
export type RecallSetStatus = 'active' | 'paused' | 'archived';

/**
 * Summary statistics for a recall set.
 */
export interface RecallSetSummary {
  /** Total number of recall points in the set */
  totalPoints: number;
  /** Number of points due for review */
  duePoints: number;
  /** Number of new (never reviewed) points */
  newPoints: number;
}

/**
 * Recall set with summary statistics for list views.
 */
export interface RecallSetWithSummary {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Detailed description */
  description: string;
  /** Current lifecycle status */
  status: RecallSetStatus;
  /** System prompt for AI discussions */
  discussionSystemPrompt: string;
  /** When the set was created (ISO 8601 string) */
  createdAt: string;
  /** When the set was last updated (ISO 8601 string) */
  updatedAt: string;
  /** Summary statistics */
  summary: RecallSetSummary;
}

/**
 * Input data for creating a new recall set.
 */
export interface CreateRecallSetInput {
  /** Name of the recall set (1-100 characters) */
  name: string;
  /** Description of what this set covers */
  description: string;
  /** System prompt for AI discussions */
  discussionSystemPrompt: string;
}

/**
 * Input data for updating an existing recall set.
 * All fields are optional for partial updates.
 */
export interface UpdateRecallSetInput {
  /** Updated name */
  name?: string;
  /** Updated description */
  description?: string;
  /** Updated system prompt */
  discussionSystemPrompt?: string;
  /** Updated status */
  status?: RecallSetStatus;
}

// ============================================================================
// Recall Point Types
// ============================================================================

/**
 * FSRS learning state representing where a point is in the learning process.
 */
export type FSRSLearningState = 'new' | 'learning' | 'review' | 'relearning';

/**
 * FSRS (Free Spaced Repetition Scheduler) state for a recall point.
 */
export interface FSRSState {
  /** Difficulty rating (0-10 scale, higher = harder) */
  difficulty: number;
  /** Memory stability in days */
  stability: number;
  /** When this point is due for review (ISO 8601 string) */
  due: string;
  /** When this point was last reviewed (ISO 8601 string or null) */
  lastReview: string | null;
  /** Total successful repetitions */
  reps: number;
  /** Number of lapses (failed recalls after previously knowing) */
  lapses: number;
  /** Current learning state */
  state: FSRSLearningState;
}

/**
 * A single recall attempt record.
 */
export interface RecallAttempt {
  /** When the attempt occurred (ISO 8601 string) */
  timestamp: string;
  /** Whether the recall was successful */
  success: boolean;
  /** Response time in milliseconds */
  latencyMs: number;
}

/**
 * Full recall point data including FSRS state and history.
 */
export interface RecallPoint {
  /** Unique identifier */
  id: string;
  /** ID of the parent recall set */
  recallSetId: string;
  /** The core knowledge to be recalled */
  content: string;
  /** Supporting context for understanding */
  context: string;
  /** Current FSRS scheduling state */
  fsrsState: FSRSState;
  /** History of recall attempts */
  recallHistory: RecallAttempt[];
  /** When the point was created (ISO 8601 string) */
  createdAt: string;
  /** When the point was last updated (ISO 8601 string) */
  updatedAt: string;
}

/**
 * Input data for creating a new recall point.
 */
export interface CreateRecallPointInput {
  /** The core knowledge to be recalled (10-2000 characters) */
  content: string;
  /** Supporting context (10-2000 characters) */
  context: string;
}

/**
 * Input data for updating an existing recall point.
 * All fields are optional for partial updates.
 */
export interface UpdateRecallPointInput {
  /** Updated content */
  content?: string;
  /** Updated context */
  context?: string;
}

// ============================================================================
// Session Types
// ============================================================================

/**
 * Session with optional metrics for list views.
 */
export interface SessionWithMetrics {
  /** Session identifier */
  id: string;
  /** Associated recall set ID */
  recallSetId: string;
  /** Session lifecycle status */
  status: 'completed' | 'abandoned' | 'in_progress';
  /** IDs of recall points targeted in this session */
  targetRecallPointIds: string[];
  /** When the session started (ISO 8601 string) */
  startedAt: string;
  /** When the session ended (ISO 8601 string or null) */
  endedAt: string | null;
  /** Optional metrics summary */
  metrics?: {
    durationMs: number;
    recallRate: number;
    engagementScore: number;
    recallPointsAttempted: number;
    recallPointsSuccessful: number;
  } | null;
}

/**
 * Pagination info for session list responses (limit/offset style).
 */
export interface SessionPagination {
  /** Maximum items per page */
  limit: number;
  /** Number of items skipped */
  offset: number;
  /** Total number of matching sessions */
  total: number;
  /** Whether there are more results */
  hasMore: boolean;
}

/**
 * Response structure for session list endpoint.
 */
export interface SessionListResponse {
  /** Array of sessions */
  sessions: SessionWithMetrics[];
  /** Pagination metadata */
  pagination: SessionPagination;
}

/**
 * Filters for querying sessions.
 */
export interface SessionFilters {
  /** Filter by recall set ID */
  recallSetId?: string;
  /** Filter sessions started after this date (ISO 8601) */
  startDate?: string;
  /** Filter sessions started before this date (ISO 8601) */
  endDate?: string;
  /** Maximum items to return */
  limit?: number;
  /** Number of items to skip */
  offset?: number;
  /** Filter by status */
  status?: 'completed' | 'abandoned' | 'in_progress';
}

/**
 * Detailed session information including metrics.
 */
export interface SessionDetail {
  /** Session data */
  session: {
    id: string;
    recallSetId: string;
    recallSetName: string;
    status: string;
    targetRecallPointIds: string[];
    startedAt: string;
    endedAt: string | null;
  };
  /** Detailed metrics if available */
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
 * Evaluation marker for a transcript message.
 */
export interface EvaluationMarker {
  /** Recall point being evaluated */
  recallPointId: string;
  /** Whether this message starts the evaluation */
  isStart: boolean;
  /** Whether this message ends the evaluation */
  isEnd: boolean;
  /** Success result (only on end message) */
  success?: boolean;
  /** Confidence score (only on end message) */
  confidence?: number;
}

/**
 * Rabbithole (tangent) marker for a transcript message.
 */
export interface RabbitholeMarker {
  /** Event identifier */
  eventId: string;
  /** Topic of the tangent */
  topic: string;
  /** Whether this message triggered the tangent */
  isTrigger: boolean;
  /** Whether this message returned from the tangent */
  isReturn: boolean;
  /** Depth of the tangent */
  depth: number;
}

/**
 * A single message in a session transcript.
 */
export interface TranscriptMessage {
  /** Message identifier */
  id: string;
  /** Message role (user, assistant, system) */
  role: 'user' | 'assistant' | 'system';
  /** Message content */
  content: string;
  /** When the message was sent (ISO 8601 string) */
  timestamp: string;
  /** Token count if available */
  tokenCount: number | null;
  /** Index in the conversation */
  messageIndex: number;
  /** Evaluation marker if part of a recall evaluation */
  evaluationMarker?: EvaluationMarker | null;
  /** Rabbithole marker if part of a tangent */
  rabbitholeMarker?: RabbitholeMarker | null;
}

/**
 * Full transcript response for a session.
 */
export interface TranscriptResponse {
  /** Session identifier */
  sessionId: string;
  /** Array of transcript messages with markers */
  messages: TranscriptMessage[];
  /** Total message count */
  totalMessages: number;
}

/**
 * Response from starting a new session.
 */
export interface StartSessionResponse {
  /** New session identifier */
  sessionId: string;
  /** Success message */
  message: string;
  /** Number of recall points to study (only for new sessions) */
  targetRecallPointCount?: number;
  /** Whether this is resuming an existing session */
  isResume: boolean;
}

/**
 * Response from abandoning a session.
 */
export interface AbandonSessionResponse {
  /** Session identifier */
  sessionId: string;
  /** Success message */
  message: string;
  /** New status */
  status: 'abandoned';
}

/**
 * Response from deleting a recall point.
 */
export interface DeleteRecallPointResponse {
  /** Success message */
  message: string;
  /** Deleted point ID */
  id: string;
}
