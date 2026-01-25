import { watch, ref } from 'vue';
import { usePolling } from './usePolling';
import { useGitProvider } from './useGitProvider';
import { activeView } from '../stores/viewStore';
import { useViewState } from './useViewState';
import { ViewAdapter } from '../adapters/ViewAdapter';
import { configStore } from '../stores/configStore';
import { pollingLogger } from '../utils/logger';
import { notificationManager } from '../managers/NotificationManager';
import { getFollowUpService } from '../services/FollowUpService';
import { isNotificationsView } from '../config/default-views';
import { followedCount } from '../stores/followUpStore';

/**
 * View-aware polling composable.
 * Auto-polling ONLY polls follow-up PRs.
 * Active view is only refreshed on manual refresh.
 */
export function useViewPolling() {
  const provider = useGitProvider();
  const viewAdapter = new ViewAdapter(provider.pullRequests);

  const currentRefreshId = ref(0);

  /**
   * Poll only followed PRs - called automatically by the polling interval.
   * Does NOT refresh the active view.
   */
  async function pollFollowedPRsOnly(): Promise<void> {
    if (!configStore.followUpEnabled) {
      pollingLogger.debug('Follow-up disabled, skipping poll');
      return;
    }

    const count = followedCount.value;
    if (count === 0) {
      pollingLogger.debug('No followed PRs, skipping poll');
      return;
    }

    await pollFollowedPRs();
  }

  /**
   * Full refresh of active view + followed PRs.
   * Called on manual refresh.
   */
  async function refreshActiveView(): Promise<void> {
    const view = activeView.value;
    if (!view) {
      pollingLogger.warn('No active view to refresh');
      return;
    }

    const refreshId = ++currentRefreshId.value;
    const viewState = useViewState(view.id);

    pollingLogger.debug(`Refreshing view: ${view.name} (${view.id})`);

    pollFollowedPRs();

    if (isNotificationsView(view.id)) {
      pollingLogger.debug('Notifications view is active, skipping API polling');
      return;
    }

    try {
      const result = await viewAdapter.getViewData(
        view,
        configStore.username || undefined
      );

      if (currentRefreshId.value !== refreshId) {
        pollingLogger.debug(`View changed during fetch, discarding results for ${view.id}`);
        return;
      }

      viewState.prs.value = result.prs;
      viewState.pageInfo.value = result.pageInfo;
      viewState.lastFetched.value = new Date();
      viewState.error.value = '';

      pollingLogger.debug(`Successfully refreshed view ${view.id}: ${result.prs.length} PRs`);

      pollingLogger.debug('Processing notifications for potential changes...');
      notificationManager.processUpdate(result.prs).catch(err => {
        pollingLogger.error('Notification processing error:', err);
      });
    } catch (e) {
      if (currentRefreshId.value === refreshId) {
        pollingLogger.error(`Error refreshing view ${view.id}:`, e);
        viewState.error.value = e instanceof Error ? e.message : 'Refresh failed';
      }
    }
  }

  async function pollFollowedPRs(): Promise<void> {
    if (!configStore.followUpEnabled) {
      return;
    }

    const followUpService = getFollowUpService();
    if (!followUpService) {
      pollingLogger.debug('FollowUpService not initialized, skipping follow-up polling');
      return;
    }

    try {
      const result = await followUpService.pollFollowedPRs();
      if (result.changesDetected > 0) {
        pollingLogger.debug(
          `Follow-up polling: ${result.changesDetected} changes detected, ${result.notificationsCreated.length} notifications created`
        );
      }
    } catch (e) {
      pollingLogger.error('Follow-up polling error:', e);
    }
  }

  const { isPolling, nextPollIn, lastPollTime, startPolling, stopPolling, restartPolling } =
    usePolling({
      onPoll: pollFollowedPRsOnly,
      immediate: false,
      pollTimeout: 30000,
    });

  // Watch followed count to start/stop polling appropriately
  watch(
    followedCount,
    (count) => {
      if (count === 0 && isPolling.value) {
        pollingLogger.debug('No followed PRs, stopping auto-poll');
        stopPolling();
      } else if (count > 0 && !isPolling.value && configStore.pollingEnabled) {
        pollingLogger.debug('Followed PRs detected, starting auto-poll');
        startPolling();
      }
    }
  );

  // Removed automatic polling on view switch - views only refresh on manual action

  return {
    isPolling,
    nextPollIn,
    lastPollTime,
    startPolling,
    stopPolling,
    restartPolling,
    refreshActiveView,
  };
}
