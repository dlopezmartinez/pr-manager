/**
 * Secure Storage Module
 * Uses Electron's safeStorage API to encrypt sensitive data
 *
 * Data is encrypted using OS-level encryption:
 * - macOS: Keychain
 * - Windows: DPAPI
 * - Linux: libsecret or kwallet
 */

import { safeStorage, app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface SecureData {
  [key: string]: string; // encrypted base64 strings
}

const SECURE_FILE_NAME = 'secure-storage.json';

/**
 * Get the path to the secure storage file
 */
function getStoragePath(): string {
  return path.join(app.getPath('userData'), SECURE_FILE_NAME);
}

/**
 * Load encrypted data from disk
 */
function loadSecureData(): SecureData {
  try {
    const filePath = getStoragePath();
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Error loading secure storage:', error);
  }
  return {};
}

/**
 * Save encrypted data to disk
 */
function saveSecureData(data: SecureData): void {
  try {
    const filePath = getStoragePath();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving secure storage:', error);
  }
}

/**
 * Check if encryption is available on this system
 */
export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

/**
 * Store a value securely (encrypted)
 */
export function setSecureValue(key: string, value: string): boolean {
  if (!safeStorage.isEncryptionAvailable()) {
    console.error('Encryption not available - cannot store sensitive data securely');
    return false;
  }

  try {
    const encrypted = safeStorage.encryptString(value);
    const data = loadSecureData();
    data[key] = encrypted.toString('base64');
    saveSecureData(data);
    return true;
  } catch (error) {
    console.error('Error encrypting value:', error);
    return false;
  }
}

/**
 * Retrieve a securely stored value (decrypted)
 */
export function getSecureValue(key: string): string | null {
  const data = loadSecureData();
  const encryptedBase64 = data[key];

  if (!encryptedBase64) {
    return null;
  }

  if (!safeStorage.isEncryptionAvailable()) {
    console.error('Encryption not available - cannot retrieve sensitive data securely');
    return null;
  }

  try {
    const encrypted = Buffer.from(encryptedBase64, 'base64');
    return safeStorage.decryptString(encrypted);
  } catch (error) {
    console.error('Error decrypting value:', error);
    return null;
  }
}

/**
 * Delete a securely stored value
 */
export function deleteSecureValue(key: string): boolean {
  try {
    const data = loadSecureData();
    if (key in data) {
      delete data[key];
      saveSecureData(data);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting secure value:', error);
    return false;
  }
}

/**
 * Clear all secure storage
 */
export function clearSecureStorage(): boolean {
  try {
    const filePath = getStoragePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return true;
  } catch (error) {
    console.error('Error clearing secure storage:', error);
    return false;
  }
}
