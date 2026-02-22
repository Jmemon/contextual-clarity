/**
 * Session Command Handler
 *
 * This module implements the interactive recall session command for the CLI.
 * It manages the complete session lifecycle:
 *
 * 1. Finding/validating the target recall set
 * 2. Initializing the session engine
 * 3. Displaying the opening message from the AI tutor
 * 4. Running the interactive conversation loop
 * 5. Handling special commands (/quit, /eval, /help, /status)
 * 6. Processing session completion or abandonment
 *
 * The session uses Node's readline module for interactive input, providing
 * a natural conversational interface between the user and AI tutor.
 *
 * Usage (via CLI):
 * ```bash
 * bun run cli session "ATP Synthesis"
 * ```
 *
 * The session will display the tutor's opening question and wait for user input.
 * Users can type responses naturally or use slash commands for control.
 */

import * as readline from 'readline';
import type { SessionEngine } from '../../core/session/session-engine';
import type { RecallSetRepository } from '../../storage/repositories/recall-set.repository';
import {
  bold,
  yellow,
  red,
  dim,
  formatTutorMessage,
  formatProgress,
  printSessionBanner,
  printCommandsHelp,
  printSessionComplete,
  printSessionAbandoned,
  printBlankLine,
} from '../utils/terminal';

/**
 * Runs an interactive recall session for a given recall set.
 *
 * This function orchestrates the entire session workflow:
 * 1. Looks up the recall set by name (case-insensitive)
 * 2. Starts or resumes a session via the SessionEngine
 * 3. Displays the tutor's opening message
 * 4. Enters an interactive loop for user input
 * 5. Handles session completion or early exit
 *
 * @param engine - The SessionEngine instance for managing session state
 * @param recallSetRepo - Repository for looking up recall sets
 * @param setName - Name of the recall set to study (case-insensitive)
 *
 * @example
 * ```typescript
 * const engine = new SessionEngine(dependencies);
 * const recallSetRepo = new RecallSetRepository(db);
 *
 * // Start an interactive session
 * await runSessionCommand(engine, recallSetRepo, 'ATP Synthesis');
 * ```
 */
export async function runSessionCommand(
  engine: SessionEngine,
  recallSetRepo: RecallSetRepository,
  setName: string
): Promise<void> {
  // Step 1: Find the recall set by name (case-insensitive search)
  const recallSet = await recallSetRepo.findByName(setName);

  // Validate that the recall set exists
  if (!recallSet) {
    console.log(red(`Error: Recall set "${setName}" not found.`));
    console.log(dim('Use "bun run cli list" to see available recall sets.'));
    process.exit(1);
  }

  // Check if the recall set is active (not paused or archived)
  if (recallSet.status !== 'active') {
    console.log(yellow(`Warning: Recall set "${recallSet.name}" is ${recallSet.status}.`));
    console.log(dim('Only active recall sets can be used for study sessions.'));
    process.exit(1);
  }

  // Step 2: Start the session
  // The engine will either create a new session or resume an existing in-progress one
  try {
    // Start the session - the engine returns the session object
    // We don't need to store it as the engine maintains internal state
    await engine.startSession(recallSet);
  } catch (error) {
    // Handle the case where no recall points are due for review
    if (error instanceof Error && error.message.includes('No recall points are due')) {
      console.log(yellow(`\nNo recall points are due for review in "${recallSet.name}".`));
      console.log(dim('Check back later when points become due.'));
      process.exit(0);
    }
    // Re-throw unexpected errors
    throw error;
  }

  // Get session state to display progress information
  const sessionState = engine.getSessionState();
  if (!sessionState) {
    console.log(red('Error: Failed to initialize session state.'));
    process.exit(1);
  }

  // Display the session welcome banner
  printSessionBanner(recallSet.name, sessionState.totalPoints);

  // Step 3: Get and display the opening message from the tutor
  console.log(formatProgress(sessionState.recalledCount, sessionState.totalPoints));
  const openingMessage = await engine.getOpeningMessage();
  printBlankLine();
  console.log(formatTutorMessage(openingMessage));
  printBlankLine();

  // Step 4: Start the interactive conversation loop
  await runInteractiveLoop(engine);
}

/**
 * Runs the interactive conversation loop.
 *
 * This function:
 * - Creates a readline interface for user input
 * - Processes each line of input
 * - Handles slash commands for session control
 * - Sends user messages to the session engine
 * - Displays tutor responses
 * - Continues until session completes or user quits
 *
 * @param engine - The SessionEngine managing the current session
 */
async function runInteractiveLoop(engine: SessionEngine): Promise<void> {
  // Create readline interface for interactive input
  // Using process.stdin/stdout for proper terminal handling
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    // Custom prompt styling - "You:" in bold to match "Tutor:" format
    prompt: bold('You: '),
  });

  // Flag to track if we're currently processing a message
  // Prevents multiple concurrent processing which could corrupt session state
  let isProcessing = false;

  // Flag to track if session has ended (completed or abandoned)
  let sessionEnded = false;

  // Display the initial prompt
  rl.prompt();

  // Process each line of user input
  rl.on('line', async (input: string) => {
    // Trim whitespace and check for empty input
    const trimmedInput = input.trim();

    // Ignore empty lines - just show prompt again
    if (!trimmedInput) {
      if (!sessionEnded) {
        rl.prompt();
      }
      return;
    }

    // Prevent concurrent message processing
    if (isProcessing) {
      console.log(dim('Processing previous message... please wait.'));
      return;
    }

    isProcessing = true;

    try {
      // Handle slash commands (starting with /)
      if (trimmedInput.startsWith('/')) {
        const handled = await handleSlashCommand(trimmedInput, engine, rl);
        if (handled === 'quit') {
          sessionEnded = true;
          rl.close();
          return;
        }
        // For other commands, show prompt and continue
        if (!sessionEnded) {
          rl.prompt();
        }
        isProcessing = false;
        return;
      }

      // Process regular user message through the session engine
      const result = await engine.processUserMessage(trimmedInput);

      // Display the tutor's response
      printBlankLine();
      console.log(formatTutorMessage(result.response));
      printBlankLine();

      // Check if the session has completed
      if (result.completed) {
        printSessionComplete(result.totalPoints);
        sessionEnded = true;
        rl.close();
        return;
      }

      // Show progress if any points were recalled this turn
      if (result.pointsRecalledThisTurn.length > 0) {
        console.log(formatProgress(result.recalledCount, result.totalPoints));
        printBlankLine();
      }

      // Show prompt for next input
      rl.prompt();
    } catch (error) {
      // Handle errors gracefully - log and continue
      console.log(red('\nError processing your message:'));
      console.log(dim(error instanceof Error ? error.message : 'Unknown error'));
      printBlankLine();
      rl.prompt();
    } finally {
      isProcessing = false;
    }
  });

  // Handle readline close event (Ctrl+D or programmatic close)
  rl.on('close', () => {
    if (!sessionEnded) {
      // User closed input without using /quit - treat as quit
      console.log(dim('\n\nInput closed.'));
    }
  });

  // Handle SIGINT (Ctrl+C) for graceful shutdown
  rl.on('SIGINT', async () => {
    console.log(dim('\n\nReceived Ctrl+C...'));
    if (!sessionEnded) {
      try {
        await engine.abandonSession();
        printSessionAbandoned();
      } catch (error) {
        // Session may already be ended, ignore errors
      }
    }
    rl.close();
    process.exit(0);
  });

  // Return a promise that resolves when the readline closes
  // This keeps the function alive while the interactive loop runs
  return new Promise<void>((resolve) => {
    rl.on('close', () => {
      resolve();
    });
  });
}

/**
 * Handles slash commands entered by the user.
 *
 * Supported commands:
 * - /quit - Abandon the session and exit
 * - /eval - Manually trigger evaluation of current recall point
 * - /help - Display available commands
 * - /status - Show current session progress
 *
 * @param command - The full command string (e.g., "/quit")
 * @param engine - The SessionEngine for session operations
 * @param rl - The readline interface (for closing on quit)
 * @returns 'quit' if session should end, undefined otherwise
 */
async function handleSlashCommand(
  command: string,
  engine: SessionEngine,
  _rl: readline.Interface
): Promise<'quit' | undefined> {
  // Normalize command to lowercase and extract the base command
  const normalizedCommand = command.toLowerCase().split(' ')[0];

  switch (normalizedCommand) {
    case '/quit':
    case '/exit':
    case '/q':
      // Abandon the session and exit
      await engine.abandonSession();
      printSessionAbandoned();
      return 'quit';

    case '/eval':
    case '/evaluate':
      // T06: evaluation now runs continuously after every user message.
      // The /eval command is now informational only — no manual trigger needed.
      console.log(dim('\nEvaluation runs automatically after each message. Just keep typing!'));
      return undefined;

    case '/help':
    case '/h':
    case '/?':
      // Show available commands
      printCommandsHelp();
      return undefined;

    case '/status':
    case '/s':
      // Show current session status
      const state = engine.getSessionState();
      if (state) {
        printBlankLine();
        console.log(bold('Session Status:'));
        console.log(`  Recall Set: ${state.recallSet.name}`);
        console.log(`  Progress: ${formatProgress(state.recalledCount, state.totalPoints)}`);
        console.log(`  Current Point: ${dim(state.currentProbePoint ? state.currentProbePoint.content.substring(0, 80) + '...' : 'All points recalled')}`);
        console.log(`  Messages: ${state.messageCount}`);
        printBlankLine();
      } else {
        console.log(red('No active session.'));
      }
      return undefined;

    default:
      // Unknown command
      console.log(yellow(`Unknown command: ${command}`));
      console.log(dim('Type /help to see available commands.'));
      return undefined;
  }
}
