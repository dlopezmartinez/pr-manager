<template>
  <div v-if="showBanner" class="status-banner error">
    <div class="banner-content">
      <component :is="bannerIcon" :size="16" :stroke-width="2" class="banner-icon" />
      <span class="banner-text">{{ bannerText }}</span>
    </div>
    <div class="banner-actions">
      <button
        class="banner-btn banner-btn-primary"
        @click="$emit('requireLogin')"
      >
        Iniciar sesión
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { AlertCircle, Clock } from 'lucide-vue-next';
import { sessionManager } from '../services/sessionManager';

defineEmits<{
  (e: 'requireLogin'): void;
}>();

// Only show for warning states
// 'expired' state triggers redirect, not banner
const showBanner = computed(() => {
  const state = sessionManager.sessionState.value;
  return state === 'warning_subscription' || state === 'warning_session';
});

const bannerIcon = computed(() => {
  const state = sessionManager.sessionState.value;
  return state === 'warning_session' ? Clock : AlertCircle;
});

const bannerText = computed(() => {
  const state = sessionManager.sessionState.value;

  if (state === 'warning_subscription') {
    return 'Tu suscripción ha expirado. Inicia sesión para continuar usando la app.';
  }

  if (state === 'warning_session') {
    return 'Tu sesión está a punto de expirar. Inicia sesión para renovarla.';
  }

  return '';
});
</script>

<style scoped>
.status-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  gap: 12px;
  font-size: 13px;
}

.status-banner.error {
  background: var(--color-error-bg);
  color: var(--color-error);
  border-bottom: 1px solid var(--color-error);
}

.banner-content {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.banner-icon {
  flex-shrink: 0;
}

.banner-text {
  font-weight: 500;
}

.banner-actions {
  flex-shrink: 0;
}

.banner-btn {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.banner-btn:hover {
  opacity: 0.9;
}

.banner-btn-primary {
  background: var(--color-error);
  color: var(--color-text-inverted);
}
</style>
