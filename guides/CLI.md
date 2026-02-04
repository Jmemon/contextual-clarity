# Contextual Clarity CLI

The command-line interface for running interactive recall sessions with Socratic AI tutoring.

## Prerequisites

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Set up the database:**
   ```bash
   bun run db:migrate
   bun run db:seed      # Optional: adds sample recall sets
   ```

3. **Configure API key:**
   ```bash
   export ANTHROPIC_API_KEY=your-api-key-here
   ```

   Get your API key at: https://console.anthropic.com/

## Commands

### List Recall Sets

View all available recall sets:

```bash
bun run cli list
```

**Aliases:** `ls`, `l`

**Output:**
```
Available Recall Sets:
────────────────────────────────────────────────────────────
  motivation (active)
    Understanding motivation, resistance, and takin...
  atp (active)
    ATP and cellular energy transfer fundamentals
────────────────────────────────────────────────────────────

To start a session: bun run cli session "<recall-set-name>"
```

### Start a Session

Begin an interactive recall session for a specific set:

```bash
bun run cli session <recall-set-name>
```

**Aliases:** `start`, `s`

**Examples:**
```bash
bun run cli session motivation
bun run cli s atp
bun run cli session "My Custom Set"    # Use quotes for names with spaces
```

**What happens:**
1. The system finds all recall points that are due for review
2. An AI tutor begins a Socratic dialogue
3. You respond naturally, demonstrating your understanding
4. The system evaluates your recall and updates scheduling

### View Statistics

Display detailed recall statistics for a recall set:

```bash
bun run cli stats <recall-set-name>
```

**Alias:** `stat`

**Examples:**
```bash
bun run cli stats motivation
bun run cli stats "ATP Synthesis"
```

**Output includes:**
- **Overview**: Total sessions, time spent, API cost
- **Recall Performance**: Overall recall rate, engagement scores
- **Point Breakdown**: Per-point success rates with struggling indicators
- **Top Rabbithole Topics**: Common tangent topics explored
- **Recent Trend**: 7-day ASCII visualization of recall rate

### List Recent Sessions

View recent sessions for a recall set:

```bash
bun run cli sessions <recall-set-name> [options]
```

**Options:**
| Option | Description |
|--------|-------------|
| `--limit <n>`, `-n <n>` | Number of sessions to display (default: 10) |

**Examples:**
```bash
bun run cli sessions motivation
bun run cli sessions "ATP Synthesis" --limit 5
bun run cli sessions atp -n 20
```

**Output includes:**
- Session ID (for use with `replay` command)
- Date and time
- Duration
- Recall rate percentage
- Status (completed, abandoned, in_progress)

### Replay a Session

Display a full session transcript with annotations:

```bash
bun run cli replay <session-id>
```

**Example:**
```bash
bun run cli replay sess_abc123def456
```

Find session IDs using: `bun run cli sessions "<recall-set-name>"`

**Output includes:**
- Session metadata (start time, duration, recall rate)
- Full conversation transcript with timestamps
- Rabbithole entry/exit markers with topic names
- Recall evaluation results with success/failure indicators
- Session summary with aggregate statistics

### Export Data

Export session data, recall sets, or analytics to JSON or CSV files.

#### Export a Session

```bash
bun run cli export session <session-id> [options]
```

**Options:**
| Option | Description |
|--------|-------------|
| `-f, --format <format>` | Output format: `json` (default) or `csv` |
| `-o, --output <file>` | Output file path (default: `session-{id}.{format}`) |
| `--include-messages` | Include message transcript (default: true) |
| `--no-include-messages` | Exclude message transcript |
| `--include-rabbitholes` | Include rabbithole events (default: true) |
| `--no-include-rabbitholes` | Exclude rabbithole events |

**Examples:**
```bash
bun run cli export session sess_abc123
bun run cli export session sess_abc123 --format csv
bun run cli export session sess_abc123 -o my-session.json
bun run cli export session sess_abc123 --no-include-messages
```

#### Export a Recall Set

Export all sessions for a recall set with optional date filtering:

```bash
bun run cli export set <set-name> [options]
```

**Options:**
| Option | Description |
|--------|-------------|
| `-f, --format <format>` | Output format: `json` (default) or `csv` |
| `-o, --output <file>` | Output file path (default: `recall-set-{name}.{format}`) |
| `--from <date>` | Start date filter (YYYY-MM-DD) |
| `--to <date>` | End date filter (YYYY-MM-DD) |

**Note:** When using date filters, both `--from` and `--to` must be provided.

**Examples:**
```bash
bun run cli export set "ATP Synthesis"
bun run cli export set motivation --format csv
bun run cli export set "My Set" --from 2024-01-01 --to 2024-01-31
bun run cli export set atp -o backup.json
```

#### Export Analytics

Export analytics summary for a recall set:

```bash
bun run cli export analytics <set-name> [options]
```

**Options:**
| Option | Description |
|--------|-------------|
| `-f, --format <format>` | Output format: `json` (default) or `csv` |
| `-o, --output <file>` | Output file path (default: `analytics-{name}.{format}`) |

**Examples:**
```bash
bun run cli export analytics motivation
bun run cli export analytics "ATP Synthesis" --format csv
```

### Help

Display available commands:

```bash
bun run cli
bun run cli help
bun run cli --help
bun run cli -h
```

## Session Commands

While in an active session, you can use these slash commands:

| Command | Aliases | Description |
|---------|---------|-------------|
| `/quit` | `/exit`, `/q` | Abandon the session and exit |
| `/eval` | `/evaluate` | Manually trigger evaluation of the current point |
| `/status` | `/s` | Show current session progress |
| `/help` | `/h`, `/?` | Display available commands |

### Example Session

```
=== Starting Recall Session: motivation ===

Tutor: Let's explore some concepts about motivation today.
       What do you think is the relationship between taking
       action and feeling motivated?

You: I think you need to feel motivated first before you can act.

Tutor: That's a common belief! But consider this - have you ever
       started doing something you didn't feel like doing, and
       then found yourself getting into it?

You: Actually yes, that happens with exercise sometimes. Once I
     start, I want to keep going.

Tutor: Exactly! What does that suggest about the order of
       motivation and action?

You: I guess action might actually create motivation, not the
     other way around.

Tutor: Excellent insight! Let's move on to the next topic.

[Progress: 2/4 points completed]

You: /status

Session Status:
  Recall Set: motivation
  Progress: 2/4
  Current Point: The relationship between action and motiv...
  Messages: 8

You: /quit

Session abandoned.
```

## Session Flow

1. **Session Start**: The system loads all due recall points from the selected set
2. **Opening**: The AI tutor asks an open-ended question related to the first point
3. **Dialogue**: You engage in natural conversation, explaining concepts in your own words
4. **Evaluation**: When you demonstrate understanding (or use `/eval`), the system:
   - Assesses whether you successfully recalled the concept
   - Updates the FSRS scheduling based on your performance
   - Advances to the next recall point
5. **Completion**: After all points are covered, the session ends with a summary

## Evaluation Triggers

The system automatically triggers evaluation when you use phrases like:
- "I understand"
- "That makes sense"
- "Got it"
- "I see"
- "Next topic"

You can also manually trigger evaluation with `/eval`.

## FSRS Scheduling

After each evaluation, the system updates the recall point's schedule using the FSRS algorithm:

| Your Performance | Rating | Next Review |
|-----------------|--------|-------------|
| Clear, confident recall | Easy | Much longer interval |
| Solid understanding | Good | Longer interval |
| Struggled but got it | Hard | Shorter interval |
| Didn't recall | Forgot | Review soon |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes (for sessions) | Your Anthropic API key |
| `DATABASE_URL` | No | Path to SQLite database (default: `contextual-clarity.db`) |
| `DEBUG` | No | Set to any value to enable debug mode (shows stack traces) |

## Troubleshooting

### "ANTHROPIC_API_KEY environment variable is not set"

Set your API key:
```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Or create a `.env` file:
```bash
cp .env.example .env
# Edit .env and add your API key
```

### "No recall points due for review"

All points in this set have future due dates. Either:
- Wait until points are due
- Use a different recall set
- Reset the database with `bun run db:seed --force`

### "Recall set not found"

Check the exact name with `bun run cli list`. Names are case-insensitive but must match.

### "Session not found"

When using `replay`, ensure you have the correct session ID. Find valid IDs with:
```bash
bun run cli sessions "<recall-set-name>"
```

## Quick Reference

```bash
# List all recall sets
bun run cli list

# Start a session
bun run cli session "Set Name"

# View statistics
bun run cli stats "Set Name"

# List recent sessions
bun run cli sessions "Set Name" --limit 5

# Replay a session
bun run cli replay <session-id>

# Export session to JSON
bun run cli export session <session-id>

# Export recall set to CSV
bun run cli export set "Set Name" --format csv

# Export analytics
bun run cli export analytics "Set Name"
```
