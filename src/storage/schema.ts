/**
 * Database Schema Definitions for Contextual Clarity
 *
 * This file contains Drizzle ORM schema definitions for SQLite.
 * These define the structure of all database tables used by the application.
 *
 * The schema supports a conversational spaced repetition system with:
 * - Recall Sets: Collections of related recall points with discussion prompts
 * - Recall Points: Individual facts/concepts tracked using FSRS algorithm
 * - Sessions: Recall session records for tracking user engagement
 * - Session Messages: Conversation history within sessions
 *
 * All timestamps are stored as milliseconds since epoch (integer) for
 * SQLite compatibility and precise timing requirements.
 */

import {
  sqliteTable,
  text,
  integer,
  real,
  index,
} from 'drizzle-orm/sqlite-core';

/**
 * Recall Sets Table
 *
 * A recall set is a collection of related recall points that share a common
 * topic or learning objective. Each set has its own discussion system prompt
 * that guides the AI's Socratic dialog style during recall sessions.
 *
 * Status values:
 * - 'active': Set is available for recall sessions
 * - 'paused': Temporarily excluded from scheduling
 * - 'archived': Permanently excluded but preserved for history
 */
export const recallSets = sqliteTable('recall_sets', {
  // Unique identifier for the recall set (UUID format recommended)
  id: text('id').primaryKey(),

  // Human-readable name for the recall set (e.g., "Spanish Vocabulary")
  name: text('name').notNull(),

  // Detailed description of what this recall set covers
  description: text('description').notNull(),

  // Current status controlling whether the set is used in scheduling
  status: text('status', { enum: ['active', 'paused', 'archived'] })
    .notNull()
    .default('active'),

  // System prompt used to guide AI behavior during recall discussions
  // This defines the Socratic dialog style for this particular topic
  discussionSystemPrompt: text('discussion_system_prompt').notNull(),

  // Timestamp when the recall set was created (milliseconds since epoch)
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),

  // Timestamp when the recall set was last modified (milliseconds since epoch)
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

/**
 * Recall Points Table
 *
 * A recall point represents a single fact, concept, or piece of knowledge
 * that the user wants to learn. Each point is tracked using the FSRS
 * (Free Spaced Repetition Scheduler) algorithm for optimal review scheduling.
 *
 * FSRS State values:
 * - 'new': Never reviewed, initial state
 * - 'learning': Currently in the learning phase
 * - 'review': Graduated to regular review intervals
 * - 'relearning': Failed a review, back in learning phase
 */
export const recallPoints = sqliteTable('recall_points', {
  // Unique identifier for the recall point (UUID format recommended)
  id: text('id').primaryKey(),

  // Foreign key reference to the parent recall set
  recallSetId: text('recall_set_id')
    .notNull()
    .references(() => recallSets.id),

  // The actual content/fact to be recalled (e.g., "The capital of France is Paris")
  content: text('content').notNull(),

  // Additional context to help with recall (e.g., "European geography")
  context: text('context').notNull(),

  // FSRS difficulty parameter (0.0-1.0 range, higher = harder to remember)
  fsrsDifficulty: real('fsrs_difficulty').notNull(),

  // FSRS stability parameter (days until 90% recall probability)
  fsrsStability: real('fsrs_stability').notNull(),

  // FSRS due date - when this recall point should next be reviewed
  fsrsDue: integer('fsrs_due', { mode: 'timestamp_ms' }).notNull(),

  // FSRS last review timestamp - when this point was last reviewed
  fsrsLastReview: integer('fsrs_last_review', { mode: 'timestamp_ms' }),

  // FSRS repetition count - number of times reviewed in current state
  fsrsReps: integer('fsrs_reps').notNull().default(0),

  // FSRS lapse count - number of times forgotten after initial learning
  fsrsLapses: integer('fsrs_lapses').notNull().default(0),

  // FSRS state - current learning state in the algorithm
  fsrsState: text('fsrs_state', {
    enum: ['new', 'learning', 'review', 'relearning'],
  })
    .notNull()
    .default('new'),

  // Historical record of recall attempts with timestamps and results
  // Stored as JSON array for efficient querying and reporting
  recallHistory: text('recall_history', { mode: 'json' })
    .$type<Array<{ timestamp: number; success: boolean; latencyMs: number }>>()
    .notNull()
    .default([]),

  // Timestamp when the recall point was created (milliseconds since epoch)
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),

  // Timestamp when the recall point was last modified (milliseconds since epoch)
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

/**
 * Sessions Table
 *
 * A session represents a single recall practice session where the user
 * reviews one or more recall points. Sessions track engagement and
 * provide analytics on learning patterns.
 *
 * Status values:
 * - 'in_progress': Session is currently active
 * - 'completed': Session finished normally with all points reviewed
 * - 'abandoned': Session was started but not completed
 */
export const sessions = sqliteTable('sessions', {
  // Unique identifier for the session (UUID format recommended)
  id: text('id').primaryKey(),

  // Foreign key reference to the recall set being practiced
  recallSetId: text('recall_set_id')
    .notNull()
    .references(() => recallSets.id),

  // Current status of the session
  status: text('status', { enum: ['in_progress', 'completed', 'abandoned'] })
    .notNull()
    .default('in_progress'),

  // Array of recall point IDs targeted for this session
  // Stored as JSON array for flexibility in session size
  targetRecallPointIds: text('target_recall_point_ids', { mode: 'json' })
    .$type<string[]>()
    .notNull(),

  // Timestamp when the session started (milliseconds since epoch)
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),

  // Timestamp when the session ended (null if still in progress)
  endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
});

/**
 * Session Messages Table
 *
 * Stores the conversation history within a recall session. This enables
 * context-aware AI responses and allows users to review past interactions.
 *
 * Role values:
 * - 'user': Message from the learner
 * - 'assistant': Message from the AI
 * - 'system': System-generated message (prompts, instructions)
 */
export const sessionMessages = sqliteTable('session_messages', {
  // Unique identifier for the message (UUID format recommended)
  id: text('id').primaryKey(),

  // Foreign key reference to the parent session
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id),

  // Role indicating who sent the message
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),

  // The actual message content
  content: text('content').notNull(),

  // Timestamp when the message was sent (milliseconds since epoch)
  timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull(),

  // Token count for the message (useful for API cost tracking and context management)
  tokenCount: integer('token_count'),
});

/**
 * Type exports for use throughout the application
 * These types are inferred from the schema for type-safe database operations
 */
export type RecallSet = typeof recallSets.$inferSelect;
export type NewRecallSet = typeof recallSets.$inferInsert;

export type RecallPoint = typeof recallPoints.$inferSelect;
export type NewRecallPoint = typeof recallPoints.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type SessionMessage = typeof sessionMessages.$inferSelect;
export type NewSessionMessage = typeof sessionMessages.$inferInsert;

/**
 * Session Metrics Table
 *
 * Stores comprehensive analytics for each recall session, including time metrics,
 * recall performance, conversation statistics, rabbithole summaries, and token/cost data.
 * Each session can have exactly one metrics record, calculated when the session ends.
 *
 * This table enables:
 * - Performance tracking over time
 * - Engagement analysis
 * - Cost monitoring for API usage
 * - Identification of learning patterns and improvement areas
 */
export const sessionMetrics = sqliteTable(
  'session_metrics',
  {
    // Unique identifier for the metrics record (UUID format recommended)
    id: text('id').primaryKey(),

    // Foreign key reference to the session (one-to-one relationship)
    sessionId: text('session_id')
      .notNull()
      .unique()
      .references(() => sessions.id),

    // === Time Metrics ===
    // Total duration of the session from start to end (milliseconds)
    durationMs: integer('duration_ms').notNull(),

    // Time the user was actively engaged (excludes long pauses, milliseconds)
    activeTimeMs: integer('active_time_ms').notNull(),

    // Average time user takes to respond to assistant messages (milliseconds)
    avgUserResponseTimeMs: integer('avg_user_response_time_ms').notNull(),

    // Average time assistant takes to generate responses (milliseconds)
    avgAssistantResponseTimeMs: integer(
      'avg_assistant_response_time_ms'
    ).notNull(),

    // === Recall Metrics ===
    // Number of recall points that were tested in this session
    recallPointsAttempted: integer('recall_points_attempted').notNull(),

    // Number of recall points successfully recalled
    recallPointsSuccessful: integer('recall_points_successful').notNull(),

    // Number of recall points failed to recall
    recallPointsFailed: integer('recall_points_failed').notNull(),

    // Overall recall success rate (0.0-1.0, successful/attempted)
    overallRecallRate: real('overall_recall_rate').notNull(),

    // Average confidence score across all recall attempts (0.0-1.0)
    avgConfidence: real('avg_confidence').notNull(),

    // === Conversation Metrics ===
    // Total number of messages exchanged in the session
    totalMessages: integer('total_messages').notNull(),

    // Number of messages from the user
    userMessages: integer('user_messages').notNull(),

    // Number of messages from the assistant
    assistantMessages: integer('assistant_messages').notNull(),

    // Average length of messages in characters
    avgMessageLength: real('avg_message_length').notNull(),

    // === Rabbithole Summary ===
    // Number of rabbithole tangents that occurred during the session
    rabbitholeCount: integer('rabbithole_count').notNull().default(0),

    // Total time spent in rabbithole tangents (milliseconds)
    totalRabbitholeTimeMs: integer('total_rabbithole_time_ms')
      .notNull()
      .default(0),

    // Average depth of rabbithole tangents (1-3 scale)
    avgRabbitholeDepth: real('avg_rabbithole_depth').notNull().default(0),

    // === Token/Cost Metrics ===
    // Number of tokens in input prompts (for API cost tracking)
    inputTokens: integer('input_tokens').notNull(),

    // Number of tokens in generated responses (for API cost tracking)
    outputTokens: integer('output_tokens').notNull(),

    // Total tokens used in the session (input + output)
    totalTokens: integer('total_tokens').notNull(),

    // Estimated cost in USD based on token usage and model pricing
    estimatedCostUsd: real('estimated_cost_usd').notNull(),

    // === Engagement ===
    // Computed engagement score (0-100) based on various factors
    engagementScore: integer('engagement_score').notNull(),

    // Timestamp when these metrics were calculated (milliseconds since epoch)
    calculatedAt: integer('calculated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('session_metrics_session_id_idx').on(table.sessionId)]
);

/**
 * Recall Outcomes Table
 *
 * Records the outcome of each individual recall attempt during a session.
 * Links a specific recall point to its performance in a particular session,
 * capturing detailed data about how the user performed on that specific item.
 *
 * This granular data enables:
 * - Detailed analysis of which recall points need more practice
 * - Tracking of confidence calibration over time
 * - Understanding of time spent on different difficulty levels
 */
export const recallOutcomes = sqliteTable(
  'recall_outcomes',
  {
    // Unique identifier for the outcome record (UUID format recommended)
    id: text('id').primaryKey(),

    // Foreign key reference to the session where this outcome occurred
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),

    // Foreign key reference to the recall point being tested
    recallPointId: text('recall_point_id')
      .notNull()
      .references(() => recallPoints.id),

    // Whether the user successfully recalled the information
    success: integer('success', { mode: 'boolean' }).notNull(),

    // User's confidence level in their recall (0.0-1.0)
    confidence: real('confidence').notNull(),

    // User's self-rating of the recall difficulty (FSRS-style ratings)
    // 'forgot': Complete failure, needs relearning
    // 'hard': Recalled with significant difficulty
    // 'good': Recalled correctly with some effort
    // 'easy': Recalled effortlessly
    rating: text('rating', { enum: ['forgot', 'hard', 'good', 'easy'] }),

    // AI's reasoning for success/failure assessment (useful for review)
    reasoning: text('reasoning'),

    // Index of the first message related to this recall attempt
    messageIndexStart: integer('message_index_start').notNull(),

    // Index of the last message related to this recall attempt
    messageIndexEnd: integer('message_index_end').notNull(),

    // Time spent on this recall attempt (milliseconds)
    timeSpentMs: integer('time_spent_ms').notNull(),

    // Timestamp when this outcome was recorded (milliseconds since epoch)
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('recall_outcomes_session_id_idx').on(table.sessionId),
    index('recall_outcomes_recall_point_id_idx').on(table.recallPointId),
  ]
);

/**
 * Rabbithole Events Table
 *
 * Tracks when conversations veer off into tangential topics ("rabbitholes").
 * Rabbitholes can be valuable learning moments or distractions; tracking them
 * helps understand engagement patterns and optimize session structure.
 *
 * Depth levels:
 * - 1: Shallow tangent, easily returns to main topic
 * - 2: Medium depth, requires some effort to return
 * - 3: Deep tangent, significant departure from session goals
 *
 * Status values:
 * - 'active': Currently in a rabbithole tangent
 * - 'returned': Successfully returned to main session flow
 * - 'abandoned': Session ended while still in rabbithole
 */
export const rabbitholeEvents = sqliteTable(
  'rabbithole_events',
  {
    // Unique identifier for the rabbithole event (UUID format recommended)
    id: text('id').primaryKey(),

    // Foreign key reference to the session where this event occurred
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),

    // The tangential topic that triggered the rabbithole
    topic: text('topic').notNull(),

    // Index of the message that triggered entry into the rabbithole
    triggerMessageIndex: integer('trigger_message_index').notNull(),

    // Index of the message where conversation returned to main topic (null if still active or abandoned)
    returnMessageIndex: integer('return_message_index'),

    // Depth of the rabbithole (1=shallow, 2=medium, 3=deep)
    depth: integer('depth').notNull(),

    // Array of recall point IDs that relate to this rabbithole topic
    // Stored as JSON array since a rabbithole may touch multiple recall points
    relatedRecallPointIds: text('related_recall_point_ids', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),

    // Whether the user explicitly initiated the tangent (vs. AI-led exploration)
    userInitiated: integer('user_initiated', { mode: 'boolean' }).notNull(),

    // Current status of the rabbithole event
    status: text('status', { enum: ['active', 'returned', 'abandoned'] })
      .notNull()
      .default('active'),

    // Timestamp when this rabbithole event was detected (milliseconds since epoch)
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('rabbithole_events_session_id_idx').on(table.sessionId)]
);

/**
 * Message Timings Table
 *
 * Records detailed timing information for each message in a session.
 * This enables precise analysis of conversation flow, response latencies,
 * and user engagement patterns at the message level.
 *
 * Use cases:
 * - Measuring assistant response latency for performance optimization
 * - Identifying user hesitation patterns that might indicate confusion
 * - Token counting for accurate cost attribution
 * - Time-series analysis of session dynamics
 */
export const messageTimings = sqliteTable(
  'message_timings',
  {
    // Unique identifier for the timing record (UUID format recommended)
    id: text('id').primaryKey(),

    // Foreign key reference to the session containing this message
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),

    // Foreign key reference to the specific message being timed
    messageId: text('message_id')
      .notNull()
      .references(() => sessionMessages.id),

    // Role of the message sender for quick filtering
    role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),

    // Exact timestamp when the message was created (milliseconds since epoch)
    timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull(),

    // Time taken to generate/send this message after the previous message (milliseconds)
    // Null for the first message in a session or when timing is not available
    responseLatencyMs: integer('response_latency_ms'),

    // Number of tokens in this message (for API cost tracking and context limits)
    tokenCount: integer('token_count').notNull(),
  },
  (table) => [index('message_timings_session_id_idx').on(table.sessionId)]
);

// Type exports for session metrics
export type SessionMetrics = typeof sessionMetrics.$inferSelect;
export type NewSessionMetrics = typeof sessionMetrics.$inferInsert;

// Type exports for recall outcomes
export type RecallOutcome = typeof recallOutcomes.$inferSelect;
export type NewRecallOutcome = typeof recallOutcomes.$inferInsert;

// Type exports for rabbithole events
export type RabbitholeEvent = typeof rabbitholeEvents.$inferSelect;
export type NewRabbitholeEvent = typeof rabbitholeEvents.$inferInsert;

// Type exports for message timings
export type MessageTiming = typeof messageTimings.$inferSelect;
export type NewMessageTiming = typeof messageTimings.$inferInsert;
