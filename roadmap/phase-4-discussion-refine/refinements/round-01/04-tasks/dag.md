# Round 1 Refinements — Task Dependency DAG

## Task List (13 tasks)

| ID | Task | Shorthand | Group |
|----|------|-----------|-------|
| T01 | Per-session recall point checklist | `checklist` | A |
| T02 | Universal discussion agent | `universal-agent` | B |
| T03 | Transcription processing pipeline | `transcription` | A |
| T04 | Source resources with images | `resources` | A |
| T05 | Rename "AI Tutor" to "Agent" | `rename` | A |
| T06 | Continuous evaluator with feedback field | `evaluator` | B |
| T07 | Tone overhaul | `tone` | B |
| T08 | Sessions auto-end + Leave Session | `auto-end` | C |
| T09 | Rabbit holes as separate UX mode | `rabbitholes` | C |
| T10 | Voice-first input (Deepgram) | `voice-input` | C |
| T11 | Visual progress | `progress` | D |
| T12 | Single-exchange UI | `single-exchange` | D |
| T13 | Structured events protocol | `events` | E |

## Dependency DAG

```
GROUP A — No dependencies (start in parallel)
═══════════════════════════════════════════════

  ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌────────┐
  │ T01      │  │ T03          │  │ T04      │  │ T05    │
  │checklist │  │transcription │  │resources │  │rename  │
  │          │  │              │  │          │  │        │
  └──┬───┬───┘  └──────┬───────┘  └──────────┘  └────────┘
     │   │             │
     │   │             │
GROUP B — Wave 2       │
══════════════════     │
     │   │             │
     ▼   ▼             │
  ┌──────────┐  ┌──────────┐  ┌──────────────┐
  │ T06      │  │ T02      │  │ T07          │
  │evaluator │  │universal-│  │tone          │
  │          │  │agent     │  │(dep: T02)    │
  └──┬───┬───┘  └──────────┘  └──────────────┘
     │   │
     │   │
GROUP C — Wave 3
══════════════════
     │   │             │
     ▼   ▼             ▼
  ┌──────────┐  ┌──────────┐     ┌──────────┐
  │ T08      │  │ T09      │     │ T10      │
  │auto-end  │  │rabbitholes│     │voice-    │
  │          │  │          │     │input     │
  └──────────┘  └────┬─────┘     └────┬─────┘
                     │                │
                     │                │
GROUP D — Wave 4     │                │
══════════════════   │                │
                     │                │
                     ▼                ▼
               ┌──────────┐    ┌──────────┐
               │ T11      │    │ T12      │
               │progress  │    │single-   │
               │          │    │exchange  │
               └──────────┘    └──────────┘

GROUP E — Final
══════════════════

               ┌──────────┐
               │ T13      │
               │events    │  ← depends on all T01-T12
               │          │
               └──────────┘
```

## Hard Dependencies

| Task | Depends On | Reason |
|------|-----------|--------|
| T02 `universal-agent` | T01 `checklist` | **[ADDED by audit]** Universal agent prompt assumes T01's new `uncheckedPoints`/`currentProbePoint` params exist in `SocraticTutorPromptParams` |
| T06 `evaluator` | T01 `checklist` | Evaluator receives the full unchecked-points list from the checklist to evaluate against |
| T07 `tone` | T02 `universal-agent` | Tone rewrite targets the universal agent's prompt — write the agent first, then tune its voice |
| T08 `auto-end` | T06 `evaluator` | Auto-end triggers when evaluator marks the last point as recalled; needs evaluator's continuous loop |
| T09 `rabbitholes` | T06 `evaluator` | Rabbit hole mode requires the evaluator's dual-mode (recall vs rabbit-hole) with silent point tracking |
| T10 `voice-input` | T03 `transcription` | Voice produces raw transcriptions; the pipeline processes them before display |
| T11 `progress` | T01 `checklist`, T09 `rabbitholes` | Progress reads checklist state for circle counts; hides during rabbit holes and shows rabbit hole labels |
| T12 `single-exchange` | T10 `voice-input`, T03 `transcription` | **[T03 ADDED by audit]** Single-exchange view imports `FormattedText` component created by T03; also replaces the chat scroll that voice input sends messages into |
| T13 `events` | T01-T12 (all) | Event protocol codifies the full surface area — build last when all events are known |

## Soft Dependencies (Enhances)

| Task | Enhanced By | Reason |
|------|-----------|--------|
| T09 `rabbitholes` | T04 `resources` | Rabbit hole agent can reference source materials for deeper exploration |
| T09 `rabbitholes` | T10 `voice-input` | Rabbit holes should be voice-first, but work with text initially |
| T06 `evaluator` | T04 `resources` | Evaluator could use source material for more accurate assessment |
| T11 `progress` | T12 `single-exchange` | Progress bar design complements the single-exchange layout |

## Parallel Groups

### Group A — No dependencies (all start immediately, in parallel)
- **T01** `checklist` — Per-session recall point state (backend engine)
- **T03** `transcription` — Transcription pipeline + KaTeX rendering (backend + frontend)
- **T04** `resources` — Source resources with images (schema + seeds for all 51 sets)
- **T05** `rename` — Rename "AI Tutor" to "Agent" (4 string replacements)

### Group B — Wave 2 (unblocked when T01 completes)
- **T02** `universal-agent` — Universal discussion agent (prompt design, depends on T01)
- **T06** `evaluator` — Continuous evaluator (depends on T01)
- **T07** `tone` — Tone overhaul prompt rewrite (depends on T02; T02 depends on T01, so T07 can only start after both T01 and T02 complete)

> **Note**: T07 depends on T02 which depends on T01. Within Wave 2, T02 must complete before T07 can start. T06 can start as soon as T01 completes. Effective sub-ordering: T06 starts immediately in Wave 2; T02 starts immediately in Wave 2; T07 starts when T02 finishes.

### Group C — Wave 3 (unblocked when Group B completes)
- **T08** `auto-end` — Sessions auto-end + Leave Session (depends on T06)
- **T09** `rabbitholes` — Rabbit holes as separate UX mode (depends on T06)
- **T10** `voice-input` — Voice-first input with Deepgram (depends on T03)

> **Note**: T10 only depends on T03 (Group A), so it could technically start in Wave 2. However, it is grouped in Wave 3 for scheduling simplicity. If parallelism is maximized, T10 can start as soon as T03 completes.

### Group D — Wave 4 (unblocked when Group C completes)
- **T11** `progress` — Visual progress (depends on T01, T09)
- **T12** `single-exchange` — Single-exchange UI (depends on T10, T03)

### Group E — Final pass
- **T13** `events` — Structured events protocol (depends on all T01-T12)

## Build Order

| Wave | Tasks | What's Unblocked |
|------|-------|-------------------|
| **1** | T01 + T03 + T04 + T05 | All independent, start in parallel |
| **2** | T02 + T06 (+ T07 after T02) | T02 unblocked by T01; T06 unblocked by T01; T07 unblocked by T02 |
| **3** | T08 + T09 + T10 | T08/T09 unblocked by T06; T10 unblocked by T03 |
| **4** | T11 + T12 | T11 unblocked by T01+T09; T12 unblocked by T10+T03 |
| **5** | T13 | Unblocked by all prior tasks; codifies the full event protocol |

## Critical Path

The longest dependency chain determines minimum sequential time:

```
T01 → T06 → T09 → T11 → T13
 (A)   (B)   (C)   (D)   (E)
```

This 5-step chain is the critical path. All other tasks complete within or alongside it.

Secondary chains:
- `T01 → T02 → T07` (3 steps, completes within Wave 2)
- `T03 → T10 → T12` (3 steps, completes within Wave 4)

## Audit Changes Log

Changes made during Round 1 audit (2026-02-19):

1. **T02 moved from Group A to Group B**: T02's universal agent prompt assumes `uncheckedPoints`/`currentProbePoint` params from `SocraticTutorPromptParams`, which T01 introduces. Without this dependency, T02 code won't compile against the current `SocraticTutorPromptParams` interface.

2. **T12 now also depends on T03**: T12's `SingleExchangeView` component imports `FormattedText` from `../shared/FormattedText`, which T03 creates. Without T03 completing first, T12 won't compile.

3. **T05 description updated**: 3 → 4 string replacements (added `LiveSession.tsx` footer text).

## Task File Index

All task files live in this directory:

| File | Success Criteria |
|------|-----------------|
| `T01-checklist.md` | 16 criteria |
| `T02-universal-agent.md` | 15 criteria |
| `T03-transcription.md` | 20 criteria |
| `T04-resources.md` | 20 criteria |
| `T05-rename.md` | 11 criteria |
| `T06-evaluator.md` | 17 criteria |
| `T07-tone.md` | 15 criteria |
| `T08-auto-end.md` | 17 criteria |
| `T09-rabbitholes.md` | 18 criteria |
| `T10-voice-input.md` | 20 criteria |
| `T11-progress.md` | 17 criteria |
| `T12-single-exchange-ui.md` | 20 criteria |
| `T13-events.md` | 20 criteria |
| **Total** | **226 success criteria** |
