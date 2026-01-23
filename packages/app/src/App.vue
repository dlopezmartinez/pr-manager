<template>
  <ErrorBoundary fallback-message="An error occurred" @error="handleGlobalError">
    <div class="app-container">
      <!-- Auth Loading State -->
      <div v-if="!authInitialized" class="loading-container">
        <div class="loading-spinner"></div>
        <p>Loading...</p>
      </div>

      <!-- Auth Screen (Login/Signup) -->
      <AuthView
        v-else-if="!isAuthenticated"
        @authenticated="handleAuthenticated"
      />

      <!-- Subscription Screen (when authenticated but no active subscription) -->
      <SubscriptionScreen
        v-else-if="needsSubscription"
        @subscribed="handleSubscribed"
        @logout="handleAuthLogout"
      />

      <!-- Welcome Screen (Git Provider Setup) -->
      <WelcomeScreen
        v-else-if="!isConfigured"
        @configured="handleConfigured"
      />

      <!-- Missing Scopes Screen -->
      <MissingScopesScreen
        v-else-if="showMissingScopes"
        :missing-scopes="missingScopes"
        :current-scopes="currentScopes"
        @validated="handleTokenValidated"
        @change-token="handleChangeTokenFromScopes"
      />

      <!-- Dashboard with Views -->
      <div v-else-if="!isValidatingToken" class="content-wrapper">
      <!-- Trial Banner -->
      <TrialBanner />
      <!-- Title Bar with integrated controls -->
      <TitleBar>
        <template #left>
          <h1 class="app-title">Pull Requests</h1>
        </template>
        <template #right>
          <button
            class="titlebar-btn"
            @click="handleManualRefresh"
            :disabled="currentViewState.loading.value"
            :class="{ 'spinning': currentViewState.loading.value }"
            title="Refresh now"
          >
            <RefreshCw :size="16" :stroke-width="2" />
          </button>
          <div v-if="isPolling && nextPollIn > 0" class="polling-indicator" title="Auto-refresh active">
            <span class="pulse-dot"></span>
            <span class="countdown">{{ nextPollIn }}s</span>
          </div>
          <button
            v-if="isSuperuser"
            class="titlebar-btn"
            @click="showAdminDashboard = true"
            title="Admin Dashboard"
          >
            <Shield :size="16" :stroke-width="2" />
          </button>
          <button class="titlebar-btn" @click="showSettings = true" title="Settings">
            <Settings :size="16" :stroke-width="2" />
          </button>
        </template>
      </TitleBar>

      <header class="header">
        <div class="header-content">
          <!-- View Tabs -->
          <ViewTabs
            :pr-counts="prCounts"
            @add-view="showViewEditor = true"
          />
        </div>
      </header>

      <div v-if="currentViewState.error.value" class="error-banner">
        <AlertTriangle :size="14" :stroke-width="2" class="error-icon" />
        {{ currentViewState.error.value }}
      </div>

      <main class="main-content">
        <!-- Notification Inbox View -->
        <NotificationInbox v-if="isNotificationsViewActive" />

        <!-- Regular PR View -->
        <ViewContainer
          v-else
          :prs="currentViewState.prs.value"
          :page-info="currentViewState.pageInfo.value"
          :loading="currentViewState.loading.value"
          :show-comments="configStore.showComments"
          :show-checks="configStore.showChecks"
          :allow-comments-expansion="configStore.allowCommentsExpansion"
          :allow-checks-expansion="configStore.allowChecksExpansion"
          @select="selectPR"
          @load-more="loadMore"
          @toggle-expand="handleToggleExpand"
          @toggle-expand-comments="handleToggleExpandComments"
          @prefetch="handlePrefetch"
          @prefetch-cancel="handlePrefetchCancel"
        />
      </main>
    </div>

    <!-- Settings Modal -->
    <SettingsScreen
      v-if="showSettings"
      @close="showSettings = false"
      @logout="handleLogout"
      @refresh-needed="handleManualRefresh"
      @provider-changed="handleProviderChanged"
    >
      <!-- View Manager Tab in Settings -->
      <template #views>
        <ViewManager />
      </template>
    </SettingsScreen>

    <!-- Admin Dashboard Modal -->
    <AdminDashboard v-if="showAdminDashboard" @close="showAdminDashboard = false" />

    <!-- View Editor Dialog -->
    <ViewEditorDialog
      v-if="showViewEditor"
      @save="handleSaveView"
      @cancel="showViewEditor = false"
    />

    <!-- In-app notifications (fallback when native notifications fail) -->
    <InAppNotification />
    </div>
  </ErrorBoundary>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { RefreshCw, Settings, AlertTriangle, Shield } from 'lucide-vue-next';
import { useGitProvider } from './composables/useGitProvider';
import { useViewPolling } from './composables/useViewPolling';
import { useAuthHealthPolling } from './composables/useAuthHealthPolling';
import { useViewState, getAllViewStates, clearAllViewStates } from './composables/useViewState';
import { useTheme } from './composables/useTheme';
import { ViewAdapter } from './adapters/ViewAdapter';
import { configStore, isConfigured as checkConfigured } from './stores/configStore';
import { viewStore, activeView, addCustomView } from './stores/viewStore';
import { authStore } from './stores/authStore';
import { notificationManager } from './managers/NotificationManager';
import { updatePrCount, setSyncing } from './utils/electron';
import ErrorBoundary from './components/ErrorBoundary.vue';
import TitleBar from './components/TitleBar.vue';
import ViewTabs from './components/ViewTabs.vue';
import ViewContainer from './components/ViewContainer.vue';
import ViewManager from './components/ViewManager.vue';
import ViewEditorDialog from './components/ViewEditorDialog.vue';
import WelcomeScreen from './components/WelcomeScreen.vue';
import SettingsScreen from './components/SettingsScreen.vue';
import MissingScopesScreen from './components/MissingScopesScreen.vue';
import InAppNotification from './components/InAppNotification.vue';
import NotificationInbox from './components/NotificationInbox.vue';
import AuthView from './components/AuthView.vue';
import SubscriptionScreen from './components/SubscriptionScreen.vue';
import TrialBanner from './components/TrialBanner.vue';
import AdminDashboard from './components/AdminDashboard.vue';
import { validateToken } from './utils/electron';
import { getApiKey } from './stores/configStore';
import { isNotificationsView } from './config/default-views';
import { initializeFollowUpService, getFollowUpService } from './services/FollowUpService';
import { unreadCount } from './stores/notificationInboxStore';
import type { PullRequestBasic } from './model/types';
import type { ViewConfig } from './model/view-types';

// Theme system
useTheme();

// Auth state
const authInitialized = computed(() => authStore.state.initialized);
const isAuthenticated = computed(() => authStore.state.isAuthenticated);
const needsSubscription = computed(() => authStore.needsSubscription.value);

// Git provider and adapter (supports GitHub, GitLab, Bitbucket)
const provider = useGitProvider();
const viewAdapter = new ViewAdapter(provider.pullRequests);

const isConfigured = computed(() => checkConfigured());
const showSettings = ref(false);
const showViewEditor = ref(false);
const showAdminDashboard = ref(false);

// Token validation state
const isValidatingToken = ref(false);
const tokenValidationComplete = ref(false);
const missingScopes = ref<string[]>([]);
const currentScopes = ref<string[]>([]);
const showMissingScopes = computed(() =>
  isConfigured.value && tokenValidationComplete.value && missingScopes.value.length > 0
);

// Get current view state (reactive based on active view)
const currentViewState = computed(() => useViewState(activeView.value.id));

// Check if current view is the notifications view
const isNotificationsViewActive = computed(() => isNotificationsView(activeView.value.id));

// Check if user is SUPERUSER for admin dashboard access
const isSuperuser = computed(() => authStore.state.user?.role === 'SUPERUSER');

// Calculate PR counts for all views (for tab badges)
const prCounts = computed(() => {
  const counts: Record<string, number> = {};
  const allStates = getAllViewStates();

  for (const [viewId, state] of allStates) {
    counts[viewId] = state.prs.value.length;
  }

  // Add unread count for notifications view
  counts['notifications'] = unreadCount.value;

  return counts;
});

// Setup view-aware polling
const { isPolling, nextPollIn, startPolling, restartPolling, refreshActiveView } = useViewPolling();

// Setup auth health polling
const authHealthPolling = useAuthHealthPolling();

onMounted(async () => {
  // Initialize auth first
  await authStore.initialize();

  // Only proceed if authenticated with active subscription
  if (isAuthenticated.value && authStore.canUseApp.value && isConfigured.value) {
    // Validate token permissions on startup
    await validateTokenPermissions();

    // Only load and start polling if token is valid
    if (missingScopes.value.length === 0) {
      // Initialize follow-up service for polling followed PRs
      initializeFollowUpService(provider.pullRequests);

      loadCurrentView();
      startPolling();
    }
  }

  // Sync notification config
  notificationManager.updateConfig({
    enabled: configStore.notificationsEnabled,
    notifyOnNewPR: configStore.notifyOnNewPR,
    notifyOnNewComments: configStore.notifyOnNewComments,
  });
});

/**
 * Validate token permissions on startup
 */
async function validateTokenPermissions(): Promise<void> {
  isValidatingToken.value = true;

  try {
    const token = getApiKey();
    if (!token) {
      tokenValidationComplete.value = true;
      return;
    }

    const result = await validateToken(
      configStore.providerType,
      token,
      configStore.gitlabUrl || undefined
    );

    missingScopes.value = result.missingScopes;
    currentScopes.value = result.scopes;
    tokenValidationComplete.value = true;
  } catch (error) {
    console.error('Token validation error:', error);
    // On error, assume token is valid to not block the user
    tokenValidationComplete.value = true;
  } finally {
    isValidatingToken.value = false;
  }
}

/**
 * Handle when token validation succeeds after user updates token
 */
function handleTokenValidated(): void {
  missingScopes.value = [];

  // Initialize follow-up service for polling followed PRs
  initializeFollowUpService(provider.pullRequests);

  loadCurrentView();
  startPolling();
}

/**
 * Handle when user wants to change token from missing scopes screen
 */
function handleChangeTokenFromScopes(): void {
  // Reset state and show welcome screen to re-configure
  missingScopes.value = [];
  currentScopes.value = [];
  tokenValidationComplete.value = false;
  showSettings.value = true;
}

// Watch for auth state changes to manage auth health polling
watch(
  () => authStore.state.isAuthenticated,
  (authenticated) => {
    if (authenticated && authStore.canUseApp.value) {
      authHealthPolling.startPolling();
    } else {
      authHealthPolling.stopPolling();
    }
  }
);

// Watch for notification config changes
watch(
  () => ({
    enabled: configStore.notificationsEnabled,
    notifyOnNewPR: configStore.notifyOnNewPR,
    notifyOnNewComments: configStore.notifyOnNewComments,
  }),
  (newConfig) => {
    notificationManager.updateConfig(newConfig);
  }
);

// Watch for active view changes
watch(
  () => viewStore.activeViewId,
  (newViewId) => {
    // Skip loading for notifications view
    if (isNotificationsView(newViewId)) {
      return;
    }

    // Load view if it hasn't been loaded yet
    if (currentViewState.value.prs.value.length === 0 && !currentViewState.value.lastFetched.value) {
      loadCurrentView();
    }
  }
);

// Update menubar PR count when current view PRs change or notifications change
watch(
  () => ({
    prs: currentViewState.value.prs.value,
    isNotifications: isNotificationsViewActive.value,
    unread: unreadCount.value,
  }),
  ({ prs, isNotifications, unread }) => {
    // Show unread notification count when in notifications view, otherwise show PR count
    updatePrCount(isNotifications ? unread : prs.length);
  },
  { immediate: true }
);

/**
 * Handle successful authentication
 */
async function handleAuthenticated() {
  // Refresh subscription status
  await authStore.refreshSubscription();
}

/**
 * Handle successful subscription
 */
function handleSubscribed() {
  // Refresh subscription status
  authStore.refreshSubscription();
}

/**
 * Handle auth logout (from subscription screen)
 */
function handleAuthLogout() {
  // Auth store already cleared, just reset local state
  authHealthPolling.stopPolling();
  clearAllViewStates();
  notificationManager.reset();
}

function handleConfigured() {
  // Initialize follow-up service for polling followed PRs
  initializeFollowUpService(provider.pullRequests);

  loadCurrentView();
  startPolling();
}

function handleLogout() {
  showSettings.value = false;
  authHealthPolling.stopPolling();
  clearAllViewStates();
  notificationManager.reset();
}

function handleProviderChanged() {
  showSettings.value = false;
  clearAllViewStates();
  notificationManager.reset();
  // The provider switch already cleared the apiKey, so isConfigured will be false
  // and WelcomeScreen will be shown automatically
}

/**
 * Handle global errors caught by ErrorBoundary
 */
function handleGlobalError(error: Error, info: string) {
  console.error('Global error caught:', error, info);
  // Could send to error tracking service here
}

// Manual refresh - reloads current view and restarts polling timer
async function handleManualRefresh() {
  await loadCurrentView();
  restartPolling();
}

// Load data for current view
async function loadCurrentView() {
  const view = activeView.value;

  // Skip loading for notifications view - it's a virtual view
  if (isNotificationsView(view.id)) {
    return;
  }

  const state = currentViewState.value;

  state.loading.value = true;
  state.error.value = '';

  // Show syncing icon in tray
  setSyncing(true);

  try {
    const result = await viewAdapter.getViewData(
      view,
      configStore.username || undefined
    );

    state.prs.value = result.prs;
    state.pageInfo.value = result.pageInfo;
    state.lastFetched.value = new Date();

    // Process notifications for current view
    notificationManager.processUpdate(result.prs).catch(err => {
      console.error('Notification processing error:', err);
    });
  } catch (e) {
    state.error.value = e instanceof Error ? e.message : 'Failed to load PRs';
    console.error('Error loading view:', e);
  } finally {
    state.loading.value = false;
    setSyncing(false);
  }
}

// Load more PRs for current view (pagination)
async function loadMore() {
  const view = activeView.value;
  const state = currentViewState.value;

  if (!state.pageInfo.value.hasNextPage) return;

  state.loading.value = true;

  try {
    const result = await viewAdapter.getViewData(
      view,
      configStore.username || undefined,
      20,
      state.pageInfo.value.endCursor || undefined
    );

    // Append new PRs to existing list
    state.prs.value = [...state.prs.value, ...result.prs];
    state.pageInfo.value = result.pageInfo;
  } catch (e) {
    state.error.value = e instanceof Error ? e.message : 'Failed to load more PRs';
  } finally {
    state.loading.value = false;
  }
}

// Handle expand checks (with in-flight deduplication)
async function handleToggleExpand(pr: PullRequestBasic) {
  const commit = pr.commits?.nodes?.[0]?.commit;
  if (!commit || !commit.statusCheckRollup) return;

  // If we already have contexts, do nothing
  if (commit.statusCheckRollup.contexts?.nodes?.length) return;

  const [owner, repo] = pr.repository.nameWithOwner.split('/');
  const key = `${owner}/${repo}/${pr.number}`;

  // Check if request is already in-flight
  if (inFlightChecks.has(key)) {
    await inFlightChecks.get(key);
    return;
  }

  const promise = (async () => {
    try {
      const checks = await provider.checks.getChecks(owner, repo, pr.number);
      if (checks && checks.contexts) {
        // Update the PR object reactively
        commit.statusCheckRollup.contexts = checks.contexts;
      }
    } catch (e) {
      console.error('Error fetching checks:', e);
    } finally {
      inFlightChecks.delete(key);
    }
  })();

  inFlightChecks.set(key, promise);
  await promise;
}

// Handle expand comments (with in-flight deduplication)
async function handleToggleExpandComments(pr: PullRequestBasic) {
  if (!pr.comments) return;

  // If we already have comments, do nothing
  if (pr.comments.nodes?.length) return;

  const [owner, repo] = pr.repository.nameWithOwner.split('/');
  const key = `${owner}/${repo}/${pr.number}`;

  // Check if request is already in-flight
  if (inFlightComments.has(key)) {
    await inFlightComments.get(key);
    return;
  }

  const promise = (async () => {
    try {
      const comments = await provider.comments.getComments(owner, repo, pr.number);
      if (comments) {
        // Update the PR object reactively
        pr.comments.nodes = comments;
      }
    } catch (e) {
      console.error('Error fetching comments:', e);
    } finally {
      inFlightComments.delete(key);
    }
  })();

  inFlightComments.set(key, promise);
  await promise;
}

// In-flight request tracking to prevent duplicate requests
const inFlightComments = new Map<string, Promise<void>>();
const inFlightChecks = new Map<string, Promise<void>>();

// Prefetch setup
let prefetchTimer: ReturnType<typeof setTimeout> | null = null;
const PREFETCH_DELAY = 200; // ms before starting prefetch

function handlePrefetch(pr: PullRequestBasic) {
  if (!configStore.prefetchOnHover) return;

  // Clear any existing timer
  if (prefetchTimer) {
    clearTimeout(prefetchTimer);
  }

  prefetchTimer = setTimeout(async () => {
    const [owner, repo] = pr.repository.nameWithOwner.split('/');
    const key = `${owner}/${repo}/${pr.number}`;

    // Prefetch comments if needed and not already in-flight
    if (pr.comments?.totalCount && !pr.comments.nodes?.length && !inFlightComments.has(key)) {
      const promise = provider.comments.getComments(owner, repo, pr.number)
        .then(comments => {
          if (comments && pr.comments) {
            pr.comments.nodes = comments;
          }
        })
        .catch(console.error)
        .finally(() => inFlightComments.delete(key));

      inFlightComments.set(key, promise);
    }

    // Prefetch checks if needed and not already in-flight
    const commit = pr.commits?.nodes?.[0]?.commit;
    if (commit?.statusCheckRollup && !commit.statusCheckRollup.contexts?.nodes?.length && !inFlightChecks.has(key)) {
      const promise = provider.checks.getChecks(owner, repo, pr.number)
        .then(checks => {
          if (checks?.contexts && commit.statusCheckRollup) {
            commit.statusCheckRollup.contexts = checks.contexts;
          }
        })
        .catch(console.error)
        .finally(() => inFlightChecks.delete(key));

      inFlightChecks.set(key, promise);
    }
  }, PREFETCH_DELAY);
}

function handlePrefetchCancel() {
  if (prefetchTimer) {
    clearTimeout(prefetchTimer);
    prefetchTimer = null;
  }
}

async function selectPR(pr: PullRequestBasic) {
  console.log('Selected PR:', pr);
  // Future: Open PR details modal or navigate
}

function handleSaveView(view: ViewConfig) {
  try {
    addCustomView(view);
    showViewEditor.value = false;
  } catch (e) {
    console.error('Error creating view:', e);
    // Error handling is done in ViewManager component
  }
}
</script>

<style>
/* Global Reset & Base Styles - theme.css handles all theming */
body {
  margin: 0;
  padding: 0;
  /* Menubar app specific */
  overflow: hidden;
  user-select: none;
}

* {
  box-sizing: border-box;
}
</style>

<style scoped>
.app-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--color-bg-primary);
}

/* Loading container */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  gap: 16px;
  color: var(--color-text-secondary);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.loading-container p {
  margin: 0;
  font-size: 14px;
}

.content-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* App title in title bar */
.app-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.2px;
  margin: 0;
  color: var(--color-text-primary);
}

/* Title bar buttons */
.titlebar-btn {
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  width: 32px;
  height: 32px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
}

.titlebar-btn:hover:not(:disabled) {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.titlebar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.titlebar-btn.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Polling indicator */
.polling-indicator {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--color-success-bg);
  border-radius: var(--radius-xl);
  font-size: 10px;
  font-weight: 500;
  color: var(--color-success);
}

.pulse-dot {
  width: 6px;
  height: 6px;
  background: var(--color-success);
  border-radius: var(--radius-full);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}

.countdown {
  font-variant-numeric: tabular-nums;
}

/* Header with view tabs */
.header {
  padding: 0 var(--spacing-lg);
  margin-bottom: var(--spacing-md);
  flex-shrink: 0;
}

.header-content {
  display: flex;
  flex-direction: column;
}

/* Error banner */
.error-banner {
  background: var(--color-error-bg);
  color: var(--color-error);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  margin: 0 var(--spacing-lg) var(--spacing-md);
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  flex-shrink: 0;
}

/* Main content area */
.main-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 var(--spacing-lg) var(--spacing-lg);
  animation: fadeIn 0.3s ease;
  min-height: 0;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
