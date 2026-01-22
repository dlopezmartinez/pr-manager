/**
 * Follow-up Store
 * Tracks which PRs the user is following for change notifications
 * Persists to localStorage with automatic pruning
 */

import { reactive, watch, computed } from 'vue';
import type { PullRequestBasic } from '../model/types';

/**
 * State tracked for each followed PR to detect changes
 */
export interface FollowedPRState {
  commitCount: number;
  commentCount: number;
  reviewCount: number;
  updatedAt: string;
}

/**
 * Information stored for a followed PR
 */
export interface FollowedPRInfo {
  prId: string;
  prNumber: number;
  repoNameWithOwner: string;
  url: string;
  title: string;
  authorLogin: string;
  authorAvatarUrl: string;
  followedAt: string; // ISO timestamp
  lastKnownState: FollowedPRState;
}

interface FollowUpStoreData {
  followedPRs: Record<string, FollowedPRInfo>;
  lastPruned: string;
}

const STORAGE_KEY = 'pr-manager-follow-up';
const MAX_FOLLOWED_PRS = 50; // Limit to prevent API rate limiting
const PRUNE_AGE_DAYS = 30;
const SAVE_DEBOUNCE_MS = 500;

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function loadFollowUpState(): FollowUpStoreData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      return {
        followedPRs: data.followedPRs || {},
        lastPruned: data.lastPruned || new Date().toISOString(),
      };
    }
  } catch (e) {
    console.error('Error loading follow-up state:', e);
  }
  return {
    followedPRs: {},
    lastPruned: new Date().toISOString(),
  };
}

function saveFollowUpState(data: FollowUpStoreData): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Error saving follow-up state:', e);
    }
  }, SAVE_DEBOUNCE_MS);
}

function pruneOldEntries(data: FollowUpStoreData): void {
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - PRUNE_AGE_DAYS * 24 * 60 * 60 * 1000);
  const entries = Object.entries(data.followedPRs);

  let pruned = 0;
  for (const [prId, info] of entries) {
    const followedDate = new Date(info.followedAt);
    if (followedDate < cutoffDate) {
      delete data.followedPRs[prId];
      pruned++;
    }
  }

  if (pruned > 0) {
    console.log(`FollowUpStore: Pruned ${pruned} old entries`);
  }

  data.lastPruned = now.toISOString();
}

/**
 * Extract the state we track for changes from a PR
 */
function extractPRState(pr: PullRequestBasic): FollowedPRState {
  const regularComments = pr.comments?.totalCount ?? 0;
  const reviewComments = pr.reviews?.nodes?.reduce(
    (sum, review) => sum + (review.comments?.totalCount ?? 0),
    0
  ) ?? 0;

  // Use totalCount for commits if available, otherwise count nodes
  const commitCount = pr.commits?.totalCount ?? pr.commits?.nodes?.length ?? 0;

  return {
    commitCount,
    commentCount: regularComments + reviewComments,
    reviewCount: pr.reviews?.nodes?.length ?? 0,
    updatedAt: pr.updatedAt,
  };
}

// Initialize store
const storeData = reactive<FollowUpStoreData>(loadFollowUpState());

// Prune on startup if needed (once per day)
const lastPruned = new Date(storeData.lastPruned);
const now = new Date();
if (now.getTime() - lastPruned.getTime() > 24 * 60 * 60 * 1000) {
  pruneOldEntries(storeData);
  saveFollowUpState(storeData);
}

// Auto-save on changes
watch(
  () => ({ ...storeData }),
  (newData) => {
    saveFollowUpState(newData);
  },
  { deep: true }
);

// ===== Public API =====

/**
 * Follow a PR for change notifications
 */
export function followPR(pr: PullRequestBasic): boolean {
  // Check limit
  if (Object.keys(storeData.followedPRs).length >= MAX_FOLLOWED_PRS) {
    console.warn(`Cannot follow more than ${MAX_FOLLOWED_PRS} PRs`);
    return false;
  }

  storeData.followedPRs[pr.id] = {
    prId: pr.id,
    prNumber: pr.number,
    repoNameWithOwner: pr.repository.nameWithOwner,
    url: pr.url,
    title: pr.title,
    authorLogin: pr.author.login,
    authorAvatarUrl: pr.author.avatarUrl,
    followedAt: new Date().toISOString(),
    lastKnownState: extractPRState(pr),
  };

  return true;
}

/**
 * Stop following a PR
 */
export function unfollowPR(prId: string): void {
  delete storeData.followedPRs[prId];
}

/**
 * Check if a PR is being followed
 */
export function isFollowing(prId: string): boolean {
  return prId in storeData.followedPRs;
}

/**
 * Get info about a followed PR
 */
export function getFollowedPRInfo(prId: string): FollowedPRInfo | undefined {
  return storeData.followedPRs[prId];
}

/**
 * Get all followed PRs
 */
export function getFollowedPRs(): FollowedPRInfo[] {
  return Object.values(storeData.followedPRs);
}

/**
 * Get followed PR IDs for batch fetching
 */
export function getFollowedPRIds(): string[] {
  return Object.keys(storeData.followedPRs);
}

/**
 * Get count of followed PRs
 */
export function getFollowedCount(): number {
  return Object.keys(storeData.followedPRs).length;
}

/**
 * Update the last known state for a PR (called after polling)
 */
export function updatePRState(prId: string, pr: PullRequestBasic): void {
  const info = storeData.followedPRs[prId];
  if (info) {
    info.lastKnownState = extractPRState(pr);
    info.title = pr.title; // Update title in case it changed
  }
}

/**
 * Compare current PR state with last known state
 * Returns changes detected
 */
export function detectChanges(
  prId: string,
  currentPR: PullRequestBasic
): {
  hasChanges: boolean;
  newCommits: number;
  newComments: number;
  newReviews: number;
} {
  const info = storeData.followedPRs[prId];
  if (!info) {
    console.log('FollowUpStore.detectChanges: PR not found in followed list:', prId);
    return { hasChanges: false, newCommits: 0, newComments: 0, newReviews: 0 };
  }

  const currentState = extractPRState(currentPR);
  const lastState = info.lastKnownState;

  console.log('FollowUpStore.detectChanges: PR #' + info.prNumber);
  console.log('  Current state:', currentState);
  console.log('  Last known state:', lastState);
  console.log('  Raw PR data - comments:', currentPR.comments, 'reviews:', currentPR.reviews);

  const newCommits = Math.max(0, currentState.commitCount - lastState.commitCount);
  const newComments = Math.max(0, currentState.commentCount - lastState.commentCount);
  const newReviews = Math.max(0, currentState.reviewCount - lastState.reviewCount);

  console.log('  Detected changes - commits:', newCommits, 'comments:', newComments, 'reviews:', newReviews);

  return {
    hasChanges: newCommits > 0 || newComments > 0 || newReviews > 0,
    newCommits,
    newComments,
    newReviews,
  };
}

/**
 * Remove a PR from follow-up (e.g., when PR is closed/merged)
 */
export function removeClosedPR(prId: string): void {
  delete storeData.followedPRs[prId];
}

/**
 * Clear all followed PRs
 */
export function clearAllFollowed(): void {
  storeData.followedPRs = {};
  storeData.lastPruned = new Date().toISOString();
}

/**
 * Check if we can follow more PRs
 */
export function canFollowMore(): boolean {
  return Object.keys(storeData.followedPRs).length < MAX_FOLLOWED_PRS;
}

/**
 * Computed: reactive count of followed PRs
 */
export const followedCount = computed(() => Object.keys(storeData.followedPRs).length);

/**
 * Computed: reactive list of followed PRs
 */
export const followedPRsList = computed(() => Object.values(storeData.followedPRs));

// Export store for direct access if needed
export const followUpStore = storeData;
