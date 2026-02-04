/**
 * CLI Export Command for Contextual Clarity
 *
 * This module implements the export command for the CLI, allowing users to
 * export session data, recall set data, and analytics to JSON or CSV files.
 * The exported data can be used for external analysis, backup, or integration
 * with other tools.
 *
 * Available Sub-commands:
 * - `export session <session-id>` - Export a single session's data
 * - `export set <set-name>` - Export all sessions for a recall set
 * - `export analytics <set-name>` - Export analytics summary for a recall set
 *
 * Usage Examples:
 * ```bash
 * # Export a session as JSON (default format)
 * bun run cli export session sess_abc123
 *
 * # Export a session as CSV to a specific file
 * bun run cli export session sess_abc123 --format csv --output my-session.csv
 *
 * # Export all sessions for a recall set with date filtering
 * bun run cli export set "ATP Synthesis" --from 2024-01-01 --to 2024-01-31
 *
 * # Export analytics for a recall set as CSV
 * bun run cli export analytics "Motivation Psychology" --format csv
 * ```
 *
 * The export command uses the ExportService for data aggregation and formatting,
 * ensuring consistent output across different export types.
 */

import { Command } from 'commander';
import { writeFile, stat } from 'fs/promises';
import { createDatabase } from '../../storage/db';
import {
  SessionRepository,
  RecallSetRepository,
  SessionMessageRepository,
  SessionMetricsRepository,
  RecallOutcomeRepository,
  RabbitholeEventRepository,
  RecallPointRepository,
} from '../../storage/repositories';
import { ExportService } from '../../core/export';
import { AnalyticsCalculator } from '../../core/analytics';
import {
  bold,
  dim,
  green,
  yellow,
  red,
  formatSeparator,
  printBlankLine,
} from '../utils/terminal';

/**
 * Creates the export command with all sub-commands.
 *
 * This function builds the commander.js command tree for the export functionality,
 * including the three sub-commands (session, set, analytics) and their options.
 *
 * @returns The configured Command object for the export command
 */
export function createExportCommand(): Command {
  // Create the main export command
  const exportCmd = new Command('export')
    .description('Export session data to JSON or CSV files');

  // Sub-command: export session <session-id>
  // Exports a single session's complete data including metrics, outcomes,
  // and optionally messages and rabbithole events
  exportCmd
    .command('session <session-id>')
    .description('Export a single session')
    .option('-f, --format <format>', 'Output format (json or csv)', 'json')
    .option('-o, --output <file>', 'Output file path')
    .option('--include-messages', 'Include message transcript', true)
    .option('--no-include-messages', 'Exclude message transcript')
    .option('--include-rabbitholes', 'Include rabbithole events', true)
    .option('--no-include-rabbitholes', 'Exclude rabbithole events')
    .action(async (sessionId: string, options: SessionExportOptions) => {
      await exportSession(sessionId, options);
    });

  // Sub-command: export set <set-name>
  // Exports all sessions for a recall set, with optional date filtering
  // Includes aggregate analytics alongside individual session data
  exportCmd
    .command('set <set-name>')
    .description('Export all sessions for a recall set')
    .option('-f, --format <format>', 'Output format (json or csv)', 'json')
    .option('-o, --output <file>', 'Output file path')
    .option('--from <date>', 'Start date filter (YYYY-MM-DD)')
    .option('--to <date>', 'End date filter (YYYY-MM-DD)')
    .action(async (setName: string, options: SetExportOptions) => {
      await exportRecallSet(setName, options);
    });

  // Sub-command: export analytics <set-name>
  // Exports aggregate analytics only (no individual session data)
  // Useful for quick overviews and dashboard integrations
  exportCmd
    .command('analytics <set-name>')
    .description('Export analytics summary for a recall set')
    .option('-f, --format <format>', 'Output format (json or csv)', 'json')
    .option('-o, --output <file>', 'Output file path')
    .action(async (setName: string, options: AnalyticsExportOptions) => {
      await exportAnalytics(setName, options);
    });

  return exportCmd;
}

/**
 * Options for the session export sub-command.
 */
interface SessionExportOptions {
  format: string;
  output?: string;
  includeMessages: boolean;
  includeRabbitholes: boolean;
}

/**
 * Options for the set export sub-command.
 */
interface SetExportOptions {
  format: string;
  output?: string;
  from?: string;
  to?: string;
}

/**
 * Options for the analytics export sub-command.
 */
interface AnalyticsExportOptions {
  format: string;
  output?: string;
}

/**
 * Initializes the export service with all required dependencies.
 *
 * Creates database connection, repositories, and the analytics calculator
 * needed by the ExportService. This setup is isolated to allow each export
 * command to have its own clean context.
 *
 * @returns Object containing the export service and recall set repository
 */
function initializeExportService(): {
  exportService: ExportService;
  recallSetRepo: RecallSetRepository;
} {
  // Initialize database connection using DATABASE_PATH env var
  const dbPath = process.env.DATABASE_PATH || 'contextual-clarity.db';
  const db = createDatabase(dbPath);

  // Create repository instances for all required data access
  const sessionRepo = new SessionRepository(db);
  const recallSetRepo = new RecallSetRepository(db);
  const messageRepo = new SessionMessageRepository(db);
  const metricsRepo = new SessionMetricsRepository(db);
  const outcomeRepo = new RecallOutcomeRepository(db);
  const rabbitholeRepo = new RabbitholeEventRepository(db);
  const recallPointRepo = new RecallPointRepository(db);

  // Create analytics calculator for aggregate statistics
  const analyticsCalc = new AnalyticsCalculator(
    metricsRepo,
    outcomeRepo,
    rabbitholeRepo,
    recallSetRepo,
    recallPointRepo
  );

  // Create the export service with all dependencies
  const exportService = new ExportService(
    sessionRepo,
    recallSetRepo,
    messageRepo,
    metricsRepo,
    outcomeRepo,
    rabbitholeRepo,
    analyticsCalc
  );

  return { exportService, recallSetRepo };
}

/**
 * Validates and normalizes the export format option.
 *
 * Ensures the format is either 'json' or 'csv', defaulting to 'json'
 * if an invalid format is provided.
 *
 * @param format - The format string from command options
 * @returns Normalized format ('json' or 'csv')
 */
function validateFormat(format: string): 'json' | 'csv' {
  const normalizedFormat = format.toLowerCase();
  if (normalizedFormat === 'csv') {
    return 'csv';
  }
  // Default to JSON for any unrecognized format
  if (normalizedFormat !== 'json') {
    console.log(yellow(`Warning: Unknown format "${format}", defaulting to JSON`));
  }
  return 'json';
}

/**
 * Parses a date string in YYYY-MM-DD format.
 *
 * Used for date range filtering on set exports. Throws a descriptive
 * error if the date format is invalid.
 *
 * @param dateStr - The date string to parse
 * @returns Parsed Date object
 * @throws Error if the date format is invalid
 */
function parseDate(dateStr: string): Date {
  // Validate format with regex for YYYY-MM-DD pattern
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    throw new Error(`Invalid date format: "${dateStr}". Use YYYY-MM-DD format.`);
  }

  const date = new Date(dateStr);

  // Check if the date is valid (not NaN)
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: "${dateStr}". Please provide a valid date.`);
  }

  return date;
}

/**
 * Formats a byte count into a human-readable string.
 *
 * Displays the file size in the most appropriate unit (B, KB, or MB)
 * for easy understanding of export file sizes.
 *
 * @param bytes - The number of bytes
 * @returns Human-readable size string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Writes data to a file and reports success with file size.
 *
 * Handles the common pattern of writing export data and showing
 * a success message with the file path and size.
 *
 * @param outputFile - Path to the output file
 * @param data - String data to write
 */
async function writeExportFile(outputFile: string, data: string): Promise<void> {
  // Write the data to the file
  await writeFile(outputFile, data, 'utf-8');

  // Get the file size for reporting
  const stats = await stat(outputFile);
  const fileSize = formatBytes(stats.size);

  // Report success
  printBlankLine();
  console.log(green(`  Exported to ${outputFile}`));
  console.log(dim(`  Size: ${fileSize}`));
  printBlankLine();
}

/**
 * Exports a single session's data.
 *
 * Fetches all data associated with a session (metrics, outcomes, messages,
 * rabbitholes) and exports it in the requested format. The output file
 * defaults to "session-{id}.{format}" if not specified.
 *
 * @param sessionId - The unique identifier of the session to export
 * @param options - Export configuration options
 */
async function exportSession(
  sessionId: string,
  options: SessionExportOptions
): Promise<void> {
  printBlankLine();
  console.log(bold('Exporting Session'));
  console.log(formatSeparator(40));

  try {
    // Initialize services
    const { exportService } = initializeExportService();

    // Validate and normalize the format
    const format = validateFormat(options.format);

    // Build export options for the service
    const exportOptions = {
      format,
      includeMessages: options.includeMessages,
      includeRabbitholes: options.includeRabbitholes,
      includeTimings: false, // Timings not yet implemented in the service
    };

    // Show what we're exporting
    console.log(`  Session ID: ${dim(sessionId)}`);
    console.log(`  Format: ${dim(format)}`);
    console.log(`  Include messages: ${dim(options.includeMessages ? 'yes' : 'no')}`);
    console.log(`  Include rabbitholes: ${dim(options.includeRabbitholes ? 'yes' : 'no')}`);

    // Perform the export
    const data = await exportService.exportSession(sessionId, exportOptions);

    // Determine output file path
    // Default to "session-{sessionId}.{format}" if not specified
    const outputFile = options.output || `session-${sessionId}.${format}`;

    // Write and report success
    await writeExportFile(outputFile, data);
  } catch (error) {
    // Handle errors with clear messaging
    console.log(red(`\n  Error: ${(error as Error).message}`));
    printBlankLine();
    process.exit(1);
  }
}

/**
 * Exports all sessions for a recall set.
 *
 * Looks up the recall set by name (case-insensitive), then exports all
 * associated sessions with aggregate analytics. Supports date range
 * filtering to limit which sessions are included.
 *
 * @param setName - Name of the recall set to export
 * @param options - Export configuration options
 */
async function exportRecallSet(
  setName: string,
  options: SetExportOptions
): Promise<void> {
  printBlankLine();
  console.log(bold('Exporting Recall Set'));
  console.log(formatSeparator(40));

  try {
    // Initialize services
    const { exportService, recallSetRepo } = initializeExportService();

    // Find the recall set by name (case-insensitive search)
    const recallSet = await recallSetRepo.findByName(setName);

    if (!recallSet) {
      throw new Error(`Recall set "${setName}" not found. Use "bun run cli list" to see available sets.`);
    }

    // Validate and normalize the format
    const format = validateFormat(options.format);

    // Parse date range if provided
    let dateRange: { start: Date; end: Date } | undefined;
    if (options.from || options.to) {
      // If only one date is provided, require both for clarity
      if (!options.from || !options.to) {
        throw new Error('Both --from and --to dates must be provided for date filtering.');
      }

      const start = parseDate(options.from);
      const end = parseDate(options.to);

      // Validate that start is before end
      if (start > end) {
        throw new Error(`Start date (${options.from}) must be before end date (${options.to}).`);
      }

      // Set end date to end of day for inclusive filtering
      end.setHours(23, 59, 59, 999);

      dateRange = { start, end };
    }

    // Build export options for the service
    const exportOptions = {
      format,
      includeMessages: false, // Set exports typically don't need full transcripts
      includeRabbitholes: false,
      includeTimings: false,
      dateRange,
    };

    // Show what we're exporting
    console.log(`  Recall Set: ${green(recallSet.name)}`);
    console.log(`  Format: ${dim(format)}`);
    if (dateRange) {
      console.log(`  Date range: ${dim(options.from + ' to ' + options.to)}`);
    }

    // Perform the export using the recall set ID
    const data = await exportService.exportRecallSet(recallSet.id, exportOptions);

    // Determine output file path
    // Sanitize the set name for use in filename (replace spaces with dashes)
    const sanitizedName = recallSet.name.toLowerCase().replace(/\s+/g, '-');
    const outputFile = options.output || `recall-set-${sanitizedName}.${format}`;

    // Write and report success
    await writeExportFile(outputFile, data);
  } catch (error) {
    // Handle errors with clear messaging
    console.log(red(`\n  Error: ${(error as Error).message}`));
    printBlankLine();
    process.exit(1);
  }
}

/**
 * Exports analytics summary for a recall set.
 *
 * Exports aggregate analytics data without individual session details.
 * This is useful for quick overviews, dashboards, or when only summary
 * statistics are needed.
 *
 * @param setName - Name of the recall set to analyze
 * @param options - Export configuration options
 */
async function exportAnalytics(
  setName: string,
  options: AnalyticsExportOptions
): Promise<void> {
  printBlankLine();
  console.log(bold('Exporting Analytics'));
  console.log(formatSeparator(40));

  try {
    // Initialize services
    const { exportService, recallSetRepo } = initializeExportService();

    // Find the recall set by name (case-insensitive search)
    const recallSet = await recallSetRepo.findByName(setName);

    if (!recallSet) {
      throw new Error(`Recall set "${setName}" not found. Use "bun run cli list" to see available sets.`);
    }

    // Validate and normalize the format
    const format = validateFormat(options.format);

    // Build export options for the service
    // Analytics export only uses format; other options are ignored
    const exportOptions = {
      format,
      includeMessages: false,
      includeRabbitholes: false,
      includeTimings: false,
    };

    // Show what we're exporting
    console.log(`  Recall Set: ${green(recallSet.name)}`);
    console.log(`  Format: ${dim(format)}`);

    // Perform the export using the recall set ID
    const data = await exportService.exportAnalytics(recallSet.id, exportOptions);

    // Determine output file path
    // Sanitize the set name for use in filename
    const sanitizedName = recallSet.name.toLowerCase().replace(/\s+/g, '-');
    const outputFile = options.output || `analytics-${sanitizedName}.${format}`;

    // Write and report success
    await writeExportFile(outputFile, data);
  } catch (error) {
    // Handle errors with clear messaging
    console.log(red(`\n  Error: ${(error as Error).message}`));
    printBlankLine();
    process.exit(1);
  }
}
