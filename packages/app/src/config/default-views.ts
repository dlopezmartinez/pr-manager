import type { ViewConfig } from '../model/view-types';
import type { PullRequestBasic } from '../model/types';

/**
 * Notifications View ID - special view for notification inbox
 */
export const VIEW_NOTIFICATIONS_ID = 'notifications';

/**
 * Default View: Notifications
 * Special view that shows the notification inbox for followed PRs
 * This is a virtual view - it doesn't query the API directly
 */
export const VIEW_NOTIFICATIONS: ViewConfig = {
  id: VIEW_NOTIFICATIONS_ID,
  name: 'Notifications',
  icon: '🔔',
  // This queryBuilder is a placeholder - the view is rendered differently
  queryBuilder: () => '',
  readonly: true,
  order: 0,
  applyExplicitReviewerFilter: false,
};

/**
 * Array of all default views
 * These are built-in and cannot be deleted or modified by users
 */
export const DEFAULT_VIEWS: ViewConfig[] = [VIEW_NOTIFICATIONS];

/**
 * Get default view by ID
 */
export function getDefaultView(id: string): ViewConfig | undefined {
  return DEFAULT_VIEWS.find((view) => view.id === id);
}

/**
 * Check if a view ID corresponds to a default view
 */
export function isDefaultView(id: string): boolean {
  return DEFAULT_VIEWS.some((view) => view.id === id);
}

/**
 * Check if a view ID is the notifications view
 */
export function isNotificationsView(id: string): boolean {
  return id === VIEW_NOTIFICATIONS_ID;
}
