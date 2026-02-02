/**
 * Database Schema Definitions
 *
 * This file contains Drizzle ORM schema definitions for SQLite.
 * These define the structure of all database tables used by Contextual Clarity.
 *
 * Tables:
 * - recallSets: Collections of related recall points with discussion prompts
 * - recallPoints: Individual facts/concepts to be recalled with FSRS state
 * - sessions: Recall session records
 * - sessionMessages: Conversation messages within sessions
 *
 * Note: Full schema will be implemented in P1-T03 (Database Schema task).
 * This is a placeholder to allow drizzle.config.ts to work.
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Placeholder table to validate drizzle-kit setup
// Will be replaced with full schema in P1-T03
export const _placeholder = sqliteTable('_placeholder', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
