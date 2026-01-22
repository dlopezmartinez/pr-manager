/**
 * Platform Detection and Configuration Module
 * Centralizes all platform-specific logic for better maintainability
 */

export type Platform = 'darwin' | 'win32' | 'linux';

/**
 * Current platform
 */
export const currentPlatform: Platform = process.platform as Platform;

/**
 * Platform checks
 */
export const isMac = currentPlatform === 'darwin';
export const isWindows = currentPlatform === 'win32';
export const isLinux = currentPlatform === 'linux';

/**
 * Window configuration per platform
 * Discord-like design: frameless with custom controls on Windows/Linux,
 * native traffic lights on macOS
 */
export interface WindowConfig {
  frame: boolean;
  titleBarStyle?: 'hidden' | 'hiddenInset' | 'default';
  resizable: boolean;
  skipTaskbar: boolean;
  alwaysOnTop: boolean;
  minWidth: number;
  minHeight: number;
  trafficLightPosition?: { x: number; y: number };
  useCustomControls: boolean;
}

export function getWindowConfig(): WindowConfig {
  if (isMac) {
    // macOS: Native traffic lights integrated into the content
    return {
      frame: false,
      titleBarStyle: 'hiddenInset',
      resizable: true,
      skipTaskbar: true,
      alwaysOnTop: false,
      minWidth: 400,
      minHeight: 500,
      trafficLightPosition: { x: 13, y: 13 },
      useCustomControls: false,
    };
  }

  // Windows & Linux: Fully frameless with custom controls
  return {
    frame: false,
    resizable: true,
    skipTaskbar: false,
    alwaysOnTop: false,
    minWidth: 400,
    minHeight: 500,
    useCustomControls: true,
  };
}

/**
 * Tray icon configuration per platform
 */
export interface TrayIconConfig {
  useTemplateImage: boolean;
  iconColor: 'black' | 'white';
}

export function getTrayIconConfig(): TrayIconConfig {
  if (isMac) {
    return {
      useTemplateImage: true,
      iconColor: 'black',
    };
  }

  return {
    useTemplateImage: false,
    iconColor: 'white',
  };
}

/**
 * Notification configuration per platform
 *
 * We use Electron's native Notification API on all platforms for consistency
 * and better reliability. node-notifier has been removed due to issues on Windows.
 */
export interface NotificationConfig {
  supportsSubtitle: boolean;
  requiresIcon: boolean;
}

export function getNotificationConfig(): NotificationConfig {
  if (isMac) {
    return {
      supportsSubtitle: true,
      requiresIcon: false,
    };
  }

  // Windows and Linux: no subtitle support, icon required
  return {
    supportsSubtitle: false,
    requiresIcon: true,
  };
}

/**
 * Window positioning logic per platform
 */
export interface WindowPosition {
  x: number;
  y: number;
}

export function calculateWindowPosition(
  trayBounds: Electron.Rectangle,
  windowBounds: { width: number; height: number },
  displayBounds: Electron.Rectangle,
  gap = 4
): WindowPosition {
  let x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2));

  let y: number;
  if (isWindows) {
    y = Math.round(trayBounds.y - windowBounds.height - gap);
  } else {
    y = Math.round(trayBounds.y + trayBounds.height + gap);
  }

  const screenRight = displayBounds.x + displayBounds.width;
  if (x + windowBounds.width > screenRight) {
    x = screenRight - windowBounds.width - 10;
  }
  if (x < displayBounds.x) {
    x = displayBounds.x + 10;
  }

  if (y < displayBounds.y) {
    y = displayBounds.y + 10;
  }
  const screenBottom = displayBounds.y + displayBounds.height;
  if (y + windowBounds.height > screenBottom) {
    y = screenBottom - windowBounds.height - 10;
  }

  return { x, y };
}

/**
 * App lifecycle behavior per platform
 */
export function shouldQuitOnAllWindowsClosed(): boolean {
  return !isMac;
}

/**
 * Tray title support (only macOS)
 */
export function supportsTrayTitle(): boolean {
  return isMac;
}
