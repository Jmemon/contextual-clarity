# Tree Sessions & Branch Tab UX — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace flat session messages with a tree data structure and replace the emerald theme-switch rabbit hole UX with a right-edge tab-based branch navigation system.

**Architecture:** New `branches` table replaces `rabbithole_events`. Messages get a nullable `branchId` FK. SessionEngine manages a `Map<branchId, BranchAgent>` instead of a single agent. WebSocket messages are multiplexed by `branchId`. Frontend gets a vertical tab bar on the right edge.

**Tech Stack:** Drizzle ORM (SQLite), Bun, React 18, Tailwind CSS, native WebSocket, TanStack Query.

**Design doc:** `docs/plans/2026-02-25-tree-sessions-and-branch-tabs-design.md`

---

## Task 1: Database Schema — `branches` Table and `session_messages.branchId`

**Files:**
- Modify: `src/storage/schema.ts` (lines 512–560 for `rabbitholeEvents`, lines 288–308 for `sessionMessages`, lines 615–617 for type exports)
- Create: Drizzle migration via CLI

**Step 1: Replace `rabbitholeEvents` table with `branches` in schema**

In `src/storage/schema.ts`, replace the `rabbitholeEvents` table definition (lines 512–560) with:

```typescript
export const branches = sqliteTable(
  'branches',
  {
    id: text('id').primaryKey(),

    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),

    // null = branched from trunk; otherwise FK to parent branch
    parentBranchId: text('parent_branch_id'),

    // The exact message in the parent where this branch forks
    branchPointMessageId: text('branch_point_message_id')
      .notNull()
      .references(() => sessionMessages.id),

    topic: text('topic').notNull(),

    // detected: tab appeared, user hasn't engaged yet
    // active: user has engaged, agent is/was alive
    // closed: naturally concluded or user marked done
    // abandoned: session ended with branch still open
    status: text('status', { enum: ['detected', 'active', 'closed', 'abandoned'] })
      .notNull()
      .default('detected'),

    // Populated on close — brief summary of the branch conversation
    summary: text('summary'),

    // 1 = off trunk, 2 = off a branch, etc.
    depth: integer('depth').notNull().default(1),

    relatedRecallPointIds: text('related_recall_point_ids', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),

    userInitiated: integer('user_initiated', { mode: 'boolean' }).notNull(),

    // Full exchange persisted as JSON array of { role, content }
    conversation: text('conversation', { mode: 'json' })
      .$type<Array<{ role: string; content: string }>>(),

    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),

    closedAt: integer('closed_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('branches_session_id_idx').on(table.sessionId),
    index('branches_parent_branch_id_idx').on(table.parentBranchId),
  ]
);
```

**Step 2: Add `branchId` column to `sessionMessages`**

Add after the `tokenCount` column in `sessionMessages` (line ~307):

```typescript
    // null = trunk message; otherwise FK to the branch this message belongs to
    branchId: text('branch_id').references(() => branches.id),
```

**Step 3: Update type exports**

Replace the `RabbitholeEvent`/`NewRabbitholeEvent` exports (lines 615–617) with:

```typescript
export type BranchRow = typeof branches.$inferSelect;
export type NewBranchRow = typeof branches.$inferInsert;
```

Also update the `SessionMessage` type export to include the new `branchId` field (automatic via `$inferSelect`).

**Step 4: Generate and apply migration**

```bash
cd /Users/johnmemon/Desktop/contextual-clarity
bunx drizzle-kit generate
```

Review the generated SQL migration. It should:
- Create `branches` table
- Add `branch_id` column to `session_messages`
- Drop `rabbithole_events` table

If the auto-generated migration doesn't drop `rabbithole_events`, add it manually:
```sql
DROP TABLE IF EXISTS `rabbithole_events`;
```

**Step 5: Run migration and verify**

```bash
bunx drizzle-kit push
```

**Step 6: Commit**

```bash
git add src/storage/schema.ts drizzle/
git commit -m "feat: replace rabbithole_events with branches table, add branchId to session_messages"
```

---

## Task 2: Core Domain Types — `Branch`, `BranchStatus`, Analysis Types

**Files:**
- Modify: `src/core/models/session-metrics.ts` (lines 82, 111–161, 281, 388)
- Modify: `src/core/models/index.ts` (lines 38–47)
- Modify: `src/core/session/types.ts` (lines 61–79, 117–128, 88–108, 276)
- Modify: `src/core/analysis/types.ts` (lines 17–97)
- Modify: `src/core/analysis/index.ts` (lines 42–50)

**Step 1: Update `session-metrics.ts` — rename types**

Replace `RabbitholeStatus` (line 82):
```typescript
export type BranchStatus = 'detected' | 'active' | 'closed' | 'abandoned';
```

Replace `RabbitholeEvent` interface (lines 111–161):
```typescript
export interface Branch {
  id: string;
  sessionId?: string;
  parentBranchId: string | null;
  branchPointMessageId: string;
  topic: string;
  depth: number;
  relatedRecallPointIds: string[];
  userInitiated: boolean;
  status: BranchStatus;
  summary: string | null;
  conversation: Array<{ role: string; content: string }> | null;
  createdAt?: Date;
  closedAt?: Date | null;
}
```

Update `SessionMetrics.rabbitholes` (line 281):
```typescript
  branches: Branch[];
```

Update `SessionMetricsSummary.rabbitholeCount` (line 388):
```typescript
  branchCount: number;
```

**Step 2: Update `models/index.ts` exports**

Replace rabbithole exports (lines 38–47):
```typescript
export type {
  RecallOutcome,
  BranchStatus,
  Branch,
  TokenUsage,
  MessageTiming,
  SessionMetrics,
  SessionMetricsSummary,
} from './session-metrics';
```

**Step 3: Update `session/types.ts` — event types**

Replace rabbithole event types in `SessionEventType` (lines 72–75):
```typescript
  | 'branch_detected'
  | 'branch_activated'
  | 'branch_closed'
  | 'branch_summary_injected'
```

Replace rabbithole variants in `SessionEventData` (lines 123–126):
```typescript
  | { type: 'branch_detected'; branchId: string; topic: string; parentBranchId?: string; depth: number }
  | { type: 'branch_activated'; branchId: string; topic: string }
  | { type: 'branch_closed'; branchId: string; summary: string }
  | { type: 'branch_summary_injected'; branchId: string; summary: string; branchPointMessageId: string }
```

Update `SessionCompletionSummary` (line 99):
```typescript
  branchCount: number;
```

Update `SessionEngineDependencies` (line 276):
```typescript
  branchRepo?: BranchRepository;
```

Add import for `BranchRepository` at the top of the file.

**Step 4: Update analysis types**

In `src/core/analysis/types.ts`, rename:
- `RabbitholeDetectorConfig` → `BranchDetectorConfig` (lines 17–45)
- `ActiveRabbitholeState` → `ActiveBranchState` (lines 62–97) — add `parentBranchId: string | null` and `branchPointMessageId: string` fields
- `DEFAULT_RABBITHOLE_DETECTOR_CONFIG` → `DEFAULT_BRANCH_DETECTOR_CONFIG` (lines 51–56)

**Step 5: Update `analysis/index.ts` exports**

Replace all rabbithole exports with branch equivalents.

**Step 6: Fix compilation errors**

Run `bunx tsc --noEmit` and fix any remaining import references. This will cascade — many files will need import updates.

**Step 7: Commit**

```bash
git add src/core/
git commit -m "feat: rename rabbithole domain types to branch types"
```

---

## Task 3: `BranchRepository` — Replace `RabbitholeEventRepository`

**Files:**
- Create: `src/storage/repositories/branch.repository.ts`
- Delete: `src/storage/repositories/rabbithole-event.repository.ts`
- Modify: `src/storage/repositories/index.ts` (lines 75–79)
- Test: `tests/integration/branch-repository.test.ts`

**Step 1: Write failing test**

Create `tests/integration/branch-repository.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { BranchRepository } from '@/storage/repositories/branch.repository';
// Import test DB setup from tests/setup.ts

describe('BranchRepository', () => {
  let repo: BranchRepository;

  beforeEach(async () => {
    // Reset DB
    repo = new BranchRepository(db);
  });

  it('should create a branch with detected status', async () => {
    const branch = await repo.create({
      id: 'br_test1',
      sessionId: testSessionId,
      parentBranchId: null,
      branchPointMessageId: 'msg_1',
      topic: 'ATP synthesis',
      depth: 1,
      relatedRecallPointIds: [],
      userInitiated: false,
    });
    expect(branch.status).toBe('detected');
    expect(branch.summary).toBeNull();
  });

  it('should activate a branch', async () => {
    await repo.create({ /* ... */ });
    const updated = await repo.activate('br_test1');
    expect(updated.status).toBe('active');
  });

  it('should close a branch with summary', async () => {
    await repo.create({ /* ... */ });
    await repo.activate('br_test1');
    const closed = await repo.close('br_test1', 'Explored ATP synthesis deeply');
    expect(closed.status).toBe('closed');
    expect(closed.summary).toBe('Explored ATP synthesis deeply');
    expect(closed.closedAt).toBeTruthy();
  });

  it('should find branches by session', async () => {
    // Create multiple branches
    const branches = await repo.findBySessionId(testSessionId);
    expect(branches.length).toBeGreaterThan(0);
  });

  it('should find active branches by session', async () => {
    const active = await repo.findActiveBySessionId(testSessionId);
    expect(active.every(b => b.status === 'active' || b.status === 'detected')).toBe(true);
  });

  it('should mark all active as abandoned', async () => {
    await repo.markActiveAsAbandoned(testSessionId);
    const branches = await repo.findBySessionId(testSessionId);
    expect(branches.every(b => b.status === 'abandoned' || b.status === 'closed')).toBe(true);
  });

  it('should update conversation', async () => {
    const conversation = [{ role: 'user', content: 'Hello' }, { role: 'assistant', content: 'Hi!' }];
    await repo.updateConversation('br_test1', conversation);
    const branch = await repo.findById('br_test1');
    expect(branch?.conversation).toEqual(conversation);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
bun test tests/integration/branch-repository.test.ts 2>&1 | grep -E "\(pass\)|\(fail\)|error"
```

**Step 3: Implement `BranchRepository`**

Create `src/storage/repositories/branch.repository.ts`:

Model after the existing `rabbithole-event.repository.ts` but with the new schema. Key methods:

- `create(input: CreateBranchInput): Promise<BranchRow>`
- `findById(id: string): Promise<BranchRow | null>`
- `findBySessionId(sessionId: string): Promise<BranchRow[]>`
- `findActiveBySessionId(sessionId: string): Promise<BranchRow[]>` — status in ('detected', 'active')
- `activate(id: string): Promise<BranchRow>`
- `close(id: string, summary: string): Promise<BranchRow>`
- `updateConversation(id: string, conversation: Array<{role: string, content: string}>): Promise<void>`
- `markActiveAsAbandoned(sessionId: string): Promise<void>`
- `deleteBySessionId(sessionId: string): Promise<void>`

**Step 4: Update `repositories/index.ts`**

Replace rabbithole exports with:
```typescript
export { BranchRepository } from './branch.repository';
```

**Step 5: Delete old file**

```bash
rm src/storage/repositories/rabbithole-event.repository.ts
```

**Step 6: Run tests**

```bash
bun test tests/integration/branch-repository.test.ts 2>&1 | grep -E "\(pass\)|\(fail\)"
```

**Step 7: Commit**

```bash
git add src/storage/repositories/ tests/integration/branch-repository.test.ts
git commit -m "feat: BranchRepository replaces RabbitholeEventRepository"
```

---

## Task 4: `BranchAgent` — Evolve from `RabbitholeAgent` with Parent Context

**Files:**
- Rename: `src/core/session/rabbithole-agent.ts` → `src/core/session/branch-agent.ts`
- Test: `tests/unit/branch-agent.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'bun:test';
import { BranchAgent } from '@/core/session/branch-agent';

describe('BranchAgent', () => {
  it('should accept parent context messages in constructor', () => {
    const parentContext = [
      { role: 'user' as const, content: 'Tell me about cells' },
      { role: 'assistant' as const, content: 'Cells are the basic unit...' },
    ];

    const agent = new BranchAgent({
      topic: 'mitochondria',
      recallSetName: 'Cell Biology',
      recallSetDescription: 'Core concepts...',
      parentContext,
    });

    expect(agent.getTopic()).toBe('mitochondria');
    // Parent context should be reflected in conversation history length
    const history = agent.getConversationHistory();
    expect(history.length).toBe(0); // No agent messages yet, parent context is internal
  });

  it('should return conversation history without parent context prefix', () => {
    const agent = new BranchAgent({
      topic: 'ATP',
      recallSetName: 'Bio',
      recallSetDescription: '',
      parentContext: [{ role: 'user', content: 'test' }],
    });
    const history = agent.getConversationHistory();
    // Only branch-specific messages, not parent context
    expect(history).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
bun test tests/unit/branch-agent.test.ts 2>&1 | grep -E "\(pass\)|\(fail\)|error"
```

**Step 3: Implement `BranchAgent`**

Rename `rabbithole-agent.ts` → `branch-agent.ts`. Key changes:
- Rename class `RabbitholeAgent` → `BranchAgent`
- Rename type `RabbitholeMessage` → `BranchMessage`
- Add `parentContext` parameter to constructor
- Store parent context separately — prepend it to LLM calls but don't include in `getConversationHistory()` (history returns only branch-specific messages for DB persistence)
- `generateOpeningMessage()`: LLM sees parent context + opening prompt
- `generateResponse()`: LLM sees parent context + branch messages

```typescript
export class BranchAgent {
  private llmClient: AnthropicClient;
  private parentContext: BranchMessage[];  // Frozen snapshot of parent
  private messages: BranchMessage[] = [];  // Branch-specific messages only
  private topic: string;

  constructor(params: {
    topic: string;
    recallSetName: string;
    recallSetDescription: string;
    parentContext: BranchMessage[];
  }) {
    this.topic = params.topic;
    this.parentContext = [...params.parentContext];
    this.llmClient = new AnthropicClient();
    this.llmClient.setSystemPrompt(buildBranchAgentPrompt(/*...*/));
  }

  async generateOpeningMessage(): Promise<string> {
    const openingPrompt = `I'm curious about "${this.topic}". What would you like to explore?`;
    const fullHistory = [...this.parentContext, { role: 'user', content: openingPrompt }];
    const response = await this.llmClient.complete(fullHistory, { temperature: 0.7, maxTokens: 256 });
    this.messages.push({ role: 'user', content: openingPrompt });
    this.messages.push({ role: 'assistant', content: response.text });
    return response.text;
  }

  async generateResponse(userMessage: string): Promise<string> {
    this.messages.push({ role: 'user', content: userMessage });
    const fullHistory = [...this.parentContext, ...this.messages];
    const response = await this.llmClient.complete(fullHistory, { temperature: 0.7, maxTokens: 512 });
    this.messages.push({ role: 'assistant', content: response.text });
    return response.text;
  }

  getConversationHistory(): BranchMessage[] {
    return [...this.messages]; // Branch messages only — for DB persistence
  }
}
```

**Step 4: Delete old file**

```bash
rm src/core/session/rabbithole-agent.ts
```

**Step 5: Run tests and commit**

```bash
bun test tests/unit/branch-agent.test.ts 2>&1 | grep -E "\(pass\)|\(fail\)"
git add src/core/session/ tests/unit/branch-agent.test.ts
git commit -m "feat: BranchAgent with parent context support replaces RabbitholeAgent"
```

---

## Task 5: Context Builder — `buildBranchContext()`

**Files:**
- Create: `src/core/session/context-builder.ts`
- Test: `tests/unit/context-builder.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'bun:test';
import { buildBranchContext, buildTrunkContext } from '@/core/session/context-builder';

describe('buildTrunkContext', () => {
  it('should return trunk messages with no branches', () => {
    const trunkMessages = [
      { id: 'm1', role: 'user', content: 'Hello' },
      { id: 'm2', role: 'assistant', content: 'Hi!' },
    ];
    const result = buildTrunkContext(trunkMessages, []);
    expect(result).toEqual(trunkMessages);
  });

  it('should inject closed branch summary at branch point', () => {
    const trunkMessages = [
      { id: 'm1', role: 'user', content: 'Hello' },
      { id: 'm2', role: 'assistant', content: 'About cells...' },
      { id: 'm3', role: 'user', content: 'What about ATP?' },
    ];
    const closedBranches = [{
      id: 'br1',
      branchPointMessageId: 'm2',
      topic: 'Mitochondria',
      status: 'closed',
      summary: 'Explored mitochondrial function in detail.',
    }];
    const result = buildTrunkContext(trunkMessages, closedBranches);
    // Summary should appear after m2
    expect(result[2].role).toBe('system');
    expect(result[2].content).toContain('Mitochondria');
    expect(result[2].content).toContain('Explored mitochondrial function');
    expect(result.length).toBe(4); // m1, m2, summary, m3
  });

  it('should NOT inject open branch summaries', () => {
    const trunkMessages = [{ id: 'm1', role: 'user', content: 'Hello' }];
    const openBranches = [{
      id: 'br1',
      branchPointMessageId: 'm1',
      status: 'active',
      summary: null,
    }];
    const result = buildTrunkContext(trunkMessages, openBranches);
    expect(result.length).toBe(1); // No injection
  });
});

describe('buildBranchContext', () => {
  it('should return parent trunk messages up to branch point', () => {
    const trunkMessages = [
      { id: 'm1', role: 'user', content: 'Hello' },
      { id: 'm2', role: 'assistant', content: 'About cells...' },
      { id: 'm3', role: 'user', content: 'What about ATP?' },
    ];
    const branch = { id: 'br1', branchPointMessageId: 'm2', parentBranchId: null };
    const result = buildBranchContext(branch, [], trunkMessages);
    expect(result.length).toBe(2); // m1, m2 only
  });

  it('should handle nested branches — include parent branch context up to sub-branch point', () => {
    const trunkMessages = [
      { id: 'm1', role: 'user', content: 'Hello' },
      { id: 'm2', role: 'assistant', content: 'About cells...' },
    ];
    const parentBranch = {
      id: 'br1',
      branchPointMessageId: 'm2',
      parentBranchId: null,
      conversation: [
        { id: 'b1m1', role: 'user', content: 'Tell me about mitochondria' },
        { id: 'b1m2', role: 'assistant', content: 'Mitochondria are...' },
        { id: 'b1m3', role: 'user', content: 'And ATP?' },
      ],
    };
    const childBranch = {
      id: 'br2',
      branchPointMessageId: 'b1m2',
      parentBranchId: 'br1',
    };
    const allBranches = [parentBranch, childBranch];
    const result = buildBranchContext(childBranch, allBranches, trunkMessages);
    // Should be: m1, m2 (trunk up to br1 fork), b1m1, b1m2 (parent branch up to br2 fork)
    expect(result.length).toBe(4);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
bun test tests/unit/context-builder.test.ts 2>&1 | grep -E "\(pass\)|\(fail\)|error"
```

**Step 3: Implement context builder**

Create `src/core/session/context-builder.ts`:

```typescript
interface ContextMessage {
  id?: string;
  role: string;
  content: string;
}

interface BranchInfo {
  id: string;
  parentBranchId: string | null;
  branchPointMessageId: string;
  status?: string;
  summary?: string | null;
  conversation?: Array<{ role: string; content: string }> | null;
}

/**
 * Builds LLM context for the trunk (main session).
 * Injects closed branch summaries at their branch points.
 */
export function buildTrunkContext(
  trunkMessages: ContextMessage[],
  branches: BranchInfo[]
): ContextMessage[] {
  const closedBranches = branches.filter(b => b.status === 'closed' && b.summary && !b.parentBranchId);
  if (closedBranches.length === 0) return [...trunkMessages];

  const result: ContextMessage[] = [];
  for (const msg of trunkMessages) {
    result.push(msg);
    // After the branch point message, inject summaries of closed branches that forked here
    for (const branch of closedBranches) {
      if (branch.branchPointMessageId === msg.id) {
        result.push({
          role: 'system',
          content: `[Branch: ${branch.topic}] ${branch.summary}`,
        });
      }
    }
  }
  return result;
}

/**
 * Builds frozen parent context for a branch agent.
 * Walks up the ancestry chain collecting messages up to each branch point.
 */
export function buildBranchContext(
  branch: BranchInfo,
  allBranches: BranchInfo[],
  trunkMessages: ContextMessage[]
): ContextMessage[] {
  // Build ancestry chain: [root ancestor, ..., parent, this branch]
  const ancestry: BranchInfo[] = [];
  let current: BranchInfo | undefined = branch;
  while (current) {
    ancestry.unshift(current);
    current = current.parentBranchId
      ? allBranches.find(b => b.id === current!.parentBranchId)
      : undefined;
  }

  const result: ContextMessage[] = [];

  // Start with trunk messages up to the root ancestor's branch point
  const rootBranch = ancestry[0];
  for (const msg of trunkMessages) {
    result.push(msg);
    if (msg.id === rootBranch.branchPointMessageId) break;
  }

  // For each intermediate ancestor, append its messages up to the next child's branch point
  for (let i = 0; i < ancestry.length - 1; i++) {
    const parentBranch = ancestry[i];
    const childBranch = ancestry[i + 1];
    const parentConversation = parentBranch.conversation ?? [];
    for (const msg of parentConversation) {
      result.push(msg);
      if (msg.id === childBranch.branchPointMessageId) break;
    }
  }

  return result;
}
```

**Step 4: Run tests and commit**

```bash
bun test tests/unit/context-builder.test.ts 2>&1 | grep -E "\(pass\)|\(fail\)"
git add src/core/session/context-builder.ts tests/unit/context-builder.test.ts
git commit -m "feat: context builder for tree-structured session messages"
```

---

## Task 6: SessionEngine Refactor — Multi-Branch Support

**Files:**
- Modify: `src/core/session/session-engine.ts` (lines 221–238 properties, 866–1026 rabbithole methods)

This is the largest task. The engine must support multiple concurrent branch agents.

**Step 1: Replace single-agent properties with branch map**

Remove these properties:
- `currentMode: 'recall' | 'rabbithole'` (line 232)
- `activeRabbitholeAgent: RabbitholeAgent | null` (line 238)
- `activeRabbitholeEventId` / `activeRabbitholeTopic` / `rabbitholePointsRecalled`
- `completionPendingAfterRabbithole`
- `rabbitholeDeclineCooldown`

Add:
```typescript
/** Map of active branch agents, keyed by branchId */
private branchAgents: Map<string, BranchAgent> = new Map();

/** Per-branch points recalled count for metrics */
private branchPointsRecalled: Map<string, number> = new Map();

/** Per-branch processing locks */
private branchLocks: Map<string, Promise<void>> = new Map();
```

**Step 2: Replace `enterRabbithole()` with `activateBranch()`**

```typescript
async activateBranch(branchId: string): Promise<string> {
  this.validateActiveSession();

  if (this.branchAgents.has(branchId)) {
    throw new Error(`Branch ${branchId} already has an active agent`);
  }

  // Load branch record from DB
  const branch = await this.branchRepo?.findById(branchId);
  if (!branch) throw new Error(`Branch ${branchId} not found`);

  // Build frozen parent context
  const parentContext = buildBranchContext(
    { id: branch.id, parentBranchId: branch.parentBranchId, branchPointMessageId: branch.branchPointMessageId },
    await this.branchRepo!.findBySessionId(this.currentSession!.id),
    this.messages
  );

  // Create agent with parent context
  const agent = new BranchAgent({
    topic: branch.topic,
    recallSetName: this.currentRecallSet!.name,
    recallSetDescription: this.currentRecallSet!.description,
    parentContext: parentContext.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  });

  this.branchAgents.set(branchId, agent);
  this.branchPointsRecalled.set(branchId, 0);

  // Update status to active
  await this.branchRepo!.activate(branchId);

  this.emitEvent({ type: 'branch_activated', branchId, topic: branch.topic });

  // Generate opening message
  const openingMessage = await agent.generateOpeningMessage();
  return openingMessage;
}
```

**Step 3: Replace `exitRabbithole()` with `closeBranch()`**

```typescript
async closeBranch(branchId: string): Promise<string> {
  const agent = this.branchAgents.get(branchId);
  if (!agent) throw new Error(`No active agent for branch ${branchId}`);

  // Persist conversation
  const conversation = agent.getConversationHistory();
  await this.branchRepo?.updateConversation(branchId, conversation);

  // Generate summary via LLM
  const summary = await this.generateBranchSummary(branchId, conversation);

  // Close in DB
  await this.branchRepo?.close(branchId, summary);

  // Destroy agent
  this.branchAgents.delete(branchId);
  this.branchPointsRecalled.delete(branchId);

  this.emitEvent({ type: 'branch_closed', branchId, summary });

  // Load branch to get branchPointMessageId for summary injection event
  const branch = await this.branchRepo?.findById(branchId);
  if (branch) {
    this.emitEvent({
      type: 'branch_summary_injected',
      branchId,
      summary,
      branchPointMessageId: branch.branchPointMessageId,
    });
  }

  return summary;
}
```

**Step 4: Replace `processRabbitholeMessage()` with `processBranchMessage()`**

```typescript
async processBranchMessage(branchId: string, content: string): Promise<ProcessMessageResult> {
  const agent = this.branchAgents.get(branchId);
  if (!agent) throw new Error(`No active agent for branch ${branchId}`);

  // Run evaluator silently — can still mark points recalled during branches
  const evalResult = await this.evaluateUncheckedPoints();

  const currentCount = this.branchPointsRecalled.get(branchId) ?? 0;
  this.branchPointsRecalled.set(branchId, currentCount + evalResult.recalledPointIds.length);

  for (const pointId of evalResult.recalledPointIds) {
    this.markPointRecalled(pointId);
    const confidence = evalResult.confidencePerPoint.get(pointId) ?? 0.5;
    await this.recordRecallOutcome(pointId, {
      success: true,
      confidence,
      reasoning: `Recalled during branch exploration (confidence: ${confidence})`,
    });
  }

  const response = await agent.generateResponse(content);

  return {
    response,
    completed: false,
    recalledCount: this.getRecalledCount(),
    totalPoints: this.targetPoints.length,
    pointsRecalledThisTurn: evalResult.recalledPointIds,
  };
}
```

**Step 5: Add `generateBranchSummary()` helper**

```typescript
private async generateBranchSummary(
  branchId: string,
  conversation: Array<{ role: string; content: string }>
): Promise<string> {
  const summaryPrompt = `Summarize this tangent exploration in 1-2 sentences. Focus on what was clarified, discovered, or changed. Be concise unless something directly relevant to the main session was discussed.\n\nConversation:\n${conversation.map(m => `${m.role}: ${m.content}`).join('\n')}`;

  const response = await this.llmClient.complete(summaryPrompt, {
    temperature: 0.3,
    maxTokens: 128,
  });

  return response.text;
}
```

**Step 6: Update `processUserMessage()` routing**

The existing `processUserMessage()` currently checks `this.currentMode`. Replace that check:

```typescript
async processUserMessage(content: string, branchId?: string): Promise<ProcessMessageResult> {
  if (branchId) {
    return this.processBranchMessage(branchId, content);
  }
  // ... existing trunk message processing (Socratic tutor) ...
}
```

**Step 7: Update trunk context building**

Where the engine builds LLM context for the Socratic tutor, use `buildTrunkContext()`:

```typescript
// When building messages for the tutor LLM call, wrap with context builder
const contextMessages = buildTrunkContext(
  this.messages,
  await this.branchRepo?.findBySessionId(this.currentSession!.id) ?? []
);
```

**Step 8: Remove `declineRabbithole()`**

Remove the method entirely. The new flow has no decline action — tabs just appear and the user ignores them if they want.

**Step 9: Update session completion**

Replace rabbithole-related cleanup in session completion with:
```typescript
// Mark all active/detected branches as abandoned
await this.branchRepo?.markActiveAsAbandoned(this.currentSession!.id);
// Destroy all branch agents
this.branchAgents.clear();
this.branchPointsRecalled.clear();
```

**Step 10: Run type check and fix errors**

```bash
bunx tsc --noEmit 2>&1 | head -50
```

**Step 11: Commit**

```bash
git add src/core/session/
git commit -m "feat: SessionEngine multi-branch support with per-branch agents and context building"
```

---

## Task 7: Branch Detector — Rename and Add Conclusion Detection

**Files:**
- Rename: `src/core/analysis/rabbithole-detector.ts` → `src/core/analysis/branch-detector.ts`
- Rename: `src/llm/prompts/rabbithole-detector.ts` → `src/llm/prompts/branch-detector.ts`
- Modify: `src/llm/prompts/index.ts` (update exports)

**Step 1: Rename `RabbitholeDetector` → `BranchDetector`**

In `branch-detector.ts`:
- Class: `RabbitholeDetector` → `BranchDetector`
- All internal references: `activeRabbitholes` → `activeBranches`, `generateRabbitholeId()` → `generateBranchId()` (prefix `br_`)
- Return types: `RabbitholeEvent` → `Branch`
- Method names: `detectRabbithole()` → `detectBranch()`, `detectReturns()` → stays but returns `Branch[]`

**Step 2: Add `detectConclusion()` method**

New method for detecting when a branch conversation has naturally wound down:

```typescript
/**
 * Checks if a branch conversation has naturally concluded.
 * Runs after each branch message to detect winding-down signals.
 */
async detectConclusion(
  branchConversation: Array<{ role: string; content: string }>,
  topic: string
): Promise<boolean> {
  if (branchConversation.length < 4) return false; // Too early to conclude

  const recentMessages = branchConversation.slice(-4);
  const prompt = buildBranchConclusionPrompt(topic, recentMessages);

  const response = await this.llmClient.complete(prompt, {
    temperature: 0.3,
    maxTokens: 128,
  });

  const result = parseBranchConclusionResponse(response.text);
  return result.isConcluded && result.confidence >= this.config.confidenceThreshold;
}
```

**Step 3: Add conclusion detection prompt**

In `src/llm/prompts/branch-detector.ts`, add:

```typescript
export function buildBranchConclusionPrompt(
  topic: string,
  recentMessages: Array<{ role: string; content: string }>
): string {
  return `Analyze whether this tangent conversation about "${topic}" has naturally concluded.

Signs of conclusion:
- The user seems satisfied or has stopped asking follow-up questions
- The topic has been thoroughly explored
- The conversation is becoming repetitive
- The user is giving short acknowledgment responses

Recent messages:
${recentMessages.map(m => `${m.role}: ${m.content}`).join('\n')}

Respond with JSON: { "isConcluded": boolean, "confidence": 0.0-1.0 }`;
}

export function parseBranchConclusionResponse(text: string): { isConcluded: boolean; confidence: number } {
  try {
    const parsed = JSON.parse(text);
    return {
      isConcluded: Boolean(parsed.isConcluded),
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    };
  } catch {
    return { isConcluded: false, confidence: 0 };
  }
}
```

**Step 4: Update `detectBranch()` to return branch-compatible data**

The method should now return data that includes `branchPointMessageId` instead of `triggerMessageIndex`. The caller (SessionEngine) provides the last message ID.

**Step 5: Update prompt exports in `src/llm/prompts/index.ts`**

Replace all rabbithole prompt imports/exports with branch equivalents.

**Step 6: Commit**

```bash
git add src/core/analysis/ src/llm/prompts/
git commit -m "feat: BranchDetector with conclusion detection replaces RabbitholeDetector"
```

---

## Task 8: WebSocket Types — New Branch Message Protocol

**Files:**
- Modify: `src/api/ws/types.ts` (lines 85–132 client messages, 275–348 server messages)

**Step 1: Replace client message types**

Remove `EnterRabbitholePayload`, `ExitRabbitholePayload`, `DeclineRabbitholePayload`.

Add:

```typescript
/** Client sends a message to a specific branch (or trunk if branchId omitted) */
export interface UserMessagePayload {
  type: 'user_message';
  content: string;
  branchId?: string; // null/undefined = trunk
}

/** Client activates a detected branch (first tab click) */
export interface ActivateBranchPayload {
  type: 'activate_branch';
  branchId: string;
}

/** Client explicitly closes a branch (marks as done) */
export interface CloseBranchPayload {
  type: 'close_branch';
  branchId: string;
}
```

Update `ClientMessage` union and `CLIENT_MESSAGE_TYPES` array.

**Step 2: Replace server message types**

Remove `RabbitholeDetectedPayload`, `RabbitholeEnteredPayload`, `RabbitholeExitedPayload`.

Add:

```typescript
export interface BranchDetectedPayload {
  type: 'branch_detected';
  branchId: string;
  topic: string;
  parentBranchId?: string;
  depth: number;
}

export interface BranchActivatedPayload {
  type: 'branch_activated';
  branchId: string;
  topic: string;
}

/** Streaming chunk — now tagged with branchId */
export interface AssistantChunkPayload {
  type: 'assistant_chunk';
  content: string;
  branchId?: string; // null = trunk
}

export interface AssistantCompletePayload {
  type: 'assistant_complete';
  branchId?: string;
}

export interface BranchClosedPayload {
  type: 'branch_closed';
  branchId: string;
  summary: string;
}

export interface BranchSummaryInjectedPayload {
  type: 'branch_summary_injected';
  branchId: string;
  summary: string;
  branchPointMessageId: string;
}
```

Update `ServerMessage` union.

**Step 3: Commit**

```bash
git add src/api/ws/types.ts
git commit -m "feat: WebSocket types for multiplexed branch protocol"
```

---

## Task 9: WebSocket Handler — Branch Message Routing

**Files:**
- Modify: `src/api/ws/session-handler.ts` (lines 363–385 event listener, 488–507 message routing, 582–655 handlers)
- Modify: `src/api/server.ts` (lines 57–70 imports, 425–456 dependency wiring)

**Step 1: Update message routing switch**

Replace the rabbithole cases (lines 496–507) with:

```typescript
case 'user_message':
  await this.handleUserMessage(ws, parsed.content, parsed.branchId);
  break;
case 'activate_branch':
  await this.handleActivateBranch(ws, parsed.branchId);
  break;
case 'close_branch':
  await this.handleCloseBranch(ws, parsed.branchId);
  break;
```

**Step 2: Update `handleUserMessage()` to accept `branchId`**

```typescript
private async handleUserMessage(
  ws: ServerWebSocket<WebSocketSessionData>,
  content: string,
  branchId?: string
): Promise<void> {
  // ... existing validation ...
  const result = await data.engine.processUserMessage(content, branchId);
  await this.streamResponse(ws, result.response, branchId); // Tag chunks with branchId
}
```

**Step 3: Add `handleActivateBranch()`**

```typescript
private async handleActivateBranch(
  ws: ServerWebSocket<WebSocketSessionData>,
  branchId: string
): Promise<void> {
  const data = ws.data;
  if (!data.initialized || !data.engine) {
    this.sendError(ws, 'SESSION_NOT_ACTIVE', 'Session not initialized');
    return;
  }
  try {
    const openingMessage = await data.engine.activateBranch(branchId);
    await this.streamResponse(ws, openingMessage, branchId);
  } catch (error) {
    this.sendError(ws, 'SESSION_ENGINE_ERROR', error instanceof Error ? error.message : 'Failed to activate branch');
  }
}
```

**Step 4: Add `handleCloseBranch()`**

```typescript
private async handleCloseBranch(
  ws: ServerWebSocket<WebSocketSessionData>,
  branchId: string
): Promise<void> {
  const data = ws.data;
  if (!data.initialized || !data.engine) {
    this.sendError(ws, 'SESSION_NOT_ACTIVE', 'Session not initialized');
    return;
  }
  try {
    await data.engine.closeBranch(branchId);
    // Events emitted by engine are forwarded via event listener
  } catch (error) {
    this.sendError(ws, 'SESSION_ENGINE_ERROR', error instanceof Error ? error.message : 'Failed to close branch');
  }
}
```

**Step 5: Remove old handlers**

Delete `handleEnterRabbithole()`, `handleExitRabbithole()`, `handleDeclineRabbithole()`.

**Step 6: Update `streamResponse()` to tag chunks with `branchId`**

```typescript
private async streamResponse(
  ws: ServerWebSocket<WebSocketSessionData>,
  fullText: string,
  branchId?: string
): Promise<void> {
  // ... existing chunking logic ...
  this.send(ws, { type: 'assistant_chunk', content: chunk, branchId });
  // ... at end ...
  this.send(ws, { type: 'assistant_complete', branchId });
}
```

**Step 7: Update event listener wiring**

Replace the rabbithole event forwarding (lines 363–385) with branch event forwarding:

```typescript
case 'branch_detected':
  this.send(ws, { type: 'branch_detected', branchId: d.branchId, topic: d.topic, parentBranchId: d.parentBranchId, depth: d.depth });
  break;
case 'branch_activated':
  this.send(ws, { type: 'branch_activated', branchId: d.branchId, topic: d.topic });
  break;
case 'branch_closed':
  this.send(ws, { type: 'branch_closed', branchId: d.branchId, summary: d.summary });
  break;
case 'branch_summary_injected':
  this.send(ws, { type: 'branch_summary_injected', branchId: d.branchId, summary: d.summary, branchPointMessageId: d.branchPointMessageId });
  break;
```

**Step 8: Update `server.ts` dependency wiring**

In `createWsDependencies()` (lines 425–456):
- Replace `RabbitholeEventRepository` import → `BranchRepository`
- Replace `RabbitholeDetector` import → `BranchDetector`
- Update construction: `rabbitholeDetector` → `branchDetector`, `rabbitholeRepo` → `branchRepo`

**Step 9: Update per-branch processing lock**

Replace the global `processingLock` (line 482–485) with per-branch locking:

```typescript
// Get or create lock for this branch (or trunk)
const lockKey = parsed.branchId ?? 'trunk';
const prev = data.branchLocks?.get(lockKey) ?? Promise.resolve();
let resolve!: () => void;
const lock = new Promise<void>((r) => (resolve = r));
data.branchLocks?.set(lockKey, lock);
await prev;
```

Add `branchLocks: Map<string, Promise<void>>` to `WebSocketSessionData` interface.

**Step 10: Commit**

```bash
git add src/api/
git commit -m "feat: WebSocket handler with multiplexed branch routing"
```

---

## Task 10: Frontend — WebSocket Hook Branch State Management

**Files:**
- Modify: `web/src/hooks/use-session-websocket.ts`

This replaces all rabbithole state with branch state management.

**Step 1: Replace rabbithole state variables (lines 345–379) with branch state**

Remove:
- `isInRabbithole`, `rabbitholeTopic`, `rabbitholePrompt`, `rabbitholeLabels`
- `rabbitholePromptRef`, `isInRabbitholeRef`
- All pending buffering refs (`pendingRef`, `pendingLabelsRef`)

Add:
```typescript
// Branch state
const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
const [branches, setBranches] = useState<Map<string, BranchState>>(new Map());

// Type for per-branch UI state
interface BranchState {
  branchId: string;
  topic: string;
  parentBranchId: string | null;
  depth: number;
  status: 'detected' | 'active' | 'closed';
  latestAssistantMessage: string;
  streamingContent: string;
  lastSentUserMessage: string | null;
  isWaitingForResponse: boolean;
  hasUnread: boolean;
  summary: string | null;
}
```

**Step 2: Replace rabbithole WS message handlers (lines 556–603)**

Remove handlers for `rabbithole_detected`, `rabbithole_entered`, `rabbithole_exited`.

Add:
```typescript
case 'branch_detected': {
  const { branchId, topic, parentBranchId, depth } = message;
  setBranches(prev => {
    const next = new Map(prev);
    next.set(branchId, {
      branchId, topic, parentBranchId: parentBranchId ?? null, depth,
      status: 'detected',
      latestAssistantMessage: '', streamingContent: '',
      lastSentUserMessage: null, isWaitingForResponse: false,
      hasUnread: true, summary: null,
    });
    return next;
  });
  break;
}

case 'branch_activated': {
  setBranches(prev => {
    const next = new Map(prev);
    const branch = next.get(message.branchId);
    if (branch) next.set(message.branchId, { ...branch, status: 'active' });
    return next;
  });
  break;
}

case 'assistant_chunk': {
  const targetBranchId = message.branchId ?? null;
  if (targetBranchId) {
    // Route to branch
    setBranches(prev => {
      const next = new Map(prev);
      const branch = next.get(targetBranchId);
      if (branch) {
        next.set(targetBranchId, {
          ...branch,
          streamingContent: branch.streamingContent + message.content,
          hasUnread: targetBranchId !== activeBranchIdRef.current,
        });
      }
      return next;
    });
  } else {
    // Route to trunk (existing logic)
    setStreamingContent(prev => prev + message.content);
  }
  break;
}

case 'assistant_complete': {
  const targetBranchId = message.branchId ?? null;
  if (targetBranchId) {
    setBranches(prev => {
      const next = new Map(prev);
      const branch = next.get(targetBranchId);
      if (branch) {
        next.set(targetBranchId, {
          ...branch,
          latestAssistantMessage: branch.streamingContent,
          streamingContent: '',
          isWaitingForResponse: false,
        });
      }
      return next;
    });
  } else {
    // Existing trunk logic
    setLatestAssistantMessage(streamingContentRef.current);
    setStreamingContent('');
  }
  break;
}

case 'branch_closed': {
  const { branchId, summary } = message;
  setBranches(prev => {
    const next = new Map(prev);
    next.delete(branchId); // Remove from active branches
    return next;
  });
  // Add summary to the branchSummaries list (like old rabbitholeLabels)
  setBranchSummaries(prev => [...prev, { branchId, summary, topic: prev_topic }]);
  if (activeBranchId === branchId) setActiveBranchId(null); // Switch back to trunk
  break;
}
```

**Step 3: Replace rabbithole action functions (lines 813–847)**

Remove `enterRabbithole`, `exitRabbithole`, `declineRabbithole`.

Add:
```typescript
const activateBranch = useCallback((branchId: string) => {
  setActiveBranchId(branchId);
  const branch = branchesRef.current.get(branchId);
  if (branch?.status === 'detected') {
    // First activation — tell server to create agent
    setBranches(prev => {
      const next = new Map(prev);
      const b = next.get(branchId);
      if (b) next.set(branchId, { ...b, isWaitingForResponse: true, hasUnread: false });
      return next;
    });
    sendMessage({ type: 'activate_branch', branchId });
  } else {
    // Already active — just switch view
    setBranches(prev => {
      const next = new Map(prev);
      const b = next.get(branchId);
      if (b) next.set(branchId, { ...b, hasUnread: false });
      return next;
    });
  }
}, [sendMessage]);

const closeBranch = useCallback((branchId: string) => {
  sendMessage({ type: 'close_branch', branchId });
}, [sendMessage]);

const switchToTrunk = useCallback(() => {
  setActiveBranchId(null);
}, []);
```

**Step 4: Update `sendUserMessage` to tag with branchId**

```typescript
const sendUserMessage = useCallback((content: string) => {
  const branchId = activeBranchIdRef.current;
  if (branchId) {
    setBranches(prev => {
      const next = new Map(prev);
      const branch = next.get(branchId);
      if (branch) next.set(branchId, { ...branch, lastSentUserMessage: content, isWaitingForResponse: true });
      return next;
    });
    sendMessage({ type: 'user_message', content, branchId });
  } else {
    // Existing trunk logic
    sendMessage({ type: 'user_message', content });
  }
}, [sendMessage]);
```

**Step 5: Update hook return type**

Replace rabbithole fields with:
```typescript
  activeBranchId: string | null;
  branches: Map<string, BranchState>;
  branchSummaries: Array<{ branchId: string; summary: string; topic: string }>;
  activateBranch: (branchId: string) => void;
  closeBranch: (branchId: string) => void;
  switchToTrunk: () => void;
```

**Step 6: Commit**

```bash
git add web/src/hooks/use-session-websocket.ts
git commit -m "feat: WebSocket hook with multi-branch state management"
```

---

## Task 11: Frontend — `BranchTabBar` and `BranchTab` Components

**Files:**
- Create: `web/src/components/live-session/BranchTabBar.tsx`
- Create: `web/src/components/live-session/BranchTab.tsx`

**Step 1: Create `BranchTab` component**

```typescript
// web/src/components/live-session/BranchTab.tsx

import type { HTMLAttributes } from 'react';

export interface BranchTabProps extends HTMLAttributes<HTMLButtonElement> {
  branchId: string;
  topic: string;
  isActive: boolean;
  hasUnread: boolean;
  depth: number;
  onActivate: (branchId: string) => void;
  onClose: (branchId: string) => void;
}

export function BranchTab({
  branchId,
  topic,
  isActive,
  hasUnread,
  depth,
  onActivate,
  onClose,
  className = '',
  ...props
}: BranchTabProps) {
  // Indent nested branches: depth 1 = no indent, depth 2 = 8px, etc.
  const indent = (depth - 1) * 8;

  return (
    <button
      onClick={() => onActivate(branchId)}
      className={`
        group relative w-full text-left px-3 py-2 text-xs rounded-l-lg
        transition-all duration-200 border-r-2
        ${isActive
          ? 'bg-slate-800 border-clarity-400 text-white'
          : 'bg-transparent border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
        }
        ${className}
      `}
      style={{ paddingLeft: `${12 + indent}px` }}
      title={topic}
      {...props}
    >
      {/* Unread dot */}
      {hasUnread && !isActive && (
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-clarity-400" />
      )}

      {/* Topic label — truncated */}
      <span className="block truncate max-w-[80px]">{topic}</span>

      {/* Close button — visible on hover */}
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); onClose(branchId); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onClose(branchId); } }}
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-white transition-opacity text-xs"
        aria-label={`Close branch: ${topic}`}
      >
        ×
      </span>
    </button>
  );
}
```

**Step 2: Create `BranchTabBar` component**

```typescript
// web/src/components/live-session/BranchTabBar.tsx

import { useEffect, useRef, type HTMLAttributes } from 'react';
import { BranchTab } from './BranchTab';

export interface BranchInfo {
  branchId: string;
  topic: string;
  parentBranchId: string | null;
  depth: number;
  status: 'detected' | 'active' | 'closed';
  hasUnread: boolean;
}

export interface BranchTabBarProps extends HTMLAttributes<HTMLDivElement> {
  branches: BranchInfo[];
  activeBranchId: string | null;
  onActivateBranch: (branchId: string) => void;
  onCloseBranch: (branchId: string) => void;
  onSwitchToTrunk: () => void;
}

export function BranchTabBar({
  branches,
  activeBranchId,
  onActivateBranch,
  onCloseBranch,
  onSwitchToTrunk,
  className = '',
  ...props
}: BranchTabBarProps) {
  const newTabRef = useRef<string | null>(null);

  // Detect new branches for entrance animation
  useEffect(() => {
    if (branches.length > 0) {
      const newest = branches[branches.length - 1];
      if (newest.status === 'detected' && newest.branchId !== newTabRef.current) {
        newTabRef.current = newest.branchId;
        // The CSS animation handles the slide-in
      }
    }
  }, [branches]);

  if (branches.length === 0) return null;

  return (
    <div
      className={`flex flex-col w-24 border-l border-slate-700 bg-slate-950/50 py-2 gap-1 overflow-y-auto ${className}`}
      role="tablist"
      aria-label="Session branches"
      {...props}
    >
      {/* Trunk tab — always first */}
      <button
        onClick={onSwitchToTrunk}
        className={`
          px-3 py-2 text-xs rounded-l-lg transition-all duration-200 border-r-2 text-left
          ${activeBranchId === null
            ? 'bg-slate-800 border-clarity-400 text-white font-medium'
            : 'bg-transparent border-transparent text-slate-400 hover:bg-slate-800/50'
          }
        `}
        role="tab"
        aria-selected={activeBranchId === null}
      >
        Session
      </button>

      {/* Branch tabs */}
      {branches.map((branch) => (
        <BranchTab
          key={branch.branchId}
          branchId={branch.branchId}
          topic={branch.topic}
          isActive={activeBranchId === branch.branchId}
          hasUnread={branch.hasUnread}
          depth={branch.depth}
          onActivate={onActivateBranch}
          onClose={onCloseBranch}
          role="tab"
          aria-selected={activeBranchId === branch.branchId}
          className={branch.branchId === newTabRef.current ? 'animate-slide-in-right' : ''}
        />
      ))}
    </div>
  );
}
```

**Step 3: Add `animate-slide-in-right` to Tailwind config**

In `web/tailwind.config.js`, add under `animation`:
```javascript
'slide-in-right': 'slideInRight 300ms ease-out',
```
And under `keyframes`:
```javascript
slideInRight: {
  '0%': { transform: 'translateX(100%)', opacity: '0' },
  '100%': { transform: 'translateX(0)', opacity: '1' },
},
```

**Step 4: Commit**

```bash
git add web/src/components/live-session/BranchTab.tsx web/src/components/live-session/BranchTabBar.tsx web/tailwind.config.js
git commit -m "feat: BranchTabBar and BranchTab components for right-edge tab navigation"
```

---

## Task 12: SessionContainer — Wire Up Tab UI, Remove Emerald Theme

**Files:**
- Modify: `web/src/components/live-session/SessionContainer.tsx`
- Modify: `web/src/components/live-session/SingleExchangeView.tsx`
- Modify: `web/src/components/live-session/VoiceInput.tsx`
- Modify: `web/src/components/live-session/SessionProgress.tsx`
- Delete: `web/src/components/live-session/RabbitholePrompt.tsx`
- Delete: `web/src/components/live-session/RabbitholeIndicator.tsx`
- Modify: `web/src/components/live-session/index.ts`

**Step 1: Update SessionContainer**

Remove imports for `RabbitholePrompt`, `RabbitholeIndicator`.
Add import for `BranchTabBar`.

Replace destructured hook values (lines 332–339):
```typescript
    // Branch state
    activeBranchId,
    branches,
    branchSummaries,
    activateBranch,
    closeBranch,
    switchToTrunk,
```

Remove ALL `isInRabbithole` conditional classes from the JSX:
- Line 375: Remove `isInRabbithole ? 'bg-[#0b100e]' : ''`
- Lines 377–379: Remove emerald header styling
- Lines 382–384: Remove emerald logo badge
- Line 389: Remove emerald status text
- Line 414–415: Remove emerald progress wrapper
- Lines 428–435: Remove `RabbitholeIndicator` JSX block
- Lines 474–481: Remove `RabbitholePrompt` JSX block
- Line 484: Remove emerald border styling
- Lines 491, 501: Remove `isInRabbithole` props from `SessionControls` and `VoiceInput`

Add tab bar to layout — wrap the main content in a flex container:

```tsx
<div className="flex flex-1 overflow-hidden">
  {/* Main content area */}
  <div className="flex-1 flex flex-col overflow-y-auto">
    {/* Existing SingleExchangeView, VoiceInput, etc. */}
    {/* But now render either trunk or active branch content */}
    {activeBranchId ? (
      <SingleExchangeView
        latestAssistantMessage={branches.get(activeBranchId)?.latestAssistantMessage ?? ''}
        streamingContent={branches.get(activeBranchId)?.streamingContent ?? ''}
        lastSentUserMessage={branches.get(activeBranchId)?.lastSentUserMessage ?? null}
        isWaitingForResponse={branches.get(activeBranchId)?.isWaitingForResponse ?? false}
      />
    ) : (
      <SingleExchangeView
        latestAssistantMessage={latestAssistantMessage}
        streamingContent={streamingContent}
        lastSentUserMessage={lastSentUserMessage}
        isWaitingForResponse={isWaitingForResponse}
      />
    )}
  </div>

  {/* Right-edge tab bar — only shown when branches exist */}
  <BranchTabBar
    branches={Array.from(branches.values()).map(b => ({
      branchId: b.branchId,
      topic: b.topic,
      parentBranchId: b.parentBranchId,
      depth: b.depth,
      status: b.status,
      hasUnread: b.hasUnread,
    }))}
    activeBranchId={activeBranchId}
    onActivateBranch={activateBranch}
    onCloseBranch={closeBranch}
    onSwitchToTrunk={switchToTrunk}
  />
</div>
```

Update `SessionProgress` props — replace `rabbitholeLabels` with `branchSummaries`:
```tsx
<SessionProgress
  recalledCount={recalledCount}
  totalPoints={totalPoints}
  recalledLabels={recalledLabels}
  branchSummaries={branchSummaries}
  elapsedSeconds={elapsedSeconds}
  isMuted={isMuted}
  onToggleMute={() => setIsMuted(prev => !prev)}
/>
```

**Step 2: Clean up SingleExchangeView**

Remove `isInRabbithole` prop (lines 67–68, 94).
Remove `labelColor`/`dotColor` conditional (lines 100–101) — always use clarity colors:
```typescript
const labelColor = 'text-clarity-400';
const dotColor = 'bg-clarity-400';
```

**Step 3: Clean up VoiceInput**

Remove `isInRabbithole` prop (lines 36–37, 92).
Remove emerald accent conditionals (lines 98–100) — always use clarity colors:
```typescript
const accentBg = 'bg-clarity-600';
const accentHover = 'hover:bg-clarity-500';
const accentRing = 'focus:ring-clarity-500';
```
Remove all other `isInRabbithole` ternaries.

**Step 4: Clean up SessionProgress**

Remove `isInRabbithole` prop (line 38).
Remove slide-up animation (lines 315–321) — the progress bar always shows now.
Rename `RabbitholeLabels` sub-component (lines 162–177) → `BranchSummaryPills`:
```typescript
function BranchSummaryPills({ summaries }: { summaries: Array<{ topic: string; summary: string }> }) {
  if (summaries.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {summaries.map((s, i) => (
        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-slate-700/50 text-slate-300 border border-slate-600/30 rounded-full" title={s.summary}>
          {s.topic}
        </span>
      ))}
    </div>
  );
}
```

Replace prop `rabbitholeLabels: string[]` with `branchSummaries: Array<{ topic: string; summary: string }>`.

**Step 5: Delete old components**

```bash
rm web/src/components/live-session/RabbitholePrompt.tsx
rm web/src/components/live-session/RabbitholeIndicator.tsx
```

**Step 6: Update `live-session/index.ts`**

Remove `RabbitholePrompt` and `RabbitholeIndicator` exports (lines 60–65).
Add:
```typescript
export { BranchTabBar } from './BranchTabBar';
export { BranchTab } from './BranchTab';
```

**Step 7: Commit**

```bash
git add web/src/components/live-session/ web/src/components/live-session/index.ts
git commit -m "feat: tab-based branch UI, remove emerald theme switching"
```

---

## Task 13: Frontend Types and Session Replay

**Files:**
- Modify: `web/src/types/api.ts` (lines 448–480)
- Modify: `web/src/components/session-replay/RabbitholeMarker.tsx` → rename to `BranchMarker.tsx`
- Modify: `web/src/components/session-replay/index.ts`
- Modify: `web/src/pages/SessionReplay.tsx`
- Modify: `src/api/routes/sessions.ts` (transcript endpoint)

**Step 1: Update API types**

In `web/src/types/api.ts`, rename `RabbitholeMarker` → `BranchMarker`:
```typescript
export interface BranchMarker {
  branchId: string;
  topic: string;
  depth: number;
  status: 'closed' | 'abandoned';
  summary: string | null;
}
```

Update `TranscriptMessage`:
```typescript
  branchMarker?: BranchMarker | null;
```

Update `SessionDetail`:
```typescript
  branchCount: number;
```

**Step 2: Rename and update RabbitholeMarker component**

Rename file to `BranchMarker.tsx`. Update to show branch summary with expandable conversation:

```typescript
export function BranchMarker({ topic, depth, summary, status }: BranchMarkerProps) {
  return (
    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm border bg-slate-700/30 border-slate-600/30 text-slate-300">
      <span className="flex-shrink-0" aria-hidden="true">↳</span>
      <span className="font-medium">Branch:</span>
      <span className="truncate max-w-[200px]" title={topic}>{topic}</span>
      {summary && <span className="text-slate-400 text-xs truncate max-w-[200px]">— {summary}</span>}
      {depth > 1 && <span className="px-1.5 py-0.5 text-xs rounded bg-slate-600/30 text-slate-400">L{depth}</span>}
    </div>
  );
}
```

**Step 3: Update session replay exports and page**

Update `session-replay/index.ts`:
```typescript
export { BranchMarker } from './BranchMarker';
```

Update `SessionReplay.tsx` to use `BranchMarker` instead of `RabbitholeMarker`.

**Step 4: Update transcript API route**

In `src/api/routes/sessions.ts`, update the transcript endpoint to use `branches` table instead of `rabbitholeEvents` for markers.

**Step 5: Commit**

```bash
git add web/src/types/ web/src/components/session-replay/ web/src/pages/ src/api/routes/
git commit -m "feat: BranchMarker for session replay, update API types"
```

---

## Task 14: Metrics and Analytics Updates

**Files:**
- Modify: `src/core/session/metrics-collector.ts`
- Modify: `src/core/analytics/analytics-calculator.ts`
- Modify: `src/core/analytics/types.ts`
- Modify: `src/core/export/export-service.ts`
- Modify: `src/core/export/types.ts`

**Step 1: Update `MetricsCollector`**

Replace all `rabbithole` references with `branch` equivalents:
- `recordRabbithole()` → `recordBranch()`
- `updateRabbitholeReturn()` → `updateBranchClosure()`
- Internal tracking maps renamed

**Step 2: Update analytics calculator**

Replace `rabbitholeCount` with `branchCount` in calculations.
The engagement score formula (40% recall, 25% response time, 20% rabbithole management, 15% completion) stays the same conceptually — "rabbithole management" becomes "branch management."

**Step 3: Update export service**

Replace `includeRabbitholes` option with `includeBranches`.
Update export format to use branch data from new table.

**Step 4: Run type check**

```bash
bunx tsc --noEmit 2>&1 | head -50
```

**Step 5: Commit**

```bash
git add src/core/session/metrics-collector.ts src/core/analytics/ src/core/export/
git commit -m "feat: update metrics, analytics, and export for branch model"
```

---

## Task 15: Update Server Wiring and Remaining References

**Files:**
- Modify: `src/api/server.ts`
- Modify: `src/api/routes/sessions.ts`
- Modify: `src/api/routes/dashboard.ts`
- Modify: `src/cli/commands/replay.ts`
- Modify: `src/cli/commands/stats.ts`
- Modify: `src/cli/commands/export.ts`

**Step 1: Update all remaining `rabbithole` references**

Search comprehensively:
```bash
grep -r "rabbithole\|Rabbithole\|RABBITHOLE" src/ --include="*.ts" -l
```

For each file found, rename references to branch equivalents.

**Step 2: Update API routes**

In `sessions.ts`:
- Transcript endpoint: query `branches` table instead of `rabbitholeEvents`
- Session detail: compute `branchCount` from `branches` table

In `dashboard.ts`:
- Replace any `rabbitholeCount` references

**Step 3: Update CLI commands**

`replay.ts`, `stats.ts`, `export.ts` — rename rabbithole references.

**Step 4: Full type check**

```bash
bunx tsc --noEmit
```

Fix any remaining errors. This is the "make it compile" step.

**Step 5: Commit**

```bash
git add src/
git commit -m "fix: rename all remaining rabbithole references to branch"
```

---

## Task 16: Update Tests

**Files:**
- Modify: `tests/setup.ts` (lines 29, 62, 129, 146)
- Modify: `tests/helpers.ts` (lines 258–260)
- Modify: `tests/integration/metrics-collection.test.ts` (lines 416–911)
- Modify: `tests/unit/llm-response-parsing.test.ts` (lines 20–24+)
- Modify: `tests/integration/export.test.ts`
- Modify: `tests/integration/session-api-flow.test.ts`
- Modify: `tests/integration/analytics.test.ts`
- Modify: `tests/integration/dashboard-data.test.ts`
- Modify: `tests/cli/cli-commands.test.ts`
- New: `tests/integration/branch-repository.test.ts` (from Task 3)
- New: `tests/unit/branch-agent.test.ts` (from Task 4)
- New: `tests/unit/context-builder.test.ts` (from Task 5)

**Step 1: Update test infrastructure**

In `tests/setup.ts`:
- Replace `RabbitholeEventRepository` → `BranchRepository`
- Update `TestRepositories` interface
- Update `createTestRepositories()`

In `tests/helpers.ts`:
- Update `createTestSessionMetrics()`: `rabbitholeCount` → `branchCount`, etc.

**Step 2: Update integration tests**

For each test file, do a find-replace of:
- `rabbithole` → `branch` (case-sensitive variants)
- `RabbitholeEventRepository` → `BranchRepository`
- `RabbitholeEvent` → `Branch`
- `rabbitholeCount` → `branchCount`
- Status values: `'returned'` → `'closed'` where appropriate

Pay special attention to `metrics-collection.test.ts` which has the most rabbithole-specific tests (lines 416–911). These tests for detection, return handling, concurrent tracking, and metrics integration all need renaming.

**Step 3: Update LLM response parsing tests**

In `llm-response-parsing.test.ts`, update function names:
- `parseRabbitholeDetectionResponse` → `parseBranchDetectionResponse`
- `parseRabbitholeReturnResponse` → `parseBranchReturnResponse`

**Step 4: Run full test suite**

```bash
bun test 2>&1 | grep -E "\(pass\)|\(fail\)|^\s+\d+ (pass|fail)|^Ran "
```

Fix any failures.

**Step 5: Commit**

```bash
git add tests/
git commit -m "test: update all tests for branch model (rename from rabbithole)"
```

---

## Task 17: Final Integration Verification

**Step 1: Full TypeScript check**

```bash
bunx tsc --noEmit
```
Must pass with zero errors.

**Step 2: Run full test suite**

```bash
bun test 2>&1 | grep -E "\(pass\)|\(fail\)|^\s+\d+ (pass|fail)|^Ran "
```
All tests must pass.

**Step 3: Search for any remaining `rabbithole` references**

```bash
grep -ri "rabbithole" src/ web/src/ tests/ --include="*.ts" --include="*.tsx" -l
```
Should return zero results (excluding docs/roadmap).

**Step 4: Build frontend**

```bash
cd web && bun run build
```
Must succeed.

**Step 5: Manual smoke test checklist**

- [ ] Start a session — connects via WebSocket, tutor asks opening question
- [ ] Chat with tutor — messages flow normally (trunk)
- [ ] Wait for branch detection — tab appears on right edge with slide animation
- [ ] Click branch tab — agent activates, opening message streams in
- [ ] Chat in branch — messages route to branch agent correctly
- [ ] Switch back to trunk — trunk state preserved, can continue chatting
- [ ] Close a branch — tab disappears, summary pill appears in progress area
- [ ] Verify recall evaluation works during branch conversations
- [ ] Verify session completion still works (all points recalled)
- [ ] Verify session pause/resume still works
- [ ] Check session replay — branch markers display correctly
- [ ] Check dashboard — branch metrics display correctly

**Step 6: Commit any final fixes**

```bash
git add -A
git commit -m "fix: final integration fixes for tree sessions and branch tabs"
```
