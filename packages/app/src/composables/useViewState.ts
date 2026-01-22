import { ref, type Ref } from 'vue';
import type { ViewId, ViewState } from '../model/view-types';
import type { PullRequestBasic, PageInfo } from '../model/types';

/**
 * Reactive refs for a view state
 * These are shared across all consumers of the same viewId
 */
interface ReactiveViewState {
  prs: Ref<PullRequestBasic[]>;
  pageInfo: Ref<PageInfo>;
  loading: Ref<boolean>;
  error: Ref<string>;
  lastFetched: Ref<Date | null>;
}

/**
 * Cache for reactive view states
 * Each view maintains its own independent reactive state
 * IMPORTANT: We store the REFS themselves, not plain values
 * This ensures all consumers share the same reactive references
 */
const viewStatesCache = new Map<ViewId, ReactiveViewState>();

/**
 * Create default reactive state for a view
 */
function createDefaultReactiveState(): ReactiveViewState {
  return {
    prs: ref<PullRequestBasic[]>([]),
    pageInfo: ref<PageInfo>({ hasNextPage: false, endCursor: null }),
    loading: ref<boolean>(false),
    error: ref<string>(''),
    lastFetched: ref<Date | null>(null),
  };
}

/**
 * Composable for managing individual view state
 *
 * Each view gets its own independent state:
 * - PRs list
 * - Pagination info
 * - Loading state
 * - Error state
 * - Last fetched timestamp
 *
 * State refs are SHARED across all consumers of the same viewId.
 * This means when polling updates the PRs, the UI automatically sees the changes.
 *
 * @param viewId - Unique identifier for the view
 * @returns Reactive state refs for the view (shared across all consumers)
 */
export function useViewState(viewId: ViewId): ReactiveViewState {
  // Get or create reactive state for this view
  if (!viewStatesCache.has(viewId)) {
    viewStatesCache.set(viewId, createDefaultReactiveState());
  }

  // Return the SAME refs for this viewId - all consumers share these refs
  return viewStatesCache.get(viewId)!;
}

/**
 * Get state for all views
 * Useful for computing PR counts across all views
 *
 * @returns Map of viewId to ReactiveViewState
 */
export function getAllViewStates(): Map<ViewId, ReactiveViewState> {
  return viewStatesCache;
}

/**
 * Get raw state object for a view (snapshot of current values)
 * Useful for read-only operations
 *
 * @param viewId - View identifier
 * @returns View state snapshot or undefined if not initialized
 */
export function getViewStateSnapshot(viewId: ViewId): ViewState | undefined {
  const state = viewStatesCache.get(viewId);
  if (!state) return undefined;

  return {
    prs: state.prs.value,
    pageInfo: state.pageInfo.value,
    loading: state.loading.value,
    error: state.error.value,
    lastFetched: state.lastFetched.value,
  };
}

/**
 * Clear cache for a specific view
 * Forces re-fetch on next access
 *
 * @param viewId - View identifier to clear
 */
export function clearViewState(viewId: ViewId): void {
  viewStatesCache.delete(viewId);
}

/**
 * Clear all view states
 * Useful for logout or reset scenarios
 */
export function clearAllViewStates(): void {
  viewStatesCache.clear();
}

/**
 * Check if a view has been initialized (has state)
 *
 * @param viewId - View identifier
 * @returns True if view has state
 */
export function hasViewState(viewId: ViewId): boolean {
  return viewStatesCache.has(viewId);
}

/**
 * Get PR count for a specific view
 *
 * @param viewId - View identifier
 * @returns Number of PRs in the view (0 if view not initialized)
 */
export function getViewPRCount(viewId: ViewId): number {
  const state = viewStatesCache.get(viewId);
  return state?.prs.value.length || 0;
}

/**
 * Get total PR count across all views
 * Note: PRs may be counted multiple times if they appear in multiple views
 *
 * @returns Total PR count
 */
export function getTotalPRCount(): number {
  let total = 0;
  for (const state of viewStatesCache.values()) {
    total += state.prs.value.length;
  }
  return total;
}

/**
 * Get unique PR count across all views
 * Deduplicates PRs that appear in multiple views
 *
 * @returns Unique PR count
 */
export function getUniquePRCount(): number {
  const uniquePRIds = new Set<string>();

  for (const state of viewStatesCache.values()) {
    for (const pr of state.prs.value) {
      uniquePRIds.add(pr.id);
    }
  }

  return uniquePRIds.size;
}

/**
 * Reset state for a view without deleting it from cache
 * Useful for manual refresh
 *
 * @param viewId - View identifier
 */
export function resetViewState(viewId: ViewId): void {
  const state = viewStatesCache.get(viewId);
  if (state) {
    state.prs.value = [];
    state.pageInfo.value = { hasNextPage: false, endCursor: null };
    state.loading.value = false;
    state.error.value = '';
    state.lastFetched.value = null;
  }
}
