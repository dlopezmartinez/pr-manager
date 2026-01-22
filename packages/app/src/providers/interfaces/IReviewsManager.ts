/**
 * IReviewsManager - Interface for review operations
 * Defines the contract for fetching and analyzing reviews
 */

import type { Review } from '../../model/types';

/**
 * Summary of review states for a PR
 */
export interface ReviewStatus {
  approved: number;
  changesRequested: number;
  commented: number;
  pending: number;
}

export interface IReviewsManager {
  /**
   * Get reviews for a specific pull request
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - Pull request number
   * @param useCache - Whether to use cached data
   */
  getReviews(
    owner: string,
    repo: string,
    prNumber: number,
    useCache?: boolean
  ): Promise<Review[]>;

  /**
   * Get a summary of review states
   * @param reviews - Array of reviews to analyze
   */
  getReviewStatus(reviews: Review[]): ReviewStatus;

  /**
   * Clear the reviews cache
   * @param owner - Optional: clear specific repo's cache
   * @param repo - Optional: clear specific repo's cache
   * @param prNumber - Optional: clear specific PR's cache
   */
  clearReviewsCache(owner?: string, repo?: string, prNumber?: number): void;

  /**
   * Clear all cached data
   */
  clearCache(): void;
}
