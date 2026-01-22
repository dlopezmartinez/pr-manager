/**
 * IChecksManager - Interface for CI/CD check operations
 * Defines the contract for fetching and analyzing CI/CD status
 */

import type { StatusCheckRollup, CheckContext } from '../../model/types';

/**
 * Detailed summary of CI/CD checks
 */
export interface ChecksSummary {
  state: string;
  total: number;
  success: number;
  failure: number;
  pending: number;
  neutral: number;
  failedChecks: CheckContext[];
  pendingChecks: CheckContext[];
}

export interface IChecksManager {
  /**
   * Get CI/CD check status for a specific pull request
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - Pull request number
   * @param useCache - Whether to use cached data
   */
  getChecks(
    owner: string,
    repo: string,
    prNumber: number,
    useCache?: boolean
  ): Promise<StatusCheckRollup | null>;

  /**
   * Get a detailed summary of checks
   * @param rollup - Status check rollup to analyze
   */
  getChecksSummary(rollup: StatusCheckRollup | null): ChecksSummary;

  /**
   * Check if all CI/CD checks are passing
   * @param rollup - Status check rollup to analyze
   */
  areChecksPassing(rollup: StatusCheckRollup | null): boolean;

  /**
   * Clear the checks cache
   * @param owner - Optional: clear specific repo's cache
   * @param repo - Optional: clear specific repo's cache
   * @param prNumber - Optional: clear specific PR's cache
   */
  clearChecksCache(owner?: string, repo?: string, prNumber?: number): void;

  /**
   * Clear all cached data
   */
  clearCache(): void;
}
