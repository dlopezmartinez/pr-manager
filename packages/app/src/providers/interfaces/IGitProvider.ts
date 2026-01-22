/**
 * IGitProvider - Main interface for Git providers
 * Defines the contract that all Git providers (GitHub, GitLab, Bitbucket) must implement
 */

import type { IPullRequestManager } from './IPullRequestManager';
import type { IReviewsManager } from './IReviewsManager';
import type { ICommentsManager } from './ICommentsManager';
import type { IChecksManager } from './IChecksManager';
import type { IActionsManager } from './IActionsManager';
import type { ProviderType } from '../../model/provider-types';

export interface IGitProvider {
  /**
   * Provider type identifier
   */
  readonly type: ProviderType;

  /**
   * Pull request manager for listing and fetching PRs
   */
  readonly pullRequests: IPullRequestManager;

  /**
   * Reviews manager for fetching review data
   */
  readonly reviews: IReviewsManager;

  /**
   * Comments manager for fetching comment data
   */
  readonly comments: ICommentsManager;

  /**
   * Checks manager for CI/CD status
   */
  readonly checks: IChecksManager;

  /**
   * Actions manager for mutations (approve, merge, etc.)
   */
  readonly actions: IActionsManager;

  /**
   * Check if the provider is ready (configured with valid credentials)
   */
  isReady(): boolean;

  /**
   * Clear all caches across all managers
   */
  clearAllCaches(): void;

  /**
   * Check if the provider supports a specific operation
   * Useful for feature detection across different providers
   */
  supportsOperation(operation: string): boolean;
}
