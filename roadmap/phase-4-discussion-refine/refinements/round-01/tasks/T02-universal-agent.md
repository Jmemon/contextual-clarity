# T02 — Universal Discussion Agent

| Field | Value |
|-------|-------|
| **name** | Universal Discussion Agent |
| **parallel-group** | A (no dependencies) |
| **depends-on** | none |

---

## Description

Replace the per-set `discussionSystemPrompt` as the backbone of the tutor prompt with a single universal discussion agent prompt that works across all domains. The recall points' `content` and `context` fields provide all the domain knowledge the agent needs. The existing `discussionSystemPrompt` field on each RecallSet is preserved but demoted: it becomes an optional "Supplementary Guidelines" section appended at the end of the prompt, not the opening section.

This task does NOT change the data passed to the prompt builder (that is T01's job — it changes `SocraticTutorPromptParams` to pass `uncheckedPoints` and `currentProbePoint` instead of `currentPointIndex`). This task changes the prompt content that receives those params. Since T01 and T02 are both group A, implement T02 assuming T01's new params exist: `uncheckedPoints: RecallPoint[]`, `currentProbePoint: RecallPoint | null`.

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
3. Current point / unchecked points section (UNCHANGED by this task; T01 rewrites it)
4. `buildGuidelinesSection()` — do's and don'ts (UNCHANGED by this task; T07 rewrites it)
5. `buildSupplementaryGuidelinesSection(recallSet)` — optional per-set guidelines (NEW position: LAST)

The key structural change: the universal agent section is FIRST (sets the identity), and supplementary guidelines are LAST (optional overrides, not the backbone).

### 5. Update `buildEmptySessionPrompt()` (line 121)

The current empty session prompt uses `recallSet.discussionSystemPrompt` as the opening line. Replace it with the universal agent framing:

```typescript
function buildEmptySessionPrompt(recallSet: RecallSet): string {
  return `You are facilitating a recall session for "${recallSet.name}", but there are no specific recall points assigned for this session.

Engage in a general discussion about the subject matter. Ask open-ended questions to help the user explore and articulate what they know about the topic.`;
}
```

### 6. Do NOT change seed data

The existing `discussionSystemPrompt` values in seed files (e.g., the long custom prompts for each recall set) remain as-is. They will be injected as supplementary guidelines. No seed file changes are needed for this task.

### 7. Do NOT change the `SocraticTutorPromptParams` interface

T01 is responsible for changing this interface. This task writes the prompt content that receives those params. If T01 has not yet been implemented when T02 runs, the implementer should:
- Write the `buildUniversalAgentSection()` and `buildSupplementaryGuidelinesSection()` functions
- Restructure the section assembly order in `buildSocraticTutorPrompt()`
- Leave the point-related sections (3 and 4 in the current order) untouched — they still reference whatever params exist

---

## Relevant Files

| Action | File | What Changes |
|--------|------|-------------|
| MODIFY | `src/llm/prompts/socratic-tutor.ts` | Remove `buildCustomPromptSection()`. Create `buildUniversalAgentSection()`. Create `buildSupplementaryGuidelinesSection(recallSet)`. Restructure prompt section assembly order in `buildSocraticTutorPrompt()`. Update `buildEmptySessionPrompt()`. |

Note: T01 modifies `SocraticTutorPromptParams` and the point-related sections. T07 modifies `buildSocraticMethodSection()` and `buildGuidelinesSection()`. This task only touches the agent identity section and supplementary guidelines section.

---

## Success Criteria

1. **Universal agent section exists**: `buildUniversalAgentSection()` is a new exported or module-private function that returns the universal recall facilitator prompt. It contains no domain-specific references and works for any subject.

2. **Domain-agnostic identity**: The prompt identifies the agent as a "recall session facilitator" — NOT "AI Tutor", NOT "knowledgeable tutor", NOT "patient teacher". No education-specific framing.

3. **Recall, not teaching**: The prompt explicitly states the user has "previously learned" the material and is "practicing retrieval." It instructs the agent NOT to teach, explain, or provide answers.

4. **Evaluator awareness**: The prompt mentions that "an evaluator system analyzes each user message and provides observations about what they have and have not recalled." This prepares for T06 integration where evaluator feedback is injected into the conversation context.

5. **UI handles reinforcement**: The prompt explicitly states "The UI handles all positive reinforcement" and instructs the agent not to generate congratulatory text, celebration, or praise.

6. **Supplementary guidelines as last section**: `buildSupplementaryGuidelinesSection(recallSet)` reads `recallSet.discussionSystemPrompt`, wraps non-empty values in a clearly labeled section with XML delimiters, and returns empty string for empty/whitespace values. This section is the LAST section in the prompt assembly.

7. **Empty discussionSystemPrompt handled**: When `recallSet.discussionSystemPrompt` is empty or whitespace-only, the supplementary guidelines section is omitted entirely (no empty headers, no "No guidelines provided" text).

8. **Non-empty discussionSystemPrompt preserved**: When `recallSet.discussionSystemPrompt` has content, it appears in full inside the supplementary guidelines section. No truncation, no summarization.

9. **Section order**: The assembled prompt sections appear in this order: universal agent identity, Socratic method, point sections, guidelines, supplementary guidelines. The universal agent section is first; supplementary guidelines are last.

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

15. **Existing tests**: Any tests that reference `buildCustomPromptSection` are updated to test `buildSupplementaryGuidelinesSection` instead. Tests for `buildUniversalAgentSection` are added to verify the prompt contains key phrases: "recall session", "facilitator", "evaluator", "UI handles", and does NOT contain "AI Tutor" or "patient tutor".
