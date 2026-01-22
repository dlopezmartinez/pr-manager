/**
 * Authentication Store
 * Reactive state management for auth and subscription status
 */

import { reactive, computed, readonly } from 'vue';
import { authService, type SubscriptionStatus } from '../services/authService';
import type { AuthUser } from '../preload';

interface AuthState {
  initialized: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  subscription: SubscriptionStatus | null;
  isLoading: boolean;
  error: string | null;
}

const state = reactive<AuthState>({
  initialized: false,
  isAuthenticated: false,
  user: null,
  subscription: null,
  isLoading: false,
  error: null,
});

// Computed properties
const isActive = computed(() => {
  return state.subscription?.active ?? false;
});

const isTrialing = computed(() => {
  return state.subscription?.isTrialing ?? false;
});

const trialDaysLeft = computed(() => {
  return state.subscription?.trialDaysLeft ?? 0;
});

const subscriptionStatus = computed(() => {
  return state.subscription?.status ?? 'none';
});

const canUseApp = computed(() => {
  // User can use the app if they have an active subscription or are in trial
  return state.isAuthenticated && (state.subscription?.active ?? false);
});

const needsSubscription = computed(() => {
  // User is authenticated but doesn't have an active subscription
  return state.isAuthenticated && !state.subscription?.active;
});

/**
 * Initialize the auth store
 * Should be called once on app startup
 */
async function initialize(): Promise<void> {
  if (state.initialized) return;

  state.isLoading = true;
  state.error = null;

  try {
    // Initialize auth service (loads stored token)
    const hasToken = await authService.initialize();

    if (hasToken) {
      // Verify the token is still valid
      const verification = await authService.verifyToken();

      if (verification.valid && verification.user) {
        state.isAuthenticated = true;
        state.user = verification.user;

        // Check subscription status
        await refreshSubscription();
      } else {
        state.isAuthenticated = false;
        state.user = null;
        state.subscription = null;
      }
    } else {
      state.isAuthenticated = false;
      state.user = null;
      state.subscription = null;
    }
  } catch (error) {
    console.error('Auth initialization failed:', error);
    state.error = 'Failed to initialize authentication';
    state.isAuthenticated = false;
    state.user = null;
    state.subscription = null;
  } finally {
    state.initialized = true;
    state.isLoading = false;
  }
}

/**
 * Sign up a new user
 */
async function signup(email: string, password: string, name?: string): Promise<void> {
  state.isLoading = true;
  state.error = null;

  try {
    const response = await authService.signup(email, password, name);
    state.isAuthenticated = true;
    state.user = response.user;

    // New users start with no subscription (will get trial on first checkout)
    state.subscription = { active: false, status: 'none' };
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Signup failed';
    throw error;
  } finally {
    state.isLoading = false;
  }
}

/**
 * Log in an existing user
 */
async function login(email: string, password: string): Promise<void> {
  state.isLoading = true;
  state.error = null;

  try {
    const response = await authService.login(email, password);
    state.isAuthenticated = true;
    state.user = response.user;

    // Check subscription status
    await refreshSubscription();
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Login failed';
    throw error;
  } finally {
    state.isLoading = false;
  }
}

/**
 * Log out the current user
 */
async function logout(): Promise<void> {
  state.isLoading = true;
  state.error = null;

  try {
    await authService.logout();
    state.isAuthenticated = false;
    state.user = null;
    state.subscription = null;
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Logout failed';
  } finally {
    state.isLoading = false;
  }
}

/**
 * Refresh subscription status from the backend
 */
async function refreshSubscription(): Promise<void> {
  if (!state.isAuthenticated) return;

  try {
    state.subscription = await authService.getSubscriptionStatus();
  } catch (error) {
    console.error('Failed to refresh subscription:', error);
    state.subscription = { active: false, status: 'error', message: 'Failed to check subscription' };
  }
}

/**
 * Open checkout for subscription
 */
async function openCheckout(priceId: 'monthly' | 'yearly'): Promise<void> {
  state.isLoading = true;
  state.error = null;

  try {
    const checkout = await authService.createCheckoutSession(priceId);
    if (checkout.url) {
      window.electronAPI.shell.openExternal(checkout.url);
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Failed to open checkout';
    throw error;
  } finally {
    state.isLoading = false;
  }
}

/**
 * Open customer portal for subscription management
 */
async function openCustomerPortal(): Promise<void> {
  state.isLoading = true;
  state.error = null;

  try {
    const portal = await authService.openCustomerPortal();
    if (portal.url) {
      window.electronAPI.shell.openExternal(portal.url);
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Failed to open customer portal';
    throw error;
  } finally {
    state.isLoading = false;
  }
}

/**
 * Clear any error message
 */
function clearError(): void {
  state.error = null;
}

// Export the store
export const authStore = {
  // State (readonly to prevent direct mutations)
  state: readonly(state),

  // Computed
  isActive,
  isTrialing,
  trialDaysLeft,
  subscriptionStatus,
  canUseApp,
  needsSubscription,

  // Actions
  initialize,
  signup,
  login,
  logout,
  refreshSubscription,
  openCheckout,
  openCustomerPortal,
  clearError,
};
