/**
 * Stats Command Handler for Recall Set Analytics
 *
 * This module implements the `stats` command for the CLI, which displays
 * comprehensive recall statistics for a given recall set. It provides:
 *
 * 1. Overview metrics (sessions, time, cost)
 * 2. Recall performance (success rate, engagement)
 * 3. Point-by-point breakdown (success rates, due dates, struggling indicators)
 * 4. Top rabbithole topics
 * 5. Recent recall rate trend visualization
 *
 * The stats command helps users understand their learning progress and identify
 * areas that need extra attention. Struggling points are highlighted with warning
 * indicators to draw attention to knowledge gaps.
 *
 * Usage (via CLI):
 * ```bash
 * bun run cli stats "ATP Synthesis"
 * ```
 *
 * The command will display a well-formatted report with colored output for
 * easy reading. If the recall set has no sessions yet, it displays a friendly
 * message encouraging the user to start their first session.
 */

import type { AppDatabase } from '../../storage/db';
import { AnalyticsCalculator } from '../../core/analytics';
import { RecallSetRepository } from '../../storage/repositories/recall-set.repository';
import { RecallPointRepository } from '../../storage/repositories/recall-point.repository';
import { SessionMetricsRepository } from '../../storage/repositories/session-metrics.repository';
import { RecallOutcomeRepository } from '../../storage/repositories/recall-outcome.repository';
import { RabbitholeEventRepository } from '../../storage/repositories/rabbithole-event.repository';
import type { RecallSetAnalytics, RecallPointAnalytics, TrendData } from '../../core/analytics';
import {
  bold,
  dim,
  green,
  yellow,
  red,
  cyan,
  formatSeparator,
  printBlankLine,
} from '../utils/terminal';

// =============================================================================
// Constants for Display Formatting
// =============================================================================

/** Maximum characters to display for truncated point content */
const MAX_CONTENT_LENGTH = 50;

/** Warning icon for struggling points */
const WARNING_ICON = '\u26A0\uFE0F '; // Unicode warning sign with variation selector

/** Number of days to show in trend visualization */
const TREND_DAYS = 7;

// =============================================================================
// Main Stats Command Handler
// =============================================================================

/**
 * Displays comprehensive recall statistics for a given recall set.
 *
 * This function is the main entry point for the stats command. It:
 * 1. Looks up the recall set by name (case-insensitive)
 * 2. Creates an AnalyticsCalculator with all required repositories
 * 3. Fetches comprehensive analytics for the recall set
 * 4. Formats and displays the results in a readable format
 *
 * If the recall set doesn't exist or has no data, appropriate messages
 * are displayed to guide the user.
 *
 * @param db - The database connection to use for queries
 * @param recallSetName - Name of the recall set to analyze (case-insensitive)
 *
 * @example
 * ```typescript
 * const db = createDatabase();
 * await runStatsCommand(db, 'ATP Synthesis');
 * ```
 */
export async function runStatsCommand(
  db: AppDatabase,
  recallSetName: string
): Promise<void> {
  // Step 1: Create repositories for data access
  const recallSetRepo = new RecallSetRepository(db);
  const recallPointRepo = new RecallPointRepository(db);
  const sessionMetricsRepo = new SessionMetricsRepository(db);
  const recallOutcomeRepo = new RecallOutcomeRepository(db);
  const rabbitholeRepo = new RabbitholeEventRepository(db);

  // Step 2: Find the recall set by name (case-insensitive search)
  const recallSet = await recallSetRepo.findByName(recallSetName);

  // Validate that the recall set exists
  if (!recallSet) {
    console.log(red(`Error: Recall set "${recallSetName}" not found.`));
    console.log(dim('Use "bun run cli list" to see available recall sets.'));
    process.exit(1);
  }

  // Step 3: Create analytics calculator with all required repositories
  const analyticsCalc = new AnalyticsCalculator(
    sessionMetricsRepo,
    recallOutcomeRepo,
    rabbitholeRepo,
    recallSetRepo,
    recallPointRepo
  );

  // Step 4: Calculate comprehensive analytics for the recall set
  const analytics = await analyticsCalc.calculateRecallSetAnalytics(recallSet.id);

  // Step 5: Display the formatted statistics report
  displayStatsReport(analytics);
}

// =============================================================================
// Display Functions
// =============================================================================

/**
 * Displays the complete statistics report for a recall set.
 *
 * The report is divided into sections:
 * 1. Overview - Basic session and cost metrics
 * 2. Recall Performance - Success rates and engagement
 * 3. Point Breakdown - Per-point statistics with struggling indicators
 * 4. Top Rabbithole Topics - Common tangent topics
 * 5. Recent Trend - ASCII visualization of recall rate trend
 *
 * @param analytics - The computed analytics for the recall set
 */
function displayStatsReport(analytics: RecallSetAnalytics): void {
  // Display section header
  printBlankLine();
  console.log(bold(cyan('===== Recall Set Statistics =====')));
  printBlankLine();

  // Section 1: Overview
  displayOverviewSection(analytics);

  // Section 2: Recall Performance
  displayPerformanceSection(analytics);

  // Section 3: Point Breakdown
  displayPointBreakdownSection(analytics.pointAnalytics);

  // Section 4: Top Rabbithole Topics
  displayRabbitholeSection(analytics.topRabbitholeTopics);

  // Section 5: Recent Trend
  displayTrendSection(analytics.recallRateTrend);

  // Final separator
  console.log(formatSeparator(60));
  printBlankLine();
}

/**
 * Displays the overview section with basic session metrics.
 *
 * Shows:
 * - Recall set name
 * - Total number of sessions
 * - Total time spent studying
 * - Total API cost
 *
 * @param analytics - The computed analytics for the recall set
 */
function displayOverviewSection(analytics: RecallSetAnalytics): void {
  console.log(bold(yellow('Overview')));
  console.log(formatSeparator(40));

  // Display recall set name
  console.log(`  Set: ${bold(analytics.recallSetName)}`);

  // Display total sessions (handle zero sessions case)
  const sessionsDisplay =
    analytics.totalSessions === 0
      ? yellow('No sessions yet')
      : analytics.totalSessions.toString();
  console.log(`  Total Sessions: ${sessionsDisplay}`);

  // Display total time spent (formatted as hours/minutes)
  console.log(`  Total Time: ${formatDuration(analytics.totalTimeSpentMs)}`);

  // Display total cost with 4 decimal places for precision
  console.log(`  Total Cost: $${analytics.totalCostUsd.toFixed(4)}`);

  printBlankLine();
}

/**
 * Displays the recall performance section with success rates.
 *
 * Shows:
 * - Overall recall rate as a percentage
 * - Average engagement score out of 100
 *
 * If there are no sessions yet, displays a friendly message
 * encouraging the user to start their first session.
 *
 * @param analytics - The computed analytics for the recall set
 */
function displayPerformanceSection(analytics: RecallSetAnalytics): void {
  console.log(bold(yellow('Recall Performance')));
  console.log(formatSeparator(40));

  // Handle case with no session data
  if (analytics.totalSessions === 0) {
    console.log(dim('  No session data yet. Start a session to see performance metrics!'));
    console.log(dim('  Run: bun run cli session "<recall-set-name>"'));
    printBlankLine();
    return;
  }

  // Display overall recall rate with color coding
  const recallRatePercent = (analytics.overallRecallRate * 100).toFixed(1);
  const recallRateColor = getPerformanceColor(analytics.overallRecallRate);
  console.log(`  Overall Recall Rate: ${recallRateColor(`${recallRatePercent}%`)}`);

  // Display average engagement score
  const engagementDisplay = analytics.avgEngagementScore.toFixed(0);
  const engagementColor = getPerformanceColor(analytics.avgEngagementScore / 100);
  console.log(`  Average Engagement: ${engagementColor(`${engagementDisplay}/100`)}`);

  printBlankLine();
}

/**
 * Displays the point breakdown section with per-point statistics.
 *
 * Each point shows:
 * - Content (truncated if too long)
 * - Success rate percentage
 * - Days until due (or "Due now" if overdue)
 * - Warning indicator if the point is struggling
 *
 * Struggling points are highlighted with a warning icon and red color
 * to draw attention to knowledge gaps.
 *
 * @param pointAnalytics - Array of analytics for each recall point
 */
function displayPointBreakdownSection(pointAnalytics: RecallPointAnalytics[]): void {
  console.log(bold(yellow('Point Breakdown')));
  console.log(formatSeparator(40));

  // Handle case with no points
  if (pointAnalytics.length === 0) {
    console.log(dim('  No recall points found.'));
    printBlankLine();
    return;
  }

  // Display each point's statistics
  for (const point of pointAnalytics) {
    // Truncate content if too long for display
    const truncatedContent = truncateContent(point.content, MAX_CONTENT_LENGTH);

    // Format success rate with color coding
    const successRatePercent = (point.successRate * 100).toFixed(0);
    const successColor = getPerformanceColor(point.successRate);

    // Format due date display
    const dueDisplay = formatDueDate(point.daysUntilDue);

    // Add warning indicator if struggling
    const strugglingIndicator = point.isStruggling ? red(WARNING_ICON) : '  ';

    // Display the point line
    console.log(
      `${strugglingIndicator}${dim(truncatedContent)}`
    );
    console.log(
      `    Success: ${successColor(`${successRatePercent}%`)} | ${dueDisplay}`
    );
  }

  // Show legend for struggling indicator if any points are struggling
  const hasStruggling = pointAnalytics.some((p) => p.isStruggling);
  if (hasStruggling) {
    printBlankLine();
    console.log(dim(`  ${WARNING_ICON} = struggling point (< 50% success rate)`));
  }

  printBlankLine();
}

/**
 * Displays the top rabbithole topics section.
 *
 * Rabbitholes are tangent topics that came up during sessions.
 * This section shows the most frequent tangent topics, helping
 * users understand common areas of curiosity or confusion.
 *
 * @param topics - Array of top rabbithole topics with counts and depths
 */
function displayRabbitholeSection(
  topics: RecallSetAnalytics['topRabbitholeTopics']
): void {
  // Skip section if no rabbithole topics
  if (topics.length === 0) {
    return;
  }

  console.log(bold(yellow('Top Rabbithole Topics')));
  console.log(formatSeparator(40));

  // Display each topic with occurrence count and average depth
  for (const topic of topics) {
    console.log(
      `  ${cyan(topic.topic)} (${topic.count}x, avg depth: ${topic.avgDepth.toFixed(1)})`
    );
  }

  printBlankLine();
}

/**
 * Displays the recent recall rate trend as a simple ASCII visualization.
 *
 * Shows the last N days of recall rate data (default 7 days) as a
 * horizontal bar chart. Each day shows the date and a visual bar
 * representing the recall rate percentage.
 *
 * If there's insufficient trend data, displays a message indicating
 * that more sessions are needed.
 *
 * @param trendData - Array of trend data points from analytics
 */
function displayTrendSection(trendData: TrendData[]): void {
  console.log(bold(yellow('Recent Recall Rate Trend')));
  console.log(formatSeparator(40));

  // Get the most recent N days of data
  const recentTrend = trendData.slice(-TREND_DAYS);

  // Handle case with insufficient data
  if (recentTrend.length === 0) {
    console.log(dim('  Not enough data for trend visualization.'));
    console.log(dim('  Complete more sessions to see trends!'));
    printBlankLine();
    return;
  }

  // Display each day's recall rate as an ASCII bar
  for (const point of recentTrend) {
    const dateStr = formatTrendDate(point.date);
    const percent = point.value * 100;
    const bar = renderAsciiBar(point.value);
    const percentStr = `${percent.toFixed(0)}%`.padStart(4);

    console.log(`  ${dateStr} ${bar} ${percentStr}`);
  }

  printBlankLine();
}

// =============================================================================
// Formatting Helper Functions
// =============================================================================

/**
 * Formats a duration in milliseconds as a human-readable string.
 *
 * Examples:
 * - 3600000 -> "1h 0m"
 * - 5400000 -> "1h 30m"
 * - 1800000 -> "30m"
 * - 0 -> "0m"
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 */
function formatDuration(ms: number): string {
  // Handle zero or negative values
  if (ms <= 0) {
    return '0m';
  }

  // Calculate hours and minutes
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);

  // Format based on whether hours are present
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Truncates content to a maximum length with ellipsis.
 *
 * If the content is shorter than the max length, it's returned unchanged.
 * Otherwise, it's truncated and "..." is appended.
 *
 * @param content - The content string to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated content string
 */
function truncateContent(content: string, maxLength: number): string {
  // Remove newlines and extra whitespace for single-line display
  const normalized = content.replace(/\s+/g, ' ').trim();

  // Check if truncation is needed
  if (normalized.length <= maxLength) {
    return normalized;
  }

  // Truncate and add ellipsis
  return normalized.substring(0, maxLength - 3) + '...';
}

/**
 * Formats the due date for display.
 *
 * Examples:
 * - daysUntilDue > 1 -> "Due in N days"
 * - daysUntilDue === 1 -> "Due tomorrow"
 * - daysUntilDue === 0 -> "Due today"
 * - daysUntilDue < 0 -> "Overdue" (in red)
 *
 * @param daysUntilDue - Number of days until the point is due
 * @returns Formatted due date string with appropriate color
 */
function formatDueDate(daysUntilDue: number): string {
  if (daysUntilDue < 0) {
    return red('Overdue');
  } else if (daysUntilDue === 0) {
    return yellow('Due today');
  } else if (daysUntilDue === 1) {
    return green('Due tomorrow');
  } else {
    return dim(`Due in ${daysUntilDue} days`);
  }
}

/**
 * Formats a date for trend display (MM/DD format).
 *
 * @param date - The date to format
 * @returns Formatted date string in MM/DD format
 */
function formatTrendDate(date: Date): string {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${month}/${day}`;
}

/**
 * Returns the appropriate color function based on performance value.
 *
 * Performance thresholds:
 * - >= 0.7 (70%) -> green (good)
 * - >= 0.4 (40%) -> yellow (needs work)
 * - < 0.4 (40%) -> red (struggling)
 *
 * @param value - Performance value from 0.0 to 1.0
 * @returns Color function to apply to the display text
 */
function getPerformanceColor(value: number): (s: string) => string {
  if (value >= 0.7) {
    return green;
  } else if (value >= 0.4) {
    return yellow;
  } else {
    return red;
  }
}

/**
 * Renders an ASCII bar for trend visualization.
 *
 * Creates a simple horizontal bar using Unicode block characters.
 * The bar width is proportional to the value (0.0 to 1.0).
 *
 * Maximum bar width is 20 characters.
 *
 * @param value - Value from 0.0 to 1.0
 * @returns ASCII bar string with appropriate color
 */
function renderAsciiBar(value: number): string {
  // Define maximum bar width
  const maxWidth = 20;

  // Calculate filled width based on value
  const filledWidth = Math.round(value * maxWidth);

  // Create the bar using block characters
  const filled = '\u2588'.repeat(filledWidth); // Full block character
  const empty = '\u2591'.repeat(maxWidth - filledWidth); // Light shade character

  // Apply color based on performance
  const colorFn = getPerformanceColor(value);
  return colorFn(filled) + dim(empty);
}
