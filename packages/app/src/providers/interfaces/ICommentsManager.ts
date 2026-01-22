/**
 * ICommentsManager - Interface for comment operations
 * Defines the contract for fetching and analyzing comments
 */

import type { Comment } from '../../model/types';

/**
 * Statistics about comments on a PR
 */
export interface CommentsStats {
  total: number;
  byAuthor: Map<string, number>;
  recent: Comment[];
}

export interface ICommentsManager {
  /**
   * Get comments for a specific pull request
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - Pull request number
   * @param useCache - Whether to use cached data
   */
  getComments(
    owner: string,
    repo: string,
    prNumber: number,
    useCache?: boolean
  ): Promise<Comment[]>;

  /**
   * Get statistics about comments
   * @param comments - Array of comments to analyze
   */
  getCommentsStats(comments: Comment[]): CommentsStats;

  /**
   * Clear the comments cache
   * @param owner - Optional: clear specific repo's cache
   * @param repo - Optional: clear specific repo's cache
   * @param prNumber - Optional: clear specific PR's cache
   */
  clearCommentsCache(owner?: string, repo?: string, prNumber?: number): void;

  /**
   * Clear all cached data
   */
  clearCache(): void;
}
