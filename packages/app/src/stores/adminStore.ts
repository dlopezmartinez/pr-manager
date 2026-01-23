import { reactive, readonly } from 'vue';
import type {
  AdminUser,
  AdminSession,
  AdminSubscription,
  AdminWebhook,
  AuditLog,
  SystemConfig,
  SystemHealth,
  PaginationInfo,
} from '../types/admin.js';

interface AdminState {
  // Data
  users: AdminUser[];
  sessions: AdminSession[];
  subscriptions: AdminSubscription[];
  webhooks: AdminWebhook[];
  auditLogs: AuditLog[];
  configs: SystemConfig[];
  systemHealth: SystemHealth | null;

  // Pagination
  usersPagination: PaginationInfo | null;
  sessionsPagination: PaginationInfo | null;
  subscriptionsPagination: PaginationInfo | null;
  webhooksPagination: PaginationInfo | null;
  auditLogsPagination: PaginationInfo | null;

  // UI State
  loading: boolean;
  error: string | null;
  selectedUser: AdminUser | null;
  selectedSession: AdminSession | null;
  selectedSubscription: AdminSubscription | null;
  selectedWebhook: AdminWebhook | null;
}

const state = reactive<AdminState>({
  users: [],
  sessions: [],
  subscriptions: [],
  webhooks: [],
  auditLogs: [],
  configs: [],
  systemHealth: null,

  usersPagination: null,
  sessionsPagination: null,
  subscriptionsPagination: null,
  webhooksPagination: null,
  auditLogsPagination: null,

  loading: false,
  error: null,
  selectedUser: null,
  selectedSession: null,
  selectedSubscription: null,
  selectedWebhook: null,
});

export const adminStore = {
  state: readonly(state),

  // Users setters
  setUsers(users: AdminUser[], pagination?: PaginationInfo) {
    state.users = users;
    if (pagination) state.usersPagination = pagination;
  },

  setSelectedUser(user: AdminUser | null) {
    state.selectedUser = user;
  },

  // Sessions setters
  setSessions(sessions: AdminSession[], pagination?: PaginationInfo) {
    state.sessions = sessions;
    if (pagination) state.sessionsPagination = pagination;
  },

  setSelectedSession(session: AdminSession | null) {
    state.selectedSession = session;
  },

  // Subscriptions setters
  setSubscriptions(subscriptions: AdminSubscription[], pagination?: PaginationInfo) {
    state.subscriptions = subscriptions;
    if (pagination) state.subscriptionsPagination = pagination;
  },

  setSelectedSubscription(subscription: AdminSubscription | null) {
    state.selectedSubscription = subscription;
  },

  // Webhooks setters
  setWebhooks(webhooks: AdminWebhook[], pagination?: PaginationInfo) {
    state.webhooks = webhooks;
    if (pagination) state.webhooksPagination = pagination;
  },

  setSelectedWebhook(webhook: AdminWebhook | null) {
    state.selectedWebhook = webhook;
  },

  // Audit logs setters
  setAuditLogs(logs: AuditLog[], pagination?: PaginationInfo) {
    state.auditLogs = logs;
    if (pagination) state.auditLogsPagination = pagination;
  },

  // Config setters
  setConfigs(configs: SystemConfig[]) {
    state.configs = configs;
  },

  // Health setters
  setSystemHealth(health: SystemHealth) {
    state.systemHealth = health;
  },

  // UI state setters
  setLoading(loading: boolean) {
    state.loading = loading;
  },

  setError(error: string | null) {
    state.error = error;
  },

  clearError() {
    state.error = null;
  },

  // Clear all data
  clearAll() {
    state.users = [];
    state.sessions = [];
    state.subscriptions = [];
    state.webhooks = [];
    state.auditLogs = [];
    state.configs = [];
    state.systemHealth = null;
    state.selectedUser = null;
    state.selectedSession = null;
    state.selectedSubscription = null;
    state.selectedWebhook = null;
    state.error = null;
    state.loading = false;
  },
};
