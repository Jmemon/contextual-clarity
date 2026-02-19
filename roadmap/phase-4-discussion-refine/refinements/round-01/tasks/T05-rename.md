# T05 — Rename "AI Tutor" to "Agent"

| Field | Value |
|-------|-------|
| **name** | Rename "AI Tutor" to "Agent" |
| **parallel-group** | A (no dependencies) |
| **depends-on** | none |

---

## Description

Replace all user-visible occurrences of "AI Tutor" in the frontend UI with "Agent". This is a purely cosmetic change — no backend logic, no session engine changes, no prompt changes. The label "AI Tutor" appears in chat message bubbles, the streaming message indicator, and the typing/thinking indicator. All three must be updated. A full codebase search must also be performed to catch any occurrences outside these known locations.

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

### 4. Full Codebase Search for Other Occurrences

After making the three known changes above, perform a comprehensive search for any other user-visible "AI Tutor" strings:

**Search 1 — All frontend files:**
```bash
grep -rn "AI Tutor" web/src/
```
Any result in a `.tsx` or `.ts` file where the string appears inside JSX (rendered to the user) must also be changed to "Agent".

**Search 2 — Backend comment in session-handler.ts:**
The WebSocket session handler (`src/api/ws/session-handler.ts`) has a comment on line 40 that says `displayMessage('Tutor', message.openingMessage)`. This is inside a JSDoc `@example` comment block — it is NOT user-facing and does NOT need to be changed. However, document this decision: it's an example showing how a hypothetical client would display the message.

**Search 3 — WebSocket types comment:**
`src/api/ws/types.ts` line 126 has a JSDoc comment: "the AI tutor's opening message". This is a code comment, not user-facing. Do NOT change it — but verify it is only in a comment, not in a rendered string.

**Search 4 — Session engine and prompt files:**
`src/llm/prompts/socratic-tutor.ts` may contain "AI Tutor" or "tutor" in prompt text that is sent to the LLM. These are NOT user-facing (the user never sees the system prompt directly). Do NOT change these — the agent's identity in the prompt is a separate concern handled by T02 (Universal Agent) and T07 (Tone).

**Search 5 — Test files:**
Search all test files (`*.test.ts`, `*.test.tsx`, `*.spec.ts`) for "AI Tutor". If any test asserts the rendered text "AI Tutor", update the assertion to expect "Agent" instead.

### 5. What NOT to Rename

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
| MODIFY | `web/src/components/live-session/MessageList.tsx` | Line 73: `'AI Tutor'` → `'Agent'`. Line 154: `AI Tutor` → `Agent` in typing indicator |
| MODIFY | `web/src/components/live-session/StreamingMessage.tsx` | Line 47: `AI Tutor` → `Agent` in streaming message role label |
| MODIFY | `web/src/pages/LiveSession.tsx` | Line 261: user-visible "AI tutor" text — change to "Agent" |
| AUDIT | `web/src/**/*.tsx` | Search for any other user-visible "AI Tutor" strings |
| AUDIT | `web/src/**/*.ts` | Search for any other user-visible "AI Tutor" strings |
| AUDIT | `**/*.test.ts`, `**/*.test.tsx` | Update test assertions if they check for "AI Tutor" text |
| AUDIT | `e2e/tests/07-live-session.spec.ts` | Line 141: `getByText(/AI Tutor/i)` assertion — update to match "Agent" |

---

## Success Criteria

1. **MessageList.tsx line 73**: The string `'AI Tutor'` is replaced with `'Agent'` in the ternary expression `{isUser ? 'You' : 'Agent'}`. Verified by reading the file.
2. **MessageList.tsx line 154**: The string `AI Tutor` is replaced with `Agent` in the typing indicator `<p>` tag. Verified by reading the file.
3. **StreamingMessage.tsx line 47**: The string `AI Tutor` is replaced with `Agent` in the role label `<p>` tag. Verified by reading the file.
4. **No "AI Tutor" in any .tsx file**: Running `grep -rn "AI Tutor" web/src/ --include="*.tsx"` returns zero results. Every user-visible instance has been replaced.
5. **No "AI Tutor" in any rendered .ts hook/utility**: Running `grep -rn "AI Tutor" web/src/ --include="*.ts"` returns zero results in strings that are rendered to the DOM. (Comments and type documentation are acceptable.)
6. **Test assertions updated**: If any test file asserts the presence of "AI Tutor" text (e.g., `expect(screen.getByText('AI Tutor'))`), the assertion now expects `'Agent'` instead.
7. **Internal code unchanged**: The file `src/llm/prompts/socratic-tutor.ts` is NOT renamed. The variables `tutorTemperature` and `tutorMaxTokens` in `src/core/session/types.ts` are NOT renamed. The type `SocraticTutorPromptParams` is NOT renamed.
8. **`discussionSystemPrompt` unchanged**: None of the 51 recall set seed data `discussionSystemPrompt` values are modified.
9. **Visual verification**: When the app is running and a session is active:
   - Assistant message bubbles show "Agent" as the role label (not "AI Tutor")
   - The typing indicator shows "Agent" above the bouncing dots
   - The streaming message shows "Agent" above the partial response with blinking cursor
   - User message bubbles still show "You"
10. **No regressions**: The app builds without errors (`bun run build` in the `web/` directory). No TypeScript compilation errors.
11. **Completeness**: A final `grep -rni "AI Tutor" web/` search returns zero hits in non-comment, non-documentation contexts.
