# Phase 3: Build Main App - Implementation Plan

## Phase Goal

Build the primary user-facing web interface where users can:
- See all recall sets: in rotation, out of rotation
- View stats for each set
- Access a workspace to ingest new sets of recall points (preparation for Phase 4)
- Run interactive recall sessions via the web browser

By the end of this phase, you should be able to:
1. Start the server with `bun run server` and access the web app at `http://localhost:3000`
2. View a dashboard with global stats, due points, and recent sessions
3. Browse all recall sets with quick statistics
4. Drill into a single recall set to see detailed analytics, point status, and session history
5. Start and complete an interactive recall session in the browser
6. Review past session transcripts with evaluation markers
7. Create, edit, pause, and archive recall sets
8. Have a responsive, clean UI that works on desktop and tablet

---

## Task Overview

| ID | Title | Dependencies | Parallel Group |
|----|-------|--------------|----------------|
| P3-T01 | Backend Project Setup | P2-T16 | A |
| P3-T02 | Frontend Project Setup | P3-T01 | B |
| P3-T03 | API Route Structure | P3-T01 | B |
| P3-T04 | Dashboard API Endpoints | P3-T03 | C |
| P3-T05 | Recall Sets API Endpoints | P3-T03 | C |
| P3-T06 | Sessions API Endpoints | P3-T03 | C |
| P3-T07 | WebSocket Session Handler | P3-T01 | C |
| P3-T08 | React App Shell & Routing | P3-T02 | C |
| P3-T09 | UI Component Library | P3-T02 | C |
| P3-T10 | API Client & React Query Setup | P3-T08 | D |
| P3-T11 | Dashboard Page | P3-T04, P3-T10 | E |
| P3-T12 | Recall Sets List Page | P3-T05, P3-T10 | E |
| P3-T13 | Recall Set Detail Page | P3-T05, P3-T10 | E |
| P3-T14 | Session History Page | P3-T06, P3-T10 | E |
| P3-T15 | Session Replay Page | P3-T06, P3-T10 | E |
| P3-T16 | Live Session Interface | P3-T07, P3-T10 | F |
| P3-T17 | Recall Set Management Forms | P3-T05, P3-T09 | F |
| P3-T18 | User Context & Auth Preparation | P3-T01 | D |
| P3-T19 | Error Handling & Loading States | P3-T10 | E |
| P3-T20 | Responsive Layout & Polish | P3-T11, P3-T12, P3-T13 | G |
| P3-T21 | Integration Tests | P3-T16, P3-T17 | H |
| P3-T22 | Production Build Configuration | P3-T21 | I |

---

## Detailed Task Specifications

### P3-T01: Backend Project Setup

**Description:**
Set up the Hono web server on Bun, configure CORS, logging, and error handling middleware. Create the project structure for API routes and WebSocket handlers.

**Dependencies:** P2-T16 (Phase 2 complete)

**Parallel Group:** A

**Files to create:**
- `src/api/server.ts` - Main Hono server setup with middleware
- `src/api/middleware/cors.ts` - CORS configuration
- `src/api/middleware/error-handler.ts` - Global error handling
- `src/api/middleware/logger.ts` - Request logging
- `src/api/middleware/rate-limit.ts` - Rate limiting
- `src/api/middleware/index.ts` - Barrel export
- `src/api/index.ts` - Barrel export

```typescript
// src/api/middleware/rate-limit.ts
import type { Context, Next } from 'hono';

interface RateLimitConfig {
  windowMs: number;      // Time window in ms
  maxRequests: number;   // Max requests per window
  keyGenerator?: (c: Context) => string;
}

// Simple in-memory rate limiter (use Redis in production for multiple instances)
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(config: RateLimitConfig) {
  const { windowMs = 60000, maxRequests = 100 } = config;

  return async (c: Context, next: Next) => {
    const key = config.keyGenerator?.(c) ?? c.req.header('x-forwarded-for') ?? 'anonymous';
    const now = Date.now();

    let record = requestCounts.get(key);
    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + windowMs };
      requestCounts.set(key, record);
    }

    record.count++;

    // Set rate limit headers
    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - record.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(record.resetAt / 1000)));

    if (record.count > maxRequests) {
      return c.json({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests' },
      }, 429);
    }

    await next();
  };
}

// Usage in server.ts:
// app.use('/api/*', rateLimit({ windowMs: 60000, maxRequests: 100 }));
// app.use('/api/sessions/start', rateLimit({ windowMs: 60000, maxRequests: 10 })); // Stricter for LLM endpoints
```

```typescript
// src/api/server.ts (port availability check)

async function findAvailablePort(preferredPort: number): Promise<number> {
  const net = await import('net');

  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(preferredPort, () => {
      server.close(() => resolve(preferredPort));
    });
    server.on('error', () => {
      // Port in use, try next
      resolve(findAvailablePort(preferredPort + 1));
    });
  });
}

// In server startup:
const preferredPort = parseInt(process.env.PORT || '3000');
const actualPort = await findAvailablePort(preferredPort);
if (actualPort !== preferredPort) {
  console.log(`Port ${preferredPort} in use, using ${actualPort} instead`);
}
```

**Files to modify:**
- `package.json` - Add server start scripts

**Success criteria:**
- `bun run server` starts HTTP server on configured port
- Server automatically finds available port if preferred port is in use
- CORS allows requests from frontend dev server
- All errors return consistent JSON responses
- Request logging shows method, path, response time
- Rate limiting protects endpoints (100 req/min general, 10 req/min for LLM endpoints)

**Test approach:**
```bash
bun run server &
curl http://localhost:3000/api/health
```

---

### P3-T02: Frontend Project Setup

**Description:**
Initialize React + Vite frontend with TypeScript and Tailwind CSS. Configure build system and development proxy.

**Dependencies:** P3-T01

**Parallel Group:** B

**Files to create:**
- `web/package.json` - Frontend manifest
- `web/vite.config.ts` - Vite with proxy
- `web/tsconfig.json` - TypeScript config
- `web/tailwind.config.js` - Tailwind config
- `web/postcss.config.js` - PostCSS config
- `web/index.html` - HTML entry
- `web/src/main.tsx` - React entry
- `web/src/App.tsx` - Root component
- `web/src/index.css` - Global styles

**Dependencies to install:**
```bash
cd web
bun add react react-dom react-router-dom @tanstack/react-query recharts
bun add -d typescript @types/react @types/react-dom vite @vitejs/plugin-react tailwindcss postcss autoprefixer
```

**Success criteria:**
- `bun run web:dev` starts Vite at `http://localhost:5173`
- API proxy forwards to backend
- `bun run web:build` produces production build

---

### P3-T03: API Route Structure

**Description:**
Create route structure with shared response types and utilities.

**Dependencies:** P3-T01

**Parallel Group:** B

**Files to create:**
- `src/api/routes/index.ts` - Route aggregator
- `src/api/routes/health.ts` - Health check
- `src/api/types.ts` - API response types
- `src/api/utils/response.ts` - Response helpers
- `src/api/middleware/validate.ts` - Zod validation middleware

```typescript
// src/api/middleware/validate.ts
import { z } from 'zod';
import type { Context, Next } from 'hono';

export function validate<T extends z.ZodType>(schema: T) {
  return async (c: Context, next: Next) => {
    try {
      const body = await c.req.json();
      const validated = schema.parse(body);
      c.set('validatedBody', validated);
      await next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: error.errors.map(e => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
        }, 400);
      }
      throw error;
    }
  };
}

// Example schemas
export const createRecallSetSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000),
  discussionSystemPrompt: z.string().min(10),
});

export const createRecallPointSchema = z.object({
  content: z.string().min(10).max(2000),
  context: z.string().min(10).max(2000),
});
```

**Success criteria:**
- All routes mounted under `/api`
- `/api/health` returns `{ success: true, data: { status: 'ok' } }`
- Consistent JSON structure
- Request bodies validated with Zod schemas

---

### P3-T04: Dashboard API Endpoints

**Description:**
API endpoints for dashboard data using DashboardDataAggregator from Phase 2.

**Dependencies:** P3-T03

**Parallel Group:** C

**Files to create:**
- `src/api/routes/dashboard.ts`

**Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard/overview` | Global stats, due points, streaks |
| GET | `/api/dashboard/recent-sessions` | Last N sessions |
| GET | `/api/dashboard/upcoming-reviews` | Points due in next N days |

**Success criteria:**
- Returns complete DashboardOverview data
- Respects query parameters (limit, days)

---

### P3-T05: Recall Sets API Endpoints

**Description:**
CRUD endpoints for recall sets and points.

**Dependencies:** P3-T03

**Parallel Group:** C

**Files to create:**
- `src/api/routes/recall-sets.ts`

**Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/recall-sets` | List all sets with summary |
| POST | `/api/recall-sets` | Create new set |
| GET | `/api/recall-sets/:id` | Get set with full dashboard data |
| PATCH | `/api/recall-sets/:id` | Update set |
| DELETE | `/api/recall-sets/:id` | Archive set |
| GET | `/api/recall-sets/:id/points` | List points |
| POST | `/api/recall-sets/:id/points` | Add point |
| PATCH | `/api/recall-sets/:id/points/:pointId` | Update point |
| DELETE | `/api/recall-sets/:id/points/:pointId` | Delete point |

**Success criteria:**
- CRUD operations work correctly
- Validation returns 400 with details
- 404 for missing resources

---

### P3-T06: Sessions API Endpoints

**Description:**
Endpoints for session management and history.

**Dependencies:** P3-T03

**Parallel Group:** C

**Files to create:**
- `src/api/routes/sessions.ts`

**Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sessions` | List with filters |
| GET | `/api/sessions/:id` | Session details |
| GET | `/api/sessions/:id/transcript` | Full transcript |
| POST | `/api/sessions/start` | Start session |
| POST | `/api/sessions/:id/abandon` | Abandon session |

**Success criteria:**
- Pagination works correctly
- Filter by recallSetId and date range
- Transcript includes rabbithole/evaluation markers

---

### P3-T07: WebSocket Session Handler

**Description:**
WebSocket support for real-time sessions with streaming LLM responses.

**Dependencies:** P3-T01

**Parallel Group:** C

**Files to create:**
- `src/api/ws/session-handler.ts`
- `src/api/ws/types.ts`
- `src/api/ws/index.ts`

**Message Protocol:**
```typescript
// Client -> Server
type ClientMessage =
  | { type: 'user_message'; content: string }
  | { type: 'trigger_eval' }
  | { type: 'end_session' }
  | { type: 'ping' };

// Server -> Client
type ServerMessage =
  | { type: 'session_started'; sessionId: string; openingMessage: string }
  | { type: 'assistant_chunk'; content: string }
  | { type: 'assistant_complete'; fullContent: string }
  | { type: 'evaluation_result'; ... }
  | { type: 'point_transition'; ... }
  | { type: 'session_complete'; summary: SessionSummary }
  | { type: 'error'; code: string; message: string };
```

**Session Lifecycle:**

1. Client calls `POST /api/sessions/start` with `{ recallSetId: string }`
2. Server creates session, returns `{ sessionId: string }`
3. Client connects to WebSocket: `/api/session/ws?sessionId=<id>`
4. Server sends `session_started` with opening message
5. Conversation proceeds via WebSocket
6. On completion, server sends `session_complete` and closes connection

**Important:** The REST endpoint creates the session; the WebSocket handles the conversation.
This separation ensures:
- Session exists in DB before WebSocket connects
- Reconnection is possible (session state persisted)
- Failed WebSocket doesn't orphan session creation

**Success criteria:**
- Connection at `/api/session/ws?sessionId=<id>`
- Messages stream in real-time
- Evaluation results sent as discrete messages
- Session completion sends summary

---

### P3-T08: React App Shell & Routing

**Description:**
React Router setup with layout and page structure.

**Dependencies:** P3-T02

**Parallel Group:** C

**Files to create:**
- `web/src/layouts/MainLayout.tsx`
- `web/src/pages/Dashboard.tsx`
- `web/src/pages/RecallSets.tsx`
- `web/src/pages/RecallSetDetail.tsx`
- `web/src/pages/Sessions.tsx`
- `web/src/pages/SessionReplay.tsx`
- `web/src/pages/LiveSession.tsx`
- `web/src/pages/NotFound.tsx`
- `web/src/router.tsx`

**Routes:**
- `/` - Dashboard
- `/recall-sets` - List
- `/recall-sets/:id` - Detail
- `/sessions` - History
- `/sessions/:id` - Replay
- `/session/:id` - Live session (full-screen)

**Success criteria:**
- All routes render correctly
- Navigation highlights active route
- Browser back/forward work

---

### P3-T09: UI Component Library

**Description:**
Reusable UI components with Tailwind styling.

**Dependencies:** P3-T02

**Parallel Group:** C

**Files to create:**
- `web/src/components/ui/Button.tsx`
- `web/src/components/ui/Card.tsx`
- `web/src/components/ui/Badge.tsx`
- `web/src/components/ui/Input.tsx`
- `web/src/components/ui/Textarea.tsx`
- `web/src/components/ui/Select.tsx`
- `web/src/components/ui/Modal.tsx`
- `web/src/components/ui/Spinner.tsx`
- `web/src/components/ui/EmptyState.tsx`
- `web/src/components/ui/StatCard.tsx`
- `web/src/components/ui/Progress.tsx`
- `web/src/components/ui/Table.tsx`
- `web/src/components/ui/index.ts`

**Success criteria:**
- Components render correctly
- Variants have distinct styles
- Accessible (labels, ARIA)

---

### P3-T10: API Client & React Query Setup

**Description:**
TanStack Query setup with typed API client.

**Dependencies:** P3-T08

**Parallel Group:** D

**Files to create:**
- `web/src/lib/api-client.ts`
- `web/src/lib/query-client.ts`
- `web/src/hooks/api/use-dashboard.ts`
- `web/src/hooks/api/use-recall-sets.ts`
- `web/src/hooks/api/use-sessions.ts`
- `web/src/types/api.ts`

```typescript
// web/src/lib/query-client.ts
import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Log errors for debugging
      console.error('Query error:', query.queryKey, error);

      // Show toast for user-facing errors
      if (query.meta?.showErrorToast !== false) {
        // Will be connected to ToastContext
        window.dispatchEvent(new CustomEvent('query-error', {
          detail: { error, queryKey: query.queryKey }
        }));
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, variables, context, mutation) => {
      console.error('Mutation error:', error);
      window.dispatchEvent(new CustomEvent('mutation-error', {
        detail: { error, mutationKey: mutation.options.mutationKey }
      }));
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        if (error instanceof Error && error.message.includes('4')) {
          return false;
        }
        return failureCount < 3;
      },
    },
  },
});
```

**Success criteria:**
- All endpoints have typed client functions
- useQuery hooks return typed data
- Mutations invalidate relevant queries
- Query/mutation errors logged and dispatched to ToastContext
- 4xx errors not retried, transient errors retried up to 3 times

---

### P3-T11: Dashboard Page

**Description:**
Main dashboard with stats, due points, recent sessions, streak.

**Dependencies:** P3-T04, P3-T10

**Parallel Group:** E

**Files to create:**
- `web/src/pages/Dashboard.tsx`
- `web/src/components/dashboard/OverviewStats.tsx`
- `web/src/components/dashboard/DuePointsCard.tsx`
- `web/src/components/dashboard/RecentSessionsList.tsx`
- `web/src/components/dashboard/UpcomingReviewsCard.tsx`
- `web/src/components/dashboard/StreakDisplay.tsx`

**Success criteria:**
- Shows all statistics
- Navigation to sets/sessions works
- Loading/error states

---

### P3-T12: Recall Sets List Page

**Description:**
List of all recall sets with filtering and quick stats.

**Dependencies:** P3-T05, P3-T10

**Parallel Group:** E

**Files to create:**
- `web/src/pages/RecallSets.tsx`
- `web/src/components/recall-sets/RecallSetCard.tsx`
- `web/src/components/recall-sets/RecallSetFilters.tsx`

**Success criteria:**
- All sets displayed
- Filter by status works
- Start Session button works

---

### P3-T13: Recall Set Detail Page

**Description:**
Detailed view with stats, charts, points, session history.

**Dependencies:** P3-T05, P3-T10

**Parallel Group:** E

**Files to create:**
- `web/src/pages/RecallSetDetail.tsx`
- `web/src/components/recall-set-detail/SetHeader.tsx`
- `web/src/components/recall-set-detail/StatsOverview.tsx`
- `web/src/components/recall-set-detail/PointStatusBreakdown.tsx`
- `web/src/components/recall-set-detail/RecallRateChart.tsx`
- `web/src/components/recall-set-detail/PointsList.tsx`
- `web/src/components/recall-set-detail/SessionHistoryTable.tsx`

**Success criteria:**
- All data displayed
- Charts render correctly
- Edit/manage points works

---

### P3-T14: Session History Page

**Description:**
Paginated session list with filters.

**Dependencies:** P3-T06, P3-T10

**Parallel Group:** E

**Files to create:**
- `web/src/pages/Sessions.tsx`
- `web/src/components/sessions/SessionFilters.tsx`
- `web/src/components/sessions/SessionTable.tsx`

**Success criteria:**
- Pagination works
- Filters by set/date work
- Links to replay

---

### P3-T15: Session Replay Page

**Description:**
Transcript view with evaluation and rabbithole markers.

**Dependencies:** P3-T06, P3-T10

**Parallel Group:** E

**Files to create:**
- `web/src/pages/SessionReplay.tsx`
- `web/src/components/session-replay/TranscriptMessage.tsx`
- `web/src/components/session-replay/EvaluationMarker.tsx`
- `web/src/components/session-replay/RabbitholeMarker.tsx`
- `web/src/components/session-replay/SessionSummary.tsx`

**Success criteria:**
- Full transcript with timestamps
- Markers at correct positions
- Summary at top

---

### P3-T16: Live Session Interface

**Description:**
Real-time session UI with WebSocket streaming.

**Dependencies:** P3-T07, P3-T10

**Parallel Group:** F

**Files to create:**
- `web/src/pages/LiveSession.tsx`
- `web/src/components/live-session/SessionContainer.tsx`
- `web/src/components/live-session/MessageList.tsx`
- `web/src/components/live-session/MessageInput.tsx`
- `web/src/components/live-session/SessionProgress.tsx`
- `web/src/components/live-session/StreamingMessage.tsx`
- `web/src/components/live-session/SessionControls.tsx`
- `web/src/hooks/use-session-websocket.ts`

```typescript
// web/src/hooks/use-session-websocket.ts

interface UseSessionWebSocketOptions {
  sessionId: string;
  onMessage: (msg: ServerMessage) => void;
  onError: (error: Error) => void;
  onReconnect?: () => void;
}

export function useSessionWebSocket(options: UseSessionWebSocketOptions) {
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected' | 'reconnecting'>('connecting');
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = useRef(1000);

  const connect = useCallback(() => {
    const ws = new WebSocket(`/api/session/ws?sessionId=${options.sessionId}`);

    ws.onopen = () => {
      setConnectionState('connected');
      reconnectAttempts.current = 0;
      reconnectDelay.current = 1000;
    };

    ws.onclose = (event) => {
      if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
        setConnectionState('reconnecting');
        reconnectAttempts.current++;
        // Exponential backoff
        setTimeout(() => {
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000);
          connect();
          options.onReconnect?.();
        }, reconnectDelay.current);
      } else {
        setConnectionState('disconnected');
      }
    };

    ws.onerror = (error) => {
      options.onError(new Error('WebSocket error'));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data) as ServerMessage;
      options.onMessage(msg);
    };

    return ws;
  }, [options.sessionId]);

  // On reconnect, fetch current session state from REST API
  const syncSessionState = useCallback(async () => {
    const response = await fetch(`/api/sessions/${options.sessionId}`);
    const session = await response.json();
    // Emit messages we might have missed
    return session;
  }, [options.sessionId]);

  // ... rest of hook
}
```

**Success criteria:**
- Messages stream in real-time
- "I've got it" triggers evaluation
- Point transition indicated
- Session completion shows summary
- WebSocket reconnects automatically with exponential backoff
- Connection state exposed to UI for status indicators

---

### P3-T17: Recall Set Management Forms

**Description:**
Create/edit forms for sets and points.

**Dependencies:** P3-T05, P3-T09

**Parallel Group:** F

**Files to create:**
- `web/src/components/forms/RecallSetForm.tsx`
- `web/src/components/forms/RecallPointForm.tsx`
- `web/src/components/forms/DeleteConfirmModal.tsx`

**Success criteria:**
- Validation works
- Submit shows loading
- Data persists correctly

---

### P3-T18: User Context & Auth Preparation

**Description:**
Single-user context ready for future multi-user auth.

**Dependencies:** P3-T01

**Parallel Group:** D

**Files to create:**
- `src/api/middleware/user-context.ts`
- `src/api/types/user.ts`
- `web/src/context/UserContext.tsx`
- `web/src/hooks/use-user.ts`

**Success criteria:**
- User context in all API routes
- Patterns ready for future auth

---

### P3-T19: Error Handling & Loading States

**Description:**
Consistent error/loading patterns across app.

**Dependencies:** P3-T10

**Parallel Group:** E

**Files to create:**
- `web/src/components/ui/ErrorState.tsx`
- `web/src/components/ui/LoadingState.tsx`
- `web/src/components/ui/Toast.tsx`
- `web/src/context/ToastContext.tsx`
- `web/src/hooks/use-toast.ts`

**Success criteria:**
- Consistent loading spinners
- Error retry available
- Toast notifications for mutations

---

### P3-T20: Responsive Layout & Polish

**Description:**
Mobile/tablet support and UI polish.

**Dependencies:** P3-T11, P3-T12, P3-T13

**Parallel Group:** G

**Files to modify:**
- `web/src/layouts/MainLayout.tsx` - Mobile nav
- Various components - Responsive classes

**Success criteria:**
- Mobile hamburger menu
- Cards stack on mobile
- Touch targets 44x44px
- Smooth transitions

---

### P3-T21: Integration Tests

**Description:**
API and E2E tests for critical flows.

**Dependencies:** P3-T16, P3-T17

**Parallel Group:** H

**Files to create:**
- `tests/api/dashboard.test.ts`
- `tests/api/recall-sets.test.ts`
- `tests/api/sessions.test.ts`
- `tests/e2e/session-flow.test.ts`

**Success criteria:**
- All API endpoints tested
- WebSocket flow tested
- Tests run in CI

---

### P3-T22: Production Build Configuration

**Description:**
Docker and production deployment setup.

**Dependencies:** P3-T21

**Parallel Group:** I

**Files to create:**
- `Dockerfile`
- `.env.production.example`
- `scripts/build.sh`
- `src/config.ts`

**Success criteria:**
- `bun run build` produces artifacts
- Docker image builds
- Environment config works

---

## Final Checklist

- [ ] `bun run server` starts API
- [ ] `bun run web:dev` starts frontend
- [ ] API endpoints return correct data
- [ ] WebSocket sessions work
- [ ] Dashboard displays stats
- [ ] Recall sets list/detail work
- [ ] Session history/replay work
- [ ] Live session works
- [ ] Forms create/edit data
- [ ] Responsive on tablet
- [ ] Tests pass
- [ ] Docker builds

---

## File Tree Summary (Phase 3 Additions)

```
contextual-clarity/
├── Dockerfile
├── scripts/build.sh
├── src/
│   ├── api/
│   │   ├── server.ts
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── config.ts
│   │   ├── middleware/
│   │   │   ├── cors.ts
│   │   │   ├── error-handler.ts
│   │   │   ├── logger.ts
│   │   │   ├── rate-limit.ts
│   │   │   ├── validate.ts
│   │   │   ├── user-context.ts
│   │   │   └── index.ts
│   │   ├── routes/
│   │   │   ├── index.ts
│   │   │   ├── health.ts
│   │   │   ├── dashboard.ts
│   │   │   ├── recall-sets.ts
│   │   │   └── sessions.ts
│   │   ├── ws/
│   │   │   ├── session-handler.ts
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   └── utils/response.ts
│   └── config.ts
├── web/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── router.tsx
│       ├── index.css
│       ├── layouts/MainLayout.tsx
│       ├── pages/
│       │   ├── Dashboard.tsx
│       │   ├── RecallSets.tsx
│       │   ├── RecallSetDetail.tsx
│       │   ├── Sessions.tsx
│       │   ├── SessionReplay.tsx
│       │   ├── LiveSession.tsx
│       │   └── NotFound.tsx
│       ├── components/
│       │   ├── ui/ (Button, Card, Badge, Input, Modal, etc.)
│       │   ├── dashboard/ (OverviewStats, RecentSessions, etc.)
│       │   ├── recall-sets/ (RecallSetCard, Filters)
│       │   ├── recall-set-detail/ (Charts, PointsList, etc.)
│       │   ├── sessions/ (Filters, Table)
│       │   ├── session-replay/ (Transcript, Markers)
│       │   ├── live-session/ (MessageList, Input, etc.)
│       │   └── forms/ (RecallSetForm, PointForm)
│       ├── lib/ (api-client, query-client)
│       ├── hooks/ (api hooks, useSessionWebSocket, useToast)
│       ├── context/ (UserContext, ToastContext)
│       └── types/api.ts
└── tests/
    ├── api/ (dashboard, recall-sets, sessions tests)
    └── e2e/session-flow.test.ts
```
