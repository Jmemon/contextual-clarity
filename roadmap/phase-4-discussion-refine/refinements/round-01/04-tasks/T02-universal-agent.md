# T02 — Universal Discussion Agent

| Field | Value |
|-------|-------|
| **name** | Universal Discussion Agent |
| **parallel-group** | B |
| **depends-on** | T01 |

---

## Description

Replace the per-set `discussionSystemPrompt` as the backbone of the tutor prompt with a single universal discussion agent prompt that works across all domains. The recall points' `content` and `context` fields provide all the domain knowledge the agent needs. The existing `discussionSystemPrompt` field on each RecallSet is preserved but demoted: it becomes an optional "Supplementary Guidelines" section appended at the end of the prompt, not the opening section.

This task does NOT change the data passed to the prompt builder (that is T01's job — it changes `SocraticTutorPromptParams` to pass `uncheckedPoints` and `currentProbePoint` instead of `currentPointIndex`). This task changes the prompt content that receives those params. Since T02 depends on T01, by the time T02 runs, T01 will already be complete. T01's new params (`uncheckedPoints: RecallPoint[]`, `currentProbePoint: RecallPoint | null`) and checklist-aware point sections will already be in place. T02's changes to prompt assembly must work with T01's new param shape.

This task also does NOT change the tone, Socratic method section, or guidelines section (that is T07). It only replaces the custom prompt section with the universal agent section and restructures the prompt assembly order.

---

## Detailed Implementation

### 1. Remove `buildCustomPromptSection()` as the primary section

In `src/llm/prompts/socratic-tutor.ts`, the current `buildCustomPromptSection(recallSet)` (line 137) serves as Section 1 of the prompt. It injects `recallSet.discussionSystemPrompt.trim()` as the opening text, or falls back to a generic "knowledgeable and patient tutor" persona. This function will be replaced by two new functions: `buildUniversalAgentSection()` (new Section 1) and `buildSupplementaryGuidelinesSection()` (new final section).

### 2. Create `buildUniversalAgentSection()` — new Section 1

This function takes no parameters (it is context-free; the recall points are injected by other sections). It returns a string containing the universal agent identity and behavioral framework:

```
You are facilitating a recall session. The user has previously learned the material below and is practicing retrieving it from memory. Your job is to probe their recall through questions — not to teach, explain, or provide the answers.

## Your role

- You are a recall session facilitator. You work across any domain — science, history, music, philosophy, engineering, anything.
- The recall points listed below are your only source of truth for this session. They tell you what the user should be able to recall.
- You are NOT teaching new material. The user has already learned this. You are helping them practice retrieval.
- An evaluator system analyzes each user message and provides you with observations about what they have and have not recalled. Use these observations to decide what to probe next and how to nudge them toward precision.
- The UI handles all positive reinforcement (checkmarks, sounds, progress indicators). Do not generate congratulatory text, celebration, or praise. When a point is recalled, move on to the next unchecked point.
```

The language must be:
- Domain-agnostic: no references to "learning", "studying", "students", "lessons", or any education-specific framing beyond "recall session"
- Explicit that this is RECALL, not teaching
- Explicit that the evaluator provides feedback (preparing for T06 integration)
- Explicit that UI handles positive reinforcement (no congratulatory text)

### 3. Rename and repurpose `buildCustomPromptSection()` to `buildSupplementaryGuidelinesSection(recallSet)`

The new function:
- Reads `recallSet.discussionSystemPrompt.trim()`
- If the value is empty or whitespace-only, returns an empty string (section omitted entirely)
- If non-empty, wraps it in a clearly labeled section:

```
## Supplementary guidelines for this recall set

The following guidelines were provided for this specific recall set. Follow them in addition to (not instead of) the universal instructions above:

<supplementary_guidelines>
{recallSet.discussionSystemPrompt.trim()}
</supplementary_guidelines>
```

The `<supplementary_guidelines>` XML tags serve as delimiters to prevent prompt injection from user-authored content.

### 4. Restructure `buildSocraticTutorPrompt()` section assembly

Current order (line 95-110):
1. `buildCustomPromptSection(recallSet)` — per-set persona (REPLACING)
2. `buildSocraticMethodSection()` — Socratic principles
3. `buildCurrentPointSection(currentPoint)` — one point focus
4. `buildUpcomingPointsSection(upcomingPoints)` — next 3 points
5. `buildGuidelinesSection()` — do's and don'ts

New order:
1. `buildUniversalAgentSection()` — universal identity and role (NEW)
2. `buildSocraticMethodSection()` — Socratic principles (UNCHANGED by this task; T07 rewrites it)
3. Checklist-aware point sections (UNCHANGED by this task; T01 has already replaced the old `buildCurrentPointSection` and `buildUpcomingPointsSection` with checklist-aware sections)
4. `buildGuidelinesSection()` — do's and don'ts (UNCHANGED by this task; T07 rewrites it)
5. `buildSupplementaryGuidelinesSection(recallSet)` — optional per-set guidelines (NEW position: LAST)

The key structural change: the universal agent section is FIRST (sets the identity), and supplementary guidelines are LAST (optional overrides, not the backbone).

**Note on `buildUpcomingPointsSection`**: T01 has already replaced `buildUpcomingPointsSection` with checklist-aware sections that use `uncheckedPoints` and `currentProbePoint`. T02 does not modify those sections. When restructuring the assembly array, use whatever point-related section functions T01 left in place — do not re-introduce `buildUpcomingPointsSection`.

### 5. Coordinate with T01's changes to the call site

The only call site for `buildSocraticTutorPrompt` is `session-engine.ts` lines 1029-1033 (the `updateLLMPrompt()` method). T01 will have already changed both the `SocraticTutorPromptParams` interface and this call site to pass `uncheckedPoints` and `currentProbePoint` instead of `currentPointIndex`. T02 does NOT modify the call site or the interface. T02 only changes the prompt content functions and their assembly order within `buildSocraticTutorPrompt()`. Verify that T01's call-site changes are in place before modifying the section assembly.

### 6. Update `buildEmptySessionPrompt()` (line 121)

The current empty session prompt uses `recallSet.discussionSystemPrompt` as the opening line. Replace it with the universal agent framing:

```typescript
function buildEmptySessionPrompt(recallSet: RecallSet): string {
  return `You are facilitating a recall session for "${recallSet.name}", but there are no specific recall points assigned for this session.

Engage in a general discussion about the subject matter. Ask open-ended questions to help the user explore and articulate what they know about the topic.`;
}
```

### 7. Do NOT change seed data

The existing `discussionSystemPrompt` values in seed files (e.g., the long custom prompts for each recall set) remain as-is. They will be injected as supplementary guidelines. No seed file changes are needed for this task.

### 8. Do NOT change the `SocraticTutorPromptParams` interface

T01 is responsible for changing this interface. By the time T02 runs, T01 will have already changed the interface to use `uncheckedPoints` and `currentProbePoint`. T02 does not modify the interface further.

### 9. AnthropicClient statefulness

The universal agent prompt is assembled as part of `buildSocraticTutorPrompt()` and set via `this.llmClient.setSystemPrompt(prompt)` in session-engine.ts. This uses the session's existing `AnthropicClient` instance, which is correct — the universal agent prompt IS the session's system prompt, not a separate agent prompt. No dedicated client instance is needed for T02 because T02 is replacing the content of the existing system prompt, not adding a parallel prompt consumer.

---

## Relevant Files

| Action | File | What Changes |
|--------|------|-------------|
| MODIFY | `src/llm/prompts/socratic-tutor.ts` | Remove `buildCustomPromptSection()`. Create `buildUniversalAgentSection()`. Create `buildSupplementaryGuidelinesSection(recallSet)`. Restructure prompt section assembly order in `buildSocraticTutorPrompt()`. Update `buildEmptySessionPrompt()`. |
| CREATE | `tests/unit/prompts/socratic-tutor.test.ts` | New test file for universal agent prompt and supplementary guidelines. |

Note: T01 modifies `SocraticTutorPromptParams` and the point-related sections. T07 modifies `buildSocraticMethodSection()` and `buildGuidelinesSection()`. This task only touches the agent identity section and supplementary guidelines section.

---

## Success Criteria

1. **Universal agent section exists**: `buildUniversalAgentSection()` is a new module-private function that returns the universal recall facilitator prompt. It contains no domain-specific references and works for any subject.

2. **Domain-agnostic identity**: The prompt identifies the agent as a "recall session facilitator" — NOT "AI Tutor", NOT "knowledgeable tutor", NOT "patient teacher". No education-specific framing.

3. **Recall, not teaching**: The prompt explicitly states the user has "previously learned" the material and is "practicing retrieval." It instructs the agent NOT to teach, explain, or provide answers.

4. **Evaluator awareness**: The prompt mentions that "an evaluator system analyzes each user message and provides observations about what they have and have not recalled." This prepares for T06 integration where evaluator feedback is injected into the conversation context.

5. **UI handles reinforcement**: The prompt explicitly states "The UI handles all positive reinforcement" and instructs the agent not to generate congratulatory text, celebration, or praise.

6. **Supplementary guidelines as last section**: `buildSupplementaryGuidelinesSection(recallSet)` reads `recallSet.discussionSystemPrompt`, wraps non-empty values in a clearly labeled section with XML delimiters, and returns empty string for empty/whitespace values. This section is the LAST section in the prompt assembly.

7. **Empty discussionSystemPrompt handled**: When `recallSet.discussionSystemPrompt` is empty or whitespace-only, the supplementary guidelines section is omitted entirely (no empty headers, no "No guidelines provided" text).

8. **Non-empty discussionSystemPrompt preserved**: When `recallSet.discussionSystemPrompt` has content, it appears in full inside the supplementary guidelines section. No truncation, no summarization.

9. **Section order**: The assembled prompt sections appear in this order: universal agent identity, Socratic method, checklist-aware point sections (from T01), guidelines, supplementary guidelines. The universal agent section is first; supplementary guidelines are last.

10. **`buildCustomPromptSection()` removed**: The old function no longer exists. No references to it remain in the codebase.

11. **`buildEmptySessionPrompt()` updated**: Uses universal agent framing instead of `recallSet.discussionSystemPrompt` as the opening line.

12. **Seed data unchanged**: No modifications to any files in `src/storage/seed/` or similar seed data directories.

13. **Mental domain check**: The universal prompt should read sensibly when mentally tested against these diverse domains:
    - Motivation theory (psychology)
    - ATP synthesis (biochemistry)
    - Categorical imperative (philosophy)
    - Counterpoint rules (music composition)
    - Kubernetes networking (engineering)
    - Rule of thirds (visual arts)

    For each domain, the recall points' content and context fields should be sufficient for the agent to probe recall — the universal prompt should not need domain-specific instructions.

14. **No behavioral regression**: The prompt still produces a functional recall session. The agent still asks questions, still guides toward recall, still uses point content/context. The change is in identity and framing, not in fundamental behavior.

15. **Tests**: Create a new test file at `tests/unit/prompts/socratic-tutor.test.ts` (this file does not yet exist; the directory `tests/unit/prompts/` also does not exist and must be created). The test framework is `bun:test` (used throughout the project — import from `'bun:test'`, not Vitest). Since `buildUniversalAgentSection()` and `buildSupplementaryGuidelinesSection()` are module-private functions, tests must exercise them through the public `buildSocraticTutorPrompt()` function (the only exported function besides the `SocraticTutorPromptParams` interface). Tests should verify:
    - The assembled prompt contains key phrases: "recall session", "facilitator", "evaluator", "UI handles"
    - The assembled prompt does NOT contain "AI Tutor" or "patient tutor"
    - When `recallSet.discussionSystemPrompt` is non-empty, the output contains the supplementary guidelines section with the custom text
    - When `recallSet.discussionSystemPrompt` is empty/whitespace, no supplementary guidelines section appears
    - The universal agent section appears before the supplementary guidelines section in the output

---

## Implementation Warnings

> **WARNING: Prompt contradiction with `session-engine.ts`**
> The new universal agent prompt says "Do not generate congratulatory text, celebration, or praise" and "The UI handles all positive reinforcement". However, `session-engine.ts` contains hardcoded instructions in `generateTransitionMessage()` (line ~934: "Generate a brief, congratulatory transition message"), `generateCompletionMessage()` (line ~938: "Generate a congratulatory message"), and `getOpeningMessage()` (line ~980-981: "Celebrate recall warmly"). These instructions directly contradict the new universal agent prompt. **T07 (Tone Overhaul) is responsible for fixing these hardcoded prompts, not T02.** Until T07 lands, the agent will receive contradictory instructions. This is acceptable as a known intermediate state — document it but do not block on it.

> **WARNING: T01 must be complete before T02 begins**
> T02 depends on T01. T01 changes the `SocraticTutorPromptParams` interface (adding `uncheckedPoints` and `currentProbePoint`, removing `currentPointIndex`), replaces the point-related section functions, and updates the `session-engine.ts` call site. T02 must not start until T01's changes are merged and in place. If T01's changes are not present, T02's section assembly restructuring will not compile correctly.
