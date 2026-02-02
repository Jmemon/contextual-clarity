/**
 * Terminal Utilities for CLI Output Formatting
 *
 * This module provides ANSI escape code wrappers for colorizing and formatting
 * terminal output. These utilities help create a visually clear and intuitive
 * CLI experience without requiring external dependencies.
 *
 * Features:
 * - Text styling (bold, dim)
 * - Color functions (green, yellow, blue, red, cyan)
 * - Semantic formatters for specific UI elements
 *
 * Usage:
 * ```typescript
 * import { bold, green, yellow, formatSessionInfo } from './terminal';
 *
 * console.log(bold('Welcome to Contextual Clarity!'));
 * console.log(green('Session completed successfully'));
 * console.log(yellow('Warning: No recall points are due'));
 * ```
 *
 * Note: These escape codes are universally supported in modern terminals
 * (macOS Terminal, iTerm2, Windows Terminal, most Linux terminals).
 * In non-TTY environments, the codes pass through harmlessly.
 */

// =============================================================================
// Text Style Modifiers
// =============================================================================

/**
 * Makes text bold/bright in the terminal.
 * Use for emphasis on important information like headings or key values.
 *
 * @param s - The string to make bold
 * @returns The string wrapped in ANSI bold codes
 *
 * @example
 * console.log(bold('Session Complete!'));
 * // Output: **Session Complete!** (rendered bold in terminal)
 */
export const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`;

/**
 * Makes text dim/faded in the terminal.
 * Use for secondary information like hints, timestamps, or IDs.
 *
 * @param s - The string to dim
 * @returns The string wrapped in ANSI dim codes
 *
 * @example
 * console.log(dim('Press Ctrl+C to exit'));
 * // Output: faded "Press Ctrl+C to exit"
 */
export const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;

// =============================================================================
// Color Functions
// =============================================================================

/**
 * Colors text green in the terminal.
 * Use for success messages, completed items, or positive feedback.
 *
 * @param s - The string to color green
 * @returns The string wrapped in ANSI green codes
 *
 * @example
 * console.log(green('Recall point successfully reviewed!'));
 */
export const green = (s: string): string => `\x1b[32m${s}\x1b[0m`;

/**
 * Colors text yellow in the terminal.
 * Use for warnings, in-progress states, or items needing attention.
 *
 * @param s - The string to color yellow
 * @returns The string wrapped in ANSI yellow codes
 *
 * @example
 * console.log(yellow('No recall points are due for review'));
 */
export const yellow = (s: string): string => `\x1b[33m${s}\x1b[0m`;

/**
 * Colors text blue in the terminal.
 * Use for informational messages, prompts, or highlighting commands.
 *
 * @param s - The string to color blue
 * @returns The string wrapped in ANSI blue codes
 *
 * @example
 * console.log(blue('Type /help for available commands'));
 */
export const blue = (s: string): string => `\x1b[34m${s}\x1b[0m`;

/**
 * Colors text red in the terminal.
 * Use for errors, critical warnings, or failed operations.
 *
 * @param s - The string to color red
 * @returns The string wrapped in ANSI red codes
 *
 * @example
 * console.log(red('Error: Recall set not found'));
 */
export const red = (s: string): string => `\x1b[31m${s}\x1b[0m`;

/**
 * Colors text cyan in the terminal.
 * Use for the AI tutor's responses to distinguish from user input.
 *
 * @param s - The string to color cyan
 * @returns The string wrapped in ANSI cyan codes
 *
 * @example
 * console.log(cyan('Tutor: Can you explain what ATP is used for?'));
 */
export const cyan = (s: string): string => `\x1b[36m${s}\x1b[0m`;

// =============================================================================
// Semantic Formatters
// =============================================================================

/**
 * Formats the AI tutor's response for display.
 * Adds visual distinction from user input with color and label.
 *
 * @param message - The tutor's response text
 * @returns Formatted string with "Tutor:" prefix in cyan
 *
 * @example
 * console.log(formatTutorMessage('What role does ATP play in cellular energy?'));
 * // Output: "Tutor: What role does ATP play in cellular energy?" in cyan
 */
export function formatTutorMessage(message: string): string {
  return cyan(`Tutor: ${message}`);
}

/**
 * Formats session progress information for display.
 * Shows current position in the session (e.g., "Point 2 of 5").
 *
 * @param currentIndex - Zero-based index of current recall point
 * @param totalPoints - Total number of recall points in session
 * @returns Formatted progress string
 *
 * @example
 * console.log(formatProgress(1, 5));
 * // Output: "[Point 2 of 5]" (styled dim)
 */
export function formatProgress(currentIndex: number, totalPoints: number): string {
  return dim(`[Point ${currentIndex + 1} of ${totalPoints}]`);
}

/**
 * Formats a horizontal separator line for visual section breaks.
 *
 * @param width - Width of the separator in characters (default: 50)
 * @returns A dim horizontal line string
 *
 * @example
 * console.log(formatSeparator());
 * // Output: "──────────────────────────────────────────────────"
 */
export function formatSeparator(width: number = 50): string {
  return dim('─'.repeat(width));
}

/**
 * Formats command help text for display.
 * Used to show available CLI commands in a consistent style.
 *
 * @param command - The command name (e.g., "/quit")
 * @param description - What the command does
 * @returns Formatted help line with command highlighted
 *
 * @example
 * console.log(formatCommandHelp('/quit', 'Exit the session'));
 * // Output: "  /quit  - Exit the session"
 */
export function formatCommandHelp(command: string, description: string): string {
  return `  ${yellow(command.padEnd(10))} - ${dim(description)}`;
}

/**
 * Clears the current line and moves cursor to beginning.
 * Useful for updating progress indicators or spinner text.
 *
 * @returns ANSI escape sequence to clear current line
 */
export const clearLine = (): string => '\x1b[2K\r';

/**
 * Prints a blank line for visual spacing.
 * Convenience function that wraps console.log().
 */
export function printBlankLine(): void {
  console.log();
}

/**
 * Prints a welcome banner for the CLI application.
 * Called at the start of a session to provide context.
 *
 * @param recallSetName - Name of the recall set being studied
 * @param pointCount - Number of recall points to review
 */
export function printSessionBanner(recallSetName: string, pointCount: number): void {
  printBlankLine();
  console.log(formatSeparator(60));
  console.log(bold('  Contextual Clarity - Recall Session'));
  console.log(formatSeparator(60));
  console.log(`  Recall Set: ${green(recallSetName)}`);
  console.log(`  Points to review: ${yellow(pointCount.toString())}`);
  console.log(formatSeparator(60));
  printBlankLine();
  console.log(dim('  Commands: /quit (exit) | /eval (evaluate current point) | /help'));
  printBlankLine();
}

/**
 * Prints available CLI commands in a formatted help display.
 * Called when user types /help during a session.
 */
export function printCommandsHelp(): void {
  printBlankLine();
  console.log(bold('Available Commands:'));
  console.log(formatCommandHelp('/quit', 'Abandon session and exit'));
  console.log(formatCommandHelp('/eval', 'Manually trigger evaluation of current point'));
  console.log(formatCommandHelp('/help', 'Show this help message'));
  console.log(formatCommandHelp('/status', 'Show current session progress'));
  printBlankLine();
}

/**
 * Prints a session completion summary.
 * Called when all recall points have been reviewed.
 *
 * @param pointsReviewed - Number of points reviewed in the session
 */
export function printSessionComplete(pointsReviewed: number): void {
  printBlankLine();
  console.log(formatSeparator(60));
  console.log(green(bold('  Session Complete!')));
  console.log(`  You reviewed ${yellow(pointsReviewed.toString())} recall point(s).`);
  console.log(formatSeparator(60));
  printBlankLine();
}

/**
 * Prints a session abandoned message.
 * Called when user exits early with /quit.
 */
export function printSessionAbandoned(): void {
  printBlankLine();
  console.log(yellow('Session abandoned. Your progress has been saved.'));
  console.log(dim('You can resume this session later by running the same command.'));
  printBlankLine();
}
