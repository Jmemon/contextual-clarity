# T06 — Continuous Evaluator with Feedback Field

| Field | Value |
|-------|-------|
| **name** | Continuous Evaluator with Feedback Field |
| **parallel-group** | B (wave 2) |
| **depends-on** | T01 (Per-Session Recall Point Checklist) |

---

## Description

Transform the recall evaluator from a single-point, trigger-based scorer into continuous middleware that runs on every user message. The evaluator receives ALL unchecked points (from T01's checklist) and returns: which points were recalled, confidence per point, and a feedback string that gets injected into the tutor's context. The user never sees the evaluator's output — it shapes the tutor's next response invisibly.

This task also removes the entire manual evaluation trigger mechanism: `EVALUATION_TRIGGER_PHRASES`, `trigger_eval` WebSocket message, the "I've got it!" button, `shouldTriggerEvaluation()`, `handleTriggerEval()`, and the `autoEvaluateAfter`/`maxMessagesPerPoint` config options.

---

## Detailed Implementation

### 1. New Types (`src/core/scoring/types.ts`)

Add the following types. If `src/core/scoring/types.ts` does not exist, create it and move existing scoring-related types there.

```typescript
/**
 * Result of evaluating a batch of unchecked recall points against the latest user message.
 * Returned by RecallEvaluator.evaluateBatch().
 */
interface BatchEvaluationResult {
  // IDs of recall points the user demonstrated recall of in this message.
  // Empty array if no points were recalled.
  recalledPointIds: string[];

  // Confidence score (0.0 to 1.0) for each recalled point.
  // Only contains entries for points in recalledPointIds.
  confidencePerPoint: Map<string, number>;

  // Guidance string for the tutor. Describes what the user recalled, what was imprecise,
  // and what remains unchecked. In rabbithole mode, this is minimal (just "point X recalled").
  // Empty string if nothing notable happened.
  feedback: string;
}

/**
 * Raw JSON structure returned by the batch evaluator LLM call.
 * Parsed by parseBatchEvaluationResponse().
 */
interface BatchEvaluationRawResponse {
  recalledPoints: Array<{
    id: string;
    confidence: number;
    observation: string;
  }>;
  feedback: string;
}
```

### 2. New Evaluator Method (`src/core/scoring/recall-evaluator.ts`)

Add `evaluateBatch()` to the `RecallEvaluator` class. Keep the existing `evaluate()` and `evaluateEnhanced()` methods for backward compatibility but mark them as deprecated.

```typescript
/**
 * Evaluates ALL unchecked recall points against the conversation so far.
 * Runs on every user message. Returns which points (if any) were demonstrated,
 * confidence per point, and a feedback string for the tutor.
 *
 * Uses Haiku for speed and cost — this runs on EVERY message.
 * Temperature 0.3 for consistency.
 *
 * @param uncheckedPoints - Points from T01's getUncheckedPoints() — only pending points
 * @param conversationMessages - Full conversation history (or last N messages for context window)
 * @param mode - 'recall' for full feedback, 'rabbithole' for minimal silent tagging
 */
async evaluateBatch(
  uncheckedPoints: RecallPoint[],
  conversationMessages: SessionMessage[],
  mode: 'recall' | 'rabbithole'
): Promise<BatchEvaluationResult> {
  // Early return if no points to evaluate
  if (uncheckedPoints.length === 0) {
    return { recalledPointIds: [], confidencePerPoint: new Map(), feedback: '' };
  }

  // Extract conversation excerpt — last 10 messages for context, same as existing evaluate()
  const excerpt = this.extractConversationExcerpt(conversationMessages, 10);

  // Build the batch evaluation prompt
  const prompt = buildBatchEvaluatorPrompt(
    uncheckedPoints.map(p => ({ id: p.id, content: p.content })),
    excerpt,
    mode
  );

  // Call LLM — use Haiku model, temperature 0.3
  const response = await this.llmClient.complete({
    model: 'haiku',  // Use the Haiku model reference from the existing LLM client config
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    maxTokens: 1024,  // Batch evaluation responses should be concise
  });

  // Parse the response
  return parseBatchEvaluationResponse(response.content);
}
```

**Important implementation detail:** The existing `evaluate()` method uses a specific model configured in the evaluator. Check `RecallEvaluator`'s constructor to see how the model is configured, and ensure `evaluateBatch()` explicitly overrides to use Haiku. If the LLM client doesn't support model selection per-call, add that capability or use a separate client instance configured for Haiku.

### 3. New Evaluator Prompt (`src/llm/prompts/recall-evaluator.ts`)

Add `buildBatchEvaluatorPrompt()` alongside the existing prompt builders. Do NOT remove the existing `buildRecallEvaluatorPrompt()` or `buildEnhancedRecallEvaluatorPrompt()` yet — they may still be referenced by deprecated code paths. Mark them deprecated.

```typescript
/**
 * Builds the prompt for batch evaluation of multiple recall points against the conversation.
 * Designed to be concise (runs on every message via Haiku).
 *
 * @param uncheckedPoints - Array of {id, content} for all pending recall points
 * @param conversationExcerpt - Recent conversation messages as formatted string
 * @param mode - 'recall' = full feedback for tutor; 'rabbithole' = minimal tagging only
 */
function buildBatchEvaluatorPrompt(
  uncheckedPoints: Array<{ id: string; content: string }>,
  conversationExcerpt: string,
  mode: 'recall' | 'rabbithole'
): string {
  const pointsList = uncheckedPoints
    .map((p, i) => `${i + 1}. [${p.id}] ${p.content}`)
    .join('\n');

  const feedbackInstruction = mode === 'recall'
    ? `Provide a "feedback" string summarizing what happened in this exchange. Include:
- Which points were recalled and how accurately
- Any imprecisions or near-misses (e.g., "described the mechanism but used the wrong term")
- What remains unchecked
This feedback will guide the tutor's next response. Be specific and actionable.`
    : `Provide a minimal "feedback" string. Just list which points were recalled, nothing more. Example: "Point rp_xxx was recalled." If no points were recalled, feedback is empty.`;

  return `You are a recall evaluation system. Your job is to determine which recall points (if any) the user demonstrated knowledge of in the conversation below.

## Unchecked Recall Points
${pointsList}

## Recent Conversation
${conversationExcerpt}

## Instructions
Analyze the user's most recent message(s) in the context of the full conversation excerpt. For each unchecked recall point, determine if the user demonstrated genuine recall of that concept. A point is "recalled" if the user expressed the core idea in their own words — it does not need to be verbatim.

Be conservative: only mark a point as recalled if the user clearly demonstrated understanding of its core content. Partial or tangential mentions do not count.

${feedbackInstruction}

## Response Format
Respond with ONLY a JSON object in this exact format, no other text:
{
  "recalledPoints": [
    {"id": "rp_xxx", "confidence": 0.85, "observation": "correctly described the concept of..."}
  ],
  "feedback": "User recalled point X accurately. Their description of Y was close but imprecise — they said Z without mentioning W. Points A and B remain unchecked."
}

If no points were recalled, return:
{
  "recalledPoints": [],
  "feedback": "No recall points were demonstrated in this message. [brief note on what user discussed instead, if relevant]"
}`;
}
```

### 4. Response Parser (`src/llm/prompts/recall-evaluator.ts`)

Add alongside the prompt builder:

```typescript
/**
 * Parses the raw LLM response from the batch evaluator into a typed result.
 * Handles malformed JSON gracefully — returns empty result on parse failure.
 */
function parseBatchEvaluationResponse(response: string): BatchEvaluationResult {
  try {
    // Strip markdown code fences if present (LLMs sometimes wrap JSON in ```json ... ```)
    const cleaned = response.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    const raw: BatchEvaluationRawResponse = JSON.parse(cleaned);

    const recalledPointIds = raw.recalledPoints.map(p => p.id);
    const confidencePerPoint = new Map<string, number>(
      raw.recalledPoints.map(p => [p.id, p.confidence])
    );

    return {
      recalledPointIds,
      confidencePerPoint,
      feedback: raw.feedback || '',
    };
  } catch (error) {
    // If parsing fails, return empty result — don't crash the session
    console.error('Failed to parse batch evaluation response:', error);
    return {
      recalledPointIds: [],
      confidencePerPoint: new Map(),
      feedback: '',
    };
  }
}
```

### 5. SessionEngine Integration — New `processUserMessage()` Flow (`src/core/session/session-engine.ts`)

Rewrite the core message processing loop. The old flow was:
1. Save message
2. Check if evaluation should trigger (phrase match or message count)
3. If triggered: evaluate single current point, possibly advance
4. Generate tutor response

The new flow is:
1. Save message
2. Call `evaluator.evaluateBatch(getUncheckedPoints(), messages, currentMode)`
3. For each recalled point ID in result:
   a. Call `markPointRecalled(id)` (from T01 — emits `point_recalled` event)
   b. Call `recordRecallOutcome(id, { success: true, confidence })` (from T01 — updates FSRS)
4. If `allPointsRecalled()`: handle auto-end (T08 adds overlay; for now, mark session complete)
5. Call `generateTutorResponse(result.feedback)` — feedback shapes the tutor's next reply
6. Return `ProcessMessageResult` with new shape

```typescript
async processUserMessage(content: string): Promise<ProcessMessageResult> {
  this.validateActiveSession();

  // 1. Save the user's message
  const userMessage = await this.saveMessage('user', content);
  this.emitEvent('user_message', { messageId: userMessage.id, content });

  // 2. Run batch evaluation against all unchecked points
  const uncheckedPoints = this.getUncheckedPoints();
  const currentMode = this.isInRabbitHole() ? 'rabbithole' : 'recall';
  // Determine the current mode. isInRabbitHole() checks if a rabbit hole is active.
  // If no rabbit hole detection exists yet, default to 'recall'.

  const evalResult = await this.evaluator.evaluateBatch(
    uncheckedPoints,
    this.messages,
    currentMode
  );

  // 3. Process recalled points
  const pointsRecalledThisTurn: string[] = [];
  for (const pointId of evalResult.recalledPointIds) {
    this.markPointRecalled(pointId); // Emits point_recalled event, advances probe index
    const confidence = evalResult.confidencePerPoint.get(pointId) ?? 0.5;
    await this.recordRecallOutcome(pointId, { success: true, confidence });
    pointsRecalledThisTurn.push(pointId);
  }

  // 4. Check completion
  const isComplete = this.allPointsRecalled();
  // TODO (T08): If isComplete, emit session_complete_overlay event instead of completing immediately

  // 5. Update the tutor prompt with current checklist state
  this.updateLLMPrompt();

  // 6. Generate tutor response, shaped by evaluator feedback
  const response = await this.generateTutorResponse(evalResult.feedback);

  // 7. Save and emit assistant message
  const assistantMessage = await this.saveMessage('assistant', response);
  this.emitEvent('assistant_message', { messageId: assistantMessage.id, content: response });

  return {
    response,
    completed: isComplete,
    pointsRecalledThisTurn,
    recalledCount: this.getRecalledCount(),
    totalPoints: this.targetPoints.length,
  };
}
```

### 6. Feedback Injection into Tutor Response (`src/core/session/session-engine.ts`)

Modify `generateTutorResponse()` to accept an optional feedback parameter:

```typescript
/**
 * Generates the tutor's next response, optionally shaped by evaluator feedback.
 * The feedback is injected as a system-level observation that the user never sees.
 *
 * @param evaluatorFeedback - Guidance from the batch evaluator about what the user recalled.
 *                            Injected as a system context note before the conversation history.
 */
private async generateTutorResponse(evaluatorFeedback?: string): Promise<string> {
  const messages = [...this.messages];

  // If feedback is present, prepend it as a system-level context note.
  // This appears in the LLM's context but is NOT added to the stored conversation history.
  // The tutor sees it and adjusts its response accordingly.
  if (evaluatorFeedback && evaluatorFeedback.trim().length > 0) {
    messages.unshift({
      role: 'system',
      content: `[EVALUATOR OBSERVATION — not visible to user, do not reference directly]: ${evaluatorFeedback}`,
    });
  }

  // ... rest of existing generation logic, using the modified messages array
}
```

**Important:** The feedback message is NOT saved to `sessionMessages` in the database. It's ephemeral — constructed fresh each turn. It should be injected into the LLM call's messages array, not into the persistent conversation history.

If the existing `generateTutorResponse()` method doesn't directly take a messages array (e.g., it reads from `this.messages`), refactor it to accept an optional prepended context. The exact mechanism depends on how the LLM client is called, but the key requirement is: feedback appears in the LLM's input, not in the stored conversation.

### 7. Kill List — Removals

These items must be completely removed from the codebase:

**`src/core/session/types.ts`:**
- Remove `EVALUATION_TRIGGER_PHRASES` constant (line ~283). This array of trigger strings like "i think i understand", "got it", etc. is no longer needed.
- Remove `autoEvaluateAfter` from `SessionEngineConfig` (the message-count threshold for auto-evaluation)
- Remove `maxMessagesPerPoint` from `SessionEngineConfig` (the per-point message limit)

**`src/core/session/session-engine.ts`:**
- Remove `shouldTriggerEvaluation()` method (line ~667). This checked message content against `EVALUATION_TRIGGER_PHRASES`.
- Remove `evaluateCurrentPoint()` method (line ~712). This called `evaluator.evaluate()` for a single point. Replaced by the batch evaluation in `processUserMessage()`.
- Remove or fully refactor `advanceToNextPoint()` method (line ~763). Its responsibilities are now split across `markPointRecalled()`, `advanceProbeIndex()`, and `recordRecallOutcome()` from T01. If any remaining code path still calls it, redirect to the new methods.
- Remove the `currentPointMessageCount` property and any logic that increments it.
- Remove any `if (this.currentPointMessageCount >= config.autoEvaluateAfter)` checks.

**`src/api/ws/types.ts`:**
- Remove `trigger_eval` from the `ClientMessage` union type. This WebSocket message type is no longer needed since evaluation is continuous.

**`src/api/ws/session-handler.ts`:**
- Remove `handleTriggerEval()` method (line ~445). This handled the `trigger_eval` client message.
- Remove the `case 'trigger_eval':` branch in the message handler switch/if-else.

**`web/src/hooks/use-session-websocket.ts`:**
- Remove `triggerEvaluation` from the returned object. This function sent the `trigger_eval` WebSocket message.
- Remove any state or handler related to `trigger_eval`.

**`web/src/components/live-session/SessionControls.tsx`:**
- Remove the "I've got it!" button entirely. This button called `onTriggerEvaluation` which sent `trigger_eval`.
- Remove the `onTriggerEvaluation` prop.

**`web/src/components/live-session/SessionContainer.tsx`:**
- Remove any state or callbacks related to `triggerEvaluation` or `onTriggerEvaluation`.
- Remove any imports of evaluation-related types that are now deleted.

### 8. Performance Considerations

The batch evaluator runs on EVERY user message, so it must be fast and cheap:

- **Model**: Use Haiku (not Sonnet). The existing evaluator may use Sonnet — the batch evaluator must explicitly use Haiku.
- **Temperature**: 0.3 for consistency across evaluations.
- **Max tokens**: 1024 — batch evaluation responses should be concise JSON.
- **Conversation excerpt**: Use last 10 messages (same as existing `evaluate()`). Do not send the entire conversation history.
- **Point list**: Send only unchecked points, not all points. As points are recalled, the prompt gets shorter.
- **Prompt size**: The prompt template is tight — no verbose instructions. The response format is minimal JSON.

If the LLM client supports streaming, the batch evaluator should NOT stream — it needs the full JSON response to parse.

### 9. Deprecation of Old Methods

Mark these as deprecated but do not delete them yet (other parts of the codebase may reference them and will be updated in later tasks):

```typescript
/** @deprecated Use evaluateBatch() instead. Will be removed after T06 migration is complete. */
async evaluate(recallPoint: RecallPoint, conversationMessages: SessionMessage[]): Promise<RecallEvaluationResult> {
  // ... existing implementation
}

/** @deprecated Use evaluateBatch() instead. Will be removed after T06 migration is complete. */
async evaluateEnhanced(recallPoint: RecallPoint, conversationMessages: SessionMessage[], context?: any): Promise<EnhancedRecallEvaluationResult> {
  // ... existing implementation
}
```

---

## Relevant Files

| Action | File | What Changes |
|--------|------|-------------|
| MODIFY | `src/core/scoring/recall-evaluator.ts` | Add `evaluateBatch()` method, mark `evaluate()` and `evaluateEnhanced()` as deprecated |
| MODIFY | `src/llm/prompts/recall-evaluator.ts` | Add `buildBatchEvaluatorPrompt()`, add `parseBatchEvaluationResponse()`, mark old prompt builders as deprecated |
| MODIFY or CREATE | `src/core/scoring/types.ts` | Add `BatchEvaluationResult`, `BatchEvaluationRawResponse` types |
| MODIFY | `src/core/session/session-engine.ts` | Rewrite `processUserMessage()` with continuous eval flow, modify `generateTutorResponse()` for feedback injection, remove `shouldTriggerEvaluation()`, `evaluateCurrentPoint()`, refactor `advanceToNextPoint()` |
| MODIFY | `src/core/session/types.ts` | Remove `EVALUATION_TRIGGER_PHRASES`, remove `autoEvaluateAfter`, remove `maxMessagesPerPoint`, update `ProcessMessageResult` |
| MODIFY | `src/api/ws/types.ts` | Remove `trigger_eval` from `ClientMessage`, add evaluation-related server message types if needed |
| MODIFY | `src/api/ws/session-handler.ts` | Remove `handleTriggerEval()` method and its case branch |
| MODIFY | `web/src/hooks/use-session-websocket.ts` | Remove `triggerEvaluation` from returned object |
| MODIFY | `web/src/components/live-session/SessionControls.tsx` | Remove "I've got it!" button and `onTriggerEvaluation` prop entirely |
| MODIFY | `web/src/components/live-session/SessionContainer.tsx` | Remove evaluation-related state, callbacks, and imports |

---

## Success Criteria

1. **Continuous evaluation**: Every call to `processUserMessage()` triggers `evaluateBatch()` with all unchecked points. No message is processed without evaluation.
2. **Multi-point recall**: If a user recalls 3 points in a single message, all 3 are checked off in that turn. `pointsRecalledThisTurn` contains all 3 IDs.
3. **Zero recall**: If a user's message doesn't demonstrate recall of any point, `recalledPointIds` is empty, no points are checked off, and the feedback string reflects this (e.g., "No recall points were demonstrated").
4. **Feedback injection**: The evaluator's feedback string is passed to `generateTutorResponse()` and injected into the LLM context as a system-level note. The user never sees the raw feedback. The tutor's response is shaped by it.
5. **Feedback quality in recall mode**: Feedback is specific and actionable. Examples:
   - "User recalled point rp_123 (adenosine receptor blocking) accurately with high confidence."
   - "User's description of tolerance was close but imprecise — they said 'your body adjusts' without mentioning upregulation. This does not meet the threshold for recall."
   - "Points rp_456 and rp_789 remain unchecked."
6. **Feedback in rabbithole mode**: Feedback is minimal — just "Point rp_xxx was recalled" with no steering guidance. The rabbit hole agent operates independently.
7. **EVALUATION_TRIGGER_PHRASES removed**: The constant is deleted from `types.ts`. No references to it exist anywhere in the codebase. `grep -r "EVALUATION_TRIGGER_PHRASES"` returns nothing.
8. **`trigger_eval` removed**: The client message type is deleted from `types.ts`. `handleTriggerEval()` is deleted from `session-handler.ts`. `triggerEvaluation` is removed from the WebSocket hook. `grep -r "trigger_eval"` returns nothing (except possibly in git history or task files).
9. **"I've got it!" button removed**: The button is completely removed from `SessionControls.tsx`. The `onTriggerEvaluation` prop is removed. No UI element triggers manual evaluation.
10. **Config options removed**: `autoEvaluateAfter` and `maxMessagesPerPoint` are removed from `SessionEngineConfig`. No code references them.
11. **Haiku model**: `evaluateBatch()` explicitly uses the Haiku model, not Sonnet or any other model. Verify this by checking the LLM client call parameters.
12. **Temperature 0.3**: The batch evaluator call uses temperature 0.3.
13. **Idempotency on already-recalled points**: The evaluator only receives unchecked points (from `getUncheckedPoints()`). If a user repeats something already recalled, it's not in the unchecked list, so it can't be re-evaluated. This is guaranteed by the flow, not by the evaluator prompt.
14. **Parse failure resilience**: If the LLM returns malformed JSON, `parseBatchEvaluationResponse()` catches the error and returns an empty result (no points recalled, empty feedback). The session does not crash.
15. **Backward compatibility**: The old `evaluate()` and `evaluateEnhanced()` methods still exist (marked deprecated) so any code not yet migrated doesn't break.
16. **FSRS updates**: For each recalled point, `recordRecallOutcome()` is called with `success: true` and the confidence from the evaluator. FSRS state is updated in the database.
17. **No user-visible evaluation machinery**: The user sees only the tutor's natural conversational responses. No evaluation scores, no "you recalled X correctly" messages from the system. All evaluation is invisible middleware.
