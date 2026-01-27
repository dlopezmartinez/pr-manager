/**
 * SessionManager - Centralized session and subscription state management
 *
 * Single source of truth for:
 * - JWT validity
 * - Subscription status
 * - Grace periods
 * - Background sync
 *
 * One interval controls all timing to prevent desync.
 */

import { reactive, computed, readonly } from 'vue';
import { decodeJWT, isTokenExpired, type SubscriptionClaims, type JWTPayload } from '../utils/jwt';
import { httpGet } from './http';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.prmanagerhub.com';

// =============================================================================
// Constants - All timing in one place
// =============================================================================

const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;        // 12 hours - silent token refresh
const GRACE_PERIOD_MS = 6 * 60 * 60 * 1000;          // 6 hours - after subscription expires
const WARNING_BEFORE_EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 hours - show warning before expiry
const CHECK_INTERVAL_MS = 60 * 1000;                  // 1 minute - state check frequency

// =============================================================================
// Types
// =============================================================================

export type SessionState =
  | 'ok'                      // Everything fine, app usable
  | 'warning_subscription'    // Subscription expired, grace period ending soon
  | 'warning_session'         // JWT expiring soon, can't refresh
  | 'expired';                // Must redirect to login

export type SessionHealthLevel = 'healthy' | 'degraded' | 'critical';

interface SessionManagerState {
  state: SessionState;
  healthLevel: SessionHealthLevel;

  // JWT info
  jwtExpiresAt: number | null;         // Unix timestamp ms

  // Subscription info
  subscriptionClaims: SubscriptionClaims | null;
  subscriptionExpiresAt: number | null; // Unix timestamp ms

  // Grace period (starts when subscription expires)
  gracePeriodEndsAt: number | null;    // Unix timestamp ms

  // Sync info
  lastSyncAt: number | null;           // Unix timestamp ms
  lastSyncError: string | null;

  // For Settings display
  isOnline: boolean;
}

type ExpiredCallback = () => void;

// =============================================================================
// State
// =============================================================================

const state = reactive<SessionManagerState>({
  state: 'ok',
  healthLevel: 'healthy',
  jwtExpiresAt: null,
  subscriptionClaims: null,
  subscriptionExpiresAt: null,
  gracePeriodEndsAt: null,
  lastSyncAt: null,
  lastSyncError: null,
  isOnline: true,
});

let checkIntervalId: ReturnType<typeof setInterval> | null = null;
let lastSyncAttempt: number = 0;
let onExpiredCallback: ExpiredCallback | null = null;

// =============================================================================
// Computed values for external use
// =============================================================================

const sessionState = computed(() => state.state);
const healthLevel = computed(() => state.healthLevel);
const isOnline = computed(() => state.isOnline);
const subscriptionClaims = computed(() => state.subscriptionClaims);

const canUseApp = computed(() => {
  return state.state === 'ok' ||
         state.state === 'warning_subscription' ||
         state.state === 'warning_session';
});

// For Settings - detailed status
const statusDetails = computed(() => ({
  jwtExpiresAt: state.jwtExpiresAt,
  subscriptionExpiresAt: state.subscriptionExpiresAt,
  gracePeriodEndsAt: state.gracePeriodEndsAt,
  lastSyncAt: state.lastSyncAt,
  lastSyncError: state.lastSyncError,
  isOnline: state.isOnline,
}));

// =============================================================================
// Core Logic - Single check function
// =============================================================================

function checkState(): void {
  const now = Date.now();

  // 1. Check JWT expiration
  if (state.jwtExpiresAt) {
    const timeUntilJwtExpiry = state.jwtExpiresAt - now;

    if (timeUntilJwtExpiry <= 0) {
      // JWT expired
      transitionToExpired('jwt_expired');
      return;
    }

    if (timeUntilJwtExpiry <= WARNING_BEFORE_EXPIRY_MS && !state.isOnline) {
      // JWT expiring soon and we can't refresh
      updateState('warning_session', 'critical');
      return;
    }
  }

  // 2. Check subscription expiration
  if (state.subscriptionExpiresAt) {
    const timeUntilSubExpiry = state.subscriptionExpiresAt - now;

    if (timeUntilSubExpiry <= 0) {
      // Subscription expired - check grace period
      if (!state.gracePeriodEndsAt) {
        // Start grace period
        state.gracePeriodEndsAt = now + GRACE_PERIOD_MS;
        console.log('[SessionManager] Subscription expired, grace period started');
      }

      const timeUntilGraceEnds = state.gracePeriodEndsAt - now;

      if (timeUntilGraceEnds <= 0) {
        // Grace period ended
        transitionToExpired('grace_period_ended');
        return;
      }

      if (timeUntilGraceEnds <= WARNING_BEFORE_EXPIRY_MS) {
        // Grace period ending soon - show warning
        updateState('warning_subscription', 'critical');
        return;
      }

      // In grace period but not warning yet - still OK but degraded
      updateState('ok', 'degraded');
      return;
    }
  }

  // 3. Check if subscription is not active
  if (state.subscriptionClaims && !state.subscriptionClaims.active) {
    // No active subscription at all
    if (!state.gracePeriodEndsAt) {
      state.gracePeriodEndsAt = now + GRACE_PERIOD_MS;
    }

    const timeUntilGraceEnds = state.gracePeriodEndsAt - now;

    if (timeUntilGraceEnds <= 0) {
      transitionToExpired('no_subscription');
      return;
    }

    if (timeUntilGraceEnds <= WARNING_BEFORE_EXPIRY_MS) {
      updateState('warning_subscription', 'critical');
      return;
    }

    updateState('ok', 'degraded');
    return;
  }

  // 4. All good
  updateState('ok', state.isOnline ? 'healthy' : 'degraded');

  // 5. Check if we need to sync (every 12h)
  const timeSinceLastSync = now - lastSyncAttempt;
  if (timeSinceLastSync >= SYNC_INTERVAL_MS) {
    silentSync();
  }
}

function updateState(newState: SessionState, newHealth: SessionHealthLevel): void {
  if (state.state !== newState || state.healthLevel !== newHealth) {
    console.log(`[SessionManager] State: ${state.state} -> ${newState}, Health: ${state.healthLevel} -> ${newHealth}`);
    state.state = newState;
    state.healthLevel = newHealth;
  }
}

function transitionToExpired(reason: string): void {
  console.log(`[SessionManager] Session expired: ${reason}`);
  state.state = 'expired';
  state.healthLevel = 'critical';
  stopManager();

  if (onExpiredCallback) {
    onExpiredCallback();
  }
}

// =============================================================================
// Sync Logic - Silent background refresh
// =============================================================================

async function silentSync(): Promise<void> {
  lastSyncAttempt = Date.now();

  try {
    console.log('[SessionManager] Starting silent sync...');
    const response = await httpGet(`${API_URL}/auth/sync`);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        // Token rejected by server
        transitionToExpired('sync_auth_failed');
        return;
      }

      // Other error - mark as offline but continue
      state.isOnline = false;
      state.lastSyncError = `HTTP ${response.status}`;
      console.log('[SessionManager] Sync failed, continuing offline');
      return;
    }

    const data = await response.json();

    // Update token
    if (data.accessToken) {
      await window.electronAPI.auth.setToken(data.accessToken);

      // Re-parse JWT for new expiration
      const payload = decodeJWT(data.accessToken);
      if (payload?.exp) {
        state.jwtExpiresAt = payload.exp * 1000;
      }
    }

    // Update subscription claims
    if (data.subscription) {
      state.subscriptionClaims = data.subscription;
      state.subscriptionExpiresAt = data.subscription.expiresAt
        ? data.subscription.expiresAt * 1000
        : null;

      // If subscription is now active, clear grace period
      if (data.subscription.active) {
        state.gracePeriodEndsAt = null;
      }
    }

    state.lastSyncAt = Date.now();
    state.lastSyncError = null;
    state.isOnline = true;

    console.log('[SessionManager] Sync successful');

  } catch (error) {
    state.isOnline = false;
    state.lastSyncError = error instanceof Error ? error.message : 'Network error';
    console.log('[SessionManager] Sync error, continuing offline:', error);
  }
}

// =============================================================================
// Public API
// =============================================================================

function initialize(token: string, onExpired: ExpiredCallback): void {
  console.log('[SessionManager] Initializing...');

  onExpiredCallback = onExpired;

  const payload = decodeJWT(token);

  if (!payload) {
    console.error('[SessionManager] Invalid token');
    transitionToExpired('invalid_token');
    return;
  }

  if (isTokenExpired(payload)) {
    console.error('[SessionManager] Token already expired');
    transitionToExpired('token_expired');
    return;
  }

  // Set JWT expiration
  if (payload.exp) {
    state.jwtExpiresAt = payload.exp * 1000;
  }

  // Set subscription info
  if (payload.subscription) {
    state.subscriptionClaims = payload.subscription;
    state.subscriptionExpiresAt = payload.subscription.expiresAt
      ? payload.subscription.expiresAt * 1000
      : null;
  } else {
    state.subscriptionClaims = {
      active: false,
      status: 'none',
      plan: null,
      expiresAt: null,
    };
  }

  // Reset grace period on fresh init
  state.gracePeriodEndsAt = null;
  state.lastSyncError = null;
  state.isOnline = true;

  // Initial state check
  checkState();

  // Start the single interval
  startManager();

  // Initial sync after short delay
  setTimeout(() => silentSync(), 5000);
}

function startManager(): void {
  if (checkIntervalId) return;

  checkIntervalId = setInterval(checkState, CHECK_INTERVAL_MS);
  console.log('[SessionManager] Started');
}

function stopManager(): void {
  if (checkIntervalId) {
    clearInterval(checkIntervalId);
    checkIntervalId = null;
  }
  console.log('[SessionManager] Stopped');
}

function reset(): void {
  stopManager();

  state.state = 'ok';
  state.healthLevel = 'healthy';
  state.jwtExpiresAt = null;
  state.subscriptionClaims = null;
  state.subscriptionExpiresAt = null;
  state.gracePeriodEndsAt = null;
  state.lastSyncAt = null;
  state.lastSyncError = null;
  state.isOnline = true;

  lastSyncAttempt = 0;
  onExpiredCallback = null;

  console.log('[SessionManager] Reset');
}

// Manual sync trigger (for Settings)
async function forceSyncNow(): Promise<boolean> {
  await silentSync();
  return state.isOnline;
}

// =============================================================================
// Export
// =============================================================================

export const sessionManager = {
  // Readonly state
  state: readonly(state),

  // Computed
  sessionState,
  healthLevel,
  isOnline,
  canUseApp,
  subscriptionClaims,
  statusDetails,

  // Actions
  initialize,
  reset,
  forceSyncNow,
};
