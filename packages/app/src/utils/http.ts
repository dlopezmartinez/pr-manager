/**
 * HTTP Utilities with Retry Logic
 *
 * Provides robust HTTP request handling with:
 * - Automatic retry for transient failures
 * - Exponential backoff
 * - Timeout handling
 * - Better error messages
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay between retries in ms (default: 1000) */
  initialDelay?: number;
  /** Maximum delay between retries in ms (default: 10000) */
  maxDelay?: number;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Whether to retry on specific status codes */
  retryOnStatus?: number[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  timeout: 30000,
  retryOnStatus: [408, 429, 500, 502, 503, 504],
};

/**
 * Custom error class for HTTP errors with additional context
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly statusText?: string,
    public readonly url?: string,
    public readonly isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'HttpError';
  }

  static fromResponse(response: Response, url: string): HttpError {
    const isRetryable = DEFAULT_OPTIONS.retryOnStatus.includes(response.status);
    return new HttpError(
      `HTTP ${response.status}: ${response.statusText}`,
      response.status,
      response.statusText,
      url,
      isRetryable
    );
  }

  static timeout(url: string, timeoutMs: number): HttpError {
    return new HttpError(
      `Request timeout after ${timeoutMs}ms`,
      undefined,
      'Timeout',
      url,
      true
    );
  }

  static network(url: string, originalError: Error): HttpError {
    return new HttpError(
      `Network error: ${originalError.message}`,
      undefined,
      'Network Error',
      url,
      true
    );
  }
}

/**
 * Custom error class for GraphQL errors
 */
export class GraphQLError extends Error {
  constructor(
    message: string,
    public readonly errors: Array<{ message: string; path?: string[] }>
  ) {
    super(message);
    this.name = 'GraphQLError';
  }

  static fromResponse(errors: Array<{ message: string; path?: string[] }>): GraphQLError {
    const messages = errors.map(e => e.message).join('; ');
    return new GraphQLError(`GraphQL Error: ${messages}`, errors);
  }
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoff(attempt: number, initialDelay: number, maxDelay: number): number {
  const delay = initialDelay * Math.pow(2, attempt);
  // Add jitter (±25%)
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, maxDelay);
}

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw HttpError.timeout(url, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch with automatic retry on transient failures
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const opts = { ...DEFAULT_OPTIONS, ...retryOptions };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, opts.timeout);

      // Check if we should retry based on status code
      if (!response.ok && opts.retryOnStatus.includes(response.status)) {
        if (attempt < opts.maxRetries) {
          const delay = calculateBackoff(attempt, opts.initialDelay, opts.maxDelay);
          console.warn(
            `Request to ${url} failed with status ${response.status}, ` +
            `retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${opts.maxRetries})`
          );
          await sleep(delay);
          continue;
        }
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Only retry on network errors or timeouts
      const isRetryable = lastError instanceof HttpError && lastError.isRetryable;
      const isNetworkError = lastError.name === 'TypeError' && lastError.message.includes('fetch');

      if ((isRetryable || isNetworkError) && attempt < opts.maxRetries) {
        const delay = calculateBackoff(attempt, opts.initialDelay, opts.maxDelay);
        console.warn(
          `Request to ${url} failed: ${lastError.message}, ` +
          `retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${opts.maxRetries})`
        );
        await sleep(delay);
        continue;
      }

      // If it's a network error, wrap it in HttpError
      if (isNetworkError) {
        throw HttpError.network(url, lastError);
      }

      throw lastError;
    }
  }

  // Should not reach here, but just in case
  throw lastError || new Error('Unknown error');
}

/**
 * Execute a GraphQL query with retry support
 */
export async function executeGraphQL<T>(
  endpoint: string,
  query: string,
  variables: Record<string, unknown> = {},
  headers: Record<string, string> = {},
  retryOptions: RetryOptions = {}
): Promise<T> {
  const response = await fetchWithRetry(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({ query, variables }),
    },
    retryOptions
  );

  if (!response.ok) {
    throw HttpError.fromResponse(response, endpoint);
  }

  const result = await response.json();

  if (result.errors && result.errors.length > 0) {
    throw GraphQLError.fromResponse(result.errors);
  }

  return result;
}

/**
 * Check if an error is a rate limit error
 */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof HttpError) {
    return error.status === 429;
  }
  if (error instanceof GraphQLError) {
    return error.errors.some(e =>
      e.message.toLowerCase().includes('rate limit') ||
      e.message.toLowerCase().includes('api rate limit')
    );
  }
  return false;
}

/**
 * Check if an error is an authentication error
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof HttpError) {
    return error.status === 401 || error.status === 403;
  }
  if (error instanceof GraphQLError) {
    return error.errors.some(e =>
      e.message.toLowerCase().includes('authentication') ||
      e.message.toLowerCase().includes('unauthorized') ||
      e.message.toLowerCase().includes('bad credentials')
    );
  }
  return false;
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 401) return 'Authentication failed. Please check your API token.';
    if (error.status === 403) return 'Access denied. Your token may lack required permissions.';
    if (error.status === 404) return 'Resource not found.';
    if (error.status === 429) return 'Rate limit exceeded. Please wait before retrying.';
    if (error.status && error.status >= 500) return 'Server error. Please try again later.';
    if (error.statusText === 'Timeout') return 'Request timed out. Please check your connection.';
    if (error.statusText === 'Network Error') return 'Network error. Please check your connection.';
    return error.message;
  }

  if (error instanceof GraphQLError) {
    if (isRateLimitError(error)) return 'Rate limit exceeded. Please wait before retrying.';
    if (isAuthError(error)) return 'Authentication failed. Please check your API token.';
    return error.errors.map(e => e.message).join('; ');
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unknown error occurred';
}
