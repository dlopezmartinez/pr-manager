/**
 * IPullRequestManager - Interface for pull request operations
 * Defines the contract for listing and fetching pull requests
 */

import type {
  PullRequest,
  PullRequestBasic,
  PageInfo,
  Review,
  Comment,
  StatusCheckRollup,
  RepositoryInfo,
} from '../../model/types';

/**
 * Result type for list operations with pagination
 */
export interface ListResult {
  prs: PullRequestBasic[];
  pageInfo: PageInfo;
}

/**
 * Result type for enriched PR data (lazy loading)
 */
export interface EnrichedPullRequest {
  pr: PullRequestBasic;
  reviews: Review[];
  comments: Comment[];
  checks: StatusCheckRollup | null;
}

export interface IPullRequestManager {
  /**
   * Get the authenticated user's username
   */
  getCurrentUser(): Promise<string>;

  /**
   * List pull requests based on a search query
   * @param query - Provider-specific query string
   * @param limit - Maximum results per page
   * @param after - Pagination cursor
   */
  listPullRequests(query: string, limit?: number, after?: string): Promise<ListResult>;

  /**
   * Get detailed information for a specific pull request
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - Pull request number
   * @param useCache - Whether to use cached data
   */
  getPullRequestDetails(
    owner: string,
    repo: string,
    prNumber: number,
    useCache?: boolean
  ): Promise<PullRequest>;

  /**
   * Get pull requests awaiting review from the specified user
   * @param username - Username (defaults to authenticated user)
   * @param limit - Maximum results
   * @param after - Pagination cursor
   */
  getPRsToReview(username?: string, limit?: number, after?: string): Promise<ListResult>;

  /**
   * Get pull requests authored by the specified user
   * @param username - Username (defaults to authenticated user)
   * @param limit - Maximum results
   * @param after - Pagination cursor
   */
  getMyPullRequests(username?: string, limit?: number, after?: string): Promise<ListResult>;

  /**
   * Load reviews for a specific PR (lazy loading)
   */
  loadReviews(pr: PullRequestBasic): Promise<Review[]>;

  /**
   * Load comments for a specific PR (lazy loading)
   */
  loadComments(pr: PullRequestBasic): Promise<Comment[]>;

  /**
   * Load CI/CD checks for a specific PR (lazy loading)
   */
  loadChecks(pr: PullRequestBasic): Promise<StatusCheckRollup | null>;

  /**
   * Load all details for a PR in parallel (lazy loading)
   */
  enrichPullRequest(pr: PullRequestBasic): Promise<EnrichedPullRequest>;

  /**
   * Clear all caches
   */
  clearAllCaches(): void;

  /**
   * Get repositories the user has access to
   * @param searchTerm - Optional search term to filter repositories
   * @param limit - Maximum results to return (default 50)
   */
  getRepositories(searchTerm?: string, limit?: number): Promise<RepositoryInfo[]>;
}
