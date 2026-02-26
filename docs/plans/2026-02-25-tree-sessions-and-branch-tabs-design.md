# Tree Sessions & Branch Tab UX — Design Document

**Date:** 2026-02-25
**Branch:** discussion-refine
**Status:** Approved

## Problem

Sessions are stored as flat message sequences. Rabbit holes take over the entire UI with an emerald theme switch, requiring explicit "Explore" / "Return" buttons. This is clunky — it interrupts flow, mixes rabbit hole context into the main session, and only supports one rabbit hole at a time.

## Solution

Two interconnected changes:

1. **Tree data structure for sessions.** Sessions become trees where rabbit holes are branches off the main trunk (or off other branches). Each branch has its own conversation context, and the main session never sees raw branch exchanges — only summaries injected at branch points when branches close.

2. **Tab-based branch UX.** Instead of switching the whole UI to emerald, branches appear as tabs on the right edge of the screen. Users tap a tab to explore it, tap another to switch back. Multiple branches can coexist. Non-invasive, no mode switching.

## Design Decisions

### Approach chosen: Evolve `rabbitholeEvents` → new `branches` table

**Considered alternatives:**
- **Separate `branches` table alongside `rabbitholeEvents`**: Rejected — duplication, two tables representing overlapping concepts.
- **JSON tree document on sessions table**: Rejected — fights the relational model, can't enforce referential integrity, poor Drizzle ORM support.

**Chosen approach** creates a new `branches` table and drops `rabbitholeEvents`. Clean relational model. Nesting is trivial via self-referential `parentBranchId`. Existing rabbithole data is not preserved (no production data to migrate).

---

## Section 1: Data Model — The Tree Structure

### New `branches` table (replaces `rabbithole_events`)

```sql
branches
  id                    TEXT PRIMARY KEY        -- 'br_<uuid>'
  sessionId             TEXT FK → sessions.id   -- NOT NULL
  parentBranchId        TEXT FK → branches.id   -- nullable; null = branched from trunk
  branchPointMessageId  TEXT FK → session_messages.id  -- the exact message in the parent where this branch forks
  topic                 TEXT NOT NULL
  status                TEXT enum('detected', 'active', 'closed', 'abandoned')
                        -- detected: tab appeared, user hasn't engaged yet
                        -- active: user has engaged, agent is/was alive
                        -- closed: naturally concluded or user marked done
                        -- abandoned: session ended with branch still open
  summary               TEXT                    -- nullable; populated on close
  depth                 INTEGER NOT NULL        -- 1 = off trunk, 2 = off a branch, etc.
  relatedRecallPointIds JSON<string[]>
  userInitiated         BOOLEAN
  conversation          JSON<{role, content}[]> -- full exchange, always persisted
  createdAt             TIMESTAMP_MS
  closedAt              TIMESTAMP_MS            -- nullable
```

### Modified `session_messages` table

Add one column:

```sql
branchId  TEXT FK → branches.id  -- nullable; null = trunk message
```

### Key relationships

- A session has one trunk (messages where `branchId IS NULL`) and N branches.
- Each branch knows its parent (`parentBranchId`) and fork point (`branchPointMessageId`).
- Nesting is natural: branch B's `parentBranchId` → branch A's `id`.
- To reconstruct any branch's context: walk up the `parentBranchId` chain, collecting trunk/parent messages up to each `branchPointMessageId`.

### What gets dropped

- `rabbithole_events` table — dropped entirely, no data migration.
- `triggerMessageIndex` / `returnMessageIndex` — replaced by `branchPointMessageId` (a real FK, not a fragile integer index).
- Metrics columns `rabbithole_count`, `total_rabbithole_time_ms`, `avg_rabbithole_depth` in `session_metrics` — stay conceptually the same but are now computed from the `branches` table.

---

## Section 2: WebSocket Protocol — Multiplexed Branches

One WebSocket connection. All branches multiplexed via `branchId` field.

### Client → Server

| Message | Fields | When |
|---------|--------|------|
| `user_message` | `content`, `branchId?` | User sends a message. `branchId` null = trunk. |
| `activate_branch` | `branchId` | User clicks a tab for the first time — triggers agent creation + opening message. |
| `close_branch` | `branchId` | User explicitly marks a branch as done. |

### Server → Client

| Message | Fields | When |
|---------|--------|------|
| `branch_detected` | `branchId`, `topic`, `parentBranchId?`, `depth` | AI detects tangent — tab should appear. |
| `branch_activated` | `branchId`, `topic` | Confirms agent is ready after `activate_branch`. |
| `assistant_chunk` | `content`, `branchId?` | Streaming token. `branchId` null = trunk. |
| `assistant_complete` | `branchId?` | Stream done for a branch or trunk. |
| `branch_closed` | `branchId`, `summary` | Branch concluded (AI-detected or user-closed). |
| `branch_summary_injected` | `branchId`, `summary`, `branchPointMessageId` | Summary available in parent's context. |

### Removed messages

**Client:** `enter_rabbithole`, `exit_rabbithole`, `decline_rabbithole`
**Server:** `rabbithole_detected`, `rabbithole_entered`, `rabbithole_exited`

### Processing lock

Changes from global to per-branch: `Map<branchId | 'trunk', Promise<void>>`. Trunk and branch messages can process concurrently. Messages within the same branch are serialized.

---

## Section 3: Backend Engine — Multi-Branch SessionEngine

### Current state

`SessionEngine` has one `activeRabbitholeAgent`, one `currentMode` ('recall' | 'rabbithole'), and a global processing lock. Supports one rabbit hole at a time.

### New design

**`currentMode` eliminated.** No global mode. Server routes by `branchId`:
- `branchId` null/undefined → trunk → Socratic tutor (as today)
- `branchId` present → look up agent in map → route to that agent

**Branch agent management:**
- `Map<branchId, BranchAgent>` replaces single `activeRabbitholeAgent`
- Each `BranchAgent` (renamed from `RabbitholeAgent`) owns its own `AnthropicClient`, message history, and topic
- Agents created lazily — only on `activate_branch`, not on detection
- Agents destroyed on branch close

**BranchAgent changes from RabbitholeAgent:**
- Constructor accepts parent context messages (frozen snapshot) in addition to topic/recallSet info
- Parent context is prepended to the agent's conversation history so the LLM has full prior context
- Otherwise same behavior: own LLM client, exploratory tone, separate message history

**Branch conclusion detection:**
- Adapted from `RabbitholeDetector.detectReturns()`: instead of "returned to main topic," detects "conversation has naturally wound down"
- Runs after each branch message using the branch's own conversation
- On detection → auto-close (same flow as user-triggered close)

**Recall evaluation during branches:**
- Continues as-is. `evaluateUncheckedPoints()` still runs on branch messages, can still mark points recalled.
- Points recalled during a branch tracked per-branch for metrics.

---

## Section 4: Frontend UX — Tab-Based Branch Navigation

### Layout

```
┌──────────────────────────────────────┬──────┐
│  Header / Progress                   │      │
│                                      │  T   │
│                                      │  A   │
│  SingleExchangeView                  │  B   │
│  (renders whichever tab is active)   │      │
│                                      │  B   │
│                                      │  A   │
│  VoiceInput                          │  R   │
└──────────────────────────────────────┴──────┘
```

### Tab bar behavior

- "Session" tab always present at top (the trunk).
- `branch_detected` → new tab slides in with subtle pulse animation.
- Nested branches indent under their parent tab.
- Active tab has highlight/accent; inactive tabs are muted.
- Closed branches disappear, summary pill appears in progress area.
- Unread dot on tabs with unseen content.

### Tab visual treatment

- Small vertical pills on right edge with truncated topic label.
- Trunk tab: clarity-blue accent (existing palette).
- Branch tabs: neutral/warm accent (stone or distinct color per branch). **No emerald theme switch.**
- New tab entrance: slide-in from right + brief glow, then settle.

### What gets removed

- `RabbitholePrompt.tsx` — no more inline "Explore / Stay on track" card.
- `RabbitholeIndicator.tsx` — no more top banner.
- All emerald theme switching: `isInRabbithole` conditional classes throughout `SessionContainer`, `SingleExchangeView`, `VoiceInput`, `SessionProgress`.
- The `isInRabbithole` boolean and all components consuming it.

### What gets added

- `BranchTabBar.tsx` — right-edge vertical tab strip.
- `BranchTab.tsx` — individual tab (topic label, active state, close action, unread dot).
- State: `activeBranchId: string | null` (null = trunk), `branches: Map<branchId, BranchState>`.
- Each branch has its own `latestAssistantMessage`, `streamingContent`, `lastSentUserMessage`.
- `SingleExchangeView` renders whichever branch/trunk is active.

### Tab switching

- Click tab → set `activeBranchId` → `SingleExchangeView` renders that branch's latest exchange.
- First click on a `detected` branch → send `activate_branch` → loading state → agent streams opening message.
- Switching back to trunk: instant (state preserved in memory).
- Voice/text input routes to whichever tab is active.

### Mobile

- Tab bar collapses to narrow strip (colored dots).
- Tap to expand into overlay list showing branch topics.

---

## Section 5: Context Building

### Trunk context (Socratic tutor LLM)

```
System prompt (Socratic tutor)
+ trunk messages in order
+ at each branchPointMessageId where a CLOSED branch exists:
    inject → { role: 'system', content: '[Branch: {topic}] {summary}' }
+ open/detected branches contribute NOTHING to trunk context
```

Example: trunk messages M1–M5, branch B1 forked at M2 (closed, summary S1), branch B2 forked at M4 (still open):
```
M1, M2, [system: S1], M3, M4, M5
```

### Branch context (BranchAgent LLM)

```
System prompt (exploratory agent, parameterized by topic)
+ parent context up to branchPointMessageId (frozen snapshot):
    - If parent is trunk: trunk messages up to branch point
    - If parent is another branch: that branch's context up to its branch point
    - Includes closed sibling/ancestor branch summaries preceding the branch point
+ branch's own messages from activation onward
```

Example of nested branch: trunk M1–M3, branch B1 forks at M2 with messages B1.1–B1.3, branch B2 forks at B1.2:
```
B2's context: [M1, M2] → [B1.1, B1.2] → [B2.1, B2.2]
```

### Implementation

```typescript
function buildBranchContext(
  branchId: string,
  branches: Map<string, Branch>,
  trunkMessages: Message[]
): Message[] {
  // 1. Walk up parentBranchId chain to collect ancestry path
  // 2. Start from trunk messages up to root ancestor's branchPointMessageId
  // 3. For each ancestor, append its messages up to next child's branchPointMessageId
  // 4. At each level, inject closed sibling branch summaries at their branch points
  // 5. Return flattened ordered message array
}
```

### Summary generation

On branch close, call LLM with the branch conversation:
> "Summarize this tangent exploration in 1-2 sentences. Focus on what was clarified, discovered, or changed. Be concise unless something directly relevant to the main session was discussed."

Summaries are NOT stored as real messages in `session_messages`. They are synthesized at context-build time by checking the `branches` table for closed branches with summaries.

---

## Section 6: Branch Lifecycle

### State machine

```
[detection] → detected → [user clicks tab] → active → [close] → closed
                 |                                |
                 └──── [session ends] ────────────┘──→ abandoned
```

### 1. Detection (`detected`)

- Trigger: `RabbitholeDetector` runs after each trunk message, detects tangent.
- Server: creates branch record with `status: 'detected'`, emits `branch_detected`.
- Client: tab slides into tab bar with pulse animation.
- No agent created. No LLM cost.

### 2. Activation (`active`)

- Trigger: user clicks the tab → client sends `activate_branch`.
- Server: creates `BranchAgent` with frozen parent context, generates opening message, streams it, updates status to `active`.
- Client: sets `activeBranchId`, shows loading → opening message streams in.

### 3. Ongoing conversation

- User messages tagged with `branchId` → routed to that branch's agent.
- Recall evaluation runs silently on branch messages.
- User switches tabs freely — client-side `activeBranchId` change, no server message.
- Detection continues on trunk messages — can spawn more branches while others are active.
- Detection also runs on branch messages — can spawn nested branches.

### 4. Closure (three paths)

**(a) User marks done:** close button on tab → `close_branch` → server generates summary → destroys agent → emits `branch_closed` → tab disappears, summary pill appears.

**(b) AI detects natural conclusion:** lightweight "winding down?" check after each branch message. If yes → same close flow as (a), server-initiated.

**(c) Session ends:** all `detected` or `active` branches marked `abandoned`. No summary generated.

### 5. Post-closure

- Summary injected into parent's context at branch point (at context-build time).
- `branch_summary_injected` event sent to client.
- Full conversation persisted in `branches.conversation`.
- Tab disappears, summary pill appears in progress area.

### Edge cases

- **User never clicks a `detected` tab** → stays `detected` until session ends → `abandoned`, no conversation.
- **User abandons an `active` branch** → stays `active` until session ends → `abandoned`, partial conversation persisted.
- **Branch detected while user views another branch** → tab appears in bar, user sees it when they glance.
- **Multiple branches activate simultaneously** → each has own agent and per-branch lock.
- **Nested branch detection** → detector runs on branch messages, `parentBranchId` set to current branch.

---

## Section 7: Migration & Breaking Changes

### Database

- Create new `branches` table.
- Add `branchId` column to `session_messages` (nullable, default null).
- Drop `rabbithole_events` table. No data migration needed.

### Rename blast radius

~1,636 references to "rabbithole" across 71 files. Phased rename order:
1. Schema (Drizzle table, types)
2. Core types and models (`RabbitholeEvent` → `Branch`, etc.)
3. Repositories (`RabbitholeEventRepository` → `BranchRepository`)
4. Engine (`RabbitholeAgent` → `BranchAgent`, `RabbitholeDetector` → `BranchDetector`)
5. WebSocket types and handler (message type literals, payload interfaces)
6. Frontend components and hooks
7. Tests
8. Documentation (can lag behind)

### Session replay

`RabbitholeMarker.tsx` becomes a "Branch: {topic}" expandable section in the transcript view, showing the summary by default with an option to expand the full branch conversation.

### Metrics

`session_metrics` columns (`rabbitholeCount`, `totalRabbitholeTimeMs`, `avgRabbitholeDepth`) stay conceptually the same — now computed from `branches` table. Column names can be renamed to `branchCount`, `totalBranchTimeMs`, `avgBranchDepth` as part of the rename.
