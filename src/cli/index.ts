/**
 * CLI Entry Point for Contextual Clarity
 *
 * This is the main entry point for the command-line interface. It parses
 * command-line arguments, initializes all required dependencies, and routes
 * to the appropriate command handler.
 *
 * Available Commands:
 * - `session <name>` - Start an interactive recall session for a recall set
 * - `list` - List all available recall sets
 * - (no args) - Show help with available commands
 *
 * Usage:
 * ```bash
 * # Start a session for a specific recall set
 * bun run cli session "ATP Synthesis"
 *
 * # List all available recall sets
 * bun run cli list
 *
 * # Show help
 * bun run cli
 * ```
 *
 * The CLI automatically:
 * - Initializes the database connection
 * - Creates all repository instances
 * - Sets up the FSRS scheduler and LLM client
 * - Configures the SessionEngine with all dependencies
 *
 * Dependencies are created once at startup and reused throughout the session.
 */

import { createDatabase } from '../storage/db';
import {
  RecallSetRepository,
  RecallPointRepository,
  SessionRepository,
  SessionMessageRepository,
} from '../storage/repositories';
import { SessionEngine } from '../core/session/session-engine';
import { FSRSScheduler } from '../core/fsrs/scheduler';
import { AnthropicClient } from '../llm/client';
import { RecallEvaluator } from '../core/scoring/recall-evaluator';
import { runSessionCommand } from './commands/session';
import { bold, dim, green, yellow, red, formatSeparator, printBlankLine } from './utils/terminal';

/**
 * Main entry point for the CLI application.
 *
 * This function:
 * 1. Parses command-line arguments
 * 2. Initializes the database and all dependencies
 * 3. Routes to the appropriate command handler
 * 4. Handles errors gracefully with user-friendly messages
 *
 * The function is designed to be called directly via `bun run src/cli/index.ts`.
 */
async function main(): Promise<void> {
  // Parse command-line arguments (skip 'bun' and script path)
  const args = process.argv.slice(2);
  const command = args[0];

  // Handle help flag anywhere in args
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  // Initialize the database connection
  // Uses DATABASE_PATH env var or defaults to 'contextual-clarity.db'
  const db = createDatabase();

  // Create repository instances for data access
  // These provide type-safe access to all database tables
  const recallSetRepo = new RecallSetRepository(db);
  const recallPointRepo = new RecallPointRepository(db);
  const sessionRepo = new SessionRepository(db);
  const messageRepo = new SessionMessageRepository(db);

  // Route to appropriate command handler
  switch (command) {
    case 'session':
    case 'start':
    case 's':
      // Session command requires a recall set name
      const setName = args.slice(1).join(' ');
      if (!setName) {
        console.log(red('Error: Recall set name is required.'));
        console.log(dim('Usage: bun run cli session <recall-set-name>'));
        console.log(dim('Example: bun run cli session "ATP Synthesis"'));
        process.exit(1);
      }

      // Initialize LLM client and dependent services
      // These are created here (not at top level) to delay API key validation
      // until we actually need them - allows 'list' command without API key
      let llmClient: AnthropicClient;
      try {
        llmClient = new AnthropicClient();
      } catch (error) {
        if (error instanceof Error && error.message.includes('ANTHROPIC_API_KEY')) {
          console.log(red('Error: ANTHROPIC_API_KEY environment variable is not set.'));
          console.log(dim('Get your API key at: https://console.anthropic.com/'));
          console.log(dim('Then set it: export ANTHROPIC_API_KEY=your-key-here'));
          process.exit(1);
        }
        throw error;
      }

      // Create the FSRS scheduler for spaced repetition calculations
      const scheduler = new FSRSScheduler();

      // Create the recall evaluator for assessing user recall
      const evaluator = new RecallEvaluator(llmClient);

      // Create the session engine with all dependencies injected
      // This is the central orchestrator for recall sessions
      const engine = new SessionEngine({
        scheduler,
        evaluator,
        llmClient,
        recallSetRepo,
        recallPointRepo,
        sessionRepo,
        messageRepo,
      });

      // Run the interactive session
      await runSessionCommand(engine, recallSetRepo, setName);
      break;

    case 'list':
    case 'ls':
    case 'l':
      // List all available recall sets
      await listRecallSets(recallSetRepo);
      break;

    case 'help':
    case undefined:
      // Show help when no command provided
      printHelp();
      break;

    default:
      // Unknown command
      console.log(red(`Unknown command: ${command}`));
      printBlankLine();
      printHelp();
      process.exit(1);
  }
}

/**
 * Lists all available recall sets in a formatted table.
 *
 * Displays:
 * - Name of each recall set
 * - Current status (active, paused, archived)
 * - Brief description (truncated if too long)
 *
 * @param recallSetRepo - Repository for fetching recall sets
 */
async function listRecallSets(recallSetRepo: RecallSetRepository): Promise<void> {
  const sets = await recallSetRepo.findAll();

  printBlankLine();
  console.log(bold('Available Recall Sets:'));
  console.log(formatSeparator(60));

  if (sets.length === 0) {
    console.log(yellow('  No recall sets found.'));
    console.log(dim('  Run "bun run db:seed" to create sample recall sets.'));
  } else {
    for (const set of sets) {
      // Format status with appropriate color
      let statusDisplay: string;
      switch (set.status) {
        case 'active':
          statusDisplay = green('active');
          break;
        case 'paused':
          statusDisplay = yellow('paused');
          break;
        case 'archived':
          statusDisplay = dim('archived');
          break;
        default:
          statusDisplay = set.status;
      }

      // Display set info with truncated description
      const descriptionPreview = set.description.length > 50
        ? set.description.substring(0, 47) + '...'
        : set.description;

      console.log(`  ${bold(set.name)} (${statusDisplay})`);
      console.log(`    ${dim(descriptionPreview)}`);
    }
  }

  console.log(formatSeparator(60));
  printBlankLine();
  console.log(dim('To start a session: bun run cli session "<recall-set-name>"'));
  printBlankLine();
}

/**
 * Prints the CLI help message with all available commands and usage examples.
 */
function printHelp(): void {
  printBlankLine();
  console.log(bold('Contextual Clarity CLI'));
  console.log(dim('A conversational spaced repetition system'));
  printBlankLine();
  console.log(bold('Usage:'));
  console.log('  bun run cli <command> [options]');
  printBlankLine();
  console.log(bold('Commands:'));
  console.log(`  ${green('session <name>')}  Start an interactive recall session`);
  console.log(`  ${green('list')}            List all available recall sets`);
  console.log(`  ${green('help')}            Show this help message`);
  printBlankLine();
  console.log(bold('Session Commands:'));
  console.log(`  ${yellow('/quit')}           Abandon session and exit`);
  console.log(`  ${yellow('/eval')}           Manually trigger evaluation`);
  console.log(`  ${yellow('/help')}           Show session help`);
  console.log(`  ${yellow('/status')}         Show session progress`);
  printBlankLine();
  console.log(bold('Examples:'));
  console.log(dim('  # List available recall sets'));
  console.log('  bun run cli list');
  printBlankLine();
  console.log(dim('  # Start a session for a recall set'));
  console.log('  bun run cli session "ATP Synthesis"');
  printBlankLine();
  console.log(bold('Environment Variables:'));
  console.log(`  ${green('ANTHROPIC_API_KEY')}  Required for session commands`);
  console.log(`  ${green('DATABASE_PATH')}      Path to SQLite database (optional)`);
  printBlankLine();
}

// Run the main function and handle any uncaught errors
main().catch((error: Error) => {
  console.error(red('\nFatal error:'));
  console.error(dim(error.message));

  // Show stack trace in development mode
  if (process.env.DEBUG) {
    console.error(dim(error.stack || ''));
  }

  process.exit(1);
});
