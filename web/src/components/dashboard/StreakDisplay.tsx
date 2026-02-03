/**
 * StreakDisplay Component
 *
 * Visualizes the user's study streak, showing both the current consecutive
 * day streak and their longest streak ever achieved. Includes a flame icon
 * that animates when the user is on a streak.
 *
 * The streak visualization is designed to motivate users to maintain
 * consistent study habits by celebrating their progress.
 *
 * Features:
 * - Large, prominent current streak display
 * - Flame icon with animation for active streaks
 * - Longest streak comparison for motivation
 * - Last activity date for context
 * - Encouraging messages based on streak status
 *
 * @example
 * ```tsx
 * <StreakDisplay
 *   currentStreak={7}
 *   longestStreak={14}
 *   lastActivityDate="2024-01-15"
 * />
 * ```
 */

import { Card, CardBody } from '@/components/ui';

// ============================================================================
// Type Definitions
// ============================================================================

export interface StreakDisplayProps {
  /** Current consecutive day streak */
  currentStreak: number;
  /** Longest streak ever achieved */
  longestStreak: number;
  /** ISO 8601 date string of last activity (optional) */
  lastActivityDate?: string | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Formats the last activity date into a human-readable string.
 *
 * @param dateString - ISO 8601 date string
 * @returns Human-readable date string
 */
function formatLastActivity(dateString: string | null | undefined): string {
  if (!dateString) {
    return 'No activity yet';
  }

  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date >= today) {
    return 'Today';
  }

  if (date >= yesterday && date < today) {
    return 'Yesterday';
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Returns an encouraging message based on the current streak.
 *
 * @param streak - Current streak count
 * @returns Motivational message string
 */
function getStreakMessage(streak: number): string {
  if (streak === 0) {
    return 'Start a session to begin your streak!';
  }
  if (streak === 1) {
    return 'Great start! Keep it going tomorrow.';
  }
  if (streak < 7) {
    return 'Building momentum! Keep it up.';
  }
  if (streak < 14) {
    return 'Impressive! A full week of learning.';
  }
  if (streak < 30) {
    return 'Amazing consistency! You\'re on fire!';
  }
  return 'Legendary dedication! You\'re unstoppable!';
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Animated flame icon for active streaks.
 * Uses CSS animation for a subtle pulsing effect.
 */
function FlameIcon({ isActive }: { isActive: boolean }) {
  return (
    <div className={`relative ${isActive ? 'animate-pulse' : ''}`}>
      {/* Outer glow for active streaks */}
      {isActive && (
        <div className="absolute inset-0 bg-orange-400 blur-lg opacity-50 rounded-full" />
      )}
      {/* Flame SVG */}
      <svg
        className={`relative w-16 h-16 ${isActive ? 'text-orange-500' : 'text-gray-300'}`}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 23c-4.97 0-9-3.694-9-8.246 0-3.928 2.456-6.858 5.007-9.14C10.082 3.618 12 1.456 12 1c0 0 .582 2.208 1.993 4.614 1.407 2.401 2.891 4.104 3.821 5.526C19.174 13.187 20 14.882 20 16.5 20 19.58 16.418 23 12 23zm0-4c1.657 0 3-1.119 3-2.5 0-.654-.254-1.28-.712-1.84-.348-.426-.824-.875-1.362-1.346-.312-.273-.64-.546-.926-.821-.287.275-.614.548-.926.821-.538.471-1.014.92-1.362 1.346-.458.56-.712 1.186-.712 1.84 0 1.381 1.343 2.5 3 2.5z" />
      </svg>
    </div>
  );
}

/**
 * Trophy/medal icon for longest streak display.
 */
function TrophyIcon() {
  return (
    <svg
      className="w-5 h-5 text-amber-500"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z" />
    </svg>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * StreakDisplay shows the user's current and longest study streaks.
 * Designed to motivate consistent study habits through visual feedback.
 */
export function StreakDisplay({
  currentStreak,
  longestStreak,
  lastActivityDate,
}: StreakDisplayProps) {
  const isOnStreak = currentStreak > 0;
  const isAtRecord = currentStreak > 0 && currentStreak >= longestStreak;

  return (
    <Card>
      <CardBody>
        {/* Main streak display */}
        <div className="flex flex-col items-center text-center py-4">
          {/* Flame icon */}
          <FlameIcon isActive={isOnStreak} />

          {/* Current streak number */}
          <p className={`text-5xl font-bold mt-4 ${isOnStreak ? 'text-orange-500' : 'text-gray-400'}`}>
            {currentStreak}
          </p>
          <p className="text-gray-500 mt-1">
            day{currentStreak === 1 ? '' : 's'} streak
          </p>

          {/* Record indicator */}
          {isAtRecord && currentStreak > 1 && (
            <div className="flex items-center gap-1 mt-2 text-amber-600">
              <TrophyIcon />
              <span className="text-sm font-medium">Personal Record!</span>
            </div>
          )}

          {/* Motivational message */}
          <p className="text-sm text-gray-600 mt-4 max-w-xs">
            {getStreakMessage(currentStreak)}
          </p>
        </div>

        {/* Stats row - longest streak and last activity */}
        <div className="flex justify-around pt-4 mt-4 border-t border-gray-200">
          {/* Longest streak */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <TrophyIcon />
              <p className="text-xl font-semibold text-gray-700">{longestStreak}</p>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">longest streak</p>
          </div>

          {/* Last activity */}
          <div className="text-center">
            <p className="text-xl font-semibold text-gray-700">
              {formatLastActivity(lastActivityDate)}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">last activity</p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
