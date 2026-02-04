# Contextual Clarity Web Application

A web interface for running interactive recall sessions with Socratic AI tutoring. This guide covers the full stack: backend API server, frontend React application, and real-time WebSocket communication.

## Prerequisites

Before starting, ensure you have:

1. **Bun** (v1.0+): JavaScript/TypeScript runtime
2. **Node.js** (for some tooling, optional but recommended)
3. **Anthropic API key**: Get one at https://console.anthropic.com/

## Getting Started

### 1. Install Dependencies

```bash
# Root dependencies (backend)
bun install

# Frontend dependencies
cd web && bun install && cd ..
```

### 2. Initialize the Database

```bash
bun run db:migrate          # Apply schema migrations
bun run db:seed             # Optional: add sample recall sets
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Required variables:
```bash
ANTHROPIC_API_KEY=sk-ant-xxx    # Your Claude API key
```

### 4. Start Development Servers

**Option A: Start both servers manually**
```bash
# Terminal 1: Backend API server
bun run server                   # Starts on port 3001

# Terminal 2: Frontend dev server
cd web && bun run dev            # Starts on port 5173
```

**Option B: Use concurrently (if configured)**
```bash
bun run dev                      # Starts both servers
```

**Access the app:**
- Frontend: http://localhost:5173
- API directly: http://localhost:3001/api
- Health check: http://localhost:3001/health

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │   Pages     │  │  Components  │  │  TanStack Query       │  │
│  │  Dashboard  │  │  UI Library  │  │  (Server State)       │  │
│  │  RecallSets │  │  Forms       │  │                       │  │
│  │  Sessions   │  │  Charts      │  │  WebSocket Hook       │  │
│  │  LiveSession│  │              │  │  (Real-time State)    │  │
│  └─────────────┘  └──────────────┘  └───────────────────────┘  │
│                            │                                    │
│                            │ HTTP (REST) + WebSocket            │
└────────────────────────────┼────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Backend (Hono/Bun)                       │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │   Routes    │  │  Middleware  │  │  WebSocket Handler    │  │
│  │  /api/*     │  │  CORS        │  │  Session streaming    │  │
│  │  /health    │  │  Rate limit  │  │  LLM integration      │  │
│  │             │  │  Validation  │  │                       │  │
│  └─────────────┘  └──────────────┘  └───────────────────────┘  │
│                            │                                    │
│                            ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                     Core Services                         │  │
│  │  SessionEngine │ FSRS Scheduler │ DashboardAggregator    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                    │
│                            ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │               Storage (Drizzle ORM)                       │  │
│  │  SQLite (dev) │ PostgreSQL (prod)                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   External Services                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Anthropic Claude API (LLM for Socratic dialogue)        │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Why |
|-------|------------|-----|
| Runtime | Bun | Fast startup, native TypeScript, built-in bundler |
| Backend | Hono | Lightweight, TypeScript-first, WebSocket support |
| Database | SQLite/PostgreSQL | SQLite for dev simplicity, Postgres for production |
| ORM | Drizzle | Type-safe, migration support, performant |
| Frontend | React 18 | Component model, hooks, concurrent features |
| Build | Vite | Fast HMR, ES modules, optimized production builds |
| Styling | Tailwind CSS | Utility-first, no CSS-in-JS runtime |
| Data Fetching | TanStack Query | Caching, revalidation, mutation handling |
| Routing | React Router v6 | Standard React routing |
| AI | Anthropic Claude | Socratic dialogue generation and evaluation |

---

## Backend API

### Server Configuration (`src/api/server.ts`)

The server automatically finds an available port if the default is in use:

```bash
PORT=3001 bun run server    # Tries 3001, then 3002, etc.
```

**Port discovery behavior:**
- Starts at configured port (default: 3001)
- Tries incrementally up to configured port + 100
- Logs the actual port used

### Middleware Stack

Middleware executes in order (first to last):

1. **Error Handler** - Catches all errors, returns consistent JSON
2. **Logger** - Logs requests with timing (color-coded in dev)
3. **CORS** - Handles cross-origin requests
4. **User Context** - Injects user into request context
5. **Rate Limiter** - Protects against abuse

### API Endpoints

#### Health Check
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server status (for load balancers) |

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "environment": "development",
    "version": "1.0.0"
  }
}
```

#### Dashboard
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard/overview` | Complete dashboard summary |
| GET | `/api/dashboard/recent-sessions` | Recent sessions (default: 5) |
| GET | `/api/dashboard/upcoming-reviews` | Reviews due (default: 7 days) |

**Query Parameters:**
- `recent-sessions`: `?limit=10` (max 50)
- `upcoming-reviews`: `?days=14` (max 30)

#### Recall Sets
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/recall-sets` | List all sets with summaries |
| POST | `/api/recall-sets` | Create new set |
| GET | `/api/recall-sets/:id` | Get set with stats |
| PATCH | `/api/recall-sets/:id` | Update set |
| DELETE | `/api/recall-sets/:id` | Archive set (soft delete) |
| GET | `/api/recall-sets/:id/points` | List points in set |
| POST | `/api/recall-sets/:id/points` | Add point to set |
| PATCH | `/api/recall-sets/:id/points/:pointId` | Update point |
| DELETE | `/api/recall-sets/:id/points/:pointId` | Delete point |

**Create Recall Set:**
```json
POST /api/recall-sets
{
  "name": "My Set",                    // Required, 1-100 chars
  "description": "Description",        // Optional, max 1000 chars
  "discussionSystemPrompt": "..."      // Required, min 10 chars
}
```

**Create Recall Point:**
```json
POST /api/recall-sets/:id/points
{
  "content": "What is X?",             // Required, 10-2000 chars
  "context": "Supporting context..."   // Required, 10-2000 chars
}
```

#### Sessions
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sessions` | List sessions with filters |
| GET | `/api/sessions/:id` | Session details |
| GET | `/api/sessions/:id/transcript` | Full transcript |
| POST | `/api/sessions/start` | Start new session |
| POST | `/api/sessions/:id/abandon` | Abandon session |

**List Sessions Query Parameters:**
- `limit`: Max results (default: 20, max: 100)
- `offset`: Pagination offset
- `recallSetId`: Filter by recall set
- `startDate`: Filter by date (ISO 8601)
- `endDate`: Filter by date (ISO 8601)
- `status`: Filter by status (in_progress, completed, abandoned)

**Start Session:**
```json
POST /api/sessions/start
{
  "recallSetId": "rs_abc123"
}
```

Returns session ID for WebSocket connection.

### Response Format

All API responses follow this structure:

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": [
      { "path": "name", "message": "Required" }
    ]
  }
}
```

**Error Codes:**
| Code | Status | Description |
|------|--------|-------------|
| BAD_REQUEST | 400 | Invalid request format |
| VALIDATION_ERROR | 400 | Schema validation failed |
| UNAUTHORIZED | 401 | Authentication required |
| FORBIDDEN | 403 | Permission denied |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | Resource conflict |
| RATE_LIMITED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Server error |
| SERVICE_UNAVAILABLE | 503 | Service temporarily unavailable |
| LLM_ERROR | 502 | LLM API failure |
| DATABASE_ERROR | 500 | Database operation failed |

### Rate Limiting

Rate limits are enforced per IP address:

| Endpoint Pattern | Limit | Window |
|-----------------|-------|--------|
| General API (`/api/*`) | 100 requests | 1 minute |
| LLM endpoints (`/api/sessions/*`, `/api/evaluate/*`) | 10 requests | 1 minute |

**Rate limit headers in response:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705312200
```

**When rate limited (429):**
```
Retry-After: 45
```

---

## WebSocket Protocol

Live sessions use WebSocket for real-time communication.

### Connection Flow

1. **Start session via REST:**
   ```
   POST /api/sessions/start { "recallSetId": "rs_xxx" }
   → { "data": { "id": "sess_abc123" } }
   ```

2. **Connect WebSocket:**
   ```
   ws://localhost:3001/api/session/ws?sessionId=sess_abc123
   ```

3. **Server sends opening message:**
   ```json
   { "type": "session_started", "sessionId": "sess_abc123", "openingMessage": "..." }
   ```

4. **Conversation proceeds via messages**

5. **Session completes:**
   ```json
   { "type": "session_complete", "summary": { ... } }
   ```

### Message Types

#### Client → Server

```typescript
// Send user response
{ "type": "user_message", "content": "My explanation..." }

// Manually trigger evaluation
{ "type": "trigger_eval" }

// End session early
{ "type": "end_session" }

// Keepalive
{ "type": "ping" }
```

#### Server → Client

```typescript
// Session ready
{ "type": "session_started", "sessionId": "sess_xxx", "openingMessage": "..." }

// Streaming LLM response (multiple chunks)
{ "type": "assistant_chunk", "content": "partial text..." }

// Response complete
{ "type": "assistant_complete", "fullContent": "complete text..." }

// Evaluation result
{
  "type": "evaluation_result",
  "pointId": "rp_xxx",
  "recalled": true,
  "rating": "good",
  "feedback": "..."
}

// Moving to next point
{
  "type": "point_transition",
  "currentIndex": 2,
  "totalPoints": 5,
  "pointId": "rp_yyy"
}

// Session finished
{
  "type": "session_complete",
  "summary": {
    "pointsCompleted": 5,
    "pointsRecalled": 4,
    "averageRating": 3.2,
    "duration": 1800
  }
}

// Error occurred
{ "type": "error", "code": "SESSION_NOT_FOUND", "message": "..." }

// Keepalive response
{ "type": "pong" }
```

### Connection Management

**Timeouts:**
- Ping interval: 30 seconds
- Pong timeout: 10 seconds
- Idle timeout: 5 minutes

**Reconnection:**
- The frontend hook implements exponential backoff
- Max 5 reconnection attempts
- Initial delay: 1 second, doubles each attempt (max 30 seconds)

**Close Codes:**
| Code | Meaning |
|------|---------|
| 1000 | Normal closure |
| 4000 | Session not found |
| 4001 | Session already completed |
| 4002 | Invalid message format |
| 4003 | Session error |
| 4004 | Authentication required |
| 4005 | Rate limited |

---

## Frontend

### Directory Structure

```
web/src/
├── main.tsx              # Entry point
├── App.tsx               # Provider hierarchy
├── router.tsx            # Route definitions
├── index.css             # Tailwind imports + global styles
├── pages/                # Route page components
│   ├── Dashboard.tsx
│   ├── RecallSets.tsx
│   ├── RecallSetDetail.tsx
│   ├── Sessions.tsx
│   ├── SessionReplay.tsx
│   ├── LiveSession.tsx
│   └── NotFound.tsx
├── components/
│   ├── ui/               # Reusable primitives
│   ├── dashboard/        # Dashboard-specific
│   ├── recall-sets/      # Recall set list
│   ├── recall-set-detail/# Single set view
│   ├── sessions/         # Session history
│   ├── session-replay/   # Transcript view
│   ├── live-session/     # Active session
│   └── forms/            # Create/edit forms
├── hooks/
│   ├── api/              # TanStack Query hooks
│   │   ├── use-dashboard.ts
│   │   ├── use-recall-sets.ts
│   │   └── use-sessions.ts
│   ├── use-session-websocket.ts
│   └── use-toast.ts
├── context/
│   ├── ToastContext.tsx
│   └── UserContext.tsx
├── lib/
│   ├── api-client.ts     # Typed fetch wrapper
│   └── query-client.ts   # TanStack Query config
└── types/
    └── api.ts            # API response types
```

### Routes

| Path | Page | Layout | Description |
|------|------|--------|-------------|
| `/` | Dashboard | MainLayout | Overview stats, due points |
| `/recall-sets` | RecallSets | MainLayout | List all recall sets |
| `/recall-sets/:id` | RecallSetDetail | MainLayout | Single set details |
| `/sessions` | Sessions | MainLayout | Session history |
| `/sessions/:id` | SessionReplay | MainLayout | Past session transcript |
| `/session/:id` | LiveSession | Full-screen | Active study session |
| `*` | NotFound | MainLayout | 404 page |

**Note:** `/sessions/:id` (plural) is for replay, `/session/:id` (singular) is for live sessions.

### State Management

**Server State (TanStack Query):**
- All API data fetched via React Query hooks
- Automatic caching with 5-second stale time
- Background refetching on window focus
- Optimistic updates for mutations

**Client State:**
- React Context for cross-cutting concerns (User, Toast)
- Local useState for UI interactions
- Custom hook for WebSocket state

### API Client

The API client (`web/src/lib/api-client.ts`) provides typed wrappers:

```typescript
import { apiClient } from '@/lib/api-client';

// GET request
const sets = await apiClient.recallSets.list();

// POST request
const newSet = await apiClient.recallSets.create({
  name: 'My Set',
  discussionSystemPrompt: '...'
});

// With query parameters
const sessions = await apiClient.sessions.list({
  recallSetId: 'rs_xxx',
  limit: 10
});
```

**Error handling:**
```typescript
try {
  await apiClient.recallSets.delete(id);
} catch (error) {
  if (error instanceof ApiError) {
    console.log(error.code);    // "NOT_FOUND"
    console.log(error.status);  // 404
  }
}
```

### WebSocket Hook

The `useSessionWebSocket` hook manages live session connections:

```typescript
const {
  connectionState,     // 'connecting' | 'connected' | 'disconnected' | 'reconnecting'
  messages,            // Chat message history
  streamingContent,    // Current streaming response (partial)
  currentPointIndex,   // Current recall point (0-indexed)
  totalPoints,         // Total points in session
  isWaitingForResponse,// True while LLM is responding
  sendUserMessage,     // (content: string) => void
  triggerEvaluation,   // () => void
  endSession,          // () => void
} = useSessionWebSocket({ sessionId });
```

### Toast Notifications

Use the toast hook for user feedback:

```typescript
const toast = useToast();

// Success
toast.success('Recall set created');

// Error
toast.error('Failed to delete');

// Info
toast.info('Session saved');
```

---

## Configuration

### Environment Variables

#### Required in Production

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/db` |
| `ANTHROPIC_API_KEY` | Claude API key | `sk-ant-api03-xxx` |

#### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | API server port |
| `HOST` | `0.0.0.0` | Server bind address |
| `NODE_ENV` | `development` | Environment mode |
| `ALLOWED_ORIGINS` | (localhost) | CORS origins (comma-separated) |
| `DATABASE_PATH` | `./contextual-clarity.db` | SQLite database path (dev only) |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-20250514` | Claude model to use |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window |
| `RATE_LIMIT_LLM_MAX_REQUESTS` | `10` | Max LLM requests per window |

#### Frontend (Vite)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:3001` | Backend API URL |

### Configuration Validation

The server validates configuration at startup (`src/config.ts`):

**Production requirements:**
- `DATABASE_URL` must be set
- `ANTHROPIC_API_KEY` must be set and start with `sk-ant-`
- Warning logged if using SQLite in production

**Startup failures:**
- Invalid API key format
- Missing required variables in production

---

## Security Considerations

### What's Implemented

1. **Rate Limiting**
   - IP-based rate limiting on all endpoints
   - Stricter limits on expensive LLM operations
   - Supports proxy headers (X-Forwarded-For, X-Real-IP)

2. **Input Validation**
   - Zod schema validation on all POST/PATCH endpoints
   - Content length limits prevent oversized payloads
   - Type coercion and sanitization

3. **CORS**
   - Explicit allowed origins (not wildcard in production)
   - Credentials supported for future auth

4. **Error Hiding**
   - Stack traces only in development
   - Generic error messages in production

### What's NOT Implemented (Single-User Mode)

⚠️ **The current implementation is designed for single-user, local use:**

1. **No Authentication**
   - User context uses a hardcoded default user
   - No login/logout functionality
   - No session tokens or JWT

2. **No Authorization**
   - All users can access all data
   - No ownership checks (except point→set relationship)
   - No role-based access control

3. **No HTTPS in Dev**
   - Development server uses HTTP
   - Production should use a reverse proxy with TLS

4. **In-Memory Rate Limiting**
   - Rate limit state not shared across instances
   - Restarts clear rate limit counters

### Before Exposing to Internet

If you plan to expose this application publicly:

1. **Add authentication** - Implement JWT or session-based auth
2. **Use HTTPS** - Put behind nginx/caddy with TLS certificates
3. **Use PostgreSQL** - SQLite doesn't handle concurrent writes well
4. **Add Redis** - For shared rate limiting across instances
5. **Review CORS origins** - Remove localhost in production
6. **Add CSP headers** - Content Security Policy
7. **Implement audit logging** - Track sensitive operations

---

## Production Deployment

### Docker Build

```bash
# Build the image
docker build -t contextual-clarity .

# Run the container
docker run -d \
  -p 3001:3001 \
  -e DATABASE_URL="postgres://..." \
  -e ANTHROPIC_API_KEY="sk-ant-..." \
  -e NODE_ENV=production \
  -e ALLOWED_ORIGINS="https://yourdomain.com" \
  contextual-clarity
```

### Manual Build

```bash
# Build frontend
cd web && bun run build && cd ..

# Start production server
NODE_ENV=production bun run server
```

The server serves the frontend from `web/dist/` in production mode.

### Health Checks

Use `/health` endpoint for load balancer health checks:

```bash
curl http://localhost:3001/health
```

Returns 200 if server is running.

### Database Migrations

Run migrations before starting:

```bash
bun run db:migrate
```

**Note:** Migrations are NOT run automatically on startup.

---

## Troubleshooting

### Server Won't Start

**"Address already in use"**

The server tries to find an available port automatically. If you see this:
```bash
# Find what's using the port
lsof -i :3001

# Kill the process or use a different port
PORT=3002 bun run server
```

**"ANTHROPIC_API_KEY environment variable is required"**

```bash
export ANTHROPIC_API_KEY=sk-ant-xxx
# or add to .env file
```

**"Invalid ANTHROPIC_API_KEY format"**

The key must start with `sk-ant-`. Check for typos or extra whitespace.

### WebSocket Connection Fails

**"Session not found" (code 4000)**
- The session ID doesn't exist or expired
- Sessions are created via POST `/api/sessions/start`

**"Session already completed" (code 4001)**
- Cannot reconnect to finished sessions
- Start a new session

**Connection keeps reconnecting**
- Check server logs for errors
- Verify the session ID is valid
- Check for rate limiting (429 responses)

### Frontend Issues

**API requests return 404**
- In development, Vite proxies `/api/*` to backend
- Verify backend is running on port 3001
- Check `vite.config.ts` proxy configuration

**"Network Error" or CORS errors**
- Backend must be running
- Check CORS origins in `src/api/middleware/cors.ts`
- Clear browser cache/hard refresh

**Blank page / React errors**
- Check browser console for errors
- Verify `bun install` completed in `web/`
- Try deleting `node_modules` and reinstalling

### Database Issues

**"no such table"**
```bash
bun run db:migrate
```

**"database is locked" (SQLite)**
- Only one process can write at a time
- Use PostgreSQL for concurrent access

**Migrations fail**
- Check `drizzle/` directory for migration files
- Verify database file permissions
- Try deleting `.db` file and re-running migrations (loses data!)

### Live Session Issues

**Session ends unexpectedly**
- Check server logs for errors
- LLM API errors can terminate sessions
- Verify `ANTHROPIC_API_KEY` is valid

**No response from AI**
- Check Anthropic API status
- Verify API key has credits
- Check rate limits (LLM endpoints: 10 req/min)

**Evaluation not triggering**
- Use explicit phrases: "I understand", "Got it", "Next topic"
- Or manually trigger with the evaluation button

---

## Known Limitations

### Architecture

1. **Single-user design** - No multi-tenancy or user isolation
2. **In-memory rate limits** - Not shared across server instances
3. **No background jobs** - All operations are synchronous
4. **No caching layer** - Every request hits the database

### Frontend

1. **No offline support** - Requires constant connection
2. **No PWA features** - Not installable as app
3. **Limited mobile optimization** - Designed for desktop/tablet
4. **No keyboard shortcuts** - Mouse-driven interface

### WebSocket

1. **No message persistence** - Lost messages aren't recovered
2. **Single connection per session** - Can't have multiple tabs
3. **No typing indicators** - No real-time status updates

### Database

1. **SQLite limitations** - Single writer, no concurrent connections
2. **No full-text search** - Basic filtering only
3. **No archival strategy** - Data grows indefinitely

---

## Common Gotchas

### Route Confusion

- `/session/:id` (singular) = Live session (WebSocket)
- `/sessions/:id` (plural) = Session replay (read-only transcript)

### ID Prefixes

All IDs have prefixes for type safety:
- `rs_` = Recall Set
- `rp_` = Recall Point
- `sess_` = Session

### Port Numbers

- `3001` = Backend API (default)
- `5173` = Vite dev server (frontend)
- `4173` = Vite preview server

### Environment Modes

- `development` - Verbose logging, stack traces, SQLite allowed
- `production` - Minimal logging, errors hidden, requires Postgres
- `test` - In-memory SQLite, no rate limiting

### WebSocket Session Flow

You **must** create the session via REST before connecting WebSocket:

```
❌ WRONG: Connect to /api/session/ws?sessionId=new
✅ RIGHT: POST /api/sessions/start → get ID → connect WebSocket
```

### Query Invalidation

After mutations, queries are automatically invalidated:
- Creating a recall set → invalidates recall sets list
- Completing a session → invalidates dashboard + sessions list
- Adding a point → invalidates the parent set's points

### React Query Keys

Query keys follow a factory pattern:
```typescript
['recall-sets']           // List all
['recall-sets', id]       // Single set
['recall-sets', id, 'points']  // Points for set
```

---

## Development Tips

### Inspecting API Requests

```bash
# Watch server logs
bun run server 2>&1 | grep -E "(GET|POST|PATCH|DELETE)"
```

### Testing API Directly

```bash
# Health check
curl http://localhost:3001/health

# List recall sets
curl http://localhost:3001/api/recall-sets

# Create recall set
curl -X POST http://localhost:3001/api/recall-sets \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","discussionSystemPrompt":"You are a tutor."}'
```

### Database Inspection

```bash
# Open SQLite directly
sqlite3 contextual-clarity.db
.tables
select * from recall_sets;
```

### WebSocket Testing

Use `websocat` for testing WebSocket connections:

```bash
# Install
brew install websocat

# Connect (after starting a session via REST)
websocat ws://localhost:3001/api/session/ws?sessionId=sess_xxx
```

### Resetting Development State

```bash
# Delete database
rm contextual-clarity.db

# Re-initialize
bun run db:migrate
bun run db:seed
```

---

## Running Tests

```bash
# All tests
bun test

# Specific test file
bun test tests/api/recall-sets.test.ts

# With coverage
bun test --coverage

# Watch mode
bun test --watch
```

Tests use an in-memory SQLite database and mock the LLM client.
