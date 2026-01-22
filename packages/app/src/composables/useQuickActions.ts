/**
 * Composable for Quick Actions functionality
 * Handles approve, request changes, comment, and merge operations
 */

import { ref, computed } from 'vue';
import { useGitProvider } from './useGitProvider';
import { markAsSeen } from '../stores/seenStateStore';
import { configStore } from '../stores/configStore';
import type { PullRequestBasic } from '../model/types';
import type { MergeMethod, ReviewResponse, CommentResponse, MergeResponse } from '../model/mutation-types';

export interface QuickActionState {
  loading: boolean;
  error: string | null;
  success: string | null;
}

export function useQuickActions() {
  const github = useGitProvider();

  const loading = ref(false);
  const error = ref<string | null>(null);
  const success = ref<string | null>(null);

  // Clear messages after timeout
  function clearMessages(timeout = 3000) {
    setTimeout(() => {
      error.value = null;
      success.value = null;
    }, timeout);
  }

  /**
   * Approve a pull request
   */
  async function approve(pr: PullRequestBasic, comment?: string): Promise<ReviewResponse | null> {
    if (loading.value) return null;

    loading.value = true;
    error.value = null;
    success.value = null;

    try {
      const result = await github.actions.approvePullRequest(pr.id, comment);

      if (result.success && result.data) {
        success.value = 'PR approved successfully';
        markAsSeen(pr.id);

        // Invalidate reviews cache
        const repoParts = pr.repository.nameWithOwner.split('/');
        if (repoParts.length === 2) {
          github.reviews.clearReviewsCache(repoParts[0], repoParts[1], pr.number);
        }

        clearMessages();
        return result.data;
      } else {
        error.value = result.error || 'Failed to approve PR';
        clearMessages();
        return null;
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to approve PR';
      clearMessages();
      return null;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Request changes on a pull request
   */
  async function requestChanges(pr: PullRequestBasic, comment: string): Promise<ReviewResponse | null> {
    if (loading.value) return null;

    if (!comment.trim()) {
      error.value = 'Comment is required when requesting changes';
      clearMessages();
      return null;
    }

    loading.value = true;
    error.value = null;
    success.value = null;

    try {
      const result = await github.actions.requestChanges(pr.id, comment);

      if (result.success && result.data) {
        success.value = 'Changes requested successfully';
        markAsSeen(pr.id);

        // Invalidate reviews cache
        const repoParts = pr.repository.nameWithOwner.split('/');
        if (repoParts.length === 2) {
          github.reviews.clearReviewsCache(repoParts[0], repoParts[1], pr.number);
        }

        clearMessages();
        return result.data;
      } else {
        error.value = result.error || 'Failed to request changes';
        clearMessages();
        return null;
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to request changes';
      clearMessages();
      return null;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Add a comment to a pull request
   */
  async function addComment(pr: PullRequestBasic, comment: string): Promise<CommentResponse | null> {
    if (loading.value) return null;

    if (!comment.trim()) {
      error.value = 'Comment cannot be empty';
      clearMessages();
      return null;
    }

    loading.value = true;
    error.value = null;
    success.value = null;

    try {
      const result = await github.actions.addComment(pr.id, comment);

      if (result.success && result.data) {
        success.value = 'Comment added successfully';
        markAsSeen(pr.id);

        // Invalidate comments cache
        const repoParts = pr.repository.nameWithOwner.split('/');
        if (repoParts.length === 2) {
          github.comments.clearCommentsCache(repoParts[0], repoParts[1], pr.number);
        }

        clearMessages();
        return result.data;
      } else {
        error.value = result.error || 'Failed to add comment';
        clearMessages();
        return null;
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to add comment';
      clearMessages();
      return null;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Merge a pull request
   */
  async function merge(
    pr: PullRequestBasic,
    options?: {
      mergeMethod?: MergeMethod;
      commitTitle?: string;
      commitBody?: string;
    }
  ): Promise<MergeResponse | null> {
    if (loading.value) return null;

    loading.value = true;
    error.value = null;
    success.value = null;

    try {
      const result = await github.actions.mergePullRequest(pr.id, {
        mergeMethod: options?.mergeMethod || 'SQUASH',
        commitHeadline: options?.commitTitle,
        commitBody: options?.commitBody,
      });

      if (result.success && result.data) {
        success.value = 'PR merged successfully';
        markAsSeen(pr.id);
        clearMessages();
        return result.data;
      } else {
        error.value = result.error || 'Failed to merge PR';
        clearMessages();
        return null;
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to merge PR';
      clearMessages();
      return null;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Check if user can perform actions on this PR
   */
  function canPerformActions(pr: PullRequestBasic): boolean {
    // Can't perform actions on closed/merged PRs
    return pr.state === 'OPEN';
  }

  /**
   * Check if user has already submitted an APPROVED review
   */
  function hasAlreadyApproved(pr: PullRequestBasic): boolean {
    const username = configStore.username;
    if (!username) return false;

    return pr.reviews?.nodes?.some(
      (review) => review.author?.login === username && review.state === 'APPROVED'
    ) || false;
  }

  /**
   * Check if user has already submitted a CHANGES_REQUESTED review
   */
  function hasAlreadyRequestedChanges(pr: PullRequestBasic): boolean {
    const username = configStore.username;
    if (!username) return false;

    return pr.reviews?.nodes?.some(
      (review) => review.author?.login === username && review.state === 'CHANGES_REQUESTED'
    ) || false;
  }

  /**
   * Check if user can approve (not the author and hasn't already approved)
   */
  function canApprove(pr: PullRequestBasic): boolean {
    return canPerformActions(pr) && pr.myReviewStatus !== 'author' && !hasAlreadyApproved(pr);
  }

  /**
   * Check if user can request changes (not the author and hasn't already requested changes)
   */
  function canRequestChanges(pr: PullRequestBasic): boolean {
    return canPerformActions(pr) && pr.myReviewStatus !== 'author' && !hasAlreadyRequestedChanges(pr);
  }

  /**
   * Check if PR might be mergeable (basic check)
   */
  function mightBeMergeable(pr: PullRequestBasic): boolean {
    // Basic check based on state and check status
    if (pr.state !== 'OPEN') return false;
    const checkState = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
    return !checkState || checkState !== 'FAILURE';
  }

  return {
    // State
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    success: computed(() => success.value),

    // Actions
    approve,
    requestChanges,
    addComment,
    merge,

    // Helpers
    canPerformActions,
    canApprove,
    canRequestChanges,
    mightBeMergeable,
  };
}
