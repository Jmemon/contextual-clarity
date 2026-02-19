# Round 1 Refinements — Task Overview

Extracted from `roadmap/phase-4-discussion-refine/schedule/round-01.md` after completing 20 sessions across motivation, ATP, and diverse recall sets.

This is not a prompt-tweaking round. This is a UX overhaul of the recall session system.

---

## 1. Per-Session Recall Point State

The engine currently advances linearly through points (`currentPointIndex` in `session-engine.ts`). Instead, maintain a per-session checklist where each user message can check off zero or more recall points regardless of order. Every loop with the user should result in the system evaluating whether any recall points — not just the "current" one — were demonstrated.

This powers: visual progress (#5), auto-end (#4), and prevents re-asking recalled points (#2).

**Current code:** `SessionEngine.currentPointIndex` tracks position linearly. `processUserMessage()` only evaluates the current point. The evaluator (`recall-evaluator.ts`) receives only the current point's content.

**Change:** The evaluator needs to receive ALL unchecked points and indicate which (if any) were hit. The session engine needs a `Map<pointId, 'pending' | 'recalled'>` instead of a linear index.

---

## 2. Evaluator Catches Out-of-Order / Batch Recall

When the user dumps multiple recall points in one response, the evaluator must identify ALL of them. Currently it evaluates only the "current" point and misses others. It also occasionally credits points that weren't actually said.

**Current code:** `evaluateCurrentPoint()` in `session-engine.ts` calls `evaluator.evaluate(currentPoint, messages)` — singular point.

**Change:** Evaluator prompt needs to receive the full list of unchecked points (numbered) and return which numbers were hit. This is a prompt + interface change to the evaluator.

---

## 3. "Can You Be More Precise?" vs Re-Asking

When the user gives a valid but imprecise answer, the RSA should nudge toward precision ("can you make that more precise?") instead of re-asking as if they missed it entirely. The current evaluator either passes or fails — there's no "close but imprecise" state.

**Change:** The evaluator needs a third state or a precision flag. The tutor prompt needs guidance on how to respond to near-hits.

---

## 4. Sessions Auto-End When All Points Hit

The "I've got it" button doesn't make sense in its current form. The system should assess which points have been hit as the user speaks, and end the session when all points are checked off. Optionally, the user can choose to keep engaging (rabbit holes, deeper discussion), and THAT is when a "done" button makes sense.

**Current code:** `SessionControls.tsx` renders "I've got it!" which sends `trigger_eval` via WebSocket. The engine evaluates only the current point.

**Change:** With per-session state (#1), auto-end becomes: if all points in the checklist are `recalled`, send a session-complete signal. The "I've got it!" button is replaced with a "Done" button that only appears after all points are hit, for when the user wants to exit continued discussion.

---

## 5. Visual Progress Indicator

Show the user how many points they've hit and how many remain. Maybe other stats too (rabbit holes explored). User shouldn't be wondering "how much longer."

**Current code:** `SessionProgress.tsx` shows "X / Y points" and a progress bar, but it tracks the linear index, not actual recall success.

**Change:** Progress should reflect the per-session checklist state. Points light up / check off as they're recalled, regardless of order.

---

## 6. RSA Structured Actions Beyond Text

Instead of just text messages, the RSA should emit structured "moves" that the UI renders differently:

- `recall-point-recalled` — rendered as a checkmark or subtle positive indicator in the UI, NOT as text praise from the LLM
- `rabbithole-detected` — user sees a prompt asking if they want to explore the tangent or stay on track (see #11)

The LLM should not be generating congratulatory text. The system handles that through UI affordances.

**Current code:** All feedback comes as `assistant_chunk` / `assistant_complete` text messages through the WebSocket. No structured action types exist.

**Change:** Add new WebSocket message types for structured RSA actions. Frontend renders them as UI elements, not chat bubbles.

---

## 7. Less Verbose, More Prodding Responses

LLM text should be short and pointed — gets the user thinking in the right direction. Behind-the-scenes can involve multiple agents analyzing conversation and system prompt, but the user-facing text should not be buzzfeed-style LLM prose.

The tone should be direct but not rough. Pleasant but not cheerleader. Think of a good conversation partner who asks sharp questions — not a customer support bot.

**Current code:** `buildSocraticMethodSection()` in `socratic-tutor.ts` instructs the AI to "celebrate recall warmly" and "encourage elaboration."

**Change:** Rewrite the socratic tutor prompt to emphasize brevity, directness, and conversational warmth without verbosity. Specific tone guidance: "like talking to a knowledgeable friend who asks good questions."

---

## 8. Remove "Encouraging Feedback" from Socratic Tutor

Get rid of the encouraging feedback section in the guidelines. The system handles positive reinforcement through UI (#6), not through LLM text.

**Current code:** `buildGuidelinesSection()` includes "Provide encouraging feedback when the learner makes progress" and `buildSocraticMethodSection()` includes "Celebrate recall: Acknowledge successful recall warmly."

**Change:** Remove both. Replace with guidance about being conversational and moving forward.

---

## 9. Remove "Encourage Elaboration" from Socratic Method

The user can go down rabbit holes if they choose. The system shouldn't push them to elaborate. The session is about recall, not about generating elaborate explanations.

**Current code:** `buildSocraticMethodSection()` principle #4: "Encourage elaboration: When they recall something correctly, ask them to explain why it matters or how it connects to other concepts."

**Change:** Remove. Replace with: "When a point is recalled, acknowledge it and move to the next unchecked point."

---

## 10. One Universal Discussion Agent (Not Per-Set)

Instead of specifying a `discussionSystemPrompt` for every recall set, have one discussion prompt/agent that generates good questions for any recall set. Can accept per-set guidelines, and those guidelines should be auto-generated from noting user interaction patterns (e.g., something the AI said was misunderstood by the user).

**Current code:** `buildCustomPromptSection()` in `socratic-tutor.ts` injects `recallSet.discussionSystemPrompt`. Each seed file has a custom prompt per set.

**Change:** Design a universal discussion agent prompt that works across domains. The `discussionSystemPrompt` field becomes optional supplementary guidelines, not the primary prompt. Auto-generation of per-set guidelines is a later feature.

---

## 11. Rabbit Holes as a Separate UX Mode

Rabbit holes should NOT just be detected and steered away from. They should be a first-class UX mode:

**UX behavior:**
- When a rabbit hole is detected, the user gets a prompt: "Looks like you're exploring [topic]. Want to go down this rabbit hole?"
- If yes: the UI transitions to **rabbit hole mode** — a visually distinct state (different color scheme, different field styling) that feels exploratory rather than recall-focused
- The rabbit hole conversation runs in a **separate context** from the main recall session. It should NOT pollute the recall session's LLM context window. Think of it as a side conversation.
- The user can exit the rabbit hole freely at any time, returning to the main recall session context exactly where they left off
- If no: the system continues with the main recall flow

**LLM behavior in rabbit hole mode:**
- Exploratory and conversational, not Socratic/prodding
- Can reference source material (#15), search the web, go deep
- Completely different agent personality than the recall session agent

**Current code:** `rabbithole-detector.ts` detects tangents and the prompt instructs the tutor to redirect back. `RabbitholeDetector` in `core/analysis/` tracks active rabbit holes but only for metrics.

**Change:** This is a significant architectural change. Rabbit holes need: their own LLM context, a separate UI mode, entry/exit transitions, and a different agent prompt. The detection system already exists; the handling needs to be completely rethought.

---

## 12. Transcription Correction via Lightweight LLM

Send user voice transcriptions through Haiku alongside domain-specific terminology from the recall set. Correct technical terms before displaying. Especially important for sets with exotic vocabulary (e.g., mycelium, phosphoanhydride).

**Change:** Add a preprocessing step between voice transcription and display/LLM-input. Pass through Haiku with the recall set's terminology as context. Fast and cheap.

---

## 13. Math / Code / Formula Rendering

When the user articulates math, code, or formulas during discussion, use a lightweight LLM to convert the transcription into LaTeX, Python, or appropriate notation. The text renderer should handle rendering LaTeX and code blocks.

**Change:** Add a post-processing step that detects math/code in transcriptions and converts. Frontend needs a renderer that handles LaTeX (KaTeX) and code blocks.

---

## 14. Voice-First Input

Sessions should be voice-first. Typing allows a certain mindlessness — speaking forces genuine recall from memory. The UI should default to voice input with typing as a fallback option.

Consider: maybe the user shouldn't see their previous messages. They speak in response to whatever prompt the system has on screen. They don't have a written record of what they said previously — this forces true recall rather than re-reading and elaborating.

**Change:** Voice input as the primary interface. Browser speech-to-text API or a dedicated transcription service. UI redesign to be voice-first: large mic button, minimal text, previous messages possibly hidden or collapsed. Typing available but secondary.

---

## 15. Back Recall Sets with Raw Source Resources

Recall sets should be backed by raw source materials (articles, book excerpts, etc.). The RSA can reference and quote from source material during sessions. Resources also serve as jumping-off points for rabbit holes via web search. Helps correct domain-specific mistranscriptions (#12).

For testing purposes, find short resources that contain the information in our existing recall sets.

**Change:** Add a `resources` field or table linked to recall sets. RSA prompt includes relevant resource excerpts. Rabbit hole mode (#11) can use resources as context for deeper exploration.

---

## 16. Image Support in Sessions

Render images during sessions. Example: showing a movie frame for the Rule of Thirds recall point as a visual example when the user recalls the relevant aspects. Images could come from recall set resources (#15).

**Change:** Add image support to the WebSocket protocol and message rendering. Recall points or resources can have associated images. The RSA can trigger image display as a structured action (#6).

---

## 17. Rename "AI Tutor"

The label "AI Tutor" appears in the UI for assistant messages. Change to something else. TBD what.

**Current code:** `MessageList.tsx` labels assistant messages as "AI Tutor."

---

## 18. Fix "I Recall Nothing" Phrasing Confusion

The LLM interpreted "I recall nothing" as "the session hasn't started yet" and responded with meta-commentary about waiting for a learner. This phrasing needs to be handled as a valid (if discouraging) response in a recall session.

**Change:** Add explicit instruction in the socratic tutor prompt: "If the learner says they recall nothing or don't remember, this is a valid response. Begin with broad hints to help them start recalling."

---

## 19. Mobile Version

Build a mobile-friendly version for on-the-go use. Voice-first (#14) makes this more natural.

**Deferred:** Not in this round's implementation scope, but voice-first design should consider mobile from the start.

---

## 20. User-Suggested Software Changes

Build features where users can describe changes to the UI or software and versions are pushed to them.

**Deferred:** Product feature for later. Not in this round's scope.
