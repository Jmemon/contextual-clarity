# Cross-Task Issues — Shared Context for All Task Spec Fixes

This document is the coordination layer. Every task spec agent MUST read this before editing their task.
It documents codebase facts, cross-task dependencies, and conventions that ALL specs must respect.

---

## 1. AnthropicClient Is Stateful — Critical for T02, T03, T06, T09, T10

`src/llm/client.ts`:
- `systemPrompt` is a **private** instance field (line 56)
- Accessible only via `setSystemPrompt()` (line 114) and `getSystemPrompt()` (line 123)
- `complete()` (line 149) ALWAYS sends `system: this.systemPrompt` (line 168)
- `LLMConfig` (second param to `complete()`) has ONLY `model`, `maxTokens`, `temperature` — **NO `system` field**
- Default model is `'claude-sonnet-4-5-20250929'` (line 35)

**Rule**: Any new agent, processor, or evaluator that needs its own system prompt MUST create a dedicated `AnthropicClient` instance. There is NO per-call system prompt override. Sharing the session's client will corrupt prompts.

---

## 2. DAG Dependency Fixes Required

Two missing hard dependencies discovered by audit:

| New Dependency | Reason |
|---------------|--------|
| **T02 depends on T01** | T02's universal agent spec assumes `uncheckedPoints`/`currentProbePoint` params exist in `SocraticTutorPromptParams`, but T01 introduces those. Without dependency, T02 code won't compile. |
| **T12 depends on T03** | T12's `SingleExchangeView` imports `FormattedText` from `../shared/FormattedText`, which T03 creates. Without dependency, T12 won't compile. |

T02 must be moved from Group A to Group B. T12 must add T03 as an additional dependency.

---

## 3. Route Registration Pattern

Every route module exports a **factory function**, not a bare router instance.

```typescript
// CORRECT — factory function pattern (see recall-sets.ts, sessions.ts, dashboard.ts)
export function fooRoutes(): Hono {
  const router = new Hono();
  router.get('/:id', async (c) => { ... });
  return router;
}

// Mounted in createApiRouter() as:
router.route('/foo', fooRoutes());
```

**Affects**: T04, T10

---

## 4. API Response Format

All routes use the `success()` helper from `src/api/utils/response.ts`:

```typescript
import { success } from '../utils/response';
return success(c, data);  // returns { success: true, data: T }
```

Never return raw `c.json({ ... })` with custom shapes.

**Affects**: T04, T10

---

## 5. Repository Constructor Pattern

All repositories take `db: AppDatabase` as constructor arg:

```typescript
constructor(private readonly db: AppDatabase) {}

// Call site:
const repo = new FooRepository(db);
```

Never `new FooRepository()` with no args.

**Affects**: T04

---

## 6. Schema Index Pattern

Indexes go as the **third argument** to `sqliteTable()`, not as standalone exports:

```typescript
export const myTable = sqliteTable(
  'my_table',
  { ...columns... },
  (table) => [index('my_table_foo_idx').on(table.fooId)]
);
```

Standalone `index()` calls outside `sqliteTable()` will NOT create actual SQLite indexes.

**Affects**: T04

---

## 7. Schema Type Exports

Every table gets inferred type exports:

```typescript
export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;
```

**Affects**: T04, T08

---

## 8. Migration Workflow

```bash
bun run db:generate   # generates SQL migration file
bun run db:migrate    # applies via project's migration runner
```

Never `drizzle-kit push`. Never `bun drizzle-kit push`. The project uses `src/storage/migrate.ts`.

**Affects**: T04, T08

---

## 9. SessionStatus Type — Two Locations

If adding `'paused'`, BOTH must be updated:
- `src/core/models/session.ts` line 31: `export type SessionStatus = 'in_progress' | 'completed' | 'abandoned';`
- `src/storage/schema.ts` line 152: `status: text('status', { enum: ['in_progress', 'completed', 'abandoned'] })`

**Affects**: T08

---

## 10. EVALUATION_TRIGGER_PHRASES Ownership

- Defined at `src/core/session/types.ts` line 283
- Re-exported from `src/core/session/index.ts` line 63
- Used by `shouldTriggerEvaluation()` in `session-engine.ts` line 668-673

**T06 owns removing the trigger mechanism** (EVALUATION_TRIGGER_PHRASES, shouldTriggerEvaluation, trigger_eval, autoEvaluateAfter, maxMessagesPerPoint).
**T01 must NOT remove EVALUATION_TRIGGER_PHRASES** — it would break code that T06 hasn't touched yet.
**T13 removes the WS protocol types** (trigger_eval from ClientMessage, handleTriggerEval from handler).

---

## 11. end_session → leave_session Rename Chain

All must be updated atomically:
- `EndSessionPayload` in `src/api/ws/types.ts` line 83-85
- `'end_session'` in `CLIENT_MESSAGE_TYPES` array line 109-114
- `case 'end_session':` in `session-handler.ts` line 352-354
- `handleEndSession()` in `session-handler.ts` line 504
- `sendMessage({ type: 'end_session' })` in `use-session-websocket.ts` line 535
- `endSession` in `SessionContainer.tsx` and `SessionControls.tsx`
- TypeScript exhaustiveness check in `session-handler.ts` lines 360-361

**T08 owns the behavioral change** (end → leave/pause semantics).
**T13 owns the protocol type changes** (WS types, handler routing).

---

## 12. rabbithole_exited Payload — Canonical Shape

T09 and T13 must agree on a single payload shape. The canonical shape should be:

```typescript
export interface RabbitholeExitedPayload {
  type: 'rabbithole_exited';
  label: string;               // topic of the rabbithole that was exited
  pointsRecalledDuring: number; // recall points checked off while in rabbithole
  completionPending: boolean;   // whether all points are now recalled
}
```

**T09** defines the engine behavior and emits this event.
**T13** defines the WS protocol type.
**T11** consumes it in the frontend for progress display.

---

## 13. currentPointIndex → Checklist-Based Tracking

T01 replaces the linear index with a checklist Map. Downstream impacts:

| Old Field | New Field | Where |
|-----------|-----------|-------|
| `currentPointIndex: number` | `currentChecklistItem: RecallPoint \| null` | `ProcessMessageResult` |
| `currentPointIndex: number` | `recalledCount: number` | `PointTransitionPayload` / frontend hook |
| `targetPoints[currentPointIndex]` | `checklist.get(id)` | Engine internals |

**Tasks that must use `recalledCount` not `currentPointIndex`**: T11, T12, T13, and the frontend hook.

---

## 14. SessionEventType — Current and Target Values

**Current** (src/core/session/types.ts lines 51-58):
```
session_started | point_started | user_message | assistant_message | point_evaluated | point_completed | session_completed
```

**Target** (T13 defines the canonical set — 17 event types):
```
session_started | session_paused | session_complete_overlay | session_completed
recall_point_recalled | recall_point_near_miss
rabbithole_detected | rabbithole_entered | rabbithole_exited | rabbithole_declined
show_image | show_resource
user_message | assistant_message | assistant_streaming_start | assistant_streaming_end
point_transition (deprecated — kept for migration only)
```

Deprecated events being REMOVED: `point_started`, `point_evaluated`, `point_completed`.

---

## 15. setEventListener() Wiring Gap

- `SessionEngine.setEventListener()` exists at line 279 of session-engine.ts
- `SessionEngine.emitEvent()` exists at line 289 (private)
- **`session-handler.ts` NEVER calls `engine.setEventListener()`** — events go nowhere
- **T13 is responsible** for wiring this in `handleWebSocket()` after `engine.startSession()`

---

## 16. Private Methods on SessionEngine

These are `private` and cannot be called from outside the class:
- `completeSession()` — line 1091
- `resetState()` — line 1129
- `resumeSession()` — line 394
- `evaluateCurrentPoint()` — line 712

If T08 needs external access to completion/pause, it must either:
- Add new public methods that delegate to private ones
- Change visibility (less preferred)

---

## 17. saveMessage() Returns Promise<void>

`session-engine.ts` line 1049: `saveMessage()` returns `Promise<void>`, not a `SessionMessage`. Code that does `const msg = await this.saveMessage(...)` will get `undefined`.

**Affects**: T06

---

## 18. RecallEvaluation Has 3 Required Fields

```typescript
interface RecallEvaluation {
  success: boolean;
  confidence: number;
  reasoning: string;  // REQUIRED — cannot be omitted
}
```

Any code creating a `RecallEvaluation` must include `reasoning`.

**Affects**: T01 (recordRecallOutcome), T06

---

## 19. Pre-existing Server/Frontend Field Name Mismatches

| Server Field (ws/types.ts) | Frontend Field (use-session-websocket.ts) |
|---------------------------|------------------------------------------|
| `totalPointsReviewed` (line 218) | `pointsAttempted` (line 83) |
| `successfulRecalls` (line 219) | `pointsSuccessful` (line 85) |

T13 MUST reconcile these — pick one naming convention and update both sides.

---

## 20. RabbitholeDetectionResult — Actual Fields

```typescript
// src/llm/prompts/rabbithole-detector.ts lines 42-96
interface RabbitholeDetectionResult {
  isRabbithole: boolean;
  topic: string | null;
  depth: 1 | 2 | 3;
  relatedToCurrentPoint: boolean;
  relatedRecallPointIds: string[];
  confidence: number;
  reasoning: string;
}
```

**NO `label` field exists.** T09 must not add a `label` field — the `topic` field already serves this purpose.

---

## 21. RabbitholeDetector vs RabbitholeAgent

`src/core/analysis/rabbithole-detector.ts` already:
- Detects new rabbitholes via `detectRabbithole()` (line 227)
- Detects returns via `detectReturns()` (line 336)
- Maintains active state in `activeRabbitholes` Map (line 101)

T09's new `RabbitholeAgent` must be clearly differentiated — it handles the UX mode (prompting user, managing conversation within rabbithole), NOT detection. Detection stays in `RabbitholeDetector`.

---

## 22. Directories That Don't Exist Yet

| Directory | Created By | Needed By |
|-----------|-----------|-----------|
| `web/public/` | T11 | T11 (sound files) |
| `web/public/sounds/` | T11 | T11 |
| `web/src/components/shared/` | T03 | T03, T12 |
| `src/core/transcription/` | T03 | T03, T10 |
| `src/core/voice/` | T10 | T10 |

Specs must explicitly say "create this directory" if it doesn't exist.

---

## 23. tailwind.config.js (NOT .ts)

The file is `web/tailwind.config.js` (plain JavaScript with JSDoc type annotation), NOT `tailwind.config.ts`.

**Affects**: T12

---

## 24. Haiku Model ID

Current codebase only references `claude-3-haiku-20240307` and `claude-3-5-haiku-20241022`.
The correct current Haiku model ID is `claude-haiku-4-5-20251001`.
Any spec referencing Haiku must use this exact string.

**Affects**: T03, T10

---

## 25. Test Files That Reference Deprecated Concepts

| File | References | Broken By |
|------|-----------|-----------|
| `tests/integration/session-engine-comprehensive.test.ts` | `currentPointIndex` (5+), `point_started`/`point_completed` events | T01, T13 |
| `tests/integration/session-flow.test.ts` | `currentPointIndex` (3), `EVALUATION_TRIGGER_PHRASES`, `recallHistory` | T01, T06 |
| `tests/integration/session-engine-metrics.test.ts` | `autoEvaluateAfter`/`maxMessagesPerPoint` (20+) | T06 |
| `e2e/tests/07-live-session.spec.ts` | `getByText(/AI Tutor/i)` line 141 | T05 |

Tasks that break these tests MUST include the test files in their Relevant Files table and implementation steps.

---

## 26. Barrel Exports That Need Updating

- `src/core/session/index.ts` line 63: re-exports `EVALUATION_TRIGGER_PHRASES` — must be updated when T06 removes it
- `src/api/ws/index.ts` lines 87-102: exports `TriggerEvalPayload`, `EndSessionPayload`, `EvaluationResultPayload`, `PointTransitionPayload` — must be updated when T13 removes these

---

## 27. Frontend SessionState Type

`SessionContainer.tsx` line 32: `type SessionState = 'connecting' | 'active' | 'evaluating' | 'completed'`
No `'paused'` state. If T08 adds pause, this must be updated along with the state machine.

---

## 28. useSessionTimer Bug

`SessionContainer.tsx` lines 53-58: uses `useState` instead of `useEffect` for the interval timer.
The cleanup function returned by the `useState` initializer is silently ignored.
This is a pre-existing bug — T11 should fix it since it directly uses the timer output.

---

## 29. Seed File Actual Names (for T04)

The recall set names in the seed files are completely different from what was in the original T04 spec.
T04 MUST use the actual names from the seed files. The agent fixing T04 must read all seed files
to get the real names rather than guessing.

Confirmed actual names for the 2 original sets:
- `motivation-recall-set.ts`: name is `"motivation"` (all lowercase)
- `atp-recall-set.ts`: name is `"atp"` (all lowercase)

The 49 diverse sets are spread across `diverse-conceptual.ts`, `diverse-procedural.ts`, `diverse-creative.ts`, `diverse-remaining.ts`. All names differ from what was in the original spec.

---

## 30. session-engine.ts Hardcoded Congratulatory Prompts

These survive independently of any prompt builder changes:
- Line 934: `'The learner successfully recalled...'` (positive feedback)
- Line 938: `'The learner struggled...'` (encouraging feedback)
- Line 980: `'Provide a warm congratulatory message...'` (completion celebration)

**T07 (tone) must address these** — they directly undermine the tone overhaul if left unchanged.
The spec should make them required changes, not just warnings.

---

## 31. Correct File Paths

| Common Mistake | Correct Path |
|---------------|-------------|
| `src/session/session-engine.ts` | `src/core/session/session-engine.ts` |
| `src/llm/session-engine.ts` | `src/core/session/session-engine.ts` |
| `web/tailwind.config.ts` | `web/tailwind.config.js` |

---

## 32. Key Function Locations in session-engine.ts

| Function | Line | Visibility |
|----------|------|-----------|
| `processUserMessage()` | 529 | public |
| `getOpeningMessage()` | 466 | public |
| `advanceToNextPoint()` | 763 | private |
| `generateTransitionMessage()` | 928 | private |
| `generateCompletionMessage()` | 976 | private |
| `evaluateCurrentPoint()` | 712 | private |
| `shouldTriggerEvaluation()` | 667 | private |
| `completeSession()` | 1091 | private |
| `resetState()` | 1129 | private |
| `saveMessage()` | 1049 | private, returns void |
| `setEventListener()` | 279 | public |
| `emitEvent()` | 289 | private |
| `detectAndRecordRabbithole()` | 1161 | private |

---

## 33. key Types Location Reference

| Type | File | Line |
|------|------|------|
| `SessionEngineConfig` | `src/core/session/types.ts` | ~100 |
| `ProcessMessageResult` | `src/core/session/types.ts` | ~260 |
| `SessionEventType` | `src/core/session/types.ts` | 51 |
| `EVALUATION_TRIGGER_PHRASES` | `src/core/session/types.ts` | 283 |
| `DEFAULT_SESSION_CONFIG` | `src/core/session/types.ts` | ~145 |
| `ServerMessage` | `src/api/ws/types.ts` | 257 |
| `ClientMessage` | `src/api/ws/types.ts` | 100 |
| `CLIENT_MESSAGE_TYPES` | `src/api/ws/types.ts` | 109 |
| `PointTransitionPayload` | `src/api/ws/types.ts` | 185 |
| `SessionStartedPayload` | `src/api/ws/types.ts` | 127 |
| `RecallEvaluation` | `src/core/scoring/types.ts` | 46 |
| `LLMConfig` | `src/llm/types.ts` | 25 |
| `LLMResponse` | `src/llm/types.ts` | 77 |
| `SessionStatus` | `src/core/models/session.ts` | 31 |
| `RecallSet` | `src/core/models/recall-set.ts` | 50 |
| `RecallPoint` | `src/core/models/recall-point.ts` | 155 |
