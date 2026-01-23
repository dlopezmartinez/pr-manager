import { test, expect } from '@playwright/test';
import { apiRequest, signupUser, loginUser } from './fixtures';

/**
 * Security Tests - Essential checks only
 */
test.describe('Security', () => {
  test('admin endpoints require authentication', async ({}) => {
    const endpoints = ['/admin/health', '/admin/users', '/admin/sessions'];

    for (const endpoint of endpoints) {
      const response = await apiRequest('GET', endpoint);
      expect(response.status).toBe(401);
    }
  });

  test('admin endpoints reject invalid tokens', async ({}) => {
    const response = await apiRequest('GET', '/admin/health', undefined, 'invalid-token');
    expect(response.status).toBe(401);
  });

  test('login response does not expose password', async ({}) => {
    const email = `sec-${Date.now()}@example.com`;

    await signupUser(email, 'SecurePass123!');
    const login = await loginUser(email, 'SecurePass123!');

    expect(login?.user).toBeTruthy();
    expect(login?.user?.passwordHash).toBeUndefined();
    expect(login?.user?.password).toBeUndefined();
  });

  test('handles SQL injection safely', async ({}) => {
    const malicious = "'; DROP TABLE users; --";
    const response = await apiRequest('GET', `/admin/users?search=${encodeURIComponent(malicious)}`);
    // Should return 401 (no auth), not crash
    expect(response.status).toBe(401);
  });
});
