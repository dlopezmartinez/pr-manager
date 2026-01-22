/**
 * Centralized Electron APIs access
 * Provides typed access to Electron APIs available in renderer process
 * Uses secure contextBridge API exposed via preload script
 */

/**
 * Check if running in Electron environment
 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' &&
         'electronAPI' in window &&
         window.electronAPI?.isElectron === true;
}

/**
 * Get the Electron API (exposed via contextBridge)
 * @throws Error if not in Electron environment
 */
function getElectronAPI() {
  if (!isElectron()) {
    throw new Error('Not running in Electron environment');
  }
  return window.electronAPI;
}

/**
 * Send IPC message to main process
 */
export function sendIpc(channel: string, ...args: unknown[]): void {
  getElectronAPI().ipc.send(channel, ...args);
}

/**
 * Listen for IPC events from main process
 */
export function onIpcEvent(channel: string, callback: (...args: unknown[]) => void): void {
  if (!isElectron()) {
    return;
  }
  getElectronAPI().ipc.on(channel, callback);
}

/**
 * Remove IPC event listener
 */
export function removeIpcListener(channel: string): void {
  if (!isElectron()) {
    return;
  }
  getElectronAPI().ipc.removeListener(channel);
}

/**
 * Open URL in default browser
 */
export function openExternal(url: string): Promise<void> {
  return getElectronAPI().shell.openExternal(url);
}

/**
 * Hide the application window
 */
export function hideWindow(): void {
  sendIpc('hide-window');
}

/**
 * Update PR count in menubar
 */
export function updatePrCount(count: number): void {
  sendIpc('update-pr-count', count);
}

/**
 * Show native notification
 */
export function showNotification(options: {
  title: string;
  body: string;
  subtitle?: string;
  url?: string;
}): void {
  sendIpc('show-notification', options);
}

/**
 * Set syncing state (changes tray icon)
 */
export function setSyncing(isSyncing: boolean): void {
  sendIpc('set-syncing', isSyncing);
}

/**
 * Get current platform
 */
export function getPlatform(): string {
  if (!isElectron()) {
    return 'web';
  }
  return getElectronAPI().platform;
}

/**
 * Set zoom level (0 = 100%, 1 = 120%, -1 = 80%, etc.)
 */
export function setZoomLevel(level: number): void {
  getElectronAPI().zoom.setZoomLevel(level);
}

/**
 * Get current zoom level
 */
export function getZoomLevel(): number {
  return getElectronAPI().zoom.getZoomLevel();
}

/**
 * Set zoom factor (1.0 = 100%, 1.2 = 120%, 0.8 = 80%)
 */
export function setZoomFactor(factor: number): void {
  getElectronAPI().zoom.setZoomFactor(factor);
}

/**
 * Get current zoom factor
 */
export function getZoomFactor(): number {
  return getElectronAPI().zoom.getZoomFactor();
}

// =============================================================================
// SECURE STORAGE
// =============================================================================

/**
 * Get a value from secure storage (encrypted)
 */
export async function getSecureValue(key: string): Promise<string | null> {
  if (!isElectron()) {
    // Fallback to localStorage in non-Electron environment
    return localStorage.getItem(`secure_${key}`);
  }
  return getElectronAPI().secureStorage.get(key);
}

/**
 * Set a value in secure storage (encrypted)
 */
export async function setSecureValue(key: string, value: string): Promise<boolean> {
  if (!isElectron()) {
    // Fallback to localStorage in non-Electron environment
    localStorage.setItem(`secure_${key}`, value);
    return true;
  }
  return getElectronAPI().secureStorage.set(key, value);
}

/**
 * Delete a value from secure storage
 */
export async function deleteSecureValue(key: string): Promise<boolean> {
  if (!isElectron()) {
    localStorage.removeItem(`secure_${key}`);
    return true;
  }
  return getElectronAPI().secureStorage.delete(key);
}

/**
 * Check if secure storage encryption is available
 */
export async function isSecureStorageAvailable(): Promise<boolean> {
  if (!isElectron()) {
    return false;
  }
  return getElectronAPI().secureStorage.isAvailable();
}

// =============================================================================
// TOKEN VALIDATION
// =============================================================================

export interface TokenValidationResult {
  valid: boolean;
  scopes: string[];
  missingScopes: string[];
  username?: string;
  error?: string;
}

/**
 * Validate a GitHub or GitLab token
 * Checks if the token is valid and has required scopes
 */
export async function validateToken(
  provider: 'github' | 'gitlab',
  token: string,
  baseUrl?: string
): Promise<TokenValidationResult> {
  if (!isElectron()) {
    // Fallback for non-Electron environment - basic validation only
    return validateTokenFallback(provider, token, baseUrl);
  }
  return getElectronAPI().validateToken(provider, token, baseUrl);
}

/**
 * Fallback token validation for non-Electron environments
 * Does basic authentication check without scope verification
 */
async function validateTokenFallback(
  provider: 'github' | 'gitlab',
  token: string,
  baseUrl?: string
): Promise<TokenValidationResult> {
  try {
    if (provider === 'github') {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        return {
          valid: false,
          scopes: [],
          missingScopes: ['repo'],
          error: response.status === 401 ? 'Invalid token' : 'Token validation failed',
        };
      }

      const data = await response.json();
      const scopes = response.headers.get('X-OAuth-Scopes')?.split(',').map(s => s.trim()) || [];

      return {
        valid: scopes.includes('repo') || scopes.length === 0,
        scopes,
        missingScopes: scopes.includes('repo') || scopes.length === 0 ? [] : ['repo'],
        username: data.login,
      };
    } else {
      const endpoint = baseUrl ? `${baseUrl}/api/v4/user` : 'https://gitlab.com/api/v4/user';
      const response = await fetch(endpoint, {
        headers: { 'PRIVATE-TOKEN': token },
      });

      if (!response.ok) {
        return {
          valid: false,
          scopes: [],
          missingScopes: ['api'],
          error: response.status === 401 ? 'Invalid token' : 'Token validation failed',
        };
      }

      const data = await response.json();
      return {
        valid: true,
        scopes: ['unknown'],
        missingScopes: [],
        username: data.username,
      };
    }
  } catch (error) {
    return {
      valid: false,
      scopes: [],
      missingScopes: provider === 'github' ? ['repo'] : ['api'],
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

// =============================================================================
// APP INFO
// =============================================================================

/**
 * Get the application version
 */
export async function getAppVersion(): Promise<string> {
  if (!isElectron()) {
    return 'dev';
  }
  return getElectronAPI().getAppVersion();
}
