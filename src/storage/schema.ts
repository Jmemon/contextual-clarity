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

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

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
