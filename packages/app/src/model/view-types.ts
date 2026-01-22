import type { PullRequestBasic } from './types';

/**
 * Unique identifier for a view
 */
export type ViewId = string;

/**
 * Query builder function that generates GraphQL search queries
 * @param username - Current GitHub username
 * @returns GitHub search query string or array of query strings for multi-query views
 */
export type ViewQueryBuilder = (username: string) => string | string[];

/**
 * Post-fetch filter function for additional client-side filtering
 * @param pr - Pull request to filter
 * @param username - Current GitHub username
 * @returns true if PR should be included, false otherwise
 */
export type ViewFilter = (pr: PullRequestBasic, username: string) => boolean;

/**
 * Sorting function for PRs within a view
 * @param a - First PR to compare
 * @param b - Second PR to compare
 * @returns Negative if a < b, positive if a > b, 0 if equal
 */
export type ViewSorter = (a: PullRequestBasic, b: PullRequestBasic) => number;

/**
 * Core view configuration interface
 * Defines how a view fetches, filters, and displays PRs
 */
export interface ViewConfig {
  /** Unique identifier for the view */
  id: ViewId;

  /** Display name shown in tab */
  name: string;

  /** Optional icon (emoji or URL) displayed in tab */
  icon?: string;

  /** Query builder function - can return single query or multiple queries to merge */
  queryBuilder: ViewQueryBuilder;

  /** Optional post-fetch filter for additional client-side filtering */
  filter?: ViewFilter;

  /** Optional custom sorter (defaults to updatedAt descending) */
  sorter?: ViewSorter;

  /** Whether to deduplicate results (useful for multi-query views) */
  deduplicate?: boolean;

  /** Maximum results per page (defaults to 20) */
  pageSize?: number;

  /** Whether this is a built-in (non-deletable/non-editable) view */
  readonly?: boolean;

  /** Order position for sorting tabs (lower numbers appear first) */
  order?: number;

  /** Whether to apply explicit reviewer filter (only show explicit reviewers, not team reviews)
   * undefined = use global setting from configStore
   * true = always apply
   * false = never apply */
  applyExplicitReviewerFilter?: boolean;
}

/**
 * Serializable view config for localStorage persistence
 * Uses filter/sorter IDs instead of serialized code for security
 */
export interface SerializableViewConfig {
  /** Unique identifier */
  id: ViewId;

  /** Display name */
  name: string;

  /** Optional icon (emoji or URL) */
  icon?: string;

  /** Query template with {{username}} placeholder */
  queryTemplate: string;

  /**
   * Filter ID from predefined filters (see config/view-filters.ts)
   * SECURITY: Using IDs instead of serialized code prevents code injection
   */
  filterId?: string;

  /**
   * Sorter ID from predefined sorters (see config/view-filters.ts)
   * SECURITY: Using IDs instead of serialized code prevents code injection
   */
  sorterId?: string;

  /**
   * @deprecated Use filterId instead. Kept for migration purposes only.
   * Will be ignored if filterId is present.
   */
  filterCode?: string;

  /**
   * @deprecated Use sorterId instead. Kept for migration purposes only.
   * Will be ignored if sorterId is present.
   */
  sorterCode?: string;

  /** Whether to deduplicate results */
  deduplicate?: boolean;

  /** Maximum results per page */
  pageSize?: number;

  /** Whether this is a built-in view (always false for custom views) */
  readonly?: boolean;

  /** Order position */
  order?: number;

  /** Whether to apply explicit reviewer filter (only show explicit reviewers) */
  applyExplicitReviewerFilter?: boolean;
}

/**
 * State for a single view
 * Each view maintains its own independent state
 */
export interface ViewState {
  /** Loaded pull requests */
  prs: PullRequestBasic[];

  /** Pagination information */
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };

  /** Loading indicator */
  loading: boolean;

  /** Error message (empty if no error) */
  error: string;

  /** Timestamp of last successful fetch (null if never fetched) */
  lastFetched: Date | null;
}

/**
 * Form data for creating/editing custom views
 * Used by ViewEditorDialog component
 */
export interface ViewEditorFormData {
  /** View name (required) */
  name: string;

  /** View icon (emoji picker) */
  icon?: string;

  /** Custom GitHub search query (advanced mode) */
  customQuery?: string;

  /** Repository filters (e.g., ["org/repo1", "org/repo2"]) - ignored if customQuery is set */
  repositories?: string[];

  /** Label filters (e.g., ["urgent", "bug"]) - ignored if customQuery is set */
  labels?: string[];

  /** Author filters (e.g., ["user1", "user2"]) - ignored if customQuery is set */
  authors?: string[];

  /** Include draft PRs - ignored if customQuery is set */
  isDraft?: boolean;

  /** PR state filter - ignored if customQuery is set */
  state?: 'open' | 'closed';

  /** Review status filter - ignored if customQuery is set */
  reviewStatus?: 'pending' | 'approved' | 'changes-requested';

  /** Sort order */
  sortBy?: 'updated' | 'created';

  /** Apply explicit reviewer filter (only show explicit reviewers, not team reviews) */
  applyExplicitReviewerFilter?: boolean;
}
