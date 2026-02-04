/**
 * Dashboard Page Component
 *
 * The main landing page of the application that displays an overview of:
 * - User's learning progress and statistics (OverviewStats)
 * - Current and longest study streaks (StreakDisplay)
 * - Points due for review today (DuePointsCard)
 * - Recent activity and session history (RecentSessionsList)
 * - Upcoming reviews in the next few days (UpcomingReviewsCard)
 *
 * This page uses the useDashboardOverview hook to fetch all dashboard data
 * in a single API call. It handles loading, error, and empty states gracefully.
 *
 * @route /
 */

import { useDashboardOverview } from '@/hooks/api/use-dashboard';
import { Spinner, Button } from '@/components/ui';
import {
  OverviewStats,
  DuePointsCard,
  RecentSessionsList,
  UpcomingReviewsCard,
  StreakDisplay,
} from '@/components/dashboard';

// ============================================================================
// Loading State Component
// ============================================================================

/**
 * Full-page loading state shown while dashboard data is being fetched.
 * Centers a large spinner with loading text.
 */
function DashboardLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <Spinner size="lg" label="Loading dashboard..." />
      <p className="text-gray-500 mt-4">Loading your dashboard...</p>
    </div>
  );
}

// ============================================================================
// Error State Component
// ============================================================================

/**
 * Error state shown when dashboard data fails to load.
 * Displays error message and retry button.
 */
function DashboardError({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      {/* Error icon */}
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
        <svg
          className="w-8 h-8 text-red-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        Failed to Load Dashboard
      </h2>
      <p className="text-gray-500 mb-6 text-center max-w-md">
        {error.message || 'An unexpected error occurred while loading your dashboard.'}
      </p>
      <Button variant="primary" onClick={onRetry}>
        Try Again
      </Button>
    </div>
  );
}

// ============================================================================
// Dashboard Page Component
// ============================================================================

/**
 * Dashboard page displaying user's learning overview.
 *
 * Layout structure:
 * - Header with title and description
 * - Overview stats grid (6 StatCards)
 * - Two-column layout:
 *   - Left column: Due points card + Recent sessions
 *   - Right column: Streak display + Upcoming reviews
 *
 * The layout is responsive:
 * - Mobile: single column, stacked sections
 * - Tablet: two columns for the main content
 * - Desktop: wider spacing and larger cards
 */
export function Dashboard() {
  // Fetch all dashboard data using the overview hook
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useDashboardOverview();

  // Show loading state while data is being fetched
  if (isLoading) {
    return (
      <div className="p-8">
        <DashboardLoading />
      </div>
    );
  }

  // Show error state if fetch failed
  if (error) {
    return (
      <div className="p-8">
        <DashboardError error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  // Extract data with defaults for safety
  const totalRecallSets = data?.totalRecallSets ?? 0;
  const activeRecallSets = data?.activeRecallSets ?? 0;
  const totalSessions = data?.totalSessions ?? 0;
  const totalStudyTimeMs = data?.totalStudyTimeMs ?? 0;
  const overallRecallRate = data?.overallRecallRate ?? 0;
  const todaysSessions = data?.todaysSessions ?? 0;
  const todaysStudyTimeMs = data?.todaysStudyTimeMs ?? 0;
  const pointsDueToday = data?.pointsDueToday ?? 0;
  const recentSessions = data?.recentSessions ?? [];
  const upcomingReviews = data?.upcomingReviews ?? [];
  const currentStreak = data?.currentStreak ?? 0;
  const longestStreak = data?.longestStreak ?? 0;

  // Calculate total points from recent sessions (approximation)
  // In a real app, this would come from the API
  const totalPoints = recentSessions.reduce(
    (sum, session) => sum + (session.engagementScore || 0),
    0
  );

  // Build upcoming reviews summary
  const reviewsSummary = {
    total: upcomingReviews.length,
    overdue: upcomingReviews.filter((r) => r.priority === 'overdue').length,
    dueToday: upcomingReviews.filter((r) => r.priority === 'due-today').length,
    upcoming: upcomingReviews.filter((r) => r.priority === 'upcoming').length,
  };

  // Determine last activity date from recent sessions
  const firstSession = recentSessions[0];
  const lastActivityDate = firstSession !== undefined
    ? firstSession.startedAt
    : null;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Page header with title and description - responsive text sizing */}
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-clarity-800 mb-2">
          Dashboard
        </h1>
        <p className="text-sm sm:text-base text-clarity-600">
          Your learning overview and progress at a glance.
        </p>
      </header>

      {/* Overview statistics grid - shows key metrics */}
      {/* Responsive: 1 col mobile, 2 cols tablet, 3 cols desktop */}
      <section className="mb-6 sm:mb-8">
        <h2 className="text-lg sm:text-xl font-semibold text-clarity-700 mb-3 sm:mb-4">
          Overview
        </h2>
        <OverviewStats
          totalSets={totalRecallSets}
          activeSets={activeRecallSets}
          totalPoints={totalPoints}
          totalSessions={totalSessions}
          overallRecallRate={overallRecallRate}
          totalStudyTimeMs={totalStudyTimeMs}
        />
      </section>

      {/* Main dashboard content - stacks on mobile, two columns on larger screens */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Left column: Due points and recent sessions */}
        <div className="space-y-4 sm:space-y-6">
          {/* Due points card - shows today's review status */}
          <DuePointsCard
            duePoints={pointsDueToday}
            todaysSessions={todaysSessions}
            todaysStudyTimeMs={todaysStudyTimeMs}
          />

          {/* Recent sessions list - shows recent study activity */}
          <RecentSessionsList
            sessions={recentSessions}
            isLoading={false}
            error={null}
            onRetry={() => refetch()}
          />
        </div>

        {/* Right column: Streak and upcoming reviews */}
        <div className="space-y-4 sm:space-y-6">
          {/* Streak display - shows current and longest streaks */}
          <StreakDisplay
            currentStreak={currentStreak}
            longestStreak={longestStreak}
            lastActivityDate={lastActivityDate}
          />

          {/* Upcoming reviews card - shows reviews due in coming days */}
          <UpcomingReviewsCard
            reviews={upcomingReviews}
            summary={reviewsSummary}
            isLoading={false}
            error={null}
            onRetry={() => refetch()}
            maxDisplay={5}
          />
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
