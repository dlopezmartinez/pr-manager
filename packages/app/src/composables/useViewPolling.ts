import { watch, ref, onUnmounted, getCurrentInstance } from 'vue';
import { usePolling } from './usePolling';
import { useGitProvider } from './useGitProvider';
import { viewStore, activeView } from '../stores/viewStore';
import { useViewState } from './useViewState';
import { ViewAdapter } from '../adapters/ViewAdapter';
import { configStore } from '../stores/configStore';
import { pollingLogger } from '../utils/logger';
import { notificationManager } from '../managers/NotificationManager';
import { getFollowUpService } from '../services/FollowUpService';
import { isNotificationsView } from '../config/default-views';

// Debounce delay for view switches (prevents rapid polling on quick navigation)
const VIEW_SWITCH_DEBOUNCE_MS = 300;

/**
 * View-aware polling composable
 *
 * Extends usePolling with view-specific logic:
 * - Only polls the currently active view
 * - Debounces view switches to prevent rapid re-polling
 * - Updates view-specific state on each poll
 * - Handles concurrent request prevention
 *
 * @returns Polling control functions and state
 */
export function useViewPolling() {
  const provider = useGitProvider();
  const viewAdapter = new ViewAdapter(provider.pullRequests);

  // Track current refresh to prevent race conditions
  const currentRefreshId = ref(0);

  /**
   * Refresh the currently active view
   * Called by polling mechanism
   */
  async function refreshActiveView(): Promise<void> {
    const view = activeView.value;
    if (!view) {
      pollingLogger.warn('No active view to refresh');
      return;
    }

    // Capture the refresh ID at start to detect if view changed during refresh
    const refreshId = ++currentRefreshId.value;
    const viewState = useViewState(view.id);

    pollingLogger.debug(`Polling view: ${view.name} (${view.id})`);

    // Always poll followed PRs regardless of current view
    pollFollowedPRs();

    // Skip API polling for notifications view - it's a virtual view
    if (isNotificationsView(view.id)) {
      pollingLogger.debug('Notifications view is active, skipping API polling');
      return;
    }

    try {
      // Fetch fresh data for the active view
      const result = await viewAdapter.getViewData(
        view,
        configStore.username || undefined
      );

      // Check if view changed during the fetch - if so, discard results
      if (currentRefreshId.value !== refreshId) {
        pollingLogger.debug(`View changed during fetch, discarding results for ${view.id}`);
        return;
      }

      // Update view state with new data
      viewState.prs.value = result.prs;
      viewState.pageInfo.value = result.pageInfo;
      viewState.lastFetched.value = new Date();
      viewState.error.value = '';

      pollingLogger.debug(`Successfully polled view ${view.id}: ${result.prs.length} PRs`);

      // Process notifications for changes detected during background polling
      pollingLogger.debug('Processing notifications for potential changes...');
      notificationManager.processUpdate(result.prs).catch(err => {
        pollingLogger.error('Notification processing error:', err);
      });
    } catch (e) {
      // Only update error if view hasn't changed
      if (currentRefreshId.value === refreshId) {
        pollingLogger.error(`Error polling view ${view.id}:`, e);
        viewState.error.value = e instanceof Error ? e.message : 'Polling failed';
      }
    }
  }

  /**
   * Poll followed PRs for changes (runs on every poll cycle)
   */
  async function pollFollowedPRs(): Promise<void> {
    // Check if follow-up feature is enabled
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

  // Initialize polling with view refresh callback
  const { isPolling, nextPollIn, lastPollTime, startPolling, stopPolling, restartPolling, pollNow } =
    usePolling({
      onPoll: refreshActiveView,
      immediate: false,
      pollTimeout: 30000, // 30 second timeout for API calls
    });

  // Debounce timer for view switches
  let viewSwitchTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Watch for active view changes
   * Debounce to prevent rapid polling when user quickly navigates through views
   */
  watch(
    () => viewStore.activeViewId,
    (newViewId, oldViewId) => {
      if (newViewId !== oldViewId) {
        pollingLogger.debug(`View changed from ${oldViewId} to ${newViewId}`);

        // Clear any pending view switch
        if (viewSwitchTimer) {
          clearTimeout(viewSwitchTimer);
        }

        // Debounce the view switch polling
        viewSwitchTimer = setTimeout(() => {
          viewSwitchTimer = null;

          if (isPolling.value) {
            pollingLogger.debug(`Triggering poll for new view: ${newViewId}`);
            // Use pollNow instead of restartPolling to avoid resetting the entire interval
            pollNow().catch(console.error);
          }
        }, VIEW_SWITCH_DEBOUNCE_MS);
      }
    }
  );

  // Cleanup debounce timer on unmount (only if called within a component)
  if (getCurrentInstance()) {
    onUnmounted(() => {
      if (viewSwitchTimer) {
        clearTimeout(viewSwitchTimer);
        viewSwitchTimer = null;
      }
    });
  }

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
