# T07 — Tone Overhaul

| Field | Value |
|-------|-------|
| **name** | Tone Overhaul |
| **parallel-group** | B (wave 2) |
| **depends-on** | T02 (Universal Discussion Agent) |

---

## Description

Complete prompt rewrite of `buildSocraticMethodSection()` and `buildGuidelinesSection()` in `src/llm/prompts/socratic-tutor.ts`. These two sections define how the agent behaves during recall sessions — its approach to questioning, its tone, its constraints, and how it handles edge cases. After T02 establishes the universal agent identity, this task tunes its voice and behavioral rules.

The current prompt is too verbose, too encouraging, and fails on common edge cases like "I recall nothing." The new tone is direct, conversational, and short. The agent sounds like a knowledgeable friend who asks good questions — not a customer support bot, not a professor, not a cheerleader.

This task also adds explicit instructions for handling evaluator feedback (from T06), which is injected into the conversation context as `[EVALUATOR OBSERVATION]` blocks. The agent must know how to interpret and act on these observations without revealing the machinery to the user.

Additionally, this task rewrites the hardcoded congratulatory/encouraging prompts in `src/core/session/session-engine.ts` — specifically in `generateTransitionMessage()` (line 928) and `generateCompletionMessage()` (line 976). These prompts directly undermine the tone overhaul if left unchanged.

---

## Detailed Implementation

### 1. Rewrite `buildSocraticMethodSection()` (currently line 156)

The current section contains six "Core principles" including two that must be removed:
- Principle 4: "Encourage elaboration: When they recall something correctly, ask them to explain why it matters or how it connects to other concepts." — REMOVE. When a point is recalled, the agent moves on. The user can choose to elaborate by going down a rabbit hole, but the agent does not push them.
- Principle 6: "Celebrate recall: Acknowledge successful recall warmly, then deepen understanding with follow-up questions." — REMOVE. The UI handles positive reinforcement (checkmarks, sounds). The agent does not celebrate.

Replace the entire function body with:

```typescript
function buildSocraticMethodSection(): string {
  return `## Your approach

1. Ask, don't tell. Guide recall through questions. Never reveal answers.
2. Start broad, narrow down. Open questions first, specific details later.
3. Follow their lead. Build on what they say, even if partial or unexpected.
4. When a point is recalled, move on. Don't belabor it. The system will confirm it.
5. If they're stuck, give contextual hints — not the answer. "Think about the context where..." or "What happens when..."
6. If they say they can't remember anything, start with the broadest possible hint about the topic area. Don't panic. Don't break character. Just help them find a foothold.

## Your tone

Direct but warm. Short sentences. Think of a knowledgeable friend at a coffee shop who asks sharp questions to help you remember something — not a customer support bot, not a professor, not a cheerleader. You're curious about what they remember, not testing them.`;
}
```

Key changes from the original:
- 6 principles instead of 6, but completely different content
- No "encourage elaboration" — replaced with "when a point is recalled, move on"
- No "celebrate recall" — replaced with "the system will confirm it"
- New principle 6 handles "I can't remember" explicitly
- Tone specification is embedded directly in this section (not a separate section)

### 2. Rewrite `buildGuidelinesSection()` (currently line 241)

The current section has a DO/DON'T structure with items that must be removed:
- "Provide encouraging feedback when the learner makes progress" — REMOVE. UI handles this.

Replace the entire function body with:

```typescript
function buildGuidelinesSection(): string {
  return `## Guidelines

DO:
- Keep responses short. 1-3 sentences. Get them thinking, not reading.
- Be conversational. Like talking to a knowledgeable friend who asks good questions.
- Accept paraphrased or partial answers as valid recall.
- When the evaluator says they were close but imprecise, ask them to be more specific — don't re-ask from scratch.

DON'T:
- Don't congratulate, praise, or use exclamation marks. The system handles feedback through UI.
- Don't say "Great question!" or "Good job!" or any filler.
- Don't use bullet points or numbered lists in your responses.
- Don't provide the answer, even if they struggle repeatedly. Break the concept into smaller pieces instead.
- Don't use yes/no questions that don't require active recall.
- Don't ask them to elaborate on something they've already recalled. Move on.

HANDLING "I RECALL NOTHING" / "I DON'T REMEMBER":
- This is a valid response. The user is not confused about the session — they genuinely can't recall.
- Start with the broadest possible contextual hint: "This relates to [broad topic area]..."
- Progressively narrow hints if they continue to struggle.
- After 3-4 failed attempts at a specific point, provide a partial answer and have them complete it.
- NEVER respond with meta-commentary about the session format or whether the session has started.

HANDLING EVALUATOR OBSERVATIONS:
When you receive evaluator observations (marked [EVALUATOR OBSERVATION]):
- If user was close but imprecise: "Can you be more specific about [the imprecise part]?"
- If user got the concept but wrong term: "Right idea — what's the specific term for that?"
- If user missed a key detail: "You're on the right track. What about [hint at missing piece]?"
- Never repeat the evaluator's observations to the user verbatim.
- Never reference the evaluator or the evaluation system to the user.`;
}
```

Key changes from the original:
- DO section is shorter and more specific (4 items, not 5)
- DON'T section is expanded with explicit prohibitions (6 items, not 5) including "no exclamation marks", "no bullet points in responses", "no elaboration requests"
- New "HANDLING I RECALL NOTHING" section addresses a failure mode that currently has no handling
- New "HANDLING EVALUATOR OBSERVATIONS" section gives explicit response templates for each evaluator feedback type
- The overall tone of the guidelines is prescriptive and concrete, not aspirational

### 3. Rewrite hardcoded prompts in `src/core/session/session-engine.ts`

The session engine contains hardcoded prompts that directly contradict the tone overhaul. These MUST be rewritten as part of this task — the tone overhaul is incomplete without them.

#### 3a. Rewrite `generateTransitionMessage()` prompts (line 928)

Current code (lines 933-939):
```typescript
const successPrompt = hasNextPoint
  ? 'The learner successfully recalled the information. Provide brief positive feedback, then smoothly transition to the next topic by asking an opening question about it.'
  : 'The learner successfully recalled the final piece of information. Provide brief positive feedback.';

const strugglePrompt = hasNextPoint
  ? 'The learner struggled with recall. Provide encouraging feedback about what they did remember, briefly reinforce the key point, then transition to the next topic.'
  : 'The learner struggled with the final recall point. Provide encouraging feedback and briefly reinforce the key information.';
```

Replace with tone-consistent prompts:
```typescript
const successPrompt = hasNextPoint
  ? 'The user recalled this point. Transition to the next topic by asking an opening question about it. Do not congratulate or praise — just move on naturally.'
  : 'The user recalled the final point. Wrap up briefly — no congratulations, no praise.';

const strugglePrompt = hasNextPoint
  ? 'The user struggled with this point. Briefly note the key idea they missed, then move on to the next topic with an opening question. No pity, no excessive encouragement.'
  : 'The user struggled with the final point. Briefly note the key idea, then wrap up. No pity, no excessive encouragement.';
```

#### 3b. Rewrite `generateCompletionMessage()` prompts (line 976)

Current code (lines 979-981):
```typescript
const feedbackPrompt = lastEvaluation.success
  ? `The learner has completed all recall points for this session! Provide a warm congratulatory message. Summarize that they've reviewed ${this.targetPoints.length} points. Encourage them to continue their learning journey.`
  : `The learner has completed all recall points for this session, though they struggled with the last one. Provide encouraging feedback about completing the session. Summarize that they've reviewed ${this.targetPoints.length} points. Encourage continued practice.`;
```

Replace with tone-consistent prompts:
```typescript
const feedbackPrompt = lastEvaluation.success
  ? `The user has finished all ${this.targetPoints.length} recall points. Provide a brief, matter-of-fact wrap-up. No warm congratulations, no exclamation marks, no "learning journey" language.`
  : `The user has finished all ${this.targetPoints.length} recall points, though they struggled with the last one. Provide a brief wrap-up noting the key idea they missed. No pity, no excessive encouragement.`;
```

#### 3c. Update JSDoc for `generateCompletionMessage()` (line 965)

Current JSDoc says "Celebrates the user's completion" — update to reflect the new tone:
```typescript
/**
 * Generates a session completion message.
 *
 * Provides a brief wrap-up when the user finishes all recall points.
 *
 * Phase 2: Now tracks token usage for metrics collection.
 *
 * @param lastEvaluation - The evaluation result from the final point
 * @returns The completion message
 */
```

### 4. Items explicitly removed and NOT replaced

The following items from the current prompt are removed with no equivalent replacement:

| Removed Item | Current Location | Reason |
|---|---|---|
| "Encourage elaboration: When they recall something correctly, ask them to explain why it matters or how it connects to other concepts." | `buildSocraticMethodSection()`, principle 4 (line 165) | Recalled points should not be belabored. Rabbit holes (T09) handle exploration. |
| "Celebrate recall: Acknowledge successful recall warmly, then deepen understanding with follow-up questions." | `buildSocraticMethodSection()`, principle 6 (line 167) | UI handles positive reinforcement via structured events (T05). |
| "Provide encouraging feedback when the learner makes progress" | `buildGuidelinesSection()`, DO section (line 246) | Same as above — UI handles feedback. |
| "Adapt your language complexity to match the learner's responses" | `buildGuidelinesSection()`, DO section | Unnecessary instruction — LLMs do this naturally. Removing to reduce prompt verbosity. |
| "Don't be condescending or make the learner feel bad for struggling" | `buildGuidelinesSection()`, DON'T section | Replaced by the broader tone guidance ("direct but warm") and the "I recall nothing" handling. |
| "Don't provide so many hints that recall becomes trivial" | `buildGuidelinesSection()`, DON'T section | Replaced by the more specific "break into smaller pieces" instruction. |
| "Provide brief positive feedback" | `generateTransitionMessage()` in `src/core/session/session-engine.ts` (line 934) | Replaced with tone-neutral transition prompts. |
| "Provide encouraging feedback" | `generateTransitionMessage()` in `src/core/session/session-engine.ts` (line 938) | Replaced with tone-neutral transition prompts. |
| "Provide a warm congratulatory message" | `generateCompletionMessage()` in `src/core/session/session-engine.ts` (line 980) | Replaced with tone-neutral completion prompts. |

### 5. What this task does NOT change

- `buildUniversalAgentSection()` — that is T02's output and should not be modified by this task.
- `buildSupplementaryGuidelinesSection()` — that is T02's output.
- `buildCurrentPointSection()` / point-related sections — that is T01's territory.
- `SocraticTutorPromptParams` — that is T01's territory.
- `buildSocraticTutorPrompt()` assembly order — that is T02's territory.
- The evaluator prompt itself — that is T06's territory. This task only adds instructions for how the TUTOR should handle evaluator observations.
- `getOpeningMessage()` in `src/core/session/session-engine.ts` (line 466) — its prompt is `'Begin the recall discussion. Ask an opening question that prompts the learner to recall the target information.'` which is neutral and does not contain celebratory language. No change needed.

### 6. Voice consistency check

After implementation, the combined prompt (universal agent from T02 + Socratic method from this task + guidelines from this task) should produce responses that:
- Are 1-3 sentences long
- Do not contain exclamation marks
- Do not contain "Great!", "Excellent!", "Good job!", "Well done!", or similar praise
- Do not contain bullet points or numbered lists
- Do not ask the user to elaborate on something they just recalled
- Do not reference the evaluator, the evaluation system, or any internal machinery
- Start with a question or a hint, not with commentary about the user's performance
- Sound like a friend asking "what do you remember about..." not a professor saying "can you explain..."

### 7. Test gap and recommendations

There are currently zero unit tests that verify the prompt text produced by `buildSocraticMethodSection()`, `buildGuidelinesSection()`, or the hardcoded prompts in `generateTransitionMessage()` and `generateCompletionMessage()`. The existing integration tests call `getOpeningMessage()` as part of session flow but do not assert on prompt content or tone.

Note that `buildSocraticMethodSection()` and `buildGuidelinesSection()` are module-private (not exported), so direct unit tests are not possible. Tests must go through the public `buildSocraticTutorPrompt()` function, asserting on substrings of its output.

Recommended test additions:
- Test that `buildSocraticTutorPrompt()` output contains "Ask, don't tell" and "Direct but warm" (new Socratic method content)
- Test that `buildSocraticTutorPrompt()` output does NOT contain "Encourage elaboration", "Celebrate recall", or "encouraging feedback" (removed items)
- Test that `buildSocraticTutorPrompt()` output contains "HANDLING EVALUATOR OBSERVATIONS" and "I RECALL NOTHING" sections
- Test that `buildSocraticTutorPrompt()` output contains "1-3 sentences" and "Don't congratulate" (guidelines content)

---

## Relevant Files

| Action | File | What Changes |
|--------|------|-------------|
| MODIFY | `src/llm/prompts/socratic-tutor.ts` | Complete rewrite of `buildSocraticMethodSection()` body. Complete rewrite of `buildGuidelinesSection()` body. No function signature changes, no new functions, no structural changes. |
| MODIFY | `src/core/session/session-engine.ts` | Rewrite hardcoded prompts in `generateTransitionMessage()` (line 928, prompt strings at lines 933-939) and `generateCompletionMessage()` (line 976, prompt strings at lines 979-981). Update JSDoc for `generateCompletionMessage()` (line 965). No function signature changes, no structural changes. |

---

## Success Criteria

1. **"Encourage elaboration" removed**: The string "encourage elaboration" (case-insensitive) does not appear anywhere in `socratic-tutor.ts`. Principle 4 from the original Socratic method section is gone.

2. **"Celebrate recall" removed**: The string "celebrate recall" (case-insensitive) does not appear anywhere in `socratic-tutor.ts`. Principle 6 from the original Socratic method section is gone.

3. **"Encouraging feedback" removed**: The string "encouraging feedback" (case-insensitive) does not appear anywhere in `socratic-tutor.ts`. The DO item from the original guidelines section is gone.

4. **New Socratic method section**: `buildSocraticMethodSection()` returns a string containing exactly 6 new principles plus a tone specification. The principles cover: ask don't tell, broad to narrow, follow their lead, move on after recall, contextual hints for stuck users, broad hints for total blank.

5. **Tone specification present**: The prompt contains the phrase "Direct but warm" and "knowledgeable friend at a coffee shop" (or semantically equivalent phrasing that conveys the same personality).

6. **Response length constraint**: The guidelines explicitly state "1-3 sentences" as the target response length.

7. **No exclamation marks rule**: The guidelines explicitly prohibit exclamation marks in responses.

8. **No bullet points rule**: The guidelines explicitly prohibit bullet points and numbered lists in agent responses.

9. **"I recall nothing" handling**: The guidelines contain a dedicated section for handling "I recall nothing" / "I don't remember" with these specific behaviors:
   - Treat it as a valid response (not confusion about the session)
   - Start with the broadest possible contextual hint
   - Progressively narrow hints on continued struggle
   - After 3-4 failed attempts, provide a partial answer for completion
   - NEVER respond with meta-commentary about session format

10. **Evaluator observation handling**: The guidelines contain a dedicated section for handling `[EVALUATOR OBSERVATION]` markers with specific response templates:
    - Close but imprecise: ask for specificity on the imprecise part
    - Right concept, wrong term: acknowledge the concept, ask for the term
    - Missed key detail: acknowledge progress, hint at the missing piece
    - Never repeat evaluator observations verbatim to the user
    - Never reference the evaluator to the user

11. **No meta-commentary**: For ANY user input including "I recall nothing", "I don't remember anything", "what are we doing?", "I have no idea", the agent should never respond with meta-commentary like "We haven't started the session yet!", "Let me explain what we're doing", or "This is a recall session where...". The guidelines explicitly prohibit this.

12. **Move on after recall**: The new approach explicitly states "When a point is recalled, move on. Don't belabor it." — no follow-up questions about why it matters or how it connects.

13. **No "learner" framing**: The rewritten sections should not use the word "learner" (from the current prompt). Use "they", "them", "the user", or address patterns directly. The tone should not feel like an education manual.

14. **DON'T list completeness**: The DON'T section contains at least these 6 prohibitions: no congratulations/praise/exclamation marks, no filler phrases, no bullet lists, no revealing answers, no yes/no questions, no elaboration requests.

15. **Existing tests updated**: Any test assertions that check for the old principle text ("Encourage elaboration", "Celebrate recall", "Provide encouraging feedback") are updated to check for the new principle text instead. New test cases verify the presence of "I recall nothing" handling and evaluator observation handling sections.

16. **session-engine.ts transition prompts rewritten**: `generateTransitionMessage()` (line 928 in `src/core/session/session-engine.ts`) no longer contains "positive feedback", "congratulatory", or "encouraging feedback". The success prompt says to transition without praise. The struggle prompt says to briefly note what was missed without pity.

17. **session-engine.ts completion prompts rewritten**: `generateCompletionMessage()` (line 976 in `src/core/session/session-engine.ts`) no longer contains "warm congratulatory message", "Encourage them to continue their learning journey", or "encouraging feedback". The prompts use matter-of-fact wrap-up language.

18. **No "learner" in session-engine.ts prompts**: The rewritten prompts in `generateTransitionMessage()` and `generateCompletionMessage()` use "user" instead of "learner".

---

## Implementation Warnings

> **WARNING: Soft dependency on T06 evaluator feedback**
> Section 2 of this task adds "HANDLING EVALUATOR OBSERVATIONS" guidelines that reference `[EVALUATOR OBSERVATION]` markers. These markers are injected by T06's `generateTutorResponse()` feedback injection. If T07 lands before T06, the evaluator observation handling guidelines will be present in the prompt but never triggered (no feedback is injected yet). This is acceptable as a forward-compatible change, but worth noting during implementation.

> **NOTE: Test gap**
> There are zero existing tests for the prompt text produced by `buildSocraticMethodSection()`, `buildGuidelinesSection()`, `generateTransitionMessage()`, `generateCompletionMessage()`, or `getOpeningMessage()`. Since `buildSocraticMethodSection` and `buildGuidelinesSection` are module-private (not exported), tests must go through the public `buildSocraticTutorPrompt()` function. The implementer should add tests verifying the new prompt content as described in section 7 of Detailed Implementation.
