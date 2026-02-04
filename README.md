# Contextual Clarity

A conversational spaced repetition system combining FSRS (Free Spaced Repetition Scheduler) scheduling with Socratic AI dialogs to help you deeply internalize knowledge through dynamic, exploratory conversations.

## Table of Contents

- [First-Time Setup](#first-time-setup)
  - [Prerequisites](#prerequisites)
  - [Install Dependencies](#install-dependencies)
  - [Environment Configuration](#environment-configuration)
  - [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
  - [CLI Mode](#cli-mode)
  - [Web Application](#web-application)
- [Quick Reference](#quick-reference)
- [Troubleshooting](#troubleshooting)

---

## First-Time Setup

### Prerequisites

1. **Bun** (v1.0+) - This project uses Bun as its JavaScript/TypeScript runtime and package manager.

   ```bash
   # macOS/Linux
   curl -fsSL https://bun.sh/install | bash

   # Or with Homebrew
   brew install oven-sh/bun/bun
   ```

   Verify installation:
   ```bash
   bun --version
   ```

2. **Anthropic API Key** - Required for the AI-powered Socratic dialogs.
   - Get your API key at: https://console.anthropic.com/
   - You'll need a funded account (API calls are pay-per-use)

### Install Dependencies

```bash
# Clone the repository (if you haven't already)
git clone <repository-url>
cd contextual-clarity

# Install all dependencies (backend + frontend)
bun install
cd web && bun install && cd ..
```

### Environment Configuration

1. **Copy the example environment file:**

   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` and set your Anthropic API key:**

   ```bash
   # Open in your editor
   nano .env   # or code .env, vim .env, etc.
   ```

3. **Required configuration:**

   ```env
   # This is the only required change - add your actual API key
   ANTHROPIC_API_KEY=sk-ant-api03-your-actual-key-here
   ```

4. **Optional configuration** (defaults work for local development):

   | Variable | Default | Description |
   |----------|---------|-------------|
   | `PORT` | `3011` | HTTP server port |
   | `HOST` | `0.0.0.0` | Host binding |
   | `NODE_ENV` | `development` | Environment mode |
   | `DATABASE_TYPE` | `sqlite` | `sqlite` or `postgres` |
   | `DATABASE_URL` | `./contextual-clarity.db` | Database path/URL |
   | `ANTHROPIC_MODEL` | `claude-sonnet-4-5-20250929` | Claude model to use |
   | `ANTHROPIC_MAX_TOKENS` | `32768` | Max tokens per response |
   | `SOURCES_DIR` | `./data/sources` | Source materials directory |

### Database Setup

Initialize the database and optionally seed it with sample data:

```bash
# Apply database migrations (creates tables)
bun run db:migrate

# (Optional) Seed with sample recall sets for testing
bun run db:seed
```

**That's it!** You're ready to run the application.

---

## Running the Application

### CLI Mode

The CLI provides an interactive terminal interface for recall sessions.

```bash
# Start the CLI
bun run cli
```

#### Common CLI Commands

```bash
# List all available recall sets
bun run cli list

# Start an interactive recall session
bun run cli session "Set Name"

# View statistics for a recall set
bun run cli stats "Set Name"

# View recent sessions
bun run cli sessions "Set Name" --limit 10

# Replay a past session
bun run cli replay <session-id>

# Export session data
bun run cli export session <session-id> --format csv
bun run cli export set "Set Name" --format json
```

#### During a Session

| Command | Description |
|---------|-------------|
| `/status` or `/s` | Show current progress |
| `/eval` or `/evaluate` | Manually trigger evaluation |
| `/help` or `/?` | Show help |
| `/quit` or `/exit` | End the session |

For detailed CLI documentation, see [guides/CLI.md](guides/CLI.md).

---

### Web Application

The web app provides a graphical interface with real-time session support.

#### Development Mode (Two Terminals)

**Terminal 1 - Start the backend API server:**
```bash
bun run server
# Server runs on http://localhost:3011 (or your configured PORT)
```

**Terminal 2 - Start the frontend dev server:**
```bash
bun run web:dev
# Frontend runs on http://localhost:5173
```

Then open **http://localhost:5173** in your browser.

#### Production Build

```bash
# Build both frontend and backend
bun run build

# The frontend is built to web/dist/
# In production, the backend serves the static frontend
```

For detailed web app documentation, see [guides/WEB_APP.md](guides/WEB_APP.md).

---

## Quick Reference

### All Available Scripts

| Command | Description |
|---------|-------------|
| `bun run cli` | Run the CLI |
| `bun run server` | Start API server |
| `bun run web:dev` | Start frontend dev server |
| `bun run web:build` | Build frontend for production |
| `bun run build` | Full production build |
| `bun run check` | TypeScript type checking |
| `bun run test` | Run all tests |
| `bun run test:unit` | Run unit tests only |
| `bun run test:e2e` | Run end-to-end tests |
| `bun run db:migrate` | Apply database migrations |
| `bun run db:seed` | Seed sample data |
| `bun run db:studio` | Open Drizzle Studio (DB browser) |
| `bun run db:generate` | Generate migrations from schema changes |

### Project Structure

```
contextual-clarity/
├── src/                  # Backend source code
│   ├── api/              # REST API + WebSocket server
│   ├── cli/              # CLI commands and interface
│   ├── core/             # Domain logic (FSRS, sessions)
│   ├── llm/              # Anthropic API integration
│   └── storage/          # Database layer (Drizzle ORM)
├── web/                  # React frontend
│   ├── src/
│   │   ├── pages/        # Page components
│   │   ├── components/   # Reusable UI components
│   │   └── hooks/        # Custom React hooks
│   └── dist/             # Production build output
├── tests/                # Test suites
├── drizzle/              # Database migrations
└── guides/               # Documentation
```

---

## Troubleshooting

### "ANTHROPIC_API_KEY is not set"

Make sure you:
1. Created a `.env` file (copy from `.env.example`)
2. Added your actual API key (not the placeholder)
3. Removed any quotes around the key value

### Database errors

```bash
# Reset the database (deletes all data!)
rm contextual-clarity.db
bun run db:migrate
bun run db:seed  # Optional: re-add sample data
```

### Port already in use

Edit `.env` and change the `PORT` value:
```env
PORT=3012  # or another available port
```

For the frontend dev server, edit `web/vite.config.ts`.

### "Cannot find module" errors

```bash
# Reinstall dependencies
rm -rf node_modules bun.lockb
rm -rf web/node_modules
bun install
cd web && bun install && cd ..
```

### Web app can't connect to API

1. Make sure the backend is running (`bun run server`)
2. Check the backend is on the expected port (default: 3011)
3. Check browser console for CORS errors

---

## Additional Resources

- **CLI Guide:** [guides/CLI.md](guides/CLI.md) - Complete CLI command reference
- **Web App Guide:** [guides/WEB_APP.md](guides/WEB_APP.md) - Frontend architecture and API docs
- **FSRS Algorithm:** https://github.com/open-spaced-repetition/fsrs4anki - Spaced repetition algorithm

---

## License

[Add your license here]
