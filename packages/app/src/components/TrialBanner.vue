<template>
  <div v-if="showBanner" class="trial-banner" :class="bannerClass">
    <div class="banner-content">
      <svg class="banner-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12,6 12,12 16,14"/>
      </svg>
      <span class="banner-text">{{ bannerText }}</span>
    </div>
    <button class="banner-action" @click="handleUpgrade">
      {{ actionText }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { authStore } from '../stores/authStore';

const showBanner = computed(() => {
  // Show banner if user is in trial or subscription is about to cancel
  const sub = authStore.state.subscription;
  if (!sub) return false;

  return sub.isTrialing || sub.cancelAtPeriodEnd;
});

const bannerClass = computed(() => {
  const sub = authStore.state.subscription;
  if (!sub) return '';

  if (sub.isTrialing) {
    const daysLeft = sub.trialDaysLeft ?? 0;
    if (daysLeft <= 3) return 'urgent';
    if (daysLeft <= 7) return 'warning';
    return 'info';
  }

  if (sub.cancelAtPeriodEnd) {
    return 'warning';
  }

  return 'info';
});

const bannerText = computed(() => {
  const sub = authStore.state.subscription;
  if (!sub) return '';

  if (sub.isTrialing) {
    const daysLeft = sub.trialDaysLeft ?? 0;
    if (daysLeft === 0) return 'Last day of your free trial';
    if (daysLeft === 1) return '1 day left in your free trial';
    return `${daysLeft} days left in your free trial`;
  }

  if (sub.cancelAtPeriodEnd) {
    const endDate = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : '';
    return `Your subscription ends on ${endDate}`;
  }

  return '';
});

const actionText = computed(() => {
  const sub = authStore.state.subscription;
  if (!sub) return 'Upgrade';

  if (sub.isTrialing) {
    return 'Upgrade Now';
  }

  if (sub.cancelAtPeriodEnd) {
    return 'Reactivate';
  }

  return 'Upgrade';
});

async function handleUpgrade() {
  const sub = authStore.state.subscription;

  if (sub?.cancelAtPeriodEnd) {
    // Reactivate subscription
    try {
      await authStore.openCustomerPortal();
    } catch (err) {
      console.error('Failed to open portal:', err);
    }
  } else {
    // Open checkout for upgrade
    try {
      await authStore.openCheckout('yearly');
    } catch (err) {
      console.error('Failed to open checkout:', err);
    }
  }
}
</script>

<style scoped>
.trial-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  gap: 12px;
  font-size: 12px;
  border-bottom: 1px solid var(--color-border);
}

.trial-banner.info {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.trial-banner.warning {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.trial-banner.urgent {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.banner-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.banner-icon {
  flex-shrink: 0;
}

.banner-text {
  font-weight: 500;
}

.banner-action {
  flex-shrink: 0;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  color: white;
  background: currentColor;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.banner-action:hover {
  opacity: 0.9;
}

.trial-banner.info .banner-action {
  background: #3b82f6;
}

.trial-banner.warning .banner-action {
  background: #f59e0b;
}

.trial-banner.urgent .banner-action {
  background: #ef4444;
}
</style>
