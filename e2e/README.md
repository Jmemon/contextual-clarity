# E2E Test Suite

End-to-end tests for the Contextual Clarity web application using Playwright.

## Quick Start

```bash
# Terminal 1: Start the test server
cd e2e
bun run start:server

# Terminal 2: Run tests
cd e2e
bun run test
```

## Prerequisites

- Bun installed
- Playwright browsers installed: `bun run install-browsers`

## Test Isolation

Tests are completely isolated from your development/production data:

| Environment | API Port | Web Port | Database |
|-------------|----------|----------|----------|
| Development | 3011     | 5173     | `contextual-clarity.db` |
| **E2E Tests** | **3099** | **5199** | `/tmp/contextual-clarity-e2e-test.db` |

This separation ensures test data never leaks into your production database.

## Running Tests

### Step 1: Start the Test Server

Due to a macOS/Bun/SQLite interaction issue, the test server must be started manually before running tests.

```bash
# From the e2e directory
bun run start:server
```

This starts the API server on port 3099 with:
- Test database at `/tmp/contextual-clarity-e2e-test.db`
- Mock LLM mode enabled (no API calls)

Keep this terminal open while running tests.

### Step 2: Run Tests

In a separate terminal:

```bash
# Run all tests
bun run test

# Run specific test suites
bun run test:smoke          # Basic functionality
bun run test:navigation     # Navigation flows
bun run test:dashboard      # Dashboard features
bun run test:recall-sets    # Recall set CRUD
bun run test:recall-points  # Recall point operations
bun run test:sessions       # Session history
bun run test:live-session   # Live session functionality
bun run test:forms          # Form validation
bun run test:errors         # Error states
bun run test:responsive     # Responsive design
bun run test:database       # Database integrity
```

### Browser-Specific Tests

```bash
bun run test:chromium       # Chrome/Chromium only
bun run test:firefox        # Firefox only
bun run test:webkit         # Safari/WebKit only
bun run test:mobile         # Mobile viewports
```

### Debug Mode

```bash
bun run test:headed         # See the browser
bun run test:debug          # Step through tests
bun run test:ui             # Playwright UI mode
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `start:server` | Start test API server on port 3099 |
| `start:web` | Start test web server on port 5199 |
| `setup:db` | Create/migrate the test database |
| `test` | Run all tests |
| `test:headed` | Run tests with visible browser |
| `test:debug` | Run tests in debug mode |
| `test:ui` | Open Playwright UI |
| `test:report` | View HTML test report |
| `install-browsers` | Install Playwright browsers |

## Test Database

The test database is automatically managed:

- **Location**: `/tmp/contextual-clarity-e2e-test.db`
- **Created**: When you run `bun run setup:db` or start the test server
- **Reset**: Automatically reset when no test server is running
- **Preserved**: Kept while test server is running (for iterative testing)

### Manual Database Setup

If you need to set up the database separately:

```bash
bun run setup:db
```

## Architecture

```
e2e/
├── fixtures/
│   └── test-setup.ts      # Test fixtures and utilities
├── helpers/
│   └── assertions.ts      # Custom assertions
├── tests/
│   ├── 01-smoke.spec.ts   # Smoke tests
│   ├── 02-navigation.spec.ts
│   └── ...
├── global-setup.ts        # Runs before all tests
├── global-teardown.ts     # Runs after all tests
├── playwright.config.ts   # Playwright configuration
└── README.md              # This file
```

## Safety Features

The test suite includes multiple safety checks to prevent data leakage:

1. **Port Verification**: Setup fails if test ports match dev ports (3011/5173)
2. **Database Path Check**: Setup fails if test DB path matches production DB
3. **Server Detection**: Skips DB reset if test server is already running
4. **Separate Ports**: Tests use 3099/5199, completely separate from dev

## Troubleshooting

### "Server already running on test port"

This is normal if you started the test server manually. Tests will reuse it.

### Tests fail with "Internal Server Error"

The test server may have crashed. Restart it:
```bash
# Kill any existing server
pkill -f "PORT=3099"

# Restart
bun run start:server
```

### "SQLITE_IOERR_VNODE" errors

This macOS-specific error occurs when Playwright spawns the server automatically. Solution: Start the test server manually (see Quick Start).

### Database is corrupted

Reset the test database:
```bash
rm -f /tmp/contextual-clarity-e2e-test.db*
bun run setup:db
```

### Port already in use

Check what's using the test ports:
```bash
lsof -i :3099
lsof -i :5199
```

Kill the processes or use different ports via environment variables:
```bash
E2E_API_PORT=3100 E2E_WEB_PORT=5200 bun run test
```

## CI/CD

In CI environments, Playwright can manage the servers automatically since the SQLite issue doesn't occur on Linux:

```yaml
# Example GitHub Actions
- name: Run E2E tests
  run: |
    cd e2e
    bun run test
```

The `reuseExistingServer: true` setting allows flexibility for both local (manual server) and CI (auto-started server) workflows.

## Writing New Tests

1. Create a new file in `tests/` following the naming convention: `NN-feature.spec.ts`
2. Import fixtures from `../fixtures/test-setup`
3. Use the `testEnv` fixture for API URL and test data access

```typescript
import { test, expect } from '../fixtures/test-setup';

test.describe('My Feature', () => {
  test('does something', async ({ page, testEnv }) => {
    await page.goto(`${testEnv.webUrl}/my-page`);
    // ... assertions
  });
});
```

## Resources

- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Test Design Document](./DESIGN.md)
