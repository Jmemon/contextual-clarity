/**
 * Replay Command Handler
 *
 * This module implements the session history viewing and replay commands for the CLI.
 * It provides two main functions:
 *
 * 1. `sessions` - List recent sessions for a given recall set, showing
 *    date, duration, recall rate, and status for each session.
 *
 * 2. `replay` - Display a full session transcript with timestamps,
 *    rabbithole markers, and recall evaluation results.
 *
 * These commands are useful for:
 * - Reviewing past learning sessions to reinforce memory
 * - Analyzing learning patterns and progress over time
 * - Identifying areas that need more practice based on recall outcomes
 * - Understanding how rabbitholes affected session flow
 *
 * Usage (via CLI):
 * ```bash
 * # List recent sessions for a recall set
 * bun run cli sessions "ATP Synthesis" --limit 5
 *
 * # Replay a specific session transcript
 * bun run cli replay sess_abc123
 * ```
 */

import { createDatabase } from '../../storage/db';
import {
  RecallSetRepository,
  SessionRepository,
  SessionMessageRepository,
  SessionMetricsRepository,
  RecallOutcomeRepository,
  RabbitholeEventRepository,
} from '../../storage/repositories';
import { eq, desc } from 'drizzle-orm';
import { sessions } from '../../storage/schema';
import {
  bold,
  dim,
  green,
  yellow,
  red,
  cyan,
  blue,
  formatSeparator,
  printBlankLine,
} from '../utils/terminal';

/**
 * Lists recent sessions for a given recall set.
 *
 * Displays a formatted table showing each session's:
 * - Session ID (truncated for readability)
 * - Start date and time
 * - Duration (if metrics available)
 * - Recall rate percentage (if metrics available)
 * - Status (completed, abandoned, or in_progress)
 *
 * @param setName - Name of the recall set to list sessions for (case-insensitive)
 * @param limit - Maximum number of sessions to display (default: 10)
 */
export async function listSessions(setName: string, limit: number): Promise<void> {
  // Initialize database connection and create repository instances
  const db = createDatabase();
  const recallSetRepo = new RecallSetRepository(db);
  const metricsRepo = new SessionMetricsRepository(db);

  // Find the recall set by name (case-insensitive search)
  const recallSet = await recallSetRepo.findByName(setName);
  if (!recallSet) {
    console.log(red(`Error: Recall set "${setName}" not found.`));
    console.log(dim('Use "bun run cli list" to see available recall sets.'));
    return;
  }

  // Query sessions for this recall set, ordered by most recent first
  // We use a raw query with the schema since SessionRepository doesn't have findByRecallSetId
  const sessionResults = await db
    .select()
    .from(sessions)
    .where(eq(sessions.recallSetId, recallSet.id))
    .orderBy(desc(sessions.startedAt))
    .limit(limit);

  // Display header
  printBlankLine();
  console.log(bold(`Recent Sessions for "${recallSet.name}"`));
  console.log(formatSeparator(70));

  // Handle case where no sessions exist
  if (sessionResults.length === 0) {
    console.log(yellow('  No sessions found for this recall set.'));
    console.log(dim('  Start a session with: bun run cli session "' + recallSet.name + '"'));
    console.log(formatSeparator(70));
    printBlankLine();
    return;
  }

  // Display each session as a formatted row
  for (const session of sessionResults) {
    // Fetch metrics for this session (may be null if session was abandoned early)
    const metrics = await metricsRepo.findBySessionId(session.id);

    // Format the session ID (truncate for display but keep identifying prefix)
    const shortId = session.id.length > 20
      ? session.id.substring(0, 20) + '...'
      : session.id;

    // Format the start date in a readable format
    const dateStr = session.startedAt.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const timeStr = session.startedAt.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    // Format duration if metrics are available
    const duration = metrics
      ? formatDuration(metrics.durationMs)
      : dim('N/A');

    // Format recall rate as percentage if metrics are available
    const recallRate = metrics
      ? `${(metrics.overallRecallRate * 100).toFixed(0)}%`
      : dim('N/A');

    // Format status with appropriate color
    let statusDisplay: string;
    switch (session.status) {
      case 'completed':
        statusDisplay = green('completed');
        break;
      case 'in_progress':
        statusDisplay = yellow('in_progress');
        break;
      case 'abandoned':
        statusDisplay = red('abandoned');
        break;
      default:
        statusDisplay = session.status;
    }

    // Display the session row
    console.log(`  ${dim(shortId)}`);
    console.log(`    ${dateStr} ${timeStr} | ${duration.padEnd(8)} | Recall: ${recallRate.padEnd(6)} | ${statusDisplay}`);
    printBlankLine();
  }

  console.log(formatSeparator(70));
  console.log(dim('To replay a session: bun run cli replay <session-id>'));
  printBlankLine();
}

/**
 * Replays a past session transcript with full annotations.
 *
 * Displays the complete session including:
 * - Session metadata (start time, duration, recall rate)
 * - All messages with timestamps
 * - Rabbithole entry/exit markers with topic names
 * - Recall evaluation results with success/failure indicators
 * - Final session summary with aggregate statistics
 *
 * @param sessionId - The unique identifier of the session to replay
 */
export async function replaySession(sessionId: string): Promise<void> {
  // Initialize database connection and create all required repository instances
  const db = createDatabase();
  const sessionRepo = new SessionRepository(db);
  const messageRepo = new SessionMessageRepository(db);
  const metricsRepo = new SessionMetricsRepository(db);
  const outcomeRepo = new RecallOutcomeRepository(db);
  const rabbitholeRepo = new RabbitholeEventRepository(db);

  // Fetch the session record
  const session = await sessionRepo.findById(sessionId);
  if (!session) {
    console.log(red(`Error: Session "${sessionId}" not found.`));
    console.log(dim('Use "bun run cli sessions <set-name>" to find valid session IDs.'));
    return;
  }

  // Fetch all related data for the session replay
  const messages = await messageRepo.findBySessionId(sessionId);
  const outcomes = await outcomeRepo.findBySessionId(sessionId);
  const rabbitholes = await rabbitholeRepo.findBySessionId(sessionId);
  const metrics = await metricsRepo.findBySessionId(sessionId);

  // === Display Session Header ===
  printBlankLine();
  console.log(bold(cyan('Session Replay')));
  printBlankLine();
  console.log(`${bold('Session ID:')} ${dim(session.id)}`);
  console.log(`${bold('Started:')} ${session.startedAt.toLocaleString()}`);

  // Display end time if session is not in progress
  if (session.endedAt) {
    console.log(`${bold('Ended:')} ${session.endedAt.toLocaleString()}`);
  }

  // Format status with appropriate color
  let statusDisplay: string;
  switch (session.status) {
    case 'completed':
      statusDisplay = green('Completed');
      break;
    case 'in_progress':
      statusDisplay = yellow('In Progress');
      break;
    case 'abandoned':
      statusDisplay = red('Abandoned');
      break;
    default:
      statusDisplay = session.status;
  }
  console.log(`${bold('Status:')} ${statusDisplay}`);

  // Display metrics if available
  if (metrics) {
    console.log(`${bold('Duration:')} ${formatDuration(metrics.durationMs)}`);
    console.log(`${bold('Recall Rate:')} ${(metrics.overallRecallRate * 100).toFixed(1)}%`);
  }

  console.log(formatSeparator(60));

  // === Replay Messages with Annotations ===
  // Track active rabbitholes for visual context (nesting indication)
  const activeRabbitholes: string[] = [];

  // Iterate through all messages in chronological order
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // Check for rabbithole entries at this message index
    // Rabbitholes are triggered when conversation diverges from the main topic
    const entering = rabbitholes.filter((rh) => rh.triggerMessageIndex === i);
    for (const rh of entering) {
      printBlankLine();
      const depthIndicator = rh.depth > 1 ? ` (depth ${rh.depth})` : '';
      console.log(blue(`>> Entering rabbithole: "${rh.topic}"${depthIndicator}`));
      activeRabbitholes.push(rh.id);
    }

    // Format timestamp for display (time only for readability)
    const timestamp = msg.timestamp
      ? dim(`[${formatTime(msg.timestamp)}]`)
      : '';

    // Add visual indicator if currently inside a rabbithole
    const rabbitholePrefix = activeRabbitholes.length > 0
      ? blue('| ')
      : '';

    // Display message based on role
    printBlankLine();
    if (msg.role === 'user') {
      // User messages shown in green
      console.log(`${rabbitholePrefix}${timestamp} ${green('You:')}`);
      console.log(`${rabbitholePrefix}${msg.content}`);
    } else if (msg.role === 'assistant') {
      // Assistant/tutor messages shown in cyan
      console.log(`${rabbitholePrefix}${timestamp} ${cyan('Tutor:')}`);
      console.log(`${rabbitholePrefix}${msg.content}`);
    } else if (msg.role === 'system') {
      // System messages shown dimmed (usually internal prompts)
      console.log(`${rabbitholePrefix}${timestamp} ${dim('[System]')}`);
      console.log(`${rabbitholePrefix}${dim(msg.content)}`);
    }

    // Check for rabbithole returns at this message index
    // This indicates the conversation has returned to the main topic
    const returning = rabbitholes.filter((rh) => rh.returnMessageIndex === i);
    for (const rh of returning) {
      printBlankLine();
      console.log(blue(`<< Returned from rabbithole: "${rh.topic}"`));
      // Remove from active list
      const idx = activeRabbitholes.indexOf(rh.id);
      if (idx > -1) {
        activeRabbitholes.splice(idx, 1);
      }
    }

    // Check for recall evaluations that ended at this message index
    // These show how well the user recalled specific information
    const outcome = outcomes.find((o) => o.messageIndexEnd === i);
    if (outcome) {
      printBlankLine();
      // Display success/failure icon and rating
      const icon = outcome.success ? green('OK') : red('X');
      const rating = outcome.rating
        ? yellow(`[${outcome.rating.toUpperCase()}]`)
        : '';
      console.log(`${icon} Recall Evaluation ${rating}`);

      // Show confidence level as a percentage
      console.log(dim(`  Confidence: ${(outcome.confidence * 100).toFixed(0)}%`));

      // Show reasoning if available (AI's explanation of the assessment)
      if (outcome.reasoning) {
        console.log(dim(`  ${outcome.reasoning}`));
      }
    }
  }

  // === Display Session Summary ===
  console.log(formatSeparator(60));
  printBlankLine();
  console.log(bold(cyan('Session Summary')));
  printBlankLine();

  if (metrics) {
    // Message statistics
    console.log(`${bold('Messages:')} ${metrics.totalMessages}`);
    console.log(`  User: ${metrics.userMessages} | Assistant: ${metrics.assistantMessages}`);
    printBlankLine();

    // Recall performance statistics
    console.log(`${bold('Recall Points Attempted:')} ${metrics.recallPointsAttempted}`);
    console.log(`  Successful: ${green(metrics.recallPointsSuccessful.toString())} | Failed: ${red(metrics.recallPointsFailed.toString())}`);
    printBlankLine();

    // Rabbithole statistics (if any occurred)
    if (metrics.rabbitholeCount > 0) {
      console.log(`${bold('Rabbitholes:')} ${metrics.rabbitholeCount}`);
      console.log(`  Total time: ${formatDuration(metrics.totalRabbitholeTimeMs)}`);
      console.log(`  Avg depth: ${metrics.avgRabbitholeDepth.toFixed(1)}`);
      printBlankLine();
    }

    // Engagement score (composite measure of session quality)
    console.log(`${bold('Engagement Score:')} ${metrics.engagementScore}/100`);
  } else {
    // Handle case where metrics are not available
    console.log(dim('Detailed metrics not available for this session.'));
    console.log(`${bold('Messages:')} ${messages.length}`);
  }

  printBlankLine();
}

/**
 * Formats a timestamp as a readable time string (HH:MM format).
 *
 * @param date - The Date object to format
 * @returns Formatted time string (e.g., "02:30 PM")
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formats a duration in milliseconds as a human-readable string.
 *
 * For durations under an hour, shows "Xm Ys" format.
 * For longer durations, shows "Xh Ym" format.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string (e.g., "5m 30s" or "1h 15m")
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  // For durations over an hour, show hours and minutes
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  // For shorter durations, show minutes and seconds
  return `${minutes}m ${seconds}s`;
}
