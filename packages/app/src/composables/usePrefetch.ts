import { ref } from 'vue';
import { configStore } from '../stores/configStore';

// Cache configuration
const MAX_CACHE_SIZE = 100; // Maximum number of PR IDs to cache
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

interface CacheEntry {
  timestamp: number;
}

interface PrefetchCache {
  entries: Map<string, CacheEntry>;
}

// Track which PRs have been prefetched with TTL
const prefetchedState = {
  comments: { entries: new Map<string, CacheEntry>() } as PrefetchCache,
  checks: { entries: new Map<string, CacheEntry>() } as PrefetchCache,
};

/**
 * Check if a cached entry is still valid
 */
function isValidEntry(entry: CacheEntry | undefined): boolean {
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_TTL_MS;
}

/**
 * Add entry to cache with size limit enforcement
 */
function addToCache(cache: PrefetchCache, prId: string): void {
  // Enforce max size by removing oldest entries
  if (cache.entries.size >= MAX_CACHE_SIZE) {
    // Remove oldest 20% of entries
    const entriesToRemove = Math.ceil(MAX_CACHE_SIZE * 0.2);
    const sortedEntries = [...cache.entries.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    for (let i = 0; i < entriesToRemove && i < sortedEntries.length; i++) {
      cache.entries.delete(sortedEntries[i][0]);
    }
  }

  cache.entries.set(prId, { timestamp: Date.now() });
}

/**
 * Check if PR is in cache and still valid
 */
function hasCached(cache: PrefetchCache, prId: string): boolean {
  const entry = cache.entries.get(prId);
  if (!isValidEntry(entry)) {
    // Remove expired entry
    if (entry) cache.entries.delete(prId);
    return false;
  }
  return true;
}

// Debounce timer
let hoverTimer: ReturnType<typeof setTimeout> | null = null;
const HOVER_DELAY = 150; // ms before starting prefetch

export interface UsePrefetchOptions {
  onPrefetchComments: (prId: string) => Promise<void>;
  onPrefetchChecks: (prId: string) => Promise<void>;
}

export function usePrefetch(options: UsePrefetchOptions) {
  const { onPrefetchComments, onPrefetchChecks } = options;
  const isPrefetching = ref(false);

  function isEnabled(): boolean {
    return configStore.prefetchOnHover;
  }

  function handleMouseEnter(prId: string, hasComments: boolean, hasChecks: boolean) {
    if (!isEnabled()) return;

    // Clear any existing timer
    if (hoverTimer) {
      clearTimeout(hoverTimer);
    }

    hoverTimer = setTimeout(async () => {
      isPrefetching.value = true;
      const promises: Promise<void>[] = [];

      // Prefetch comments if not already done or expired
      if (hasComments && !hasCached(prefetchedState.comments, prId)) {
        promises.push(
          onPrefetchComments(prId).then(() => {
            addToCache(prefetchedState.comments, prId);
          }).catch(console.error)
        );
      }

      // Prefetch checks if not already done or expired
      if (hasChecks && !hasCached(prefetchedState.checks, prId)) {
        promises.push(
          onPrefetchChecks(prId).then(() => {
            addToCache(prefetchedState.checks, prId);
          }).catch(console.error)
        );
      }

      await Promise.all(promises);
      isPrefetching.value = false;
    }, HOVER_DELAY);
  }

  function handleMouseLeave() {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  }

  function clearPrefetchCache() {
    prefetchedState.comments.entries.clear();
    prefetchedState.checks.entries.clear();
  }

  function isPrefetched(prId: string, type: 'comments' | 'checks'): boolean {
    const cache = type === 'comments' ? prefetchedState.comments : prefetchedState.checks;
    return hasCached(cache, prId);
  }

  return {
    isPrefetching,
    handleMouseEnter,
    handleMouseLeave,
    clearPrefetchCache,
    isPrefetched,
  };
}
