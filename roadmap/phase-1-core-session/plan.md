# Phase 1: Core Session Loop - Implementation Plan

## Phase Goal

Get a test recall set + `discuss-sys-prompt` and get a decent-feeling discussion going.

By the end of this phase, you should be able to:
1. Run `bun run cli` and start an interactive recall session
2. Have a Socratic conversation with Claude about recall points
3. Mark points as successfully recalled or failed
4. See FSRS update the scheduling for next review

---

## Task Overview

| ID | Title | Dependencies | Parallel Group |
|----|-------|--------------|----------------|
| P1-T01 | Project Scaffolding | None | A |
| P1-T02 | Core Domain Types | P1-T01 | B |
| P1-T03 | Database Schema | P1-T01 | B |
| P1-T04 | Database Connection & Migrations | P1-T03 | C |
| P1-T05 | Repository Layer | P1-T02, P1-T04 | D |
| P1-T06 | FSRS Integration | P1-T02 | C |
| P1-T07 | LLM Client Wrapper | P1-T01 | B |
| P1-T08 | System Prompts | P1-T02 | C |
| P1-T09 | Recall Evaluator | P1-T07, P1-T08 | D |
| P1-T10 | Session Engine | P1-T05, P1-T06, P1-T09 | E |
| P1-T11 | CLI Session Runner | P1-T10 | F |
| P1-T12 | Test Recall Sets | P1-T05 | E |
| P1-T13 | End-to-End Integration Test | P1-T11, P1-T12 | G |

---

## Detailed Task Specifications

### P1-T01: Project Scaffolding

**Description:**
Initialize the Bun + TypeScript project with all required dependencies and configuration files. This establishes the foundation for all subsequent development.

**Files to create:**
- `package.json` - Project manifest with dependencies
- `tsconfig.json` - TypeScript configuration
- `bunfig.toml` - Bun-specific configuration
- `.env.example` - Environment variable template
- `.gitignore` - Git ignore rules
- `drizzle.config.ts` - Drizzle ORM configuration
- `src/index.ts` - Entry point placeholder

**Dependencies to install:**
```bash
bun add typescript drizzle-orm @anthropic-ai/sdk ts-fsrs hono zod
bun add -d drizzle-kit @types/bun
```

**Success criteria:**
- `bun run check` (or `bun tsc --noEmit`) passes with no errors
- `bun run src/index.ts` executes without errors
- All dependencies are installed and importable

**Test approach:**
```bash
bun run src/index.ts  # Should execute without error
bun tsc --noEmit      # TypeScript compiles
```

---

### P1-T02: Core Domain Types

**Description:**
Define TypeScript interfaces and types for all domain entities. These are pure types with no external dependencies, forming the contract between all modules.

**Files to create:**
- `src/core/models/recall-set.ts` - RecallSet and RecallSetStatus types
- `src/core/models/recall-point.ts` - RecallPoint and FSRSState types
- `src/core/models/session.ts` - Session, SessionStatus, and SessionMessage types
- `src/core/models/index.ts` - Barrel export

**Type definitions:**

```typescript
// recall-set.ts
export type RecallSetStatus = 'active' | 'paused' | 'archived';

export interface RecallSet {
  id: string;
  name: string;
  description: string;
  status: RecallSetStatus;
  discussionSystemPrompt: string;
  createdAt: Date;
  updatedAt: Date;
}

// recall-point.ts
export interface FSRSState {
  difficulty: number;
  stability: number;
  due: Date;
  lastReview: Date | null;
  reps: number;
  lapses: number;
  state: 'new' | 'learning' | 'review' | 'relearning';
}

export interface RecallAttempt {
  timestamp: Date;
  success: boolean;
  latencyMs: number;
}

export interface RecallPoint {
  id: string;
  recallSetId: string;
  content: string;           // The core fact/concept to recall
  context: string;           // Additional context for the AI tutor
  fsrsState: FSRSState;
  recallHistory: RecallAttempt[];
  createdAt: Date;
  updatedAt: Date;
}

// session.ts
export type SessionStatus = 'in_progress' | 'completed' | 'abandoned';
export type MessageRole = 'user' | 'assistant' | 'system';

export interface SessionMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  tokenCount: number | null;
}

export interface Session {
  id: string;
  recallSetId: string;
  status: SessionStatus;
  targetRecallPointIds: string[];
  startedAt: Date;
  endedAt: Date | null;
}
```

**Success criteria:**
- All types compile without errors
- Types can be imported from `src/core/models`
- No runtime dependencies in this module

**Test approach:**
Create a simple test file that imports and uses all types, run `bun tsc --noEmit`.

---

### P1-T03: Database Schema

**Description:**
Define the Drizzle ORM schema for SQLite, mapping domain models to database tables. Use appropriate column types and establish foreign key relationships.

**Files to create:**
- `src/storage/schema.ts` - All table definitions
- `src/storage/index.ts` - Barrel export

**Schema design:**

```typescript
// schema.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// Recall Sets table
export const recallSets = sqliteTable('recall_sets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  status: text('status', { enum: ['active', 'paused', 'archived'] }).notNull().default('active'),
  discussionSystemPrompt: text('discussion_system_prompt').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

// Recall Points table
export const recallPoints = sqliteTable('recall_points', {
  id: text('id').primaryKey(),
  recallSetId: text('recall_set_id').notNull().references(() => recallSets.id),
  content: text('content').notNull(),
  context: text('context').notNull(),
  // FSRS state stored as individual columns for query efficiency
  fsrsDifficulty: real('fsrs_difficulty').notNull(),
  fsrsStability: real('fsrs_stability').notNull(),
  fsrsDue: integer('fsrs_due', { mode: 'timestamp_ms' }).notNull(),
  fsrsLastReview: integer('fsrs_last_review', { mode: 'timestamp_ms' }),
  fsrsReps: integer('fsrs_reps').notNull().default(0),
  fsrsLapses: integer('fsrs_lapses').notNull().default(0),
  fsrsState: text('fsrs_state', { enum: ['new', 'learning', 'review', 'relearning'] }).notNull().default('new'),
  // Recall history as JSON array
  recallHistory: text('recall_history', { mode: 'json' }).$type<Array<{timestamp: number; success: boolean; latencyMs: number}>>().notNull().default([]),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

// Sessions table
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  recallSetId: text('recall_set_id').notNull().references(() => recallSets.id),
  status: text('status', { enum: ['in_progress', 'completed', 'abandoned'] }).notNull().default('in_progress'),
  targetRecallPointIds: text('target_recall_point_ids', { mode: 'json' }).$type<string[]>().notNull(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
});

// Session Messages table
export const sessionMessages = sqliteTable('session_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull(),
  tokenCount: integer('token_count'),
});
```

**Success criteria:**
- Schema compiles without TypeScript errors
- `bunx drizzle-kit generate` produces valid migration files
- Foreign key relationships are correctly defined

**Test approach:**
Run `bunx drizzle-kit generate` and inspect the generated SQL migration file.

---

### P1-T04: Database Connection & Migrations

**Description:**
Set up the database connection using Bun's native SQLite driver with Drizzle ORM. Create utilities for running migrations and ensure the database is properly initialized.

**Files to create:**
- `src/storage/db.ts` - Database connection factory
- `src/storage/migrate.ts` - Migration runner script
- `drizzle/` - Directory for generated migrations (created by drizzle-kit)

**Implementation:**

```typescript
// db.ts
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from './schema';

// Factory function to create database instance
// Allows different paths for dev/test/prod
export function createDatabase(dbPath: string = 'contextual-clarity.db') {
  const sqlite = new Database(dbPath);
  // Enable foreign keys (SQLite requires explicit enabling)
  sqlite.run('PRAGMA foreign_keys = ON');
  return drizzle(sqlite, { schema });
}

// Default instance for convenience
export const db = createDatabase();

export type Database = ReturnType<typeof createDatabase>;
```

```typescript
// migrate.ts
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { createDatabase } from './db';

const dbPath = process.env.DATABASE_PATH || 'contextual-clarity.db';
const db = createDatabase(dbPath);

console.log('Running migrations...');
migrate(db, { migrationsFolder: './drizzle' });
console.log('Migrations complete.');
```

**Add scripts to package.json:**
```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "bun run src/storage/migrate.ts",
    "db:studio": "drizzle-kit studio"
  }
}
```

**Success criteria:**
- `bun run db:generate` creates migration files in `drizzle/`
- `bun run db:migrate` creates the SQLite database and all tables
- Foreign keys are enforced (test by trying invalid inserts)

**Test approach:**
```bash
bun run db:generate
bun run db:migrate
# Verify with: sqlite3 contextual-clarity.db ".tables"
```

---

### P1-T05: Repository Layer

**Description:**
Implement the Repository pattern for data access. Each repository provides CRUD operations for its entity type, abstracting Drizzle queries from business logic.

**Files to create:**
- `src/storage/repositories/base.ts` - Generic repository interface
- `src/storage/repositories/recall-set.repository.ts`
- `src/storage/repositories/recall-point.repository.ts`
- `src/storage/repositories/session.repository.ts`
- `src/storage/repositories/session-message.repository.ts`
- `src/storage/repositories/index.ts`

**Repository interface:**

```typescript
// base.ts
export interface Repository<T, CreateInput, UpdateInput> {
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  create(input: CreateInput): Promise<T>;
  update(id: string, input: UpdateInput): Promise<T>;
  delete(id: string): Promise<void>;
}
```

**Key repository methods:**

```typescript
// recall-point.repository.ts (example key methods)
export class RecallPointRepository {
  // Find all points due for review (core for session scheduling)
  async findDuePoints(recallSetId: string, asOf: Date = new Date()): Promise<RecallPoint[]>;

  // Update FSRS state after a recall attempt
  async updateFSRSState(id: string, fsrsState: FSRSState): Promise<void>;

  // Add a recall attempt to history
  async addRecallAttempt(id: string, attempt: RecallAttempt): Promise<void>;
}

// recall-set.repository.ts
export class RecallSetRepository {
  // ... existing methods ...

  // Find a recall set by its unique name (case-insensitive)
  async findByName(name: string): Promise<RecallSet | null> {
    const result = await this.db
      .select()
      .from(recallSets)
      .where(sql`lower(${recallSets.name}) = lower(${name})`)
      .limit(1);
    return result[0] ? this.toDomain(result[0]) : null;
  }
}

// session.repository.ts (example key methods)
export class SessionRepository {
  // Find incomplete sessions for a recall set
  async findInProgress(recallSetId: string): Promise<Session | null>;

  // Complete a session
  async complete(id: string): Promise<void>;

  // Abandon a session (mark as abandoned with end time)
  async abandon(id: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ status: 'abandoned', endedAt: new Date() })
      .where(eq(sessions.id, id));
  }
}
```

**Success criteria:**
- All CRUD operations work correctly
- `findDuePoints` correctly filters by due date
- Type safety: domain models returned, not raw DB rows
- Proper mapping between DB schema and domain types

**Test approach:**
Write unit tests that create, read, update, and delete entities. Verify findDuePoints returns only points with `due <= now`.

---

### P1-T06: FSRS Integration

**Description:**
Wrap the ts-fsrs library to provide a clean interface for scheduling. Handle the conversion between our domain types and ts-fsrs types.

**Files to create:**
- `src/core/fsrs/scheduler.ts` - FSRSScheduler class
- `src/core/fsrs/types.ts` - Rating enum and conversion types
- `src/core/fsrs/index.ts` - Barrel export

**Implementation:**

```typescript
// types.ts
// Our simplified rating that maps to FSRS ratings
export type RecallRating = 'forgot' | 'hard' | 'good' | 'easy';

// scheduler.ts
import { FSRS, Card, Rating, State, createEmptyCard, generatorParameters } from 'ts-fsrs';
import type { FSRSState } from '../models';
import type { RecallRating } from './types';

export class FSRSScheduler {
  private fsrs: FSRS;

  constructor() {
    // Use default parameters, can be customized later
    const params = generatorParameters({
      maximum_interval: 365, // Max 1 year between reviews
    });
    this.fsrs = new FSRS(params);
  }

  // Convert our FSRSState to ts-fsrs Card
  private toCard(state: FSRSState): Card {
    // Calculate actual elapsed days since last review
    const elapsedDays = state.lastReview
      ? Math.floor((Date.now() - state.lastReview.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return {
      due: state.due,
      stability: state.stability,
      difficulty: state.difficulty,
      elapsed_days: elapsedDays,
      scheduled_days: 0, // Will be set by ts-fsrs
      reps: state.reps,
      lapses: state.lapses,
      state: this.mapState(state.state),
      last_review: state.lastReview ?? undefined,
    };
  }

  // Map our state string to ts-fsrs State enum
  private mapState(state: 'new' | 'learning' | 'review' | 'relearning'): State {
    const map: Record<string, State> = {
      'new': State.New,
      'learning': State.Learning,
      'review': State.Review,
      'relearning': State.Relearning,
    };
    return map[state];
  }

  // Map ts-fsrs State enum back to our string
  private reverseMapState(state: State): 'new' | 'learning' | 'review' | 'relearning' {
    const map: Record<State, 'new' | 'learning' | 'review' | 'relearning'> = {
      [State.New]: 'new',
      [State.Learning]: 'learning',
      [State.Review]: 'review',
      [State.Relearning]: 'relearning',
    };
    return map[state];
  }

  // Convert ts-fsrs Card back to our FSRSState
  private fromCard(card: Card): FSRSState {
    return {
      due: card.due,
      stability: card.stability,
      difficulty: card.difficulty,
      lastReview: card.last_review ?? null,
      reps: card.reps,
      lapses: card.lapses,
      state: this.reverseMapState(card.state),
    };
  }

  // Map our rating to ts-fsrs Rating
  private toRating(rating: RecallRating): Rating {
    const map: Record<RecallRating, Rating> = {
      forgot: Rating.Again,
      hard: Rating.Hard,
      good: Rating.Good,
      easy: Rating.Easy,
    };
    return map[rating];
  }

  // Create initial FSRS state for new recall points
  createInitialState(): FSRSState {
    const card = createEmptyCard();
    return this.fromCard(card);
  }

  // Schedule next review based on rating
  schedule(currentState: FSRSState, rating: RecallRating, reviewTime: Date = new Date()): FSRSState {
    const card = this.toCard(currentState);
    const result = this.fsrs.next(card, reviewTime, this.toRating(rating));
    return this.fromCard(result.card);
  }

  // Check if a point is due for review
  isDue(state: FSRSState, asOf: Date = new Date()): boolean {
    return state.due <= asOf;
  }
}
```

**Success criteria:**
- `createInitialState()` returns valid new card state
- `schedule()` correctly updates state based on rating
- Scheduling a "forgot" rating results in earlier next due date
- Scheduling an "easy" rating results in longer interval

**Test approach:**
```typescript
const scheduler = new FSRSScheduler();
const initial = scheduler.createInitialState();
const afterGood = scheduler.schedule(initial, 'good');
assert(afterGood.due > initial.due);
assert(afterGood.reps === 1);
```

---

### P1-T07: LLM Client Wrapper

**Description:**
Create an abstraction layer over the Anthropic SDK that handles:
- API key configuration
- Streaming responses
- Message formatting
- Token counting (approximate)
- Error handling

**Files to create:**
- `src/llm/client.ts` - AnthropicClient wrapper
- `src/llm/types.ts` - Message types and config
- `src/llm/index.ts` - Barrel export

**Implementation:**

```typescript
// types.ts
export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMConfig {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface StreamCallbacks {
  onText?: (text: string) => void;
  onComplete?: (fullText: string) => void;
  onError?: (error: Error) => void;
}

// client.ts
import Anthropic from '@anthropic-ai/sdk';
import type { LLMMessage, LLMConfig, StreamCallbacks } from './types';

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const DEFAULT_MAX_TOKENS = 1024;

export class AnthropicClient {
  private client: Anthropic;
  private defaultConfig: LLMConfig;

  constructor(config: LLMConfig = {}) {
    // Validate API key is present before proceeding
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY environment variable is required.\n' +
        'Get your API key at: https://console.anthropic.com/\n' +
        'Then set it: export ANTHROPIC_API_KEY=your-key-here'
      );
    }
    this.client = new Anthropic({ apiKey });
    this.defaultConfig = {
      model: config.model ?? DEFAULT_MODEL,
      maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: config.temperature ?? 0.7,
    };
  }

  // Non-streaming completion
  async complete(
    systemPrompt: string,
    messages: LLMMessage[],
    config?: Partial<LLMConfig>
  ): Promise<string> {
    const response = await this.client.messages.create({
      model: config?.model ?? this.defaultConfig.model!,
      max_tokens: config?.maxTokens ?? this.defaultConfig.maxTokens!,
      temperature: config?.temperature ?? this.defaultConfig.temperature,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    // Extract text from response
    const textBlock = response.content.find(block => block.type === 'text');
    return textBlock?.text ?? '';
  }

  // Streaming completion for interactive sessions
  async stream(
    systemPrompt: string,
    messages: LLMMessage[],
    callbacks: StreamCallbacks,
    config?: Partial<LLMConfig>
  ): Promise<void> {
    const stream = await this.client.messages.create({
      model: config?.model ?? this.defaultConfig.model!,
      max_tokens: config?.maxTokens ?? this.defaultConfig.maxTokens!,
      temperature: config?.temperature ?? this.defaultConfig.temperature,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
    });

    let fullText = '';
    try {
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const text = event.delta.text;
          fullText += text;
          callbacks.onText?.(text);
        }
      }
      callbacks.onComplete?.(fullText);
    } catch (error) {
      callbacks.onError?.(error as Error);
    }
  }

  // Approximate token count (rough heuristic: 4 chars per token)
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
```

**Success criteria:**
- Can make non-streaming API calls
- Can stream responses with real-time text callbacks
- Properly handles missing API key with clear error
- System prompt is correctly applied

**Test approach:**
Manual test with a simple prompt. Automated test can mock the Anthropic client.

---

### P1-T08: System Prompts

**Description:**
Design the system prompt for Socratic recall discussions. The prompt should instruct Claude to:
- Act as a Socratic tutor
- Naturally guide conversation toward recall points
- Allow exploration of rabbit holes but steer back
- Assess whether user successfully recalled each point

**Files to create:**
- `src/llm/prompts/socratic-tutor.ts` - Main discussion prompt builder
- `src/llm/prompts/recall-evaluator.ts` - Prompt for evaluating recall success
- `src/llm/prompts/index.ts` - Barrel export

**Socratic tutor prompt template:**

```typescript
// socratic-tutor.ts
import type { RecallPoint, RecallSet } from '../../core/models';

export interface SocraticTutorPromptParams {
  recallSet: RecallSet;
  targetPoints: RecallPoint[];
  currentPointIndex: number;
}

export function buildSocraticTutorPrompt(params: SocraticTutorPromptParams): string {
  const { recallSet, targetPoints, currentPointIndex } = params;
  const currentPoint = targetPoints[currentPointIndex];
  const remainingPoints = targetPoints.slice(currentPointIndex + 1);

  return `${recallSet.discussionSystemPrompt}

## Your Role
You are a Socratic tutor helping the user recall and internalize knowledge. Your goal is to guide them to demonstrate understanding through conversation, not simply recite facts.

## Current Recall Session
Topic: ${recallSet.name}
${recallSet.description}

## Target Recall Point (Current)
The user should demonstrate understanding of:
"${currentPoint.content}"

Context for you (do not share directly): ${currentPoint.context}

## Upcoming Points (${remainingPoints.length} remaining)
${remainingPoints.map((p, i) => `${i + 1}. ${p.content}`).join('\n')}

## Guidelines
1. **Start with open-ended questions** - Don't give away the answer. Ask questions that lead the user to articulate the concept.
2. **Follow rabbit holes briefly** - If the user explores a related tangent, engage with it for 1-2 exchanges, then guide back.
3. **Assess understanding** - Look for the user to explain the concept in their own words, not just repeat it.
4. **Be encouraging** - Acknowledge correct insights, gently redirect misconceptions.
5. **Signal completion** - When the user has demonstrated clear understanding of the current point, naturally transition to the next topic.
6. **Keep responses concise** - Aim for 2-4 sentences per response to maintain conversational flow.

## Important
- Do NOT directly state the recall points to the user
- Do NOT quiz them with multiple choice or fill-in-the-blank
- DO engage them in genuine discussion that surfaces their understanding`;
}
```

**Recall evaluator prompt:**

```typescript
// recall-evaluator.ts
export function buildRecallEvaluatorPrompt(
  recallPointContent: string,
  conversationExcerpt: string
): string {
  return `You are evaluating whether a user has successfully demonstrated recall of a specific concept during a conversation.

## Recall Point to Evaluate
"${recallPointContent}"

## Conversation Excerpt
${conversationExcerpt}

## Evaluation Criteria
The user has SUCCESSFULLY recalled if they:
- Explained the concept in their own words
- Demonstrated understanding of key relationships/mechanisms
- Applied the concept correctly in discussion

The user has NOT successfully recalled if they:
- Only gave vague or tangential answers
- Needed the concept explained to them
- Showed significant misconceptions that weren't corrected

## Your Response
Respond with ONLY a JSON object:
{
  "success": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation"
}`;
}
```

**Success criteria:**
- Prompts produce coherent Socratic discussions when tested
- Recall evaluator correctly identifies success vs failure
- Prompt handles edge cases (empty context, single point, etc.)

**Test approach:**
Manual testing with various recall sets. Evaluate conversation quality subjectively.

---

### P1-T09: Recall Evaluator

**Description:**
Implement the RecallEvaluator that uses the LLM to assess whether a user successfully demonstrated recall of a point during conversation.

**Files to create:**
- `src/core/scoring/recall-evaluator.ts`
- `src/core/scoring/types.ts`
- `src/core/scoring/index.ts`

**Implementation:**

```typescript
// types.ts
export interface RecallEvaluation {
  success: boolean;
  confidence: number;
  reasoning: string;
}

// recall-evaluator.ts
import { AnthropicClient } from '../../llm/client';
import { buildRecallEvaluatorPrompt } from '../../llm/prompts';
import type { RecallPoint, SessionMessage } from '../models';
import type { RecallEvaluation } from './types';

export class RecallEvaluator {
  private llmClient: AnthropicClient;

  constructor(llmClient: AnthropicClient) {
    this.llmClient = llmClient;
  }

  // Extract relevant conversation excerpt for evaluation
  private extractExcerpt(messages: SessionMessage[], maxMessages: number = 10): string {
    const recent = messages.slice(-maxMessages);
    return recent
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');
  }

  async evaluate(
    recallPoint: RecallPoint,
    conversationMessages: SessionMessage[]
  ): Promise<RecallEvaluation> {
    const excerpt = this.extractExcerpt(conversationMessages);
    const prompt = buildRecallEvaluatorPrompt(recallPoint.content, excerpt);

    const response = await this.llmClient.complete(
      'You are a precise evaluation assistant. Respond only with valid JSON.',
      [{ role: 'user', content: prompt }],
      { temperature: 0.3 } // Lower temperature for consistent evaluation
    );

    try {
      const parsed = JSON.parse(response);
      return {
        success: Boolean(parsed.success),
        confidence: Number(parsed.confidence) || 0.5,
        reasoning: String(parsed.reasoning) || 'No reasoning provided',
      };
    } catch {
      // Fallback if parsing fails - assume partial success
      console.error('Failed to parse evaluation response:', response);
      return {
        success: false,
        confidence: 0.5,
        reasoning: 'Evaluation parsing failed',
      };
    }
  }
}
```

**Success criteria:**
- Correctly parses LLM evaluation response
- Handles malformed JSON gracefully
- Evaluation matches human judgment in test cases

**Test approach:**
Create test conversations with known outcomes (clear success, clear failure, ambiguous). Verify evaluator accuracy.

---

### P1-T10: Session Engine

**Description:**
The core orchestrator that manages the conversation flow:
- Loads due recall points
- Maintains conversation state
- Triggers LLM responses
- Tracks which points have been covered
- Handles session completion

**Files to create:**
- `src/core/session/session-engine.ts`
- `src/core/session/types.ts`
- `src/core/session/index.ts`

**Implementation:**

```typescript
// types.ts
export type SessionEventType =
  | 'session_started'
  | 'point_started'
  | 'user_message'
  | 'assistant_message'
  | 'point_evaluated'
  | 'point_completed'
  | 'session_completed';

export interface SessionEvent {
  type: SessionEventType;
  data: unknown;
  timestamp: Date;
}

export interface SessionEngineConfig {
  maxMessagesPerPoint: number;  // Force evaluation after N messages
  autoEvaluateAfter: number;    // Messages before auto-triggering evaluation
}

// session-engine.ts
import type { RecallSet, RecallPoint, Session, SessionMessage } from '../models';
import type { RecallRating } from '../fsrs';
import { FSRSScheduler } from '../fsrs';
import { RecallEvaluator } from '../scoring';
import { AnthropicClient } from '../../llm';
import { buildSocraticTutorPrompt } from '../../llm/prompts';
import type { RecallPointRepository, SessionRepository, SessionMessageRepository } from '../../storage/repositories';

export class SessionEngine {
  private scheduler: FSRSScheduler;
  private evaluator: RecallEvaluator;
  private llmClient: AnthropicClient;

  // Repositories
  private recallPointRepo: RecallPointRepository;
  private sessionRepo: SessionRepository;
  private messageRepo: SessionMessageRepository;

  // Current session state
  private currentSession: Session | null = null;
  private currentRecallSet: RecallSet | null = null;
  private targetPoints: RecallPoint[] = [];
  private currentPointIndex: number = 0;
  private messages: SessionMessage[] = [];

  constructor(deps: {
    llmClient: AnthropicClient;
    scheduler: FSRSScheduler;
    recallPointRepo: RecallPointRepository;
    sessionRepo: SessionRepository;
    messageRepo: SessionMessageRepository;
  }) {
    this.llmClient = deps.llmClient;
    this.scheduler = deps.scheduler;
    this.evaluator = new RecallEvaluator(deps.llmClient);
    this.recallPointRepo = deps.recallPointRepo;
    this.sessionRepo = deps.sessionRepo;
    this.messageRepo = deps.messageRepo;
  }

  // Start a new session for a recall set
  async startSession(recallSet: RecallSet): Promise<Session> {
    // IMPORTANT: Reset state from any previous session
    this.currentSession = null;
    this.currentRecallSet = null;
    this.targetPoints = [];
    this.currentPointIndex = 0;
    this.messages = [];

    // Find due points
    const duePoints = await this.recallPointRepo.findDuePoints(recallSet.id);

    if (duePoints.length === 0) {
      throw new Error('No recall points due for review');
    }

    // Create session
    const session = await this.sessionRepo.create({
      recallSetId: recallSet.id,
      targetRecallPointIds: duePoints.map(p => p.id),
      startedAt: new Date(),
    });

    this.currentSession = session;
    this.currentRecallSet = recallSet;
    this.targetPoints = duePoints;
    this.currentPointIndex = 0;
    this.messages = [];

    return session;
  }

  // Get the opening message from the tutor
  async getOpeningMessage(): Promise<string> {
    if (!this.currentSession || !this.currentRecallSet) {
      throw new Error('No active session');
    }

    const systemPrompt = buildSocraticTutorPrompt({
      recallSet: this.currentRecallSet,
      targetPoints: this.targetPoints,
      currentPointIndex: this.currentPointIndex,
    });

    let response = '';
    await this.llmClient.stream(
      systemPrompt,
      [], // No prior messages for opening
      {
        onText: (text) => { response += text; },
      }
    );

    // Save assistant message
    await this.saveMessage('assistant', response);

    return response;
  }

  // Process user input and get response
  async processUserMessage(content: string): Promise<{ response: string; completed: boolean }> {
    if (!this.currentSession || !this.currentRecallSet) {
      throw new Error('No active session');
    }

    // Save user message
    await this.saveMessage('user', content);

    // Check for evaluation triggers (e.g., user says "I think I've got it")
    const shouldEvaluate = this.shouldTriggerEvaluation(content);

    if (shouldEvaluate) {
      return this.evaluateAndAdvance();
    }

    // Generate response
    const systemPrompt = buildSocraticTutorPrompt({
      recallSet: this.currentRecallSet,
      targetPoints: this.targetPoints,
      currentPointIndex: this.currentPointIndex,
    });

    const llmMessages = this.messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    let response = '';
    await this.llmClient.stream(
      systemPrompt,
      llmMessages,
      {
        onText: (text) => { response += text; },
      }
    );

    await this.saveMessage('assistant', response);

    return { response, completed: false };
  }

  // Evaluate current point and advance to next
  private async evaluateAndAdvance(): Promise<{ response: string; completed: boolean }> {
    const currentPoint = this.targetPoints[this.currentPointIndex];
    const evaluation = await this.evaluator.evaluate(currentPoint, this.messages);

    // Determine FSRS rating based on evaluation
    const rating: RecallRating = evaluation.success
      ? (evaluation.confidence > 0.8 ? 'easy' : 'good')
      : (evaluation.confidence < 0.3 ? 'forgot' : 'hard');

    // Update FSRS state
    const newState = this.scheduler.schedule(currentPoint.fsrsState, rating);
    await this.recallPointRepo.updateFSRSState(currentPoint.id, newState);

    // Record recall attempt
    await this.recallPointRepo.addRecallAttempt(currentPoint.id, {
      timestamp: new Date(),
      success: evaluation.success,
      latencyMs: 0, // Could track actual conversation duration
    });

    // Advance to next point or complete
    this.currentPointIndex++;

    if (this.currentPointIndex >= this.targetPoints.length) {
      // Session complete
      await this.sessionRepo.complete(this.currentSession!.id);
      return {
        response: `Great session! We covered ${this.targetPoints.length} recall points. ${evaluation.success ? 'You demonstrated solid understanding!' : 'Keep practicing - you\'ll get it!'}`,
        completed: true,
      };
    }

    // Continue to next point
    const transitionMessage = evaluation.success
      ? "Excellent! Let's move on to the next topic."
      : "Let's continue and come back to this concept. Moving to the next topic.";

    await this.saveMessage('assistant', transitionMessage);

    return { response: transitionMessage, completed: false };
  }

  private shouldTriggerEvaluation(userMessage: string): boolean {
    const triggers = ['i think i understand', 'got it', 'makes sense now', 'i see', 'next topic'];
    const lower = userMessage.toLowerCase();
    return triggers.some(t => lower.includes(t));
  }

  private async saveMessage(role: 'user' | 'assistant', content: string): Promise<void> {
    const message = await this.messageRepo.create({
      sessionId: this.currentSession!.id,
      role,
      content,
      timestamp: new Date(),
      tokenCount: this.llmClient.estimateTokens(content),
    });
    this.messages.push(message);
  }

  // Manual evaluation trigger (for CLI command)
  async triggerEvaluation(): Promise<{ response: string; completed: boolean }> {
    return this.evaluateAndAdvance();
  }

  // Abandon the current session and clean up state
  async abandonSession(): Promise<void> {
    if (this.currentSession) {
      await this.sessionRepo.abandon(this.currentSession.id);
      // Reset state
      this.currentSession = null;
      this.currentRecallSet = null;
      this.targetPoints = [];
      this.currentPointIndex = 0;
      this.messages = [];
    }
  }
}
```

**Success criteria:**
- Can start a session and get an opening message
- Processes user messages and generates contextual responses
- Tracks conversation state correctly
- Evaluates and advances through recall points
- Updates FSRS state on completion
- Handles session completion gracefully

**Test approach:**
Integration test that simulates a full session with mocked LLM responses.

---

### P1-T11: CLI Session Runner

**Description:**
Interactive command-line interface for running recall sessions. Uses Node's readline for input and provides a clean terminal experience.

**Files to create:**
- `src/cli/index.ts` - CLI entry point
- `src/cli/commands/session.ts` - Session command handler
- `src/cli/utils/terminal.ts` - Terminal utilities (colors, formatting)

**Implementation:**

```typescript
// src/cli/index.ts
import { createDatabase } from '../storage/db';
import { RecallSetRepository, RecallPointRepository, SessionRepository, SessionMessageRepository } from '../storage/repositories';
import { SessionEngine } from '../core/session';
import { FSRSScheduler } from '../core/fsrs';
import { AnthropicClient } from '../llm';
import { runSessionCommand } from './commands/session';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Initialize dependencies
  const db = createDatabase();
  const llmClient = new AnthropicClient();
  const scheduler = new FSRSScheduler();

  const recallSetRepo = new RecallSetRepository(db);
  const recallPointRepo = new RecallPointRepository(db);
  const sessionRepo = new SessionRepository(db);
  const messageRepo = new SessionMessageRepository(db);

  const engine = new SessionEngine({
    llmClient,
    scheduler,
    recallPointRepo,
    sessionRepo,
    messageRepo,
  });

  switch (command) {
    case 'session':
      const setName = args[1];
      if (!setName) {
        console.log('Usage: bun run cli session <recall-set-name>');
        process.exit(1);
      }
      await runSessionCommand(engine, recallSetRepo, setName);
      break;

    case 'list':
      const sets = await recallSetRepo.findAll();
      console.log('\nAvailable Recall Sets:');
      sets.forEach(s => {
        console.log(`  - ${s.name} (${s.status})`);
      });
      break;

    default:
      console.log('Commands:');
      console.log('  session <name>  - Start a recall session');
      console.log('  list            - List available recall sets');
  }
}

main().catch(console.error);
```

```typescript
// src/cli/commands/session.ts
import * as readline from 'readline';
import type { SessionEngine } from '../../core/session';
import type { RecallSetRepository } from '../../storage/repositories';
import { bold, dim, green, yellow } from '../utils/terminal';

export async function runSessionCommand(
  engine: SessionEngine,
  recallSetRepo: RecallSetRepository,
  setName: string
): Promise<void> {
  // Find recall set
  const recallSet = await recallSetRepo.findByName(setName);
  if (!recallSet) {
    console.log(`Recall set "${setName}" not found.`);
    return;
  }

  console.log(bold(`\n=== Starting Recall Session: ${recallSet.name} ===\n`));

  // Start session
  try {
    await engine.startSession(recallSet);
  } catch (error) {
    console.log(yellow('No recall points due for review. Check back later!'));
    return;
  }

  // Get opening message
  const opening = await engine.getOpeningMessage();
  console.log(green('Tutor: ') + opening + '\n');

  // Interactive loop
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (): Promise<string> => {
    return new Promise((resolve) => {
      rl.question('You: ', resolve);
    });
  };

  let completed = false;
  while (!completed) {
    const userInput = await prompt();

    if (userInput.toLowerCase() === '/quit') {
      // Mark session as abandoned before exiting
      await engine.abandonSession();
      console.log(dim('\nSession abandoned.'));
      break;
    }

    if (userInput.toLowerCase() === '/eval') {
      // Manual evaluation trigger
      const result = await engine.triggerEvaluation();
      console.log(green('Tutor: ') + result.response + '\n');
      completed = result.completed;
      continue;
    }

    const result = await engine.processUserMessage(userInput);
    console.log(green('Tutor: ') + result.response + '\n');
    completed = result.completed;
  }

  rl.close();
  console.log(bold('\n=== Session Complete ===\n'));
}
```

```typescript
// src/cli/utils/terminal.ts
// Simple terminal formatting utilities
export const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
export const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
export const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
export const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
export const blue = (s: string) => `\x1b[34m${s}\x1b[0m`;
```

**Add script to package.json:**
```json
{
  "scripts": {
    "cli": "bun run src/cli/index.ts"
  }
}
```

**Success criteria:**
- `bun run cli list` shows available recall sets
- `bun run cli session <name>` starts an interactive session
- User can type messages and receive responses
- `/quit` cleanly exits the session
- `/eval` manually triggers point evaluation
- Session completion message is displayed

**Test approach:**
Manual testing with test recall sets. Verify commands work as expected.

---

### P1-T12: Test Recall Sets

**Description:**
Create seed data for two test recall sets with 3-5 recall points each. These will be used for testing and demonstration.

**Files to create:**
- `src/storage/seeds/motivation-recall-set.ts`
- `src/storage/seeds/atp-recall-set.ts`
- `src/storage/seeds/index.ts`
- `src/storage/seed.ts` - Seed runner script

**Motivation recall set:**

```typescript
// motivation-recall-set.ts
import type { RecallSet, RecallPoint } from '../../core/models';
import { FSRSScheduler } from '../../core/fsrs';

const scheduler = new FSRSScheduler();

export const motivationRecallSet: Omit<RecallSet, 'id' | 'createdAt' | 'updatedAt'> = {
  name: 'motivation',
  description: 'Understanding motivation, resistance, and taking action',
  status: 'active',
  discussionSystemPrompt: `You are helping the user internalize concepts about motivation, action, and overcoming resistance.
Draw on ideas from behavioral psychology and practical productivity wisdom.
Be conversational and relate concepts to real-world examples the user might encounter.`,
};

export const motivationRecallPoints: Array<Omit<RecallPoint, 'id' | 'recallSetId' | 'fsrsState' | 'recallHistory' | 'createdAt' | 'updatedAt'>> = [
  {
    content: 'Action creates motivation, not the other way around. Starting is often harder than continuing.',
    context: 'The user should understand that waiting to "feel motivated" is often counterproductive. Taking small actions generates momentum and motivation follows.',
  },
  {
    content: 'Internal motivation (autonomy, mastery, purpose) is more sustainable than external motivation (rewards, punishments).',
    context: 'Reference Self-Determination Theory. Internal drivers lead to deeper engagement and longer-lasting motivation.',
  },
  {
    content: 'Resistance increases with the perceived size of a task. Breaking tasks into smaller pieces reduces resistance.',
    context: 'The "two-minute rule" and similar techniques work because they lower the activation energy needed to start.',
  },
  {
    content: 'Identity-based habits are more powerful than outcome-based goals. "I am a writer" vs "I want to write a book".',
    context: 'From James Clear\'s Atomic Habits. Behavior that aligns with self-identity requires less willpower to maintain.',
  },
];
```

**ATP recall set:**

```typescript
// atp-recall-set.ts
export const atpRecallSet: Omit<RecallSet, 'id' | 'createdAt' | 'updatedAt'> = {
  name: 'atp',
  description: 'ATP and cellular energy transfer fundamentals',
  status: 'active',
  discussionSystemPrompt: `You are helping the user understand ATP and cellular energy mechanisms.
Use analogies to make biochemistry accessible (e.g., ATP as "energy currency").
Connect molecular concepts to observable biological phenomena.`,
};

export const atpRecallPoints: Array<Omit<RecallPoint, 'id' | 'recallSetId' | 'fsrsState' | 'recallHistory' | 'createdAt' | 'updatedAt'>> = [
  {
    content: 'ATP (adenosine triphosphate) stores and transfers energy through the breaking of its phosphate bonds.',
    context: 'The high-energy bond between the second and third phosphate groups releases ~7.3 kcal/mol when hydrolyzed to ADP.',
  },
  {
    content: 'Cells regenerate ATP through three main pathways: glycolysis, the citric acid cycle, and oxidative phosphorylation.',
    context: 'These pathways work together: glycolysis produces pyruvate, which feeds into the citric acid cycle, which generates electron carriers for oxidative phosphorylation.',
  },
  {
    content: 'ATP is not stored in large quantities; the body recycles its weight in ATP daily.',
    context: 'A human body contains only about 250g of ATP at any moment, but recycles approximately 40-75 kg of ATP per day.',
  },
];
```

**Seed runner:**

```typescript
// seed.ts
import { createDatabase } from './db';
import { RecallSetRepository, RecallPointRepository } from './repositories';
import { FSRSScheduler } from '../core/fsrs';
import { motivationRecallSet, motivationRecallPoints } from './seeds/motivation-recall-set';
import { atpRecallSet, atpRecallPoints } from './seeds/atp-recall-set';
import { randomUUID } from 'crypto';

async function seed() {
  const db = createDatabase();
  const recallSetRepo = new RecallSetRepository(db);
  const recallPointRepo = new RecallPointRepository(db);
  const scheduler = new FSRSScheduler();

  // Check if already seeded (idempotent seeding)
  const existingMotivation = await recallSetRepo.findByName('motivation');
  if (existingMotivation) {
    console.log('Database already seeded. Use --force to reseed.');
    if (!process.argv.includes('--force')) {
      return;
    }
    console.log('Force flag detected, clearing existing seed data...');
    // Delete existing seed data
    await recallSetRepo.delete(existingMotivation.id);
    const existingAtp = await recallSetRepo.findByName('atp');
    if (existingAtp) await recallSetRepo.delete(existingAtp.id);
  }

  console.log('Seeding database...');

  // Seed motivation set
  const motivationSet = await recallSetRepo.create({
    ...motivationRecallSet,
    id: randomUUID(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  for (const point of motivationRecallPoints) {
    await recallPointRepo.create({
      ...point,
      id: randomUUID(),
      recallSetId: motivationSet.id,
      fsrsState: scheduler.createInitialState(),
      recallHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  console.log(`  Created recall set: ${motivationSet.name} with ${motivationRecallPoints.length} points`);

  // Seed ATP set
  const atpSet = await recallSetRepo.create({
    ...atpRecallSet,
    id: randomUUID(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  for (const point of atpRecallPoints) {
    await recallPointRepo.create({
      ...point,
      id: randomUUID(),
      recallSetId: atpSet.id,
      fsrsState: scheduler.createInitialState(),
      recallHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  console.log(`  Created recall set: ${atpSet.name} with ${atpRecallPoints.length} points`);

  console.log('Seeding complete!');
}

seed().catch(console.error);
```

**Add script to package.json:**
```json
{
  "scripts": {
    "db:seed": "bun run src/storage/seed.ts"
  }
}
```

**Success criteria:**
- `bun run db:seed` creates both recall sets with all points
- Points have valid initial FSRS state (due date = now)
- `bun run cli list` shows both sets
- Recall sets have meaningful system prompts

**Test approach:**
Run seed script, then query database to verify data integrity.

---

### P1-T13: End-to-End Integration Test

**Description:**
Verify the complete flow works end-to-end:
1. Start with seeded database
2. Run a CLI session
3. Have a conversation
4. Complete the session
5. Verify FSRS state was updated

**Files to create:**
- `tests/e2e/session-flow.test.ts` - Integration test

**Test script (manual initially):**

```typescript
// tests/e2e/session-flow.test.ts
import { describe, it, expect, beforeAll } from 'bun:test';
import { createDatabase } from '../../src/storage/db';
import { RecallSetRepository, RecallPointRepository, SessionRepository, SessionMessageRepository } from '../../src/storage/repositories';
import { SessionEngine } from '../../src/core/session';
import { FSRSScheduler } from '../../src/core/fsrs';
import { AnthropicClient } from '../../src/llm';

describe('Session Flow E2E', () => {
  let engine: SessionEngine;
  let recallSetRepo: RecallSetRepository;
  let recallPointRepo: RecallPointRepository;

  beforeAll(() => {
    const db = createDatabase(':memory:'); // Use in-memory DB for tests
    // Run migrations...

    const llmClient = new AnthropicClient();
    const scheduler = new FSRSScheduler();

    recallSetRepo = new RecallSetRepository(db);
    recallPointRepo = new RecallPointRepository(db);
    const sessionRepo = new SessionRepository(db);
    const messageRepo = new SessionMessageRepository(db);

    engine = new SessionEngine({
      llmClient,
      scheduler,
      recallPointRepo,
      sessionRepo,
      messageRepo,
    });
  });

  it('should complete a full session flow', async () => {
    // Get motivation recall set
    const recallSet = await recallSetRepo.findByName('motivation');
    expect(recallSet).not.toBeNull();

    // Get initial FSRS state
    const pointsBefore = await recallPointRepo.findAll(recallSet!.id);
    const initialReps = pointsBefore[0].fsrsState.reps;

    // Start session
    const session = await engine.startSession(recallSet!);
    expect(session.status).toBe('in_progress');

    // Get opening
    const opening = await engine.getOpeningMessage();
    expect(opening.length).toBeGreaterThan(0);

    // Simulate conversation
    const response1 = await engine.processUserMessage("I think action creates motivation, not waiting for it");
    expect(response1.response.length).toBeGreaterThan(0);

    // Trigger evaluation
    const evalResult = await engine.triggerEvaluation();
    expect(evalResult.completed).toBe(false); // More points to go

    // Verify FSRS was updated
    const pointsAfter = await recallPointRepo.findAll(recallSet!.id);
    expect(pointsAfter[0].fsrsState.reps).toBe(initialReps + 1);
  });
});
```

**Success criteria:**
- Full session flow completes without errors
- FSRS state is correctly updated after evaluation
- Session messages are persisted
- Session status transitions correctly

**Test approach:**
Run `bun test tests/e2e/session-flow.test.ts` (may need to mock LLM for deterministic tests).

---

## Final Checklist

Before Phase 1 is complete, verify:

- [ ] `bun install` installs all dependencies
- [ ] `bun run db:generate` creates migrations
- [ ] `bun run db:migrate` creates database
- [ ] `bun run db:seed` populates test data
- [ ] `bun run cli list` shows recall sets
- [ ] `bun run cli session motivation` starts interactive session
- [ ] Conversation feels natural and Socratic
- [ ] `/eval` evaluates current point
- [ ] Session completes and shows summary
- [ ] FSRS due dates are updated after session
- [ ] TypeScript compiles without errors
- [ ] Code follows existing patterns from overview.md

---

## File Tree Summary

```
contextual-clarity/
├── package.json
├── tsconfig.json
├── bunfig.toml
├── drizzle.config.ts
├── .env.example
├── .gitignore
├── drizzle/
│   └── (generated migrations)
├── src/
│   ├── index.ts
│   ├── core/
│   │   ├── models/
│   │   │   ├── recall-set.ts
│   │   │   ├── recall-point.ts
│   │   │   ├── session.ts
│   │   │   └── index.ts
│   │   ├── fsrs/
│   │   │   ├── scheduler.ts
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   ├── session/
│   │   │   ├── session-engine.ts
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   └── scoring/
│   │       ├── recall-evaluator.ts
│   │       ├── types.ts
│   │       └── index.ts
│   ├── llm/
│   │   ├── client.ts
│   │   ├── types.ts
│   │   ├── prompts/
│   │   │   ├── socratic-tutor.ts
│   │   │   ├── recall-evaluator.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── storage/
│   │   ├── schema.ts
│   │   ├── db.ts
│   │   ├── migrate.ts
│   │   ├── seed.ts
│   │   ├── repositories/
│   │   │   ├── base.ts
│   │   │   ├── recall-set.repository.ts
│   │   │   ├── recall-point.repository.ts
│   │   │   ├── session.repository.ts
│   │   │   ├── session-message.repository.ts
│   │   │   └── index.ts
│   │   ├── seeds/
│   │   │   ├── motivation-recall-set.ts
│   │   │   ├── atp-recall-set.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   └── cli/
│       ├── index.ts
│       ├── commands/
│       │   └── session.ts
│       └── utils/
│           └── terminal.ts
└── tests/
    └── e2e/
        └── session-flow.test.ts
```
