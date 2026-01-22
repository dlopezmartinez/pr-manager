/**
 * useGitProvider - Composable for accessing the Git provider in Vue components
 *
 * Provides type-safe access to the Git provider (GitHub, GitLab, Bitbucket)
 * through Vue's dependency injection system.
 */

import { inject } from 'vue';
import { GitProviderKey } from '../plugins/gitProvider';
import type { IGitProvider } from '../providers';

/**
 * Composable to access the Git provider in Vue components
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useGitProvider } from '@/composables/useGitProvider';
 *
 * const provider = useGitProvider();
 * const prs = await provider.pullRequests.getPRsToReview('username');
 * </script>
 * ```
 */
export function useGitProvider(): IGitProvider {
  const provider = inject<IGitProvider>(GitProviderKey);

  if (!provider) {
    throw new Error('Git provider not available. Did you install the gitProvider plugin?');
  }

  return provider;
}

/**
 * Legacy alias for backwards compatibility
 *
 * @deprecated Use useGitProvider() instead
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useGitHub } from '@/composables/useGitProvider';
 *
 * const github = useGitHub();
 * const prs = await github.pullRequests.getPRsToReview('username');
 * </script>
 * ```
 */
export function useGitHub(): IGitProvider {
  return useGitProvider();
}
