# Agent File Index

> Snapshot at `0c562f6`

## Summary

The system implements a multi-agent architecture with three agent roles: a **Socratic Tutor** (trunk — guides recall via questioning), a **Branch Agent** (explores tangents with frozen parent context), and **LLM-powered detectors/evaluators** (branch detection, recall evaluation). Each agent gets its own `AnthropicClient` instance. The `SessionEngine` orchestrates the full lifecycle — routing user messages to the appropriate agent, coordinating detection/evaluation, and emitting `SessionEvent`s consumed by the WebSocket layer. Branch state is serialized to prevent race conditions; parent context is immutable. Prompt builders live under `llm/prompts/`, agent logic under `core/session/` and `core/analysis/`, types are co-located with their modules.

---

## Files

### Core Agent Classes

| File | Description |
|------|-------------|
| `core/session/session-engine.ts` | **Orchestrator.** Manages session lifecycle, routes messages to tutor or branch agent, coordinates RecallEvaluator + BranchDetector + FSRSScheduler, emits SessionEvents. |
| `core/session/branch-agent.ts` | **Branch Agent.** Own AnthropicClient, frozen parent context snapshot, generates opening messages and responses for tangent conversations. |
| `core/session/context-builder.ts` | Builds LLM message arrays: `buildTrunkContext()` for tutor (injects closed-branch summaries at fork points), `buildBranchContext()` for branch agent (parent snapshot). |
| `core/session/metrics-collector.ts` | Aggregates session metrics — message timing, recall outcomes, branch events, token usage, engagement scores. |
| `core/analysis/branch-detector.ts` | **Branch Detector.** LLM-based detection of tangents, returns, and conclusions. Maintains active branch map with serialization lock. Confidence threshold 0.6. Supports nested branches, session resume from DB. |
| `core/scoring/recall-evaluator.ts` | **Recall Evaluator.** LLM-based semantic recall assessment. Low temperature (0.3). Returns confidence + success. Enhanced mode adds concept-level analysis and FSRS rating suggestions. |

### Prompt Builders

| File | Description |
|------|-------------|
| `llm/prompts/socratic-tutor.ts` | **Tutor agent prompt.** Universal domain-agnostic recall facilitator identity. Sections: agent identity, Socratic method rules, current/recalled point context, guidelines, tangent handling (no acknowledgment — just next question), UI safety instructions. |
| `llm/prompts/branch-detector.ts` | **Branch detector prompts.** Three prompt builders (`buildBranchDetectorPrompt`, `buildBranchReturnPrompt`, `buildBranchConclusionPrompt`) + response parsers. Classifies tangent depth 1-3, relatedness to recall points. |
| `llm/prompts/recall-evaluator.ts` | **Recall evaluator prompts.** System + user message builders, enhanced evaluation variant with concept-level analysis. Response parsers for standard and enhanced modes. |

### Type Definitions

| File | Description |
|------|-------------|
| `core/session/types.ts` | `SessionEvent` discriminated union (session_started, point_recalled, branch_detected/activated/closed, branch_summary_injected, user/assistant_message), `SessionEngineConfig`, `SessionEngineDependencies`, `ProcessMessageResult`, `SessionState`. |
| `core/analysis/types.ts` | `BranchDetectorConfig` + defaults, `ActiveBranchState` (internal tracking), `DetectionDebugInfo`. |
| `core/scoring/types.ts` | `RecallEvaluation` (success, confidence, reasoning), `EnhancedRecallEvaluation` (adds keyDemonstratedConcepts, missedConcepts, suggestedRating). |
| `core/models/session-metrics.ts` | `Branch` (status: detected/active/closed/abandoned, topic, depth, related recall points), `RecallOutcome`, `TokenUsage`, `MessageTiming`, `SessionMetrics`. |

### Integration / Transport

| File | Description |
|------|-------------|
| `api/ws/session-handler.ts` | Bridges SessionEngine ↔ WebSocket. Connection lifecycle, message routing, event serialization, streaming. Handles `activate_branch` and `close_branch` client messages. |
| `api/ws/types.ts` | Client messages: `UserMessagePayload`, `ActivateBranchPayload`, `CloseBranchPayload`, `DismissOverlayPayload`. Server messages: `SessionStartedPayload`, streaming payloads, session event payloads. |

### LLM Infrastructure

| File | Description |
|------|-------------|
| `llm/client.ts` | `AnthropicClient` — each agent instantiates its own to isolate system prompts. Streaming + non-streaming completion methods. |
| `llm/types.ts` | Shared LLM types used across all agents (message roles, completion params). |
| `llm/index.ts` | Barrel export for llm module. |

### Tests

| File | Description |
|------|-------------|
| `tests/unit/prompts/socratic-tutor.test.ts` | Tests tutor prompt builder sections, tone constraints, edge cases. |
