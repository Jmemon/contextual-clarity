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

**Examples:**
```bash
bun run cli session motivation
bun run cli session atp
bun run cli session "My Custom Set"    # Use quotes for names with spaces
```

**What happens:**
1. The system finds all recall points that are due for review
2. An AI tutor begins a Socratic dialogue
3. You respond naturally, demonstrating your understanding
4. The system evaluates your recall and updates scheduling

### Help

Display available commands:

```bash
bun run cli
bun run cli help
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

Current Session Progress
────────────────────────
  Recall Set: motivation
  Points: 2/4 completed
  Current Point: 3

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

## Troubleshooting

### "ANTHROPIC_API_KEY environment variable is required"

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

## Database Location

By default, the database is stored at `./contextual-clarity.db`. Override with:

```bash
DATABASE_PATH=/path/to/db.sqlite bun run cli list
```
