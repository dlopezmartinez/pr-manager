/**
 * IActionsManager - Interface for mutation operations
 * Defines the contract for PR actions (approve, merge, comment, etc.)
 */

import type {
  ApproveResult,
  RequestChangesResult,
  CommentResult,
  MergeResult,
  MergeMethod,
} from '../../model/mutation-types';

/**
 * Options for merge operation
 */
export interface MergeOptions {
  commitHeadline?: string;
  commitBody?: string;
  mergeMethod?: MergeMethod;
}

/**
 * Result of getting PR node ID for mutations
 */
export interface PRNodeIdResult {
  id: string;
  mergeable: string;
  canMerge: boolean;
}

export interface IActionsManager {
  /**
   * Check if an action is currently pending for a PR
   * @param prId - Pull request ID
   */
  isActionPending(prId: string): boolean;

  /**
   * Get PR node ID from owner/repo/number
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - Pull request number
   */
  getPRNodeId(owner: string, repo: string, prNumber: number): Promise<PRNodeIdResult>;

  /**
   * Approve a pull request
   * @param pullRequestId - PR node ID
   * @param body - Optional approval comment
   */
  approvePullRequest(pullRequestId: string, body?: string): Promise<ApproveResult>;

  /**
   * Request changes on a pull request
   * @param pullRequestId - PR node ID
   * @param body - Required comment explaining requested changes
   */
  requestChanges(pullRequestId: string, body: string): Promise<RequestChangesResult>;

  /**
   * Add a comment to a pull request
   * @param pullRequestId - PR node ID
   * @param body - Comment body
   */
  addComment(pullRequestId: string, body: string): Promise<CommentResult>;

  /**
   * Merge a pull request
   * @param pullRequestId - PR node ID
   * @param options - Optional merge configuration
   */
  mergePullRequest(pullRequestId: string, options?: MergeOptions): Promise<MergeResult>;

  /**
   * Parse repository string into owner/repo components
   * @param repoString - Repository string in "owner/repo" format
   */
  parseRepo(repoString: string): { owner: string; repo: string } | null;
}
