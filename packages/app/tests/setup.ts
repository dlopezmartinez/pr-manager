/**
 * Vitest Setup File
 * Configures the test environment with mocks for Electron APIs and browser globals
 */

import { vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock Electron API
const electronAPIMock = {
  isElectron: true,
  platform: 'darwin',
  ipc: {
    send: vi.fn(),
  },
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
  secureStorage: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(true),
    delete: vi.fn().mockResolvedValue(true),
    isAvailable: vi.fn().mockResolvedValue(true),
  },
  zoom: {
    setZoomLevel: vi.fn(),
    getZoomLevel: vi.fn().mockReturnValue(0),
    setZoomFactor: vi.fn(),
    getZoomFactor: vi.fn().mockReturnValue(1),
  },
};

Object.defineProperty(globalThis, 'window', {
  value: {
    ...globalThis.window,
    electronAPI: electronAPIMock,
    localStorage: localStorageMock,
  },
  writable: true,
});

// Mock fetch for API tests
globalThis.fetch = vi.fn();

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear();
});

// Export mocks for use in tests
export { localStorageMock, electronAPIMock };
