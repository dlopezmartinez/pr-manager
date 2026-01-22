/**
 * FollowUpService
 * Handles polling of followed PRs to detect changes and create notifications
 */

import type { PullRequestBasic } from '../model/types';
import type { IPullRequestManager } from '../providers/interfaces';
import {
  getFollowedPRs,
  detectChanges,
  updatePRState,
  removeClosedPR,
  type FollowedPRInfo,
} from '../stores/followUpStore';
import {
  addBatchNotifications,
  type InboxNotification,
} from '../stores/notificationInboxStore';
import { showNotification } from '../utils/electron';
import { configStore } from '../stores/configStore';

export interface FollowUpPollingResult {
  checked: number;
  changesDetected: number;
  notificationsCreated: InboxNotification[];
  errors: string[];
}

/**
 * FollowUpService - Polls followed PRs for changes
 */
export class FollowUpService {
  private pullRequestManager: IPullRequestManager;
  private isPolling = false;

  constructor(pullRequestManager: IPullRequestManager) {
    this.pullRequestManager = pullRequestManager;
  }

  /**
   * Poll all followed PRs for changes
   * Called during each polling cycle
   */
  async pollFollowedPRs(): Promise<FollowUpPollingResult> {
    if (this.isPolling) {
      console.log('FollowUpService: Already polling, skipping');
      return { checked: 0, changesDetected: 0, notificationsCreated: [], errors: [] };
    }

    this.isPolling = true;
    const result: FollowUpPollingResult = {
      checked: 0,
      changesDetected: 0,
      notificationsCreated: [],
      errors: [],
    };

    try {
      const followedPRs = getFollowedPRs();

      if (followedPRs.length === 0) {
        return result;
      }

      console.log(`FollowUpService: Polling ${followedPRs.length} followed PRs`);

      // Poll PRs in parallel with concurrency limit
      const CONCURRENCY_LIMIT = 5;
      const chunks = this.chunkArray(followedPRs, CONCURRENCY_LIMIT);

      for (const chunk of chunks) {
        const promises = chunk.map((info) => this.pollSinglePR(info, result));
        await Promise.all(promises);
      }

      // Show native notification if there were changes
      if (result.changesDetected > 0 && configStore.notificationsEnabled) {
        this.showNativeNotification(result);
      }

      console.log(
        `FollowUpService: Polling complete. Checked: ${result.checked}, Changes: ${result.changesDetected}`
      );
    } catch (error) {
      console.error('FollowUpService: Error during polling:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      this.isPolling = false;
    }

    return result;
  }

  /**
   * Poll a single PR and detect changes
   */
  private async pollSinglePR(
    info: FollowedPRInfo,
    result: FollowUpPollingResult
  ): Promise<void> {
    try {
      const { owner, repo } = this.parseRepository(info.repoNameWithOwner);

      // Fetch current PR state
      const currentPR = await this.pullRequestManager.getPullRequestDetails(
        owner,
        repo,
        info.prNumber,
        false // Don't use cache - we need fresh data
      );

      result.checked++;

      // Check if PR is closed/merged
      if (currentPR.state !== 'OPEN') {
        // Remove from follow-up and add notification
        removeClosedPR(info.prId);
        addBatchNotifications(
          {
            prId: info.prId,
            prNumber: info.prNumber,
            prTitle: currentPR.title,
            repoNameWithOwner: info.repoNameWithOwner,
            url: info.url,
            authorLogin: info.authorLogin,
            authorAvatarUrl: info.authorAvatarUrl,
          },
          {} // No specific changes, just status
        );
        return;
      }

      // Detect changes
      const changes = detectChanges(info.prId, currentPR as PullRequestBasic);

      if (changes.hasChanges) {
        result.changesDetected++;

        // Filter changes based on user notification preferences
        const notificationChanges: {
          newCommits?: number;
          newComments?: number;
          newReviews?: number;
        } = {};

        if (changes.newCommits && configStore.followUpNotifyOnCommits) {
          notificationChanges.newCommits = changes.newCommits;
        }
        if (changes.newComments && configStore.followUpNotifyOnComments) {
          notificationChanges.newComments = changes.newComments;
        }
        if (changes.newReviews && configStore.followUpNotifyOnReviews) {
          notificationChanges.newReviews = changes.newReviews;
        }

        // Only create notifications if there are changes the user wants to be notified about
        if (Object.keys(notificationChanges).length > 0) {
          console.log(`FollowUpService: Creating notifications for PR #${info.prNumber}:`, notificationChanges);

          const notifications = addBatchNotifications(
            {
              prId: info.prId,
              prNumber: info.prNumber,
              prTitle: currentPR.title,
              repoNameWithOwner: info.repoNameWithOwner,
              url: currentPR.url,
              authorLogin: info.authorLogin,
              authorAvatarUrl: info.authorAvatarUrl,
            },
            notificationChanges
          );

          console.log(`FollowUpService: Created ${notifications.length} notifications:`, notifications.map(n => n.id));
          result.notificationsCreated.push(...notifications);
        }

        // Update the stored state (always update even if no notifications created)
        updatePRState(info.prId, currentPR as PullRequestBasic);
      }
    } catch (error) {
      console.error(`FollowUpService: Error polling PR ${info.prNumber}:`, error);
      result.errors.push(
        `Failed to poll ${info.repoNameWithOwner}#${info.prNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Show native OS notification for detected changes
   */
  private showNativeNotification(result: FollowUpPollingResult): void {
    const notifications = result.notificationsCreated;

    if (notifications.length === 0) return;

    // Group by PR for cleaner notifications
    const uniquePRs = new Map<string, typeof notifications[0]>();
    for (const notif of notifications) {
      if (!uniquePRs.has(notif.prId)) {
        uniquePRs.set(notif.prId, notif);
      }
    }

    if (uniquePRs.size === 1) {
      // Single PR notification
      const notif = notifications[0];
      const changeText = this.formatChangeText(notifications);

      showNotification({
        title: 'PR Update',
        body: `${notif.prTitle}`,
        subtitle: `${notif.repoNameWithOwner} • ${changeText}`,
        url: notif.url,
      });
    } else {
      // Multiple PRs notification
      showNotification({
        title: 'PR Updates',
        body: `${uniquePRs.size} followed PRs have updates`,
        subtitle: Array.from(uniquePRs.values())
          .map((n) => `#${n.prNumber}`)
          .join(', '),
      });
    }
  }

  /**
   * Format change text for notification
   */
  private formatChangeText(notifications: InboxNotification[]): string {
    const parts: string[] = [];

    const commits = notifications.filter((n) => n.type === 'new_commits');
    const comments = notifications.filter((n) => n.type === 'new_comments');
    const reviews = notifications.filter((n) => n.type === 'new_reviews');

    if (commits.length > 0) {
      const count = commits.reduce((sum, n) => sum + (n.changeDetails.count || 0), 0);
      parts.push(`${count} commit${count !== 1 ? 's' : ''}`);
    }

    if (comments.length > 0) {
      const count = comments.reduce((sum, n) => sum + (n.changeDetails.count || 0), 0);
      parts.push(`${count} comment${count !== 1 ? 's' : ''}`);
    }

    if (reviews.length > 0) {
      const count = reviews.reduce((sum, n) => sum + (n.changeDetails.count || 0), 0);
      parts.push(`${count} review${count !== 1 ? 's' : ''}`);
    }

    return parts.join(', ') || 'Updates';
  }

  /**
   * Parse owner and repo from nameWithOwner string
   */
  private parseRepository(nameWithOwner: string): { owner: string; repo: string } {
    const [owner, repo] = nameWithOwner.split('/');
    return { owner, repo };
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// Singleton instance - will be initialized when provider is available
let followUpServiceInstance: FollowUpService | null = null;

/**
 * Initialize the follow-up service with a pull request manager
 */
export function initializeFollowUpService(manager: IPullRequestManager): FollowUpService {
  followUpServiceInstance = new FollowUpService(manager);
  return followUpServiceInstance;
}

/**
 * Get the follow-up service instance
 */
export function getFollowUpService(): FollowUpService | null {
  return followUpServiceInstance;
}
