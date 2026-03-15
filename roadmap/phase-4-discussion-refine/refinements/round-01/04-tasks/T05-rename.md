# T05 — Rename "AI Tutor" to "Agent"

| Field | Value |
|-------|-------|
| **name** | Rename "AI Tutor" to "Agent" |
| **parallel-group** | A (no dependencies) |
| **depends-on** | none |

---

## Description

Replace all user-visible occurrences of "AI Tutor" (and lowercase variant "AI tutor") in the frontend UI with "Agent". This is a purely cosmetic change — no backend logic, no session engine changes, no prompt changes. The label appears in chat message bubbles, the streaming message indicator, the typing/thinking indicator, and the session footer text. All four must be updated. A full codebase search must also be performed to catch any occurrences outside these known locations.

Internal code references to "tutor" (file names like `socratic-tutor.ts`, variable names like `tutorTemperature`, type names, comments explaining the concept) are NOT changed. Only user-facing rendered text is changed.

---

## Detailed Implementation

### 1. MessageList.tsx — Message Bubble Role Label (`web/src/components/live-session/MessageList.tsx`)

**Line 73** in the `MessageBubble` component. Currently reads:
```tsx
{isUser ? 'You' : 'AI Tutor'}
```

Change to:
```tsx
{isUser ? 'You' : 'Agent'}
```

This is inside the `<p>` tag that renders the role label above each message bubble. The surrounding JSX context (lines 66-74):
```tsx
{/* Role label */}
<p
  className={`
    text-xs mb-1 font-medium
    ${isUser ? 'text-blue-200' : 'text-clarity-400'}
  `}
>
  {isUser ? 'You' : 'Agent'}
</p>
```

### 2. MessageList.tsx — Typing Indicator Label (`web/src/components/live-session/MessageList.tsx`)

**Line 154** in the typing/thinking indicator block. Currently reads:
```tsx
<p className="text-xs mb-1 font-medium text-clarity-400">AI Tutor</p>
```

Change to:
```tsx
<p className="text-xs mb-1 font-medium text-clarity-400">Agent</p>
```

This is inside the `{isThinking && !streamingContent && (...)}` conditional render block (lines 151-162). The full block after the change:
```tsx
{isThinking && !streamingContent && (
  <div className="flex justify-start">
    <div className="bg-clarity-700/50 text-clarity-100 rounded-2xl rounded-tl-sm p-4 mr-12">
      <p className="text-xs mb-1 font-medium text-clarity-400">Agent</p>
      <div className="flex items-center gap-1">
        <span className="w-2 h-2 bg-clarity-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-clarity-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-clarity-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  </div>
)}
```

### 3. StreamingMessage.tsx — Streaming Role Label (`web/src/components/live-session/StreamingMessage.tsx`)

**Line 47** in the `StreamingMessage` component. Currently reads:
```tsx
<p className="text-xs mb-1 font-medium text-clarity-400">AI Tutor</p>
```

Change to:
```tsx
<p className="text-xs mb-1 font-medium text-clarity-400">Agent</p>
```

This is inside the streaming message bubble (lines 44-55):
```tsx
<div className="max-w-2xl bg-clarity-700/50 text-clarity-100 rounded-2xl rounded-tl-sm p-4 mr-12">
  {/* Role label */}
  <p className="text-xs mb-1 font-medium text-clarity-400">Agent</p>

  {/* Streaming content with blinking cursor */}
  <p className="leading-relaxed whitespace-pre-wrap">
    {content}
    {/* Blinking cursor indicator */}
    <span className="inline-block w-2 h-4 ml-0.5 bg-clarity-300 animate-pulse" />
  </p>
</div>
```

### 4. LiveSession.tsx — Session Footer Text (`web/src/pages/LiveSession.tsx`)

**Line 261** in the session page footer. Currently reads:
```tsx
<p className="text-clarity-500 text-sm">
  Sessions use WebSocket for real-time communication with the AI tutor
</p>
```

Change to:
```tsx
<p className="text-clarity-500 text-sm">
  Sessions use WebSocket for real-time communication with the Agent
</p>
```

Note: This instance uses lowercase "AI tutor" (not "AI Tutor"), which is why a case-insensitive search is essential.

### 5. e2e Test — Update Assertion (`e2e/tests/07-live-session.spec.ts`)

**Line 141** in the e2e test. Currently reads:
```typescript
messageList.getByText(/AI Tutor/i)
```

Change to:
```typescript
messageList.getByText(/Agent/i)
```

This test asserts the presence of AI message elements in the live session. The regex must match the new "Agent" label.

### 6. Full Codebase Search for Other Occurrences

After making the five known changes above, perform a comprehensive search for any other user-visible "AI Tutor" or "AI tutor" strings:

**Search 1 — All frontend files (case-insensitive):**
```bash
grep -rni "AI Tutor" web/src/
```
Any result in a `.tsx` or `.ts` file where the string appears inside JSX (rendered to the user) must also be changed to "Agent".

**Search 2 — Backend comment in session-handler.ts:**
The WebSocket session handler (`src/api/ws/session-handler.ts`) has a comment on line 40 that says `displayMessage('Tutor', message.openingMessage)`. This is inside a JSDoc `@example` comment block — it is NOT user-facing and does NOT need to be changed. However, document this decision: it's an example showing how a hypothetical client would display the message.

**Search 3 — WebSocket types comment:**
`src/api/ws/types.ts` line 126 has a JSDoc comment: "the AI tutor's opening message". This is a code comment, not user-facing. Do NOT change it — but verify it is only in a comment, not in a rendered string.

**Search 4 — Session engine and prompt files:**
`src/llm/prompts/socratic-tutor.ts` may contain "AI Tutor" or "tutor" in prompt text that is sent to the LLM. These are NOT user-facing (the user never sees the system prompt directly). Do NOT change these — the agent's identity in the prompt is a separate concern handled by T02 (Universal Agent) and T07 (Tone).

**Search 5 — Test files (case-insensitive):**
Search all test files (`*.test.ts`, `*.test.tsx`, `*.spec.ts`) for "AI Tutor":
```bash
grep -rni "AI Tutor" e2e/ tests/
```
If any test asserts the rendered text "AI Tutor", update the assertion to expect "Agent" instead.

**Search 6 — LiveSession.tsx page file (case-insensitive):**
Verify no other occurrences remain in the page file. Note the JSDoc comments at lines 6 and 9 reference "AI tutor" as a concept — these are code comments, not user-facing, and should NOT be changed.

### 7. What NOT to Rename

These items reference the concept of a tutor in code, not in user-facing UI. Leave them unchanged:

- **File names**: `src/llm/prompts/socratic-tutor.ts` — this is an implementation file name
- **Variable names**: `tutorTemperature`, `tutorMaxTokens` in `SessionEngineConfig`
- **Type names**: `SocraticTutorPromptParams` and similar
- **System prompts**: Any text sent to the LLM as system/user prompt content
- **Comments**: JSDoc comments explaining concepts (e.g., "the AI tutor asks a question")
- **Session handler examples**: Code examples in JSDoc blocks
- **Seed data `discussionSystemPrompt` values**: These tell the LLM to act as a tutor — changing them is T02/T07's job

---

## Relevant Files

| Action | File | What Changes |
|--------|------|-------------|
| MODIFY | `web/src/components/live-session/MessageList.tsx` | Line 73: `'AI Tutor'` -> `'Agent'`. Line 154: `AI Tutor` -> `Agent` in typing indicator |
| MODIFY | `web/src/components/live-session/StreamingMessage.tsx` | Line 47: `AI Tutor` -> `Agent` in streaming message role label |
| MODIFY | `web/src/pages/LiveSession.tsx` | Line 261: `AI tutor` -> `Agent` in session footer text |
| MODIFY | `e2e/tests/07-live-session.spec.ts` | Line 141: `getByText(/AI Tutor/i)` -> `getByText(/Agent/i)` in e2e test assertion |
| AUDIT | `web/src/**/*.tsx` | Case-insensitive search for any other user-visible "AI Tutor" strings |
| AUDIT | `web/src/**/*.ts` | Case-insensitive search for any other user-visible "AI Tutor" strings |
| AUDIT | `**/*.test.ts`, `**/*.test.tsx`, `**/*.spec.ts` | Update test assertions if they check for "AI Tutor" text |

---

## Success Criteria

1. **MessageList.tsx line 73**: The string `'AI Tutor'` is replaced with `'Agent'` in the ternary expression `{isUser ? 'You' : 'Agent'}`. Verified by reading the file.
2. **MessageList.tsx line 154**: The string `AI Tutor` is replaced with `Agent` in the typing indicator `<p>` tag. Verified by reading the file.
3. **StreamingMessage.tsx line 47**: The string `AI Tutor` is replaced with `Agent` in the role label `<p>` tag. Verified by reading the file.
4. **LiveSession.tsx line 261**: The string `AI tutor` is replaced with `Agent` in the session footer `<p>` tag. Verified by reading the file.
5. **e2e test updated**: `e2e/tests/07-live-session.spec.ts` line 141 uses `getByText(/Agent/i)` instead of `getByText(/AI Tutor/i)`. Verified by reading the file.
6. **No "AI Tutor" in any .tsx file**: Running `grep -rni "AI Tutor" web/src/ --include="*.tsx"` returns zero results. Every user-visible instance has been replaced.
7. **No "AI tutor" in any rendered .tsx/.ts string**: Running `grep -rni "AI Tutor" web/src/ --include="*.ts"` returns zero results in strings that are rendered to the DOM. (Comments and type documentation are acceptable.)
8. **Test assertions updated**: If any test file asserts the presence of "AI Tutor" text (e.g., `expect(screen.getByText('AI Tutor'))`), the assertion now expects `'Agent'` instead.
9. **Internal code unchanged**: The file `src/llm/prompts/socratic-tutor.ts` is NOT renamed. The variables `tutorTemperature` and `tutorMaxTokens` in `src/core/session/types.ts` are NOT renamed. The type `SocraticTutorPromptParams` is NOT renamed.
10. **`discussionSystemPrompt` unchanged**: None of the 51 recall set seed data `discussionSystemPrompt` values are modified.
11. **Visual verification**: When the app is running and a session is active:
    - Assistant message bubbles show "Agent" as the role label (not "AI Tutor")
    - The typing indicator shows "Agent" above the bouncing dots
    - The streaming message shows "Agent" above the partial response with blinking cursor
    - The session footer says "Agent" instead of "AI tutor"
    - User message bubbles still show "You"
12. **No regressions**: The app builds without errors (`bun run build` in the `web/` directory). No TypeScript compilation errors.
13. **Completeness**: A final `grep -rni "AI Tutor" web/` search returns zero hits in non-comment, non-documentation contexts. The `-i` flag ensures both "AI Tutor" and "AI tutor" variants are caught.
