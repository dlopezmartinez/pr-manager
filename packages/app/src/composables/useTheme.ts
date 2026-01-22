import { ref, watch, onMounted, onUnmounted } from 'vue';
import { configStore } from '../stores/configStore';

/**
 * Theme composable
 * Handles theme detection and application
 * Supports light, dark, and system themes
 */

type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

const currentTheme = ref<ResolvedTheme>('light');

/**
 * Detect system theme preference
 */
function detectSystemTheme(): ResolvedTheme {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/**
 * Resolve theme based on user preference
 */
function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'system') {
    return detectSystemTheme();
  }
  return theme;
}

/**
 * Apply theme to document
 */
function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.setAttribute('data-theme', theme);
  currentTheme.value = theme;
}

/**
 * Use theme composable
 * Manages theme state and updates
 */
export function useTheme() {
  let mediaQueryList: MediaQueryList | null = null;

  const updateTheme = () => {
    const resolved = resolveTheme(configStore.theme);
    applyTheme(resolved);
  };

  onMounted(() => {
    // Initial theme application
    updateTheme();

    // Watch for theme changes in config
    watch(() => configStore.theme, updateTheme);

    // Watch for system theme changes (when theme is set to 'system')
    if (window.matchMedia) {
      mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');

      const handleSystemThemeChange = () => {
        if (configStore.theme === 'system') {
          updateTheme();
        }
      };

      // Modern API
      if (mediaQueryList.addEventListener) {
        mediaQueryList.addEventListener('change', handleSystemThemeChange);
      } else {
        // Fallback for older browsers
        mediaQueryList.addListener(handleSystemThemeChange);
      }
    }
  });

  onUnmounted(() => {
    // Cleanup system theme listener
    if (mediaQueryList) {
      const handleSystemThemeChange = () => {
        if (configStore.theme === 'system') {
          updateTheme();
        }
      };

      if (mediaQueryList.removeEventListener) {
        mediaQueryList.removeEventListener('change', handleSystemThemeChange);
      } else {
        mediaQueryList.removeListener(handleSystemThemeChange);
      }
    }
  });

  return {
    currentTheme,
    updateTheme,
  };
}
