# Phase 2: Refine Based on Session Data - Implementation Plan

## Phase Goal

Based on how discussions go once the set is in a decent state:
- What data to track?
- How to judge success/failure for recall points?
- How would I want to see these sets / prior sessions displayed in an app?

By the end of this phase, you should be able to:
1. See comprehensive metrics for each session (duration, recall rates, engagement)
2. Track and visualize rabbit hole explorations during conversations
3. Get improved recall evaluation with confidence scores and detailed reasoning
4. Export session data for analysis
5. Review past session transcripts with `bun run cli replay <session-id>`
6. View recall statistics per set with `bun run cli stats <set-name>`
7. Have data structures ready for Phase 3 web dashboard

---

## Task Overview

| ID | Title | Dependencies | Parallel Group |
|----|-------|--------------|----------------|
| P2-T01 | Session Metrics Model | P1-T02 | A |
| P2-T02 | Rabbithole Types & Detection Prompt | P1-T02, P1-T08 | A |
| P2-T03 | Database Schema Extensions | P1-T03, P2-T01, P2-T02 | B |
| P2-T04 | Database Migrations for Metrics | P2-T03 | C |
| P2-T05 | Session Metrics Repository | P2-T04, P1-T05 | D |
| P2-T06 | Rabbithole Detector Service | P2-T02, P1-T07 | D |
| P2-T07 | Enhanced Recall Evaluator | P1-T09 | D |
| P2-T08 | Session Metrics Collector | P2-T05, P2-T06, P2-T07 | E |
| P2-T09 | Session Engine Integration | P2-T08, P1-T10 | F |
| P2-T10 | Session Analytics Calculator | P2-T05 | E |
| P2-T11 | Data Export Service | P2-T05, P2-T10 | F |
| P2-T12 | CLI Stats Command | P2-T10, P1-T11 | G |
| P2-T13 | CLI Replay Command | P2-T05, P1-T11 | G |
| P2-T14 | CLI Export Command | P2-T11, P1-T11 | G |
| P2-T15 | Dashboard Data Aggregator | P2-T10 | G |
| P2-T16 | Integration Tests | P2-T09, P2-T12, P2-T13, P2-T14 | H |

---

## Detailed Task Specifications

### P2-T01: Session Metrics Model

**Description:**
Define comprehensive TypeScript types for tracking session metrics. This extends the basic Session model from Phase 1 with detailed tracking of time, recall outcomes, engagement patterns, and conversation quality indicators.

**Dependencies:** P1-T02 (Core Domain Types)

**Parallel Group:** A

**Files to create:**
- `src/core/models/session-metrics.ts` - SessionMetrics and related types

**Files to modify:**
- `src/core/models/index.ts` - Add barrel export for session-metrics

**Type definitions:**

```typescript
// session-metrics.ts
import type { MessageRole } from './session';
import type { RecallRating } from '../fsrs';

/**
 * Granular recall outcome for a single recall point within a session.
 * Extends the basic success/failure with confidence and detailed evaluation.
 */
export interface RecallOutcome {
  recallPointId: string;
  success: boolean;
  confidence: number;           // 0.0 - 1.0 from LLM evaluation
  rating: RecallRating;         // FSRS rating applied
  reasoning: string;            // LLM's reasoning for the evaluation
  messageIndexStart: number;    // Where discussion of this point began
  messageIndexEnd: number;      // Where evaluation occurred
  timeSpentMs: number;          // Time spent on this specific point
}

/**
 * Represents a conversational tangent or exploration beyond the core recall points.
 * Tracks when users naturally explore related concepts.
 */
export interface RabbitholeEvent {
  id: string;
  topic: string;                // Detected topic of the rabbithole
  triggerMessageIndex: number;  // Message that initiated the tangent
  returnMessageIndex: number | null;  // Explicitly nullable - Message where conversation returned (null if ongoing/abandoned)
  depth: number;                // 1 = shallow mention, 2 = moderate exploration, 3 = deep dive
  relatedRecallPointIds: string[]; // Points this tangent relates to
  userInitiated: boolean;       // True if user started it, false if tutor
  // Add status for clarity
  status: 'active' | 'returned' | 'abandoned';
}

/**
 * Token usage tracking for cost analysis and optimization.
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;     // Based on Claude pricing
}

/**
 * Message timing for analyzing conversation flow and engagement.
 */
export interface MessageTiming {
  messageId: string;
  role: MessageRole;
  timestamp: Date;
  responseLatencyMs: number | null;  // Time to generate (assistant) or respond (user)
  tokenCount: number;
}

/**
 * Comprehensive session metrics capturing all trackable data.
 * Stored separately from Session for query efficiency.
 */
export interface SessionMetrics {
  id: string;
  sessionId: string;

  // Time metrics
  durationMs: number;                    // Total session duration
  activeTimeMs: number;                  // Time with active conversation (excludes pauses)
  avgUserResponseTimeMs: number;         // Average time user takes to respond
  avgAssistantResponseTimeMs: number;    // Average LLM response generation time

  // Recall metrics
  recallPointsAttempted: number;
  recallPointsSuccessful: number;
  recallPointsFailed: number;
  recallOutcomes: RecallOutcome[];       // Detailed per-point outcomes
  overallRecallRate: number;             // 0.0 - 1.0
  avgConfidence: number;                 // Average confidence across evaluations

  // Conversation metrics
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  avgMessageLength: number;              // Average characters per message
  messageTimings: MessageTiming[];

  // Rabbithole metrics
  rabbitholes: RabbitholeEvent[];
  totalRabbitholeTime: number;           // Time spent in rabbitholes
  rabbitholeDepthAvg: number;            // Average depth of exploration

  // Token/cost metrics
  tokenUsage: TokenUsage;

  // Engagement indicators (computed)
  engagementScore: number;               // 0-100 composite score

  // Timestamps
  calculatedAt: Date;
}

/**
 * Engagement Score Calculation (0-100)
 *
 * Components:
 * - Recall Success (40%): overallRecallRate * 40
 * - Response Quality (25%): Based on avg message length vs target (100-300 chars ideal)
 * - Exploration (20%): Rabbithole depth and time (encourages curiosity)
 * - Consistency (15%): Based on response time variance (steady engagement)
 */
export function calculateEngagementScore(metrics: Partial<SessionMetrics>): number {
  // Recall component (0-40)
  const recallScore = (metrics.overallRecallRate ?? 0) * 40;

  // Response quality component (0-25)
  const avgLength = metrics.avgMessageLength ?? 0;
  const lengthScore = avgLength >= 100 && avgLength <= 300
    ? 25
    : avgLength < 100
      ? (avgLength / 100) * 25
      : Math.max(0, 25 - ((avgLength - 300) / 200) * 25);

  // Exploration component (0-20)
  const rabbitholeCount = metrics.rabbitholes?.length ?? 0;
  const avgDepth = metrics.rabbitholeDepthAvg ?? 0;
  const explorationScore = Math.min(20, (rabbitholeCount * 5) + (avgDepth * 3));

  // Consistency component (0-15) - lower variance = higher score
  const responseTimeVariance = calculateResponseTimeVariance(metrics.messageTimings ?? []);
  const consistencyScore = Math.max(0, 15 - (responseTimeVariance / 10000)); // Penalize high variance

  return Math.round(recallScore + lengthScore + explorationScore + consistencyScore);
}

/**
 * Lightweight summary for list views and quick stats.
 */
export interface SessionMetricsSummary {
  sessionId: string;
  recallSetId: string;
  recallSetName: string;
  startedAt: Date;
  durationMs: number;
  recallRate: number;
  engagementScore: number;
  totalMessages: number;
  rabbitholeCount: number;
}
```

**Token Cost Constants:**

```typescript
// src/core/analytics/token-costs.ts

/**
 * Claude API pricing (as of 2024)
 * These should be updated when Anthropic changes pricing
 * Values are in USD per 1M tokens
 */
export const TOKEN_COSTS = {
  'claude-sonnet-4-5-20250929': {
    input: 3.00,   // $3 per 1M input tokens
    output: 15.00, // $15 per 1M output tokens
  },
  'claude-3-haiku-20240307': {
    input: 0.25,
    output: 1.25,
  },
  // Default fallback
  default: {
    input: 3.00,
    output: 15.00,
  },
} as const;

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = TOKEN_COSTS[model as keyof typeof TOKEN_COSTS] || TOKEN_COSTS.default;
  return (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;
}
```

**Success criteria:**
- All types compile without errors
- Types cover all metrics mentioned in proto-roadmap
- Types can be imported from `src/core/models`
- Types support both detailed storage and lightweight summaries

**Test approach:**
Create test file that imports and uses all types, run `bun tsc --noEmit`.

---

### P2-T02: Rabbithole Types & Detection Prompt

**Description:**
Define types for rabbithole tracking and create the LLM prompt for detecting when conversations diverge from recall points. The detector should identify topic, depth, and relevance of tangents.

**Dependencies:** P1-T02, P1-T08 (Core Domain Types, System Prompts)

**Parallel Group:** A

**Files to create:**
- `src/llm/prompts/rabbithole-detector.ts` - Prompt for detecting conversational tangents

**Files to modify:**
- `src/llm/prompts/index.ts` - Add barrel export

**Implementation:**

```typescript
// rabbithole-detector.ts

import type { SessionMessage, RecallPoint } from '../../core/models';

export interface RabbitholeDetectionResult {
  isRabbithole: boolean;
  topic: string | null;
  depth: 1 | 2 | 3;              // 1=shallow, 2=moderate, 3=deep
  relatedToCurrentPoint: boolean;
  relatedRecallPointIds: string[];
  confidence: number;
  reasoning: string;
}

export interface RabbitholeDetectorParams {
  recentMessages: SessionMessage[];       // Last N messages to analyze
  currentRecallPoint: RecallPoint;
  allRecallPoints: RecallPoint[];         // For detecting relation to other points
  existingRabbitholes: string[];          // Topics already identified
}

/**
 * Builds prompt for detecting if conversation has entered a rabbithole.
 * Analyzes recent messages against the current recall point target.
 */
export function buildRabbitholeDetectorPrompt(params: RabbitholeDetectorParams): string {
  const { recentMessages, currentRecallPoint, allRecallPoints, existingRabbitholes } = params;

  const messagesText = recentMessages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  const otherPointsText = allRecallPoints
    .filter(p => p.id !== currentRecallPoint.id)
    .map((p, i) => `${i + 1}. [${p.id}] ${p.content}`)
    .join('\n');

  return `You are analyzing a conversation to detect "rabbitholes" - tangential explorations that diverge from the main topic.

## Current Target Recall Point
"${currentRecallPoint.content}"

Context: ${currentRecallPoint.context}

## Other Recall Points in This Set
${otherPointsText || '(none)'}

## Already Identified Rabbitholes
${existingRabbitholes.length > 0 ? existingRabbitholes.join(', ') : '(none yet)'}

## Recent Conversation
${messagesText}

## Your Task
Analyze whether the most recent exchange represents a "rabbithole" - a tangential exploration away from the current recall point.

A rabbithole is:
- A topic related but NOT directly about the current recall point
- An exploration the user initiates or the tutor follows
- NOT simply a clarifying question about the current point
- NOT a natural part of explaining the current concept

Depth levels:
- 1 (shallow): Brief mention, 1-2 exchanges, easy to return
- 2 (moderate): Extended discussion, 3-5 exchanges, requires explicit return
- 3 (deep): Significant exploration, 5+ exchanges, major topic shift

## Response Format
Respond with ONLY a JSON object:
{
  "isRabbithole": true/false,
  "topic": "brief topic description" or null,
  "depth": 1 | 2 | 3,
  "relatedToCurrentPoint": true/false,
  "relatedRecallPointIds": ["id1", "id2"] or [],
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation"
}`;
}

/**
 * Builds prompt for detecting when a rabbithole has concluded
 * and conversation has returned to the main topic.
 */
export function buildRabbitholeReturnPrompt(
  rabbitholeTopic: string,
  currentRecallPoint: RecallPoint,
  recentMessages: SessionMessage[]
): string {
  const messagesText = recentMessages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  return `You are detecting whether a conversational tangent has concluded.

## Active Rabbithole Topic
"${rabbitholeTopic}"

## Target Recall Point (main topic)
"${currentRecallPoint.content}"

## Recent Conversation
${messagesText}

## Your Task
Determine if the conversation has returned from the rabbithole to the main recall point topic.

Signs of return:
- Explicit transition phrases ("Getting back to...", "Anyway...")
- Discussion directly addressing the recall point again
- Tutor steering conversation back to main topic

## Response Format
Respond with ONLY a JSON object:
{
  "hasReturned": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation"
}`;
}
```

**Success criteria:**
- Prompts produce valid JSON responses when tested
- Detection correctly identifies tangential discussions
- Depth classification matches intuitive assessment
- Related recall points are correctly identified

**Test approach:**
Manual testing with sample conversations showing clear rabbitholes vs. on-topic discussion.

---

### P2-T03: Database Schema Extensions

**Description:**
Extend the Drizzle schema to store session metrics, rabbithole events, and recall outcomes. Design for efficient queries on both individual sessions and aggregate statistics.

**Dependencies:** P1-T03, P2-T01, P2-T02

**Parallel Group:** B

**Files to modify:**
- `src/storage/schema.ts` - Add new tables for metrics

**Schema additions:**

```typescript
// Add to schema.ts

/**
 * Detailed metrics for each session.
 * Stored as a separate table for query efficiency - sessions table stays lightweight.
 */
export const sessionMetrics = sqliteTable('session_metrics', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id).unique(),

  // Time metrics (stored in milliseconds)
  durationMs: integer('duration_ms').notNull(),
  activeTimeMs: integer('active_time_ms').notNull(),
  avgUserResponseTimeMs: integer('avg_user_response_time_ms').notNull(),
  avgAssistantResponseTimeMs: integer('avg_assistant_response_time_ms').notNull(),

  // Recall metrics
  recallPointsAttempted: integer('recall_points_attempted').notNull(),
  recallPointsSuccessful: integer('recall_points_successful').notNull(),
  recallPointsFailed: integer('recall_points_failed').notNull(),
  overallRecallRate: real('overall_recall_rate').notNull(),
  avgConfidence: real('avg_confidence').notNull(),

  // Conversation metrics
  totalMessages: integer('total_messages').notNull(),
  userMessages: integer('user_messages').notNull(),
  assistantMessages: integer('assistant_messages').notNull(),
  avgMessageLength: real('avg_message_length').notNull(),

  // Rabbithole summary (detailed events in separate table)
  rabbitholeCount: integer('rabbithole_count').notNull().default(0),
  totalRabbitholeTimeMs: integer('total_rabbithole_time_ms').notNull().default(0),
  avgRabbitholeDepth: real('avg_rabbithole_depth').notNull().default(0),

  // Token/cost metrics
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  totalTokens: integer('total_tokens').notNull(),
  estimatedCostUsd: real('estimated_cost_usd').notNull(),

  // Computed engagement score (0-100)
  engagementScore: integer('engagement_score').notNull(),

  calculatedAt: integer('calculated_at', { mode: 'timestamp_ms' }).notNull(),
});

/**
 * Individual recall outcomes within a session.
 * One row per recall point attempted.
 */
export const recallOutcomes = sqliteTable('recall_outcomes', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  recallPointId: text('recall_point_id').notNull().references(() => recallPoints.id),

  success: integer('success', { mode: 'boolean' }).notNull(),
  confidence: real('confidence').notNull(),
  rating: text('rating', { enum: ['forgot', 'hard', 'good', 'easy'] }).notNull(),
  reasoning: text('reasoning').notNull(),

  messageIndexStart: integer('message_index_start').notNull(),
  messageIndexEnd: integer('message_index_end').notNull(),
  timeSpentMs: integer('time_spent_ms').notNull(),

  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

/**
 * Rabbithole events during sessions.
 * Tracks each tangential exploration.
 */
export const rabbitholeEvents = sqliteTable('rabbithole_events', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),

  topic: text('topic').notNull(),
  triggerMessageIndex: integer('trigger_message_index').notNull(),
  returnMessageIndex: integer('return_message_index'),  // null if ongoing/never returned
  depth: integer('depth').notNull(),  // 1, 2, or 3
  relatedRecallPointIds: text('related_recall_point_ids', { mode: 'json' }).$type<string[]>().notNull().default([]),
  userInitiated: integer('user_initiated', { mode: 'boolean' }).notNull(),

  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

/**
 * Message timing data for detailed analysis.
 * Separate from session_messages to keep that table clean.
 */
export const messageTimings = sqliteTable('message_timings', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  messageId: text('message_id').notNull().references(() => sessionMessages.id),

  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull(),
  responseLatencyMs: integer('response_latency_ms'),  // null for first message
  tokenCount: integer('token_count').notNull(),
});

// After table definitions, add indexes
import { index } from 'drizzle-orm/sqlite-core';

// Add to session_metrics table definition or as separate index
export const sessionMetricsSessionIdIdx = index('session_metrics_session_id_idx')
  .on(sessionMetrics.sessionId);

// Add to recall_outcomes
export const recallOutcomesSessionIdIdx = index('recall_outcomes_session_id_idx')
  .on(recallOutcomes.sessionId);
export const recallOutcomesPointIdIdx = index('recall_outcomes_point_id_idx')
  .on(recallOutcomes.recallPointId);

// Add to rabbithole_events
export const rabbitholeEventsSessionIdIdx = index('rabbithole_events_session_id_idx')
  .on(rabbitholeEvents.sessionId);

// Add to message_timings
export const messageTimingsSessionIdIdx = index('message_timings_session_id_idx')
  .on(messageTimings.sessionId);
```

**Success criteria:**
- Schema compiles without TypeScript errors
- `bunx drizzle-kit generate` produces valid migration files
- Foreign key relationships correctly defined
- Schema supports efficient queries for:
  - All metrics for a single session
  - Aggregate stats across sessions for a recall set
  - Time-series analysis of recall performance

**Test approach:**
Run `bunx drizzle-kit generate` and inspect generated SQL. Verify foreign keys and indexes.

---

### P2-T04: Database Migrations for Metrics

**Description:**
Generate and apply database migrations for the new metrics tables. Ensure migrations work with existing Phase 1 database containing session data.

**Dependencies:** P2-T03

**Parallel Group:** C

**Files to create:**
- `drizzle/XXXX_add_session_metrics.sql` - Generated migration file

**Files to modify:**
- `src/storage/migrate.ts` - Ensure it handles new tables

**Implementation steps:**

1. Run `bunx drizzle-kit generate` to create migration
2. Review generated SQL for correctness
3. Run migration on development database
4. Verify tables created with correct structure

**Success criteria:**
- Migration generates without errors
- `bun run db:migrate` applies changes successfully
- New tables visible in database: `session_metrics`, `recall_outcomes`, `rabbithole_events`, `message_timings`
- Existing session data preserved
- Foreign keys enforce referential integrity

**Test approach:**
```bash
bunx drizzle-kit generate
bun run db:migrate
sqlite3 contextual-clarity.db ".tables"
sqlite3 contextual-clarity.db ".schema session_metrics"
```

---

### P2-T05: Session Metrics Repository

**Description:**
Implement repository for session metrics with methods for storing, querying, and aggregating metrics data. Include efficient queries for dashboard views.

**Dependencies:** P2-T04, P1-T05

**Parallel Group:** D

**Files to create:**
- `src/storage/repositories/session-metrics.repository.ts`
- `src/storage/repositories/recall-outcome.repository.ts`
- `src/storage/repositories/rabbithole-event.repository.ts`

**Files to modify:**
- `src/storage/repositories/index.ts` - Add barrel exports

**Key repository methods:**

```typescript
// session-metrics.repository.ts

export class SessionMetricsRepository {
  // Store complete metrics for a session
  async create(metrics: SessionMetrics): Promise<SessionMetrics>;

  // Get metrics for a single session
  async findBySessionId(sessionId: string): Promise<SessionMetrics | null>;

  // Get summary metrics for all sessions in a recall set (ordered by most recent)
  async findSummariesByRecallSet(recallSetId: string): Promise<SessionMetricsSummary[]>;

  // Get aggregate statistics for a recall set
  async getAggregateStats(recallSetId: string): Promise<RecallSetAggregateStats>;

  // Get metrics for sessions within a date range
  async findByDateRange(recallSetId: string, startDate: Date, endDate: Date): Promise<SessionMetricsSummary[]>;
}

export interface RecallSetAggregateStats {
  totalSessions: number;
  avgRecallRate: number;
  avgEngagement: number;
  avgDurationMs: number;
  totalTimeMs: number;
  totalRecallAttempts: number;
  totalRecallSuccesses: number;
}
```

**Success criteria:**
- All CRUD operations work correctly
- Aggregate queries return correct statistics
- Efficient joins between sessions and metrics
- Summary queries suitable for list views

**Test approach:**
Unit tests with in-memory SQLite database. Insert sample data, verify queries return expected results.

---

### P2-T06: Rabbithole Detector Service

**Description:**
Implement the service that uses the LLM to detect when conversations enter rabbitholes and when they return to the main topic. Integrates with the prompts from P2-T02.

**Dependencies:** P2-T02, P1-T07

**Parallel Group:** D

**Files to create:**
- `src/core/analysis/rabbithole-detector.ts`
- `src/core/analysis/types.ts`
- `src/core/analysis/index.ts`

**Key methods:**

```typescript
export class RabbitholeDetector {
  private llmClient: AnthropicClient;
  private activeRabbitholes: Map<string, RabbitholeEvent> = new Map();
  private detectionInProgress: boolean = false;
  private detectionQueue: Array<() => Promise<void>> = [];

  // Serialize detection calls to prevent race conditions
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    if (this.detectionInProgress) {
      // Queue this call
      return new Promise((resolve, reject) => {
        this.detectionQueue.push(async () => {
          try {
            resolve(await fn());
          } catch (e) {
            reject(e);
          }
        });
      });
    }

    this.detectionInProgress = true;
    try {
      return await fn();
    } finally {
      this.detectionInProgress = false;
      // Process queued calls
      const next = this.detectionQueue.shift();
      if (next) next();
    }
  }

  // Check if conversation has entered a new rabbithole (call after each message exchange)
  async detectRabbithole(
    sessionId: string,
    messages: SessionMessage[],
    currentRecallPoint: RecallPoint,
    allRecallPoints: RecallPoint[],
    messageIndex: number
  ): Promise<RabbitholeEvent | null> {
    return this.withLock(async () => {
      // ... actual detection logic
    });
  }

  // Check if any active rabbitholes have concluded
  async detectReturns(
    messages: SessionMessage[],
    currentRecallPoint: RecallPoint,
    messageIndex: number
  ): Promise<RabbitholeEvent[]>;

  // Force-close all active rabbitholes at session end
  closeAllActive(finalMessageIndex: number): RabbitholeEvent[];

  // Get currently active rabbitholes
  getActiveRabbitholes(): RabbitholeEvent[];
}
```

**Success criteria:**
- Correctly detects when conversation enters tangent
- Correctly detects when conversation returns to main topic
- Tracks multiple concurrent rabbitholes
- Handles edge cases (session end, rapid topic switches)
- Respects confidence threshold

**Test approach:**
Create test conversations with known rabbitholes, verify detection accuracy.

---

### P2-T07: Enhanced Recall Evaluator

**Description:**
Enhance the Phase 1 RecallEvaluator with more nuanced evaluation including confidence scores, detailed reasoning, and support for partial recall. Add context about conversation history for better judgment.

**Dependencies:** P1-T09

**Parallel Group:** D

**Files to modify:**
- `src/core/scoring/recall-evaluator.ts` - Enhanced evaluation logic
- `src/core/scoring/types.ts` - Extended types
- `src/llm/prompts/recall-evaluator.ts` - Enhanced prompt

**Enhanced evaluation result:**

```typescript
export interface EnhancedRecallEvaluation {
  success: boolean;
  confidence: number;
  reasoning: string;
  keyDemonstratedConcepts: string[];
  missedConcepts: string[];
  suggestedRating: RecallRating;
}
```

**Success criteria:**
- Enhanced evaluation provides confidence scores
- Suggested FSRS rating aligns with confidence level
- Reasoning is clear and actionable
- Handles session context for consistent evaluation
- Backward compatible with Phase 1 usage

**Test approach:**
Create test conversations with varying recall quality, verify evaluations match expected outcomes.

---

### P2-T08: Session Metrics Collector

**Description:**
Service that collects and calculates all session metrics during and after a session. Coordinates with rabbithole detector and evaluator to build comprehensive metrics.

**Dependencies:** P2-T05, P2-T06, P2-T07

**Parallel Group:** E

**Files to create:**
- `src/core/session/metrics-collector.ts`

**Files to modify:**
- `src/core/session/index.ts` - Add barrel export

**Key methods:**

```typescript
export class SessionMetricsCollector {
  // Initialize collector for a new session
  startSession(sessionId: string): void;

  // Record a message and its timing
  recordMessage(message: SessionMessage, tokenCount: number): void;

  // Record a recall point evaluation result
  recordRecallOutcome(recallPointId: string, evaluation: {...}): void;

  // Record a rabbithole event
  recordRabbithole(event: RabbitholeEvent): void;

  // Update a rabbithole when it concludes
  updateRabbitholeReturn(rabbitholeId: string, returnIndex: number): void;

  // Finalize and persist all metrics at session end
  async finalizeSession(session: Session): Promise<SessionMetrics>;
}
```

**Success criteria:**
- Tracks all metrics during session
- Calculates derived metrics correctly
- Persists all data at session end
- Engagement score reflects actual engagement
- Token costs calculated accurately

**Test approach:**
Unit tests simulating session flow, verify metric calculations are correct.

---

### P2-T09: Session Engine Integration

**Description:**
Integrate the metrics collector, rabbithole detector, and enhanced evaluator into the SessionEngine from Phase 1. Ensure all metrics are captured during normal session flow.

**Dependencies:** P2-T08, P1-T10

**Parallel Group:** F

**Files to modify:**
- `src/core/session/session-engine.ts` - Integrate metrics collection
- `src/core/session/types.ts` - Add metrics-related types

**Success criteria:**
- All existing session functionality preserved
- Metrics collected throughout session
- Rabbitholes detected and tracked
- Enhanced evaluation used for scoring
- Metrics persisted on session completion

**Test approach:**
End-to-end test running full session, verify metrics are stored correctly.

---

### P2-T10: Session Analytics Calculator

**Description:**
Service for calculating aggregate analytics across sessions. Provides recall trends, engagement patterns, and performance insights for individual recall sets and overall usage.

**Dependencies:** P2-T05

**Parallel Group:** E

**Files to create:**
- `src/core/analytics/analytics-calculator.ts`
- `src/core/analytics/types.ts`
- `src/core/analytics/index.ts`

**Key types and methods:**

```typescript
export interface RecallSetAnalytics {
  recallSetId: string;
  recallSetName: string;
  totalSessions: number;
  totalTimeSpentMs: number;
  overallRecallRate: number;
  avgEngagementScore: number;
  recallRateTrend: TrendData[];
  engagementTrend: TrendData[];
  pointAnalytics: RecallPointAnalytics[];
  topRabbitholeTopics: { topic: string; count: number; avgDepth: number }[];
  totalCostUsd: number;
}

export interface RecallPointAnalytics {
  recallPointId: string;
  content: string;
  successRate: number;
  avgConfidence: number;
  avgTimeToRecallMs: number;
  currentStability: number;
  currentDifficulty: number;
  daysUntilDue: number;
  isStruggling: boolean;  // High lapses, low success rate
}

export class AnalyticsCalculator {
  async calculateRecallSetAnalytics(recallSetId: string): Promise<RecallSetAnalytics>;
  async calculatePointAnalytics(recallPointId: string): Promise<RecallPointAnalytics>;
  async calculateGlobalAnalytics(): Promise<GlobalAnalytics>;
}

// When calculating rabbithole metrics, handle abandoned rabbitholes
const completedRabbitholes = rabbitholes.filter(r => r.status === 'returned');
const abandonedRabbitholes = rabbitholes.filter(r => r.status === 'abandoned');

// For time calculations, use session end time for abandoned rabbitholes
const getRabbitholeEndTime = (rh: RabbitholeEvent, sessionEndTime: Date): number => {
  if (rh.returnMessageIndex !== null) {
    return messageTimings[rh.returnMessageIndex]?.timestamp.getTime() ?? sessionEndTime.getTime();
  }
  return sessionEndTime.getTime();
};
```

**Success criteria:**
- Calculates accurate aggregate statistics
- Trend data correctly grouped by time period
- Point analytics identify struggling points
- Efficient queries (uses aggregate functions where possible)

**Test approach:**
Unit tests with sample data, verify calculations match expected values.

---

### P2-T11: Data Export Service

**Description:**
Service for exporting session data in JSON and CSV formats for external analysis. Supports exporting individual sessions, recall sets, and aggregate data.

**Dependencies:** P2-T05, P2-T10

**Parallel Group:** F

**Files to create:**
- `src/core/export/export-service.ts`
- `src/core/export/types.ts`
- `src/core/export/index.ts`

**Key methods:**

```typescript
export class ExportService {
  // Export a single session's data
  async exportSession(sessionId: string, options: ExportOptions): Promise<string>;

  // Export all sessions for a recall set
  async exportRecallSet(recallSetId: string, options: ExportOptions): Promise<string>;

  // Export aggregate analytics
  async exportAnalytics(recallSetId: string, options: ExportOptions): Promise<string>;
}

export interface ExportOptions {
  format: 'json' | 'csv';
  includeMessages: boolean;
  includeRabbitholes: boolean;
  includeTimings: boolean;
  dateRange?: { start: Date; end: Date };
}
```

**Success criteria:**
- JSON export includes all requested data
- CSV export properly formatted and escaped
- Date range filtering works correctly
- Large exports handled efficiently
- Optional fields correctly omitted when not requested

**Test approach:**
Export sample sessions, verify output format is valid and contains expected data.

---

### P2-T12: CLI Stats Command

**Description:**
Add a `stats` command to the CLI that displays recall statistics for a set, including recall rates, engagement trends, and struggling points.

**Dependencies:** P2-T10, P1-T11

**Parallel Group:** G

**Files to create:**
- `src/cli/commands/stats.ts`

**Files to modify:**
- `src/cli/index.ts` - Add stats command

**Usage:**
```bash
bun run cli stats <recall-set-name>
```

**Output includes:**
- Overview (total sessions, time, cost)
- Recall performance (overall rate, attempts, engagement)
- Point breakdown (success rates, due dates, struggling indicators)
- Top rabbithole topics
- Recent trend visualization

**Success criteria:**
- `bun run cli stats <name>` shows comprehensive statistics
- Output is well-formatted and readable
- Struggling points clearly highlighted
- Trends displayed visually
- Handles sets with no sessions gracefully

**Test approach:**
Manual testing with recall sets that have varying amounts of session data.

---

### P2-T13: CLI Replay Command

**Description:**
Add a `replay` command to review past session transcripts with timestamps, recall evaluations, and rabbithole markers.

**Dependencies:** P2-T05, P1-T11

**Parallel Group:** G

**Files to create:**
- `src/cli/commands/replay.ts`

**Files to modify:**
- `src/cli/index.ts` - Add replay command

**Usage:**
```bash
bun run cli sessions <set-name>  # List recent sessions
bun run cli replay <session-id>  # Replay specific session
```

**Success criteria:**
- `bun run cli replay <id>` shows full session transcript
- Timestamps displayed for each message
- Rabbithole entries/exits marked
- Evaluation results shown at appropriate points
- Summary displayed at end
- `bun run cli sessions <set>` lists recent sessions

**Test approach:**
Complete several sessions, then replay them to verify transcript accuracy.

---

### P2-T14: CLI Export Command

**Description:**
Add an `export` command to export session data to JSON or CSV files.

**Dependencies:** P2-T11, P1-T11

**Parallel Group:** G

**Files to create:**
- `src/cli/commands/export.ts`

**Files to modify:**
- `src/cli/index.ts` - Add export command

**Usage:**
```bash
bun run cli export session <session-id> [--format json|csv] [--output file]
bun run cli export set <set-name> [--format json|csv] [--output file]
bun run cli export analytics <set-name> [--format json|csv] [--output file]
```

**Success criteria:**
- `bun run cli export session <id>` exports session to JSON
- `bun run cli export set <name> --format csv` exports all sessions to CSV
- Output files are valid and parseable
- File size reported after export
- Error messages are clear when export fails

**Test approach:**
Export sessions in both formats, open in spreadsheet/JSON viewer to verify.

---

### P2-T15: Dashboard Data Aggregator

**Description:**
Create data structures and aggregation logic for the future web dashboard. This prepares the API response shapes needed for Phase 3.

**Dependencies:** P2-T10

**Parallel Group:** G

**Files to create:**
- `src/core/dashboard/dashboard-data.ts`
- `src/core/dashboard/types.ts`
- `src/core/dashboard/index.ts`

**Key types:**

```typescript
export interface DashboardOverview {
  totalRecallSets: number;
  activeRecallSets: number;
  totalSessions: number;
  totalStudyTimeMs: number;
  overallRecallRate: number;
  todaysSessions: number;
  todaysStudyTimeMs: number;
  pointsDueToday: number;
  recentSessions: SessionSummary[];
  upcomingReviews: UpcomingReview[];
  currentStreak: number;
  longestStreak: number;
}

export interface RecallSetDashboard {
  recallSet: { id, name, description, status, createdAt };
  stats: { totalSessions, totalTimeMs, avgRecallRate, avgEngagement, totalCostUsd };
  points: { total, dueNow, mastered, struggling, new };
  recallRateHistory: ChartDataPoint[];
  engagementHistory: ChartDataPoint[];
  recentSessions: SessionSummary[];
  pointDetails: RecallPointSummary[];
}
```

**Success criteria:**
- Overview aggregates data across all sets
- Set dashboard provides detailed breakdown
- Chart data in format ready for visualization library
- Point status categorization is accurate
- Streak calculation works correctly

**Test approach:**
Create test data spanning multiple days/sets, verify aggregations are accurate.

---

### P2-T16: Integration Tests

**Description:**
Write comprehensive integration tests verifying the complete metrics collection and analytics pipeline.

**Dependencies:** P2-T09, P2-T12, P2-T13, P2-T14

**Parallel Group:** H

**Files to create:**
- `tests/integration/metrics-collection.test.ts`
- `tests/integration/analytics.test.ts`
- `tests/integration/export.test.ts`

**Test coverage:**
- Full session flow collects all metrics
- Rabbithole detection works in realistic conversations
- Engagement score calculation
- Analytics aggregation accuracy
- Export format validity

**Success criteria:**
- All integration tests pass
- Metrics collection verified end-to-end
- Rabbithole detection tested with realistic conversations
- Analytics calculations match expected values
- Export formats are valid

**Test approach:**
Run `bun test tests/integration/` with test database.

---

## Final Checklist

Before Phase 2 is complete, verify:

- [ ] `bun run db:migrate` applies new tables without errors
- [ ] Completing a session stores comprehensive metrics
- [ ] Rabbitholes are detected and tracked during sessions
- [ ] Enhanced evaluation provides confidence scores
- [ ] `bun run cli stats <name>` shows detailed statistics
- [ ] `bun run cli sessions <name>` lists recent sessions
- [ ] `bun run cli replay <id>` shows session transcript with markers
- [ ] `bun run cli export session <id>` creates valid JSON file
- [ ] `bun run cli export set <name> --format csv` creates valid CSV
- [ ] All integration tests pass
- [ ] Dashboard data structures ready for Phase 3
- [ ] TypeScript compiles without errors

---

## File Tree Summary (Phase 2 Additions)

```
contextual-clarity/
├── src/
│   ├── core/
│   │   ├── models/
│   │   │   ├── session-metrics.ts          # NEW
│   │   │   └── index.ts                    # MODIFIED
│   │   ├── analysis/
│   │   │   ├── rabbithole-detector.ts      # NEW
│   │   │   ├── types.ts                    # NEW
│   │   │   └── index.ts                    # NEW
│   │   ├── analytics/
│   │   │   ├── analytics-calculator.ts     # NEW
│   │   │   ├── types.ts                    # NEW
│   │   │   └── index.ts                    # NEW
│   │   ├── session/
│   │   │   ├── session-engine.ts           # MODIFIED
│   │   │   ├── metrics-collector.ts        # NEW
│   │   │   └── index.ts                    # MODIFIED
│   │   ├── scoring/
│   │   │   ├── recall-evaluator.ts         # MODIFIED
│   │   │   └── types.ts                    # MODIFIED
│   │   ├── export/
│   │   │   ├── export-service.ts           # NEW
│   │   │   ├── types.ts                    # NEW
│   │   │   └── index.ts                    # NEW
│   │   └── dashboard/
│   │       ├── dashboard-data.ts           # NEW
│   │       ├── types.ts                    # NEW
│   │       └── index.ts                    # NEW
│   ├── llm/
│   │   └── prompts/
│   │       ├── rabbithole-detector.ts      # NEW
│   │       ├── recall-evaluator.ts         # MODIFIED
│   │       └── index.ts                    # MODIFIED
│   ├── storage/
│   │   ├── schema.ts                       # MODIFIED
│   │   └── repositories/
│   │       ├── session-metrics.repository.ts   # NEW
│   │       ├── recall-outcome.repository.ts    # NEW
│   │       ├── rabbithole-event.repository.ts  # NEW
│   │       └── index.ts                        # MODIFIED
│   └── cli/
│       ├── index.ts                        # MODIFIED
│       └── commands/
│           ├── stats.ts                    # NEW
│           ├── replay.ts                   # NEW
│           └── export.ts                   # NEW
├── drizzle/
│   └── XXXX_add_session_metrics.sql        # NEW (generated)
└── tests/
    └── integration/
        ├── metrics-collection.test.ts      # NEW
        ├── analytics.test.ts               # NEW
        └── export.test.ts                  # NEW
```
