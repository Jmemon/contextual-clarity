# Cross-Phase Concerns & Standards

This document captures architectural decisions and patterns that span multiple phases. All implementations MUST follow these guidelines.

---

## 1. Type Safety & Consistency

### Problem
Types are defined in multiple locations:
- `src/core/models/` - Domain types
- `src/api/types.ts` - API types
- `web/src/types/api.ts` - Frontend types

Without synchronization, these can drift and cause runtime errors.

### Solution

Use Zod for runtime validation and type inference:

```typescript
// src/shared/schemas/recall-set.schema.ts
import { z } from 'zod';

export const RecallSetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(1000),
  status: z.enum(['active', 'paused', 'archived']),
  discussionSystemPrompt: z.string(),
  sourceIngestionJobId: z.string().uuid().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type RecallSet = z.infer<typeof RecallSetSchema>;

// API request/response schemas
export const CreateRecallSetRequestSchema = RecallSetSchema.pick({
  name: true,
  description: true,
  discussionSystemPrompt: true,
});

export const RecallSetResponseSchema = z.object({
  success: z.literal(true),
  data: RecallSetSchema,
});
```

**Recommendation:** Create a `src/shared/` directory for schemas shared between backend and frontend. Consider using a monorepo tool like Turborepo if complexity grows.

---

## 2. Database Transactions

### Problem
Multi-step operations (e.g., creating a recall set with points) can leave orphaned data if they fail midway.

### Solution

Wrap related operations in transactions:

```typescript
// src/storage/db.ts
import { drizzle } from 'drizzle-orm/bun-sqlite';

export function createDatabase(dbPath: string = 'contextual-clarity.db') {
  const sqlite = new Database(dbPath);
  sqlite.run('PRAGMA foreign_keys = ON');
  const db = drizzle(sqlite, { schema });

  return db;
}

// Transaction helper
export async function withTransaction<T>(
  db: Database,
  fn: () => Promise<T>
): Promise<T> {
  // SQLite supports IMMEDIATE for write transactions
  db.run('BEGIN IMMEDIATE');
  try {
    const result = await fn();
    db.run('COMMIT');
    return result;
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

// Usage in IngestionEngine:
async createRecallSet(jobId: string, name: string, description: string): Promise<RecallSet> {
  return withTransaction(this.db, async () => {
    const recallSet = await this.recallSetRepo.create({...});

    for (const point of job.generatedPoints) {
      await this.recallPointRepo.create({
        recallSetId: recallSet.id,
        // ...
      });
    }

    await this.ingestionRepo.complete(jobId, recallSet.id);

    return recallSet;
  });
}
```

---

## 3. SQLite vs PostgreSQL Compatibility

### Problem
Development uses SQLite, production uses PostgreSQL (Neon). Drizzle ORM handles most differences, but some require attention.

### Compatibility Notes

| Feature | SQLite | PostgreSQL | Solution |
|---------|--------|------------|----------|
| Timestamps | integer with mode | timestamp | Use Drizzle's mode: 'timestamp_ms' |
| JSON columns | text with mode: 'json' | jsonb | Drizzle handles this |
| UUIDs | text | uuid | Store as text in both |
| Full-text search | FTS5 extension | tsvector | Abstract behind a search service |
| Concurrent writes | Limited | Excellent | Use transactions, retry on conflict |

### Configuration

```typescript
// src/config.ts
export const config = {
  database: {
    type: process.env.DATABASE_TYPE || 'sqlite',
    url: process.env.DATABASE_URL || './contextual-clarity.db',
  },
  // ...
};

// src/storage/db.ts
import { drizzle as drizzleSqlite } from 'drizzle-orm/bun-sqlite';
import { drizzle as drizzlePg } from 'drizzle-orm/neon-http';
import { config } from '../config';

export function createDatabase() {
  if (config.database.type === 'postgres') {
    return drizzlePg(config.database.url, { schema });
  }

  const sqlite = new Database(config.database.url);
  sqlite.run('PRAGMA foreign_keys = ON');
  return drizzleSqlite(sqlite, { schema });
}
```

---

## 4. Error Handling & Logging

### Problem
Inconsistent error handling makes debugging difficult. No structured logging for production.

### Solution

**Custom Error Classes:**

```typescript
// src/core/errors.ts
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} with id '${id}' not found` : `${resource} not found`,
      'NOT_FOUND',
      404
    );
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
  }
}
```

**Structured Logging:**

```typescript
// src/core/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private formatEntry(entry: LogEntry): string {
    if (process.env.NODE_ENV === 'production') {
      // JSON for production (parseable by log aggregators)
      return JSON.stringify(entry);
    }
    // Human-readable for development
    const { level, message, context, error } = entry;
    let output = `[${level.toUpperCase()}] ${message}`;
    if (context) output += ` ${JSON.stringify(context)}`;
    if (error) output += `\n  ${error.stack || error.message}`;
    return output;
  }

  log(level: LogLevel, message: string, context?: Record<string, unknown>) {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
    };
    console[level](this.formatEntry(entry));
  }

  error(message: string, error?: Error, context?: Record<string, unknown>) {
    const entry: LogEntry = {
      level: 'error',
      message,
      timestamp: new Date().toISOString(),
      context,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    };
    console.error(this.formatEntry(entry));
  }

  info(message: string, context?: Record<string, unknown>) {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.log('warn', message, context);
  }

  debug(message: string, context?: Record<string, unknown>) {
    if (process.env.NODE_ENV !== 'production') {
      this.log('debug', message, context);
    }
  }
}

export const logger = new Logger();
```

---

## 5. Configuration Management

### Problem
Configuration values (ports, paths, API URLs) are scattered and hardcoded.

### Solution

**Centralized Configuration:**

```typescript
// src/config.ts
import { z } from 'zod';

const ConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  server: z.object({
    port: z.coerce.number().default(3000),
    host: z.string().default('0.0.0.0'),
  }),

  database: z.object({
    type: z.enum(['sqlite', 'postgres']).default('sqlite'),
    url: z.string().default('./contextual-clarity.db'),
  }),

  anthropic: z.object({
    apiKey: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
    model: z.string().default('claude-sonnet-4-5-20250929'),
    maxTokens: z.coerce.number().default(1024),
  }),

  storage: z.object({
    sourcesDir: z.string().default('./data/sources'),
  }),

  rateLimit: z.object({
    windowMs: z.coerce.number().default(60000),
    maxRequests: z.coerce.number().default(100),
  }),
});

function loadConfig() {
  const raw = {
    nodeEnv: process.env.NODE_ENV,
    server: {
      port: process.env.PORT,
      host: process.env.HOST,
    },
    database: {
      type: process.env.DATABASE_TYPE,
      url: process.env.DATABASE_URL,
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL,
      maxTokens: process.env.ANTHROPIC_MAX_TOKENS,
    },
    storage: {
      sourcesDir: process.env.SOURCES_DIR,
    },
    rateLimit: {
      windowMs: process.env.RATE_LIMIT_WINDOW_MS,
      maxRequests: process.env.RATE_LIMIT_MAX_REQUESTS,
    },
  };

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    console.error('Configuration validation failed:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
export type Config = z.infer<typeof ConfigSchema>;
```

**.env.example:**

```bash
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Database
DATABASE_TYPE=sqlite
DATABASE_URL=./contextual-clarity.db

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
ANTHROPIC_MAX_TOKENS=1024

# Storage
SOURCES_DIR=./data/sources

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

---

## 6. Health Checks

### Problem
`/api/health` only returns `{ status: 'ok' }`. Doesn't check actual service health.

### Solution

```typescript
// src/api/routes/health.ts
import { Hono } from 'hono';
import { db } from '../../storage/db';
import { logger } from '../../core/logger';

const health = new Hono();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  checks: {
    database: { status: 'up' | 'down'; latencyMs: number };
    anthropic: { status: 'up' | 'down' | 'unchecked' };
  };
}

health.get('/health', async (c) => {
  const startTime = Date.now();
  const checks: HealthStatus['checks'] = {
    database: { status: 'down', latencyMs: 0 },
    anthropic: { status: 'unchecked' },
  };

  // Check database
  try {
    const dbStart = Date.now();
    await db.execute('SELECT 1');
    checks.database = {
      status: 'up',
      latencyMs: Date.now() - dbStart,
    };
  } catch (error) {
    logger.error('Health check: database failed', error as Error);
    checks.database = { status: 'down', latencyMs: 0 };
  }

  // Determine overall status
  const allUp = Object.values(checks).every(
    c => c.status === 'up' || c.status === 'unchecked'
  );
  const status: HealthStatus = {
    status: allUp ? 'healthy' : checks.database.status === 'down' ? 'unhealthy' : 'degraded',
    version: process.env.npm_package_version || '0.0.0',
    uptime: process.uptime(),
    checks,
  };

  const statusCode = status.status === 'healthy' ? 200 : status.status === 'degraded' ? 200 : 503;
  return c.json(status, statusCode);
});

// Detailed liveness probe for Kubernetes/orchestrators
health.get('/health/live', (c) => c.json({ status: 'alive' }));

// Readiness probe - only ready when DB is connected
health.get('/health/ready', async (c) => {
  try {
    await db.execute('SELECT 1');
    return c.json({ status: 'ready' });
  } catch {
    return c.json({ status: 'not ready' }, 503);
  }
});

export { health };
```

---

## 7. Testing Strategy

### Unit Tests
- Pure functions, domain logic
- Mock external dependencies (DB, LLM)
- Fast, run on every save

### Integration Tests
- API endpoints with test database
- Database operations with in-memory SQLite
- Mock LLM responses

### E2E Tests
- Critical user flows
- Real (test) database
- Mocked LLM (or use cheap model)

### Test Database Setup

```typescript
// tests/setup.ts
import { createDatabase } from '../src/storage/db';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

export function createTestDatabase() {
  // Use in-memory database for isolation
  const db = createDatabase(':memory:');
  migrate(db, { migrationsFolder: './drizzle' });
  return db;
}

// In tests:
import { createTestDatabase } from './setup';

describe('RecallSetRepository', () => {
  let db: Database;
  let repo: RecallSetRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new RecallSetRepository(db);
  });

  // Tests...
});
```

---

## 8. Demo Data Conflict Prevention

### Problem
Phase 1 seeds and Phase 6 demo data might conflict.

### Solution

Use distinct, namespaced names:

```typescript
// Phase 1 seeds (for development/testing)
const SEED_PREFIX = '__seed__';
motivationRecallSet.name = `${SEED_PREFIX}motivation`;
atpRecallSet.name = `${SEED_PREFIX}atp`;

// Phase 6 demo data (for production demo)
const DEMO_PREFIX = ''; // No prefix, user-visible
const demoSets = [
  { name: 'Learning How to Learn', ... },
  { name: 'First Principles Thinking', ... },
];

// In seed scripts, check environment
async function seed() {
  if (process.env.NODE_ENV === 'production') {
    console.log('Refusing to run dev seeds in production');
    return;
  }
  // ... seed logic
}

// Demo seeder checks for existing sets by name
async function seedDemo() {
  for (const set of demoSets) {
    const existing = await recallSetRepo.findByName(set.name);
    if (existing) {
      console.log(`Demo set '${set.name}' already exists, skipping`);
      continue;
    }
    await recallSetRepo.create(set);
  }
}
```

---

## Implementation Checklist

When implementing each phase, verify these cross-cutting concerns:

- [ ] All new types have corresponding Zod schemas
- [ ] Multi-step operations use transactions
- [ ] Errors use custom error classes
- [ ] Logging uses the structured logger
- [ ] Configuration uses the central config
- [ ] New endpoints have validation middleware
- [ ] Database queries are optimized (indexes exist)
- [ ] Health checks updated if new dependencies added
- [ ] Tests cover the new functionality
