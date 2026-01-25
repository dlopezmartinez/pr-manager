<template>
  <div class="pinned-prs-view">
    <div v-if="pinnedPRs.length === 0" class="empty-state">
      <Pin :size="48" :stroke-width="1.5" class="empty-icon" />
      <h3>No pinned PRs</h3>
      <p>Pin PRs from the card menu for quick access</p>
    </div>

    <template v-else>
      <div class="pinned-header">
        <span class="pinned-count">{{ pinnedPRs.length }} pinned PR{{ pinnedPRs.length !== 1 ? 's' : '' }}</span>
        <button class="unpin-all-btn" @click="handleUnpinAll">
          <PinOff :size="14" :stroke-width="2" />
          Unpin all
        </button>
      </div>

      <div class="pinned-list">
        <div
          v-for="pr in pinnedPRs"
          :key="pr.prId"
          class="pinned-card"
          @click="openPR(pr)"
        >
          <div class="pinned-card-header">
            <div class="pinned-title-row">
              <span class="pinned-title">{{ pr.title }}</span>
              <span class="pinned-number">#{{ pr.prNumber }}</span>
            </div>
            <span :class="['pinned-state', pr.state.toLowerCase()]">
              {{ pr.state }}
            </span>
          </div>

          <div class="pinned-card-meta">
            <span class="pinned-repo">{{ pr.repoNameWithOwner }}</span>
            <div class="pinned-author">
              <LazyAvatar
                :src="pr.authorAvatarUrl"
                :name="pr.authorLogin"
                :size="18"
                alt="Author"
              />
              <span>{{ pr.authorLogin }}</span>
            </div>
          </div>

          <div class="pinned-card-actions">
            <button
              class="unpin-btn"
              @click.stop="handleUnpin(pr.prId)"
              title="Unpin"
            >
              <PinOff :size="14" :stroke-width="2" />
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Pin, PinOff } from 'lucide-vue-next';
import { getPinnedPRs, unpinPR, unpinAll, type PinnedPRInfo } from '../stores/pinnedStore';
import { openExternal } from '../utils/electron';
import LazyAvatar from './LazyAvatar.vue';

const pinnedPRs = computed(() => getPinnedPRs());

function openPR(pr: PinnedPRInfo) {
  openExternal(pr.url).catch(console.error);
}

function handleUnpin(prId: string) {
  unpinPR(prId);
}

function handleUnpinAll() {
  unpinAll();
}
</script>

<style scoped>
.pinned-prs-view {
  padding: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  color: var(--color-text-tertiary);
}

.empty-icon {
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state h3 {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.empty-state p {
  margin: 0;
  font-size: 13px;
}

.pinned-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--color-border-tertiary);
}

.pinned-count {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.unpin-all-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.unpin-all-btn:hover {
  background: var(--color-error-bg);
  border-color: var(--color-error);
  color: var(--color-error);
}

.pinned-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pinned-card {
  position: relative;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-lg);
  padding: 16px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.pinned-card:hover {
  border-color: var(--color-border-primary);
  box-shadow: var(--shadow-sm-themed);
  transform: translateY(-1px);
}

.pinned-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 8px;
}

.pinned-title-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex: 1;
  margin-right: 12px;
}

.pinned-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  line-height: 1.3;
}

.pinned-number {
  font-size: 11px;
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.pinned-state {
  padding: 2px 8px;
  border-radius: var(--radius-xl);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}

.pinned-state.open {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.pinned-state.merged {
  background: rgba(191, 90, 242, 0.2);
  color: var(--color-pr-merged);
}

.pinned-state.closed {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.pinned-card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.pinned-repo {
  font-weight: 500;
}

.pinned-author {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-secondary);
}

.pinned-card-actions {
  position: absolute;
  top: 12px;
  right: 12px;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.pinned-card:hover .pinned-card-actions {
  opacity: 1;
}

.unpin-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: var(--color-surface-primary);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-md);
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.unpin-btn:hover {
  background: var(--color-error-bg);
  border-color: var(--color-error);
  color: var(--color-error);
}
</style>
