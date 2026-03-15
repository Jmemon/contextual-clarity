# T06 — Continuous Evaluator with Feedback Field

| Field | Value |
|-------|-------|
| **name** | Continuous Evaluator with Feedback Field |
| **parallel-group** | B (wave 2) |
| **depends-on** | T01 (Per-Session Recall Point Checklist) |

---

## Description

Transform the recall evaluator from a single-point, trigger-based scorer into continuous middleware that runs after every user message. Instead of waiting for trigger phrases or message-count thresholds, the engine calls the existing `evaluate()` (or `evaluateEnhanced()`) method on each unchecked recall point after every user message. For each point where the user demonstrated recall, the engine marks it recalled via T01's checklist API, records the FSRS outcome, and produces a feedback string that gets injected into the tutor's LLM context. The user never sees the evaluator's output — it shapes the tutor's next response invisibly.

This task also removes the entire manual evaluation trigger mechanism: `EVALUATION_TRIGGER_PHRASES`, `shouldTriggerEvaluation()`, `autoEvaluateAfter`/`maxMessagesPerPoint` config options, and the "I've got it!" button. (Note: `trigger_eval` WS protocol type removal is owned by T13, not T06.)

---

## Detailed Implementation

### 1. Types — No New File Needed

`src/core/scoring/types.ts` already exists and contains `RecallEvaluation` (with `success`, `confidence`, `reasoning`) and `EnhancedRecallEvaluation`. **Do not create this file or add batch-evaluation types to it.**

The continuous evaluator does NOT use a new "batch" method. Instead, it iterates over unchecked points and calls the existing `evaluate()` or `evaluateEnhanced()` method for each one. The only new type needed is a lightweight result aggregation type, which lives in `session-engine.ts` as a local interface (not exported):

```typescript
/**
 * Aggregated result of evaluating all unchecked points against the latest user message.
 * Internal to session-engine.ts — not exported.
 */
interface ContinuousEvalResult {
  /** IDs of recall points the user demonstrated recall of in this message */
  recalledPointIds: string[];
  /** Confidence per recalled point (only entries for recalled points) */
  confidencePerPoint: Map<string, number>;
  /** Feedback string for the tutor describing what was recalled, what was imprecise, what remains */
  feedback: string;
}
```

### 2. Dedicated AnthropicClient for the Evaluator (Cross-Task Issue #1)

`AnthropicClient` is stateful — `systemPrompt` is a private field set via `setSystemPrompt()`, and `complete()` always sends `system: this.systemPrompt` (line 168 of `src/llm/client.ts`). If the evaluator shares the same `AnthropicClient` instance as the session engine's tutor, calling evaluation methods could corrupt the tutor's system prompt or vice versa.

**The evaluator MUST use its own dedicated `AnthropicClient` instance.** This is already the case in the current code — `SessionEngineDependencies` has separate `evaluator` and `llmClient` fields, and `RecallEvaluator` takes its own `AnthropicClient` in its constructor (line 103 of `recall-evaluator.ts`). **Verify that no code shares the same client instance between the evaluator and the tutor.** If they share an instance, create a separate one for the evaluator.

### 3. Continuous Evaluation Logic in `processUserMessage()` (`src/core/session/session-engine.ts`)

The existing `processUserMessage()` (line 529) must be surgically modified — not fully rewritten. Here are the specific changes:

**Remove these blocks from `processUserMessage()`:**
- Line 534: `this.currentPointMessageCount++;` — remove entirely
- Lines 538-540: Remove `messageCount: this.currentPointMessageCount` from the `user_message` event data
- Lines 547-554: Remove the `shouldEvaluate` check and the `if (shouldEvaluate) { return this.evaluateAndAdvance(); }` block
- Lines 557-564: Remove the `autoEvaluateAfter` threshold check block entirely

**Replace those removed blocks with the continuous evaluation flow.** After the `detectAndRecordRabbithole()` call (line 544), insert:

```typescript
// === Continuous evaluation: evaluate ALL unchecked points against this message ===
const evalResult = await this.evaluateUncheckedPoints();

// Process any recalled points
for (const pointId of evalResult.recalledPointIds) {
  // T01 provides markPointRecalled() and recordRecallOutcome()
  this.markPointRecalled(pointId);
  const confidence = evalResult.confidencePerPoint.get(pointId) ?? 0.5;
  await this.recordRecallOutcome(pointId, {
    success: true,
    confidence,
    reasoning: `Continuous evaluation detected recall with confidence ${confidence}`,
  });
}

// Check if all points are now recalled
if (this.allPointsRecalled()) {
  // TODO (T08): Emit session_complete_overlay event instead of completing immediately
  return this.handleSessionCompletion();
}
```

**Modify the `generateTutorResponse()` call** (currently at line 567). Change:
```typescript
const response = await this.generateTutorResponse();
```
To:
```typescript
const response = await this.generateTutorResponse(evalResult.feedback);
```

**Update the return value** (currently lines 573-579). Change from:
```typescript
return {
  response,
  completed: false,
  pointAdvanced: false,
  currentPointIndex: this.currentPointIndex,
  totalPoints: this.targetPoints.length,
};
```
To:
```typescript
return {
  response,
  completed: false,
  pointsRecalledThisTurn: evalResult.recalledPointIds,
  recalledCount: this.getRecalledCount(),  // from T01
  totalPoints: this.targetPoints.length,
};
```

### 4. New Private Method: `evaluateUncheckedPoints()` (`src/core/session/session-engine.ts`)

Add this new private method to `SessionEngine`. It iterates over unchecked points and calls the existing `evaluate()` or `evaluateEnhanced()` for each one, then aggregates results into a feedback string.

```typescript
/**
 * Evaluates all unchecked recall points against the current conversation.
 * Called on every user message. Uses the existing evaluate()/evaluateEnhanced()
 * methods on RecallEvaluator — no new evaluator API is needed.
 *
 * For each unchecked point, calls evaluate() with the point and current messages.
 * Aggregates results into a ContinuousEvalResult with recalled IDs, confidence
 * scores, and a feedback string for the tutor.
 *
 * Performance note: This calls evaluate() once per unchecked point. As points
 * are recalled, the number of calls decreases. The existing evaluator already
 * uses extractExcerpt() (line 134 of recall-evaluator.ts) to limit conversation
 * context to the last 10 messages, keeping token usage reasonable.
 */
private async evaluateUncheckedPoints(): Promise<ContinuousEvalResult> {
  const uncheckedPoints = this.getUncheckedPoints(); // from T01

  // Early return if nothing to evaluate
  if (uncheckedPoints.length === 0) {
    return { recalledPointIds: [], confidencePerPoint: new Map(), feedback: '' };
  }

  const recalledPointIds: string[] = [];
  const confidencePerPoint = new Map<string, number>();
  const feedbackParts: string[] = [];

  // Evaluate each unchecked point against the conversation
  // Uses existing evaluate() or evaluateEnhanced() — no new evaluator method needed
  for (const point of uncheckedPoints) {
    let evaluation: RecallEvaluation;

    if (this.metricsEnabled) {
      // Enhanced evaluation provides concept-level detail
      evaluation = await this.evaluator.evaluateEnhanced(
        point,
        this.messages,
        {
          attemptNumber: point.fsrsState?.reps ?? 1,
          previousSuccesses: point.fsrsState?.reps ?? 0,
          topic: this.currentRecallSet?.name ?? 'Unknown',
        }
      );
    } else {
      evaluation = await this.evaluator.evaluate(point, this.messages);
    }

    if (evaluation.success && evaluation.confidence >= 0.6) {
      recalledPointIds.push(point.id);
      confidencePerPoint.set(point.id, evaluation.confidence);
      feedbackParts.push(
        `Point "${point.content.substring(0, 60)}..." was recalled (confidence: ${evaluation.confidence.toFixed(2)}). ${evaluation.reasoning}`
      );
    } else if (evaluation.confidence >= 0.3) {
      // Near-miss: user was close but didn't fully demonstrate recall
      feedbackParts.push(
        `Near-miss on "${point.content.substring(0, 60)}...": ${evaluation.reasoning}`
      );
    }
  }

  // Build aggregated feedback string
  const remainingCount = uncheckedPoints.length - recalledPointIds.length;
  if (recalledPointIds.length === 0) {
    feedbackParts.push(`No recall points were demonstrated in this message. ${remainingCount} points remain unchecked.`);
  } else {
    feedbackParts.push(`${remainingCount} points remain unchecked.`);
  }

  return {
    recalledPointIds,
    confidencePerPoint,
    feedback: feedbackParts.join(' '),
  };
}
```

**Important**: The `extractExcerpt()` method on `RecallEvaluator` is **private** (line 134). The `evaluateUncheckedPoints()` method does NOT call `extractExcerpt()` directly — it passes the full `this.messages` array to `evaluate()` or `evaluateEnhanced()`, which internally call `extractExcerpt()` to limit context to the last 10 messages.

### 5. Feedback Injection into Tutor Response (`src/core/session/session-engine.ts`)

Modify the existing `generateTutorResponse()` method (line 890) to accept an optional feedback parameter. The feedback is injected as an additional message in the LLM conversation context, NOT saved to the persistent conversation history.

**Current signature** (line 890):
```typescript
private async generateTutorResponse(): Promise<string> {
```

**New signature:**
```typescript
private async generateTutorResponse(evaluatorFeedback?: string): Promise<string> {
```

**Concrete mechanism**: The feedback is prepended as an additional `assistant`-role message at the beginning of the `conversationHistory` array passed to `this.llmClient.complete()`. This message is ephemeral — it exists only in the LLM call, not in `this.messages` or the database.

**Specific change inside `generateTutorResponse()`** — after line 892 (`const conversationHistory = this.buildConversationHistory();`), insert:

```typescript
// Inject evaluator feedback as an ephemeral context note at the start of the conversation.
// This shapes the tutor's response without being visible to the user or saved to the DB.
// Uses 'assistant' role to avoid issues with the Anthropic API's system prompt handling
// (the system prompt is already set on the AnthropicClient instance via setSystemPrompt()).
if (evaluatorFeedback && evaluatorFeedback.trim().length > 0) {
  conversationHistory.unshift({
    role: 'assistant',
    content: `[Internal observation — do not reference or quote directly to the user]: ${evaluatorFeedback}`,
  });
}
```

**Why `assistant` role, not `system` role?** The `AnthropicClient.complete()` method already sends `system: this.systemPrompt` (line 168 of client.ts). The `LLMMessage` type only supports `'user' | 'assistant'` roles — there is no per-message `system` role in the Anthropic messages API. The feedback is therefore injected as a synthetic `assistant` message at the start of the conversation history that the model will treat as prior context.

**Why not modify `this.messages`?** The feedback must NOT be saved to `this.messages` (the persistent session message list). It is generated fresh each turn and is only meaningful for the current LLM call. Saving it would pollute future evaluation context and conversation history.

### 6. Update `ProcessMessageResult` (`src/core/session/types.ts`)

Modify `ProcessMessageResult` (line 259) to replace the old fields with the new continuous evaluation shape:

**Remove these fields:**
- `pointAdvanced: boolean` — no longer applicable (points are recalled, not "advanced to")
- `currentPointIndex: number` — replaced by T01's checklist-based tracking

**Add these fields:**
```typescript
/** IDs of recall points the user demonstrated recall of in this message (may be empty) */
pointsRecalledThisTurn: string[];

/** Total number of points recalled so far across the session */
recalledCount: number;
```

**Updated interface:**
```typescript
export interface ProcessMessageResult {
  /** The AI tutor's response to display */
  response: string;
  /** Whether the session has completed (all points recalled) */
  completed: boolean;
  /** IDs of recall points the user demonstrated recall of in this message */
  pointsRecalledThisTurn: string[];
  /** Total number of points recalled so far */
  recalledCount: number;
  /** Total number of recall points in the session */
  totalPoints: number;
}
```

### 7. Kill List — Removals Owned by T06

**`src/core/session/types.ts`:**
- Remove `EVALUATION_TRIGGER_PHRASES` constant (line 283+). This array of trigger strings is no longer needed.
- Remove `autoEvaluateAfter` from `SessionEngineConfig` (line 123). Remove its JSDoc.
- Remove `maxMessagesPerPoint` from `SessionEngineConfig` (line 113). Remove its JSDoc.
- Update `DEFAULT_SESSION_CONFIG` (line 150) to remove `maxMessagesPerPoint: 10` and `autoEvaluateAfter: 6`.

**`src/core/session/index.ts`:**
- Remove `EVALUATION_TRIGGER_PHRASES` from the re-export at line 63. The updated export block should be:
  ```typescript
  export { DEFAULT_SESSION_CONFIG } from './types';
  ```

**`src/core/session/session-engine.ts`:**
- Remove `shouldTriggerEvaluation()` method (line 667-673). This checked message content against `EVALUATION_TRIGGER_PHRASES`.
- Remove `evaluateCurrentPoint()` method (line 712-749). Its role is replaced by `evaluateUncheckedPoints()`.
- Remove `evaluateAndAdvance()` method (line 686-699). Its role is replaced by the inline logic in `processUserMessage()`.
- Remove `triggerEvaluation()` public method (line 599-602). There is no more manual trigger.
- Remove the `currentPointMessageCount` property and any logic that increments it.
- Remove any references to `config.autoEvaluateAfter` or `config.maxMessagesPerPoint`.
- The `advanceToNextPoint()` method (line 763) should be reviewed. If T01's `markPointRecalled()` + `recordRecallOutcome()` fully replace its functionality (FSRS update, history recording, point advancement), remove it. If it still has unique logic (e.g., generating transition messages), retain the relevant parts and refactor into the continuous flow.

**`web/src/components/live-session/SessionControls.tsx`:**
- Remove the "I've got it!" button entirely. This button called `onTriggerEvaluation` which sent `trigger_eval`.
- Remove the `onTriggerEvaluation` prop.
- (Note: T13 also touches this file for other WS protocol removals. If T13 handles this removal, add a comment noting the overlap and ensure only one task actually does it.)

**`web/src/hooks/use-session-websocket.ts`:**
- Remove `triggerEvaluation` from the returned hook object. This function sent the `trigger_eval` WebSocket message.

**`web/src/components/live-session/SessionContainer.tsx`:**
- Remove any state or callbacks related to `triggerEvaluation` or `onTriggerEvaluation`.
- Remove any imports of evaluation-related types that are now deleted.

**T06 does NOT own these removals (they belong to T13):**
- `trigger_eval` from `ClientMessage` union type in `src/api/ws/types.ts`
- `TriggerEvalPayload` from `src/api/ws/types.ts`
- `handleTriggerEval()` from `session-handler.ts`
- `case 'trigger_eval':` branch in `session-handler.ts`

### 8. Performance Considerations

The continuous evaluator calls `evaluate()` (or `evaluateEnhanced()`) once per unchecked point on every user message. This means:

- **Early in session (many unchecked points):** Multiple LLM calls per user message. Each call already uses the evaluator's configured model and `EVALUATION_TEMPERATURE` (0.3) and `EVALUATION_MAX_TOKENS` (512), as defined at the top of `recall-evaluator.ts` (lines 59, 66).
- **Late in session (few unchecked points):** Fewer calls, eventually zero when all points are recalled.
- **Conversation excerpt:** The existing `extractExcerpt()` (line 134 of `recall-evaluator.ts`) already limits context to `DEFAULT_EXCERPT_SIZE` (10 messages, line 52). This keeps token usage bounded.

**Optimization option (not required for initial implementation):** If the number of unchecked points is large (e.g., >5), consider calling `evaluate()` only on points whose content has keyword overlap with the user's latest message. This is a future optimization — the initial implementation should evaluate all unchecked points for correctness.

**Model choice:** The existing evaluator uses whatever model the `AnthropicClient` instance was configured with. If cost/latency of running evaluation on every message is a concern, the evaluator's client can be configured with Haiku (`claude-haiku-4-5-20251001`) instead of Sonnet. This is a configuration decision made when constructing `SessionEngineDependencies`, not a code change in `RecallEvaluator` itself.

### 9. No Deprecation of Existing Methods

The existing `evaluate()` and `evaluateEnhanced()` methods on `RecallEvaluator` are NOT deprecated. They are the primary API used by the continuous evaluation flow. Do not mark them as deprecated. Do not add any new methods to `RecallEvaluator`.

### 10. Using Existing Prompt Functions

The continuous evaluator uses the existing prompt functions — no new prompt functions are needed:
- `buildRecallEvaluatorPrompt(recallPointContent, conversationExcerpt)` — used by `evaluate()`
- `buildEnhancedRecallEvaluatorPrompt(recallPointContent, conversationExcerpt, context)` — used by `evaluateEnhanced()`
- `parseRecallEvaluationResponse(response)` — used by `evaluate()`
- `parseEnhancedRecallEvaluationResponse(response)` — used by `evaluateEnhanced()`
- `deriveRatingFromConfidence(confidence)` — available for rating derivation

Do NOT add `buildBatchEvaluatorPrompt()` or `parseBatchEvaluationResponse()`. These do not exist and are not needed.

---

## Relevant Files

| Action | File | What Changes |
|--------|------|-------------|
| MODIFY | `src/core/session/session-engine.ts` | Modify `processUserMessage()` to remove trigger-based evaluation and add continuous evaluation loop; add `evaluateUncheckedPoints()` private method; modify `generateTutorResponse()` to accept feedback parameter; remove `shouldTriggerEvaluation()`, `evaluateCurrentPoint()`, `evaluateAndAdvance()`, `triggerEvaluation()`, `currentPointMessageCount`; refactor or remove `advanceToNextPoint()` |
| MODIFY | `src/core/session/types.ts` | Remove `EVALUATION_TRIGGER_PHRASES`, remove `autoEvaluateAfter` and `maxMessagesPerPoint` from `SessionEngineConfig` and `DEFAULT_SESSION_CONFIG`, update `ProcessMessageResult` to use `pointsRecalledThisTurn`/`recalledCount` instead of `pointAdvanced`/`currentPointIndex` |
| MODIFY | `src/core/session/index.ts` | Remove `EVALUATION_TRIGGER_PHRASES` from re-exports (line 63) |
| READ | `src/core/scoring/recall-evaluator.ts` | No changes needed — existing `evaluate()` and `evaluateEnhanced()` are used as-is |
| READ | `src/core/scoring/types.ts` | No changes needed — `RecallEvaluation` and `EnhancedRecallEvaluation` already exist |
| READ | `src/llm/prompts/recall-evaluator.ts` | No changes needed — existing prompt functions are used as-is |
| MODIFY | `web/src/hooks/use-session-websocket.ts` | Remove `triggerEvaluation` from returned object |
| MODIFY | `web/src/components/live-session/SessionControls.tsx` | Remove "I've got it!" button and `onTriggerEvaluation` prop (coordinate with T13 if it also removes this) |
| MODIFY | `web/src/components/live-session/SessionContainer.tsx` | Remove evaluation-related state, callbacks, and imports |
| MODIFY | `tests/integration/session-engine-metrics.test.ts` | Update 25+ references to `autoEvaluateAfter`/`maxMessagesPerPoint` in test configs and assertions. Tests that configure these options must be updated to remove them. Tests that assert on trigger-based evaluation behavior must be rewritten for continuous evaluation. |
| MODIFY | `tests/integration/session-flow.test.ts` | Update reference to `EVALUATION_TRIGGER_PHRASES`. Tests that rely on trigger phrase matching must be rewritten for continuous evaluation. |

---

## Success Criteria

1. **Continuous evaluation**: Every call to `processUserMessage()` runs `evaluateUncheckedPoints()` against all unchecked points. No message is processed without evaluation.
2. **Multi-point recall**: If a user recalls 3 points in a single message, all 3 are detected, checked off, and reported in `pointsRecalledThisTurn`. The evaluator iterates all unchecked points, not just one.
3. **Zero recall**: If a user's message doesn't demonstrate recall of any point, `recalledPointIds` is empty, no points are checked off, and the feedback string notes this.
4. **Feedback injection**: The evaluator feedback string is passed to `generateTutorResponse()` and prepended to the conversation history as an ephemeral `assistant`-role message. The user never sees the raw feedback. The tutor's response is shaped by it.
5. **Feedback is NOT persisted**: The feedback message exists only in the LLM call's message array. It is NOT added to `this.messages`, NOT saved via `saveMessage()`, and NOT stored in the database.
6. **EVALUATION_TRIGGER_PHRASES removed**: The constant is deleted from `types.ts` and its re-export from `index.ts`. No references exist anywhere in the codebase. `grep -r "EVALUATION_TRIGGER_PHRASES"` returns nothing (except task files/docs).
7. **"I've got it!" button removed**: The button is completely removed from `SessionControls.tsx`. The `onTriggerEvaluation` prop is removed. No UI element triggers manual evaluation.
8. **Config options removed**: `autoEvaluateAfter` and `maxMessagesPerPoint` are removed from `SessionEngineConfig` and `DEFAULT_SESSION_CONFIG`. No code references them.
9. **`shouldTriggerEvaluation()` removed**: The private method is deleted from `session-engine.ts`. No code calls it.
10. **Uses existing evaluator API**: The implementation calls `evaluate()` and/or `evaluateEnhanced()` on the existing `RecallEvaluator` class. No `evaluateBatch()` method exists or is added.
11. **Uses existing prompt functions**: The implementation relies on `buildRecallEvaluatorPrompt`, `buildEnhancedRecallEvaluatorPrompt`, and their parsers. No new prompt functions are added.
12. **`saveMessage()` return value not used**: No code does `const msg = await this.saveMessage(...)` — the method returns `Promise<void>`.
13. **Separate AnthropicClient instances**: The evaluator and the tutor use separate `AnthropicClient` instances so system prompts don't interfere with each other.
14. **`extractExcerpt` is correct name**: All references use `extractExcerpt` (the actual private method name at line 134 of `recall-evaluator.ts`), not `extractConversationExcerpt`.
15. **Parse failure resilience**: If the LLM returns malformed JSON, the existing `parseRecallEvaluationResponse()` / `parseEnhancedRecallEvaluationResponse()` handle it gracefully with default failure results. No session crash.
16. **FSRS updates**: For each recalled point, `recordRecallOutcome()` (from T01) is called with `success: true`, the confidence from the evaluator, and the reasoning. All three fields of `RecallEvaluation` are provided (success, confidence, reasoning — per cross-task issue #18).
17. **No user-visible evaluation machinery**: The user sees only the tutor's natural conversational responses. No evaluation scores, no "you recalled X correctly" messages from the system. All evaluation is invisible middleware.
18. **Test files updated**: `tests/integration/session-engine-metrics.test.ts` (25 references to removed config options) and `tests/integration/session-flow.test.ts` (EVALUATION_TRIGGER_PHRASES reference) are updated to work with the new continuous evaluation flow.
19. **T06 does NOT remove WS protocol types**: `trigger_eval` in `ClientMessage`, `TriggerEvalPayload`, `handleTriggerEval()`, and the `case 'trigger_eval':` branch in `session-handler.ts` are owned by T13.

---

## Implementation Warnings

> **WARNING: `AnthropicClient` is stateful (Cross-Task Issue #1)**
> `systemPrompt` is a private instance field. `complete()` always sends it. The evaluator and tutor MUST use separate `AnthropicClient` instances. The current `SessionEngineDependencies` already has separate `evaluator` (which wraps its own client) and `llmClient` (for the tutor). Verify this separation is maintained when constructing dependencies.

> **WARNING: `saveMessage()` returns `Promise<void>` (Cross-Task Issue #17)**
> Do not destructure or assign the return value of `saveMessage()`. It returns nothing.

> **WARNING: `extractExcerpt()` is private and correctly named**
> The method on `RecallEvaluator` is `extractExcerpt` (line 134), not `extractConversationExcerpt`. It is `private` — do not call it from outside the class. The `evaluate()` and `evaluateEnhanced()` methods call it internally.

> **WARNING: `RecallEvaluation` has 3 required fields (Cross-Task Issue #18)**
> `{ success: boolean; confidence: number; reasoning: string }`. Any code creating a `RecallEvaluation` must include all three. The `reasoning` field cannot be omitted.

> **WARNING: Performance of per-point evaluation**
> Calling `evaluate()` per unchecked point means N LLM calls per user message (where N = unchecked points). This is acceptable because: (a) N decreases as points are recalled, (b) each call uses `extractExcerpt()` limiting to 10 messages, (c) `EVALUATION_MAX_TOKENS` is 512, (d) the evaluator can be configured with a fast/cheap model. If N is large, consider a future optimization to pre-filter points by keyword relevance before calling the LLM.

> **WARNING: `processUserMessage()` already saves the assistant message**
> The existing `generateTutorResponse()` (line 890) saves the assistant message via `saveMessage()` at line 901 and emits the `assistant_message` event at line 909. Do NOT add duplicate save/emit calls in `processUserMessage()`. After calling `generateTutorResponse()`, the message is already saved and emitted.
