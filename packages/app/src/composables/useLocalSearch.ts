/**
 * Composable for local in-memory search/filtering of PRs
 * No API calls - operates on already loaded data
 */

import { ref, computed, watch, type Ref, type ComputedRef } from 'vue';
import type { PullRequestBasic } from '../model/types';

export interface UseLocalSearchOptions {
  debounceMs?: number;
}

export interface UseLocalSearchReturn {
  searchQuery: Ref<string>;
  filteredPRs: ComputedRef<PullRequestBasic[]>;
  isFiltering: ComputedRef<boolean>;
  resultCount: ComputedRef<number>;
  clearSearch: () => void;
}

/**
 * Create a debounced ref that updates after a delay
 */
function useDebouncedRef<T>(value: Ref<T>, delay: number): Ref<T> {
  const debouncedValue = ref(value.value) as Ref<T>;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  watch(value, (newValue) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      debouncedValue.value = newValue;
    }, delay);
  });

  return debouncedValue;
}

/**
 * Local search composable for filtering PRs in-memory
 */
export function useLocalSearch(
  prs: Ref<PullRequestBasic[]> | ComputedRef<PullRequestBasic[]>,
  options: UseLocalSearchOptions = {}
): UseLocalSearchReturn {
  const { debounceMs = 300 } = options;

  const searchQuery = ref('');
  const debouncedQuery = useDebouncedRef(searchQuery, debounceMs);

  const filteredPRs = computed(() => {
    const query = debouncedQuery.value.toLowerCase().trim();

    // If no query, return all PRs
    if (!query) {
      return prs.value;
    }

    // Filter PRs based on multiple fields
    return prs.value.filter((pr) => {
      // Search in title
      if (pr.title.toLowerCase().includes(query)) {
        return true;
      }

      // Search in author username
      if (pr.author.login.toLowerCase().includes(query)) {
        return true;
      }

      // Search in repository name
      if (pr.repository.nameWithOwner.toLowerCase().includes(query)) {
        return true;
      }

      // Search in PR number
      if (pr.number.toString().includes(query)) {
        return true;
      }

      // Search in branch names (if available)
      if (pr.headRefName?.toLowerCase().includes(query)) {
        return true;
      }
      if (pr.baseRefName?.toLowerCase().includes(query)) {
        return true;
      }

      return false;
    });
  });

  const isFiltering = computed(() => {
    return searchQuery.value.trim().length > 0;
  });

  const resultCount = computed(() => {
    return filteredPRs.value.length;
  });

  function clearSearch() {
    searchQuery.value = '';
  }

  return {
    searchQuery,
    filteredPRs,
    isFiltering,
    resultCount,
    clearSearch,
  };
}
