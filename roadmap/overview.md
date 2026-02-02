# Contextual Clarity: Implementation Overview

## Vision

A conversational spaced repetition system combining FSRS scheduling with Socratic AI dialogs to help users deeply internalize knowledge through dynamic, exploratory conversations.

---

## Technical Architecture

### Stack Decisions

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Runtime** | Bun | Fast, unified JS/TS runtime per user preference |
| **Language** | TypeScript | Type safety for complex domain models, good LLM SDK support |
| **Framework** | Hono | Lightweight, fast, works great with Bun |
| **Database** | SQLite (dev) → PostgreSQL (prod) | Simple local dev, scales to prod; Drizzle ORM for type-safe queries |
| **LLM** | Claude API (Anthropic SDK) | Best conversational quality for Socratic dialogs |
| **FSRS** | ts-fsrs | TypeScript implementation of Free Spaced Repetition Scheduler |
| **Frontend** | React + Vite (Phase 3+) | Fast iteration, familiar ecosystem |

### Compute & Storage

**Development:**
- Local machine with SQLite
- Claude API key (pay-per-use)
- No external services needed for phases 1-2

**Production (Phase 3+):**
- **Compute:** Railway or Fly.io ($5-20/mo for small apps)
- **Database:** Neon PostgreSQL (free tier → $19/mo scale)
- **LLM:** Claude API (~$3/MTok input, $15/MTok output for Sonnet)
- **Storage:** S3-compatible (Cloudflare R2) for large source materials if needed

**Cost Estimate:** ~$25-50/mo for light personal use

---

## Core Domain Model

```
┌─────────────────────────────────────────────────────────────────┐
│                         RecallSet                                │
│  - id, name, description, status (active/paused/archived)       │
│  - discussion_system_prompt                                      │
│  - created_at, updated_at                                        │
├─────────────────────────────────────────────────────────────────┤
│                        RecallPoint[]                             │
│  - id, recall_set_id, content, context                          │
│  - fsrs_state: {difficulty, stability, due, last_review, ...}   │
│  - recall_history: [{timestamp, success, latency}]              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Session                                  │
│  - id, recall_set_id, started_at, ended_at                      │
│  - status (in_progress/completed/abandoned)                      │
│  - target_recall_points[]                                        │
├─────────────────────────────────────────────────────────────────┤
│                       SessionMessage[]                           │
│  - id, session_id, role (user/assistant), content               │
│  - timestamp, token_count                                        │
├─────────────────────────────────────────────────────────────────┤
│                       SessionMetrics                             │
│  - duration_seconds, message_count                               │
│  - recalls_attempted, recalls_successful                         │
│  - rabbitholes: [{topic, depth, related_points}]                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      IngestionJob (Phase 4+)                     │
│  - id, source_type (transcript/document/url)                    │
│  - raw_content, extracted_points[]                               │
│  - user_refinements[], final_recall_set_id                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Module Architecture

```
src/
├── core/                    # Domain logic, zero external deps
│   ├── models/              # TypeScript types/interfaces
│   ├── fsrs/                # FSRS scheduling logic wrapper
│   ├── session/             # Session state machine
│   └── scoring/             # Recall success evaluation
│
├── llm/                     # LLM abstraction layer
│   ├── client.ts            # Anthropic SDK wrapper
│   ├── prompts/             # System prompts, prompt builders
│   └── streaming.ts         # SSE streaming utilities
│
├── storage/                 # Persistence layer
│   ├── schema.ts            # Drizzle schema definitions
│   ├── migrations/          # Database migrations
│   └── repositories/        # Data access objects
│
├── api/                     # HTTP API (Hono)
│   ├── routes/              # Route handlers
│   ├── middleware/          # Auth, logging, error handling
│   └── ws/                  # WebSocket for live sessions
│
├── cli/                     # CLI interface (Phase 1-2)
│   └── commands/            # Interactive session runner
│
└── web/                     # React frontend (Phase 3+)
    ├── components/
    ├── pages/
    └── hooks/
```

### Key Abstractions

1. **SessionEngine** - Orchestrates conversation flow, tracks recall points hit, manages state transitions
2. **FSRSScheduler** - Wraps ts-fsrs, handles due date calculations, rating conversions
3. **ConversationAgent** - LLM interaction layer with streaming, prompt construction, response parsing
4. **RecallEvaluator** - Judges whether user successfully recalled a point (LLM-assisted)
5. **Repository<T>** - Generic data access pattern for all entities

---

## Phase Dependencies

```
Phase 1 (Core Session)
    │
    ▼
Phase 2 (Session Data) ──────┐
    │                        │
    ▼                        │
Phase 3 (Main App) ◄─────────┘
    │
    ▼
Phase 4 (Ingestion) ─────────┐
    │                        │
    ▼                        │
Phase 5 (Integration) ◄──────┘
    │
    ▼
Phase 6 (Share)
```

---

## Task Structure Template

Each task in phase plans follows this structure:

```yaml
task_id: P{phase}-T{number}
title: Concise action title
description: |
  Detailed explanation of what to build, why, and how it fits
  into the larger system.

dependencies: [P1-T1, P1-T2]  # Tasks that must complete first
parallel_group: A             # Tasks in same group can run in parallel

files_to_create:
  - path/to/file.ts: "Description of file purpose"

files_to_modify:
  - existing/file.ts: "What changes to make"

success_criteria:
  - Specific, testable outcome 1
  - Specific, testable outcome 2

test_approach: How to verify this works
```

---

## Implementation Summary

### Total Tasks: 94

| Phase | Name | Tasks | Focus |
|-------|------|-------|-------|
| 1 | Core Session Loop | 13 | CLI session, FSRS, LLM integration |
| 2 | Session Data | 16 | Metrics, analytics, export |
| 3 | Main App | 22 | Web UI, API, WebSocket sessions |
| 4 | Ingestion | 18 | Content parsing, concept extraction |
| 5 | Integration | 15 | Unified UX, onboarding |
| 6 | Share | 12 | Docs, deployment, launch |

### Parallelization Potential

Tasks within each phase are organized into parallel groups (A, B, C, etc.). Tasks in the same group can be executed simultaneously by different agents if they share no dependencies.

**Example from Phase 1:**
- Group A (1 task): Project scaffolding
- Group B (3 tasks): Core types, DB schema, LLM client - all in parallel
- Group C (3 tasks): DB connection, FSRS, system prompts - all in parallel

---

## File Index

This overview document is the root. Phase-specific plans are in:

| File | Description | Tasks |
|------|-------------|-------|
| `roadmap/phase-1-core-session/plan.md` | Core session loop implementation | 13 |
| `roadmap/phase-2-session-data/plan.md` | Data tracking and metrics | 16 |
| `roadmap/phase-3-main-app/plan.md` | User-facing web application | 22 |
| `roadmap/phase-4-ingestion/plan.md` | Content ingestion pipeline | 18 |
| `roadmap/phase-5-integration/plan.md` | Ingestion + app integration | 15 |
| `roadmap/phase-6-share/plan.md` | Documentation and release | 12 |

Each phase plan contains ordered, parallelizable tasks with full specifications.

---

## Quick Start for Implementation

1. **Read this overview** - Understand architecture and abstractions
2. **Start Phase 1** - Follow tasks in order, parallelize within groups
3. **Test each task** - Use success criteria to verify completion
4. **Commit frequently** - Each task is a logical commit boundary
5. **Move to next phase** - Only after all tasks complete

### Critical Path

The minimum path to a working demo:

```
P1-T01 → P1-T02/T03/T07 → P1-T04/T06 → P1-T05 → P1-T08/T09 → P1-T10 → P1-T11/T12 → P1-T13
   │
   └─→ Phase 1 Complete (~13 tasks)
         │
         ▼
   P2-T01/T02 → P2-T03 → P2-T04 → P2-T05/T06/T07 → P2-T08/T10 → P2-T09 → P2-T11/T12/T13/T14 → P2-T16
         │
         └─→ Phase 2 Complete (CLI with full metrics)
               │
               ▼
         Phases 3-6 (Web app, ingestion, polish)
```
