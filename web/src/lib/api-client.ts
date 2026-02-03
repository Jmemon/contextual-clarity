/**
 * Typed API Client for Contextual Clarity Backend
 *
 * This module provides a typed fetch wrapper for all backend API endpoints.
 * It handles:
 * - Base URL configuration (from environment or localhost default)
 * - JSON request/response serialization
 * - Error handling (throws on non-2xx responses)
 * - Type-safe function signatures for each endpoint
 *
 * All functions return the unwrapped data from successful responses.
 * Errors are thrown as ApiError instances with code, message, and details.
 *
 * @example
 * ```typescript
 * import { getDashboardOverview, createRecallSet } from '@/lib/api-client';
 *
 * // Fetch dashboard data
 * const overview = await getDashboardOverview();
 *
 * // Create a new recall set
 * const newSet = await createRecallSet({
 *   name: 'JavaScript Basics',
 *   description: 'Core JS concepts',
 *   discussionSystemPrompt: 'You are a JS tutor...',
 * });
 * ```
 */

import type {
  ApiResult,
  DashboardOverview,
  RecentSessionsResponse,
  UpcomingReviewsResponse,
  RecallSetWithSummary,
  CreateRecallSetInput,
  UpdateRecallSetInput,
  RecallPoint,
  CreateRecallPointInput,
  UpdateRecallPointInput,
  SessionListResponse,
  SessionFilters,
  SessionDetail,
  TranscriptResponse,
  StartSessionResponse,
  AbandonSessionResponse,
  DeleteRecallPointResponse,
} from '@/types/api';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Base URL for the API.
 * Defaults to localhost:3001 for development; can be overridden via environment variable.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

// ============================================================================
// Custom Error Class
// ============================================================================

/**
 * Custom error class for API errors.
 * Contains structured error information from the backend.
 */
export class ApiError extends Error {
  /** Machine-readable error code */
  code: string;
  /** HTTP status code */
  status: number;
  /** Additional error details */
  details?: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// ============================================================================
// Fetch Wrapper
// ============================================================================

/**
 * Options for API requests, extending standard RequestInit.
 */
interface FetchOptions extends Omit<RequestInit, 'body'> {
  /** Request body (will be JSON stringified) */
  body?: unknown;
}

/**
 * Generic fetch wrapper that handles JSON serialization, error handling,
 * and response unwrapping.
 *
 * @typeParam T - Expected response data type
 * @param endpoint - API endpoint path (without base URL)
 * @param options - Fetch options including body and headers
 * @returns The unwrapped response data
 * @throws ApiError if the response is not successful
 */
async function apiFetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { body, headers, ...restOptions } = options;

  // Construct the full URL
  const url = `${API_BASE_URL}${endpoint}`;

  // Prepare request configuration
  const config: RequestInit = {
    ...restOptions,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  // Add JSON stringified body if provided
  if (body !== undefined) {
    config.body = JSON.stringify(body);
  }

  // Execute the request
  const response = await fetch(url, config);

  // Parse the JSON response
  const result = (await response.json()) as ApiResult<T>;

  // Check for API-level errors (success: false)
  if (!result.success) {
    throw new ApiError(
      result.error.message,
      result.error.code,
      response.status,
      result.error.details
    );
  }

  // Return the unwrapped data
  return result.data;
}

// ============================================================================
// Dashboard API Functions
// ============================================================================

/**
 * Fetches the complete dashboard overview including stats, recent sessions,
 * upcoming reviews, and streak information.
 *
 * @returns Dashboard overview data
 * @throws ApiError on failure
 */
export async function getDashboardOverview(): Promise<DashboardOverview> {
  return apiFetch<DashboardOverview>('/api/dashboard/overview');
}

/**
 * Fetches recent study sessions with summary metrics.
 *
 * @param limit - Maximum number of sessions to return (default: 5, max: 50)
 * @returns Recent sessions with total count
 * @throws ApiError on failure
 */
export async function getRecentSessions(limit?: number): Promise<RecentSessionsResponse> {
  const params = limit !== undefined ? `?limit=${limit}` : '';
  return apiFetch<RecentSessionsResponse>(`/api/dashboard/recent-sessions${params}`);
}

/**
 * Fetches recall points due for review in the coming days.
 *
 * @param days - Number of days ahead to look (default: 7, max: 90)
 * @returns Upcoming reviews with summary counts
 * @throws ApiError on failure
 */
export async function getUpcomingReviews(days?: number): Promise<UpcomingReviewsResponse> {
  const params = days !== undefined ? `?days=${days}` : '';
  return apiFetch<UpcomingReviewsResponse>(`/api/dashboard/upcoming-reviews${params}`);
}

// ============================================================================
// Recall Sets API Functions
// ============================================================================

/**
 * Fetches all recall sets with their summary statistics.
 *
 * @returns Array of recall sets with summaries
 * @throws ApiError on failure
 */
export async function getRecallSets(): Promise<RecallSetWithSummary[]> {
  return apiFetch<RecallSetWithSummary[]>('/api/recall-sets');
}

/**
 * Fetches a single recall set by ID with summary statistics.
 *
 * @param id - Recall set identifier
 * @returns Recall set with summary
 * @throws ApiError if not found or on failure
 */
export async function getRecallSet(id: string): Promise<RecallSetWithSummary> {
  return apiFetch<RecallSetWithSummary>(`/api/recall-sets/${id}`);
}

/**
 * Creates a new recall set.
 *
 * @param data - Recall set creation data
 * @returns The newly created recall set
 * @throws ApiError on validation failure or other errors
 */
export async function createRecallSet(data: CreateRecallSetInput): Promise<RecallSetWithSummary> {
  return apiFetch<RecallSetWithSummary>('/api/recall-sets', {
    method: 'POST',
    body: data,
  });
}

/**
 * Updates an existing recall set with partial data.
 *
 * @param id - Recall set identifier
 * @param data - Fields to update
 * @returns The updated recall set
 * @throws ApiError if not found, validation fails, or other errors
 */
export async function updateRecallSet(
  id: string,
  data: UpdateRecallSetInput
): Promise<RecallSetWithSummary> {
  return apiFetch<RecallSetWithSummary>(`/api/recall-sets/${id}`, {
    method: 'PATCH',
    body: data,
  });
}

/**
 * Archives (soft deletes) a recall set.
 *
 * @param id - Recall set identifier
 * @returns The archived recall set
 * @throws ApiError if not found or on failure
 */
export async function deleteRecallSet(id: string): Promise<RecallSetWithSummary> {
  return apiFetch<RecallSetWithSummary>(`/api/recall-sets/${id}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// Recall Points API Functions
// ============================================================================

/**
 * Fetches all recall points for a specific recall set.
 *
 * @param setId - Parent recall set identifier
 * @returns Array of recall points
 * @throws ApiError if set not found or on failure
 */
export async function getRecallPoints(setId: string): Promise<RecallPoint[]> {
  return apiFetch<RecallPoint[]>(`/api/recall-sets/${setId}/points`);
}

/**
 * Creates a new recall point within a recall set.
 *
 * @param setId - Parent recall set identifier
 * @param data - Recall point creation data
 * @returns The newly created recall point
 * @throws ApiError if set not found, validation fails, or other errors
 */
export async function createRecallPoint(
  setId: string,
  data: CreateRecallPointInput
): Promise<RecallPoint> {
  return apiFetch<RecallPoint>(`/api/recall-sets/${setId}/points`, {
    method: 'POST',
    body: data,
  });
}

/**
 * Updates an existing recall point with partial data.
 *
 * @param setId - Parent recall set identifier
 * @param pointId - Recall point identifier
 * @param data - Fields to update
 * @returns The updated recall point
 * @throws ApiError if not found, validation fails, or other errors
 */
export async function updateRecallPoint(
  setId: string,
  pointId: string,
  data: UpdateRecallPointInput
): Promise<RecallPoint> {
  return apiFetch<RecallPoint>(`/api/recall-sets/${setId}/points/${pointId}`, {
    method: 'PATCH',
    body: data,
  });
}

/**
 * Permanently deletes a recall point.
 *
 * @param setId - Parent recall set identifier
 * @param pointId - Recall point identifier
 * @returns Deletion confirmation
 * @throws ApiError if not found or on failure
 */
export async function deleteRecallPoint(
  setId: string,
  pointId: string
): Promise<DeleteRecallPointResponse> {
  return apiFetch<DeleteRecallPointResponse>(`/api/recall-sets/${setId}/points/${pointId}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// Sessions API Functions
// ============================================================================

/**
 * Fetches sessions with optional filters and pagination.
 *
 * @param filters - Optional filter and pagination parameters
 * @returns Paginated session list
 * @throws ApiError on failure
 */
export async function getSessions(filters?: SessionFilters): Promise<SessionListResponse> {
  const params = new URLSearchParams();

  if (filters) {
    if (filters.recallSetId) params.set('recallSetId', filters.recallSetId);
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);
    if (filters.limit !== undefined) params.set('limit', String(filters.limit));
    if (filters.offset !== undefined) params.set('offset', String(filters.offset));
    if (filters.status) params.set('status', filters.status);
  }

  const queryString = params.toString();
  const endpoint = queryString ? `/api/sessions?${queryString}` : '/api/sessions';

  return apiFetch<SessionListResponse>(endpoint);
}

/**
 * Fetches detailed information about a specific session.
 *
 * @param id - Session identifier
 * @returns Session details with metrics
 * @throws ApiError if not found or on failure
 */
export async function getSession(id: string): Promise<SessionDetail> {
  return apiFetch<SessionDetail>(`/api/sessions/${id}`);
}

/**
 * Fetches the full transcript for a session including evaluation and
 * rabbithole markers.
 *
 * @param id - Session identifier
 * @returns Full transcript with messages and markers
 * @throws ApiError if not found or on failure
 */
export async function getSessionTranscript(id: string): Promise<TranscriptResponse> {
  return apiFetch<TranscriptResponse>(`/api/sessions/${id}/transcript`);
}

/**
 * Starts a new study session for a recall set.
 * If an in-progress session exists, returns that session instead.
 *
 * @param recallSetId - Recall set to study
 * @returns Session ID and status (new or resumed)
 * @throws ApiError if set not found, inactive, has no points, or other errors
 */
export async function startSession(recallSetId: string): Promise<StartSessionResponse> {
  return apiFetch<StartSessionResponse>('/api/sessions/start', {
    method: 'POST',
    body: { recallSetId },
  });
}

/**
 * Abandons an in-progress session.
 *
 * @param id - Session identifier
 * @returns Abandonment confirmation
 * @throws ApiError if not found, already finished, or other errors
 */
export async function abandonSession(id: string): Promise<AbandonSessionResponse> {
  return apiFetch<AbandonSessionResponse>(`/api/sessions/${id}/abandon`, {
    method: 'POST',
  });
}
