/**
 * Authentication Service
 * Handles communication with the PR Manager backend for auth and subscriptions
 */

import type { AuthUser } from '../preload';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.prmanager.app';

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface SubscriptionStatus {
  active: boolean;
  status: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  trialEndsAt?: string;
  trialDaysLeft?: number;
  isTrialing?: boolean;
  message?: string;
}

export interface CheckoutResponse {
  sessionId: string;
  url: string;
}

export interface PortalResponse {
  url: string;
}

class AuthService {
  private token: string | null = null;

  /**
   * Initialize the auth service by loading the stored token
   */
  async initialize(): Promise<boolean> {
    try {
      this.token = await window.electronAPI.auth.getToken();
      return !!this.token;
    } catch (error) {
      console.error('Failed to initialize auth service:', error);
      return false;
    }
  }

  /**
   * Get the current token
   */
  getToken(): string | null {
    return this.token;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.token;
  }

  /**
   * Sign up a new user
   */
  async signup(email: string, password: string, name?: string): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create account');
    }

    const data: AuthResponse = await response.json();
    await this.setAuth(data.token, data.user);
    return data;
  }

  /**
   * Log in an existing user
   */
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Invalid email or password');
    }

    const data: AuthResponse = await response.json();
    await this.setAuth(data.token, data.user);
    return data;
  }

  /**
   * Verify the current token is still valid
   */
  async verifyToken(): Promise<{ valid: boolean; user?: AuthUser }> {
    if (!this.token) {
      return { valid: false };
    }

    try {
      const response = await fetch(`${API_URL}/auth/verify-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this.token }),
      });

      if (!response.ok) {
        await this.clearAuth();
        return { valid: false };
      }

      const data = await response.json();
      if (data.valid && data.user) {
        await window.electronAPI.auth.setUser(data.user);
      }
      return data;
    } catch (error) {
      console.error('Token verification failed:', error);
      return { valid: false };
    }
  }

  /**
   * Get subscription status for the current user
   */
  async getSubscriptionStatus(): Promise<SubscriptionStatus> {
    if (!this.token) {
      return { active: false, status: 'none', message: 'Not authenticated' };
    }

    try {
      const response = await fetch(`${API_URL}/subscription/status`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          await this.clearAuth();
          return { active: false, status: 'unauthorized', message: 'Session expired' };
        }
        return { active: false, status: 'error', message: 'Failed to check subscription' };
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get subscription status:', error);
      return { active: false, status: 'error', message: 'Network error' };
    }
  }

  /**
   * Create a checkout session for subscription
   */
  async createCheckoutSession(priceId: 'monthly' | 'yearly'): Promise<CheckoutResponse> {
    if (!this.token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_URL}/subscription/create-checkout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ priceId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create checkout session');
    }

    return await response.json();
  }

  /**
   * Open the Stripe customer portal for subscription management
   */
  async openCustomerPortal(): Promise<PortalResponse> {
    if (!this.token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_URL}/subscription/manage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to open customer portal');
    }

    return await response.json();
  }

  /**
   * Cancel subscription at period end
   */
  async cancelSubscription(): Promise<void> {
    if (!this.token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_URL}/subscription/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to cancel subscription');
    }
  }

  /**
   * Reactivate a subscription that was set to cancel
   */
  async reactivateSubscription(): Promise<void> {
    if (!this.token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_URL}/subscription/reactivate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to reactivate subscription');
    }
  }

  /**
   * Log out the current user
   */
  async logout(): Promise<void> {
    await this.clearAuth();
  }

  /**
   * Store auth data securely
   */
  private async setAuth(token: string, user: AuthUser): Promise<void> {
    this.token = token;
    await window.electronAPI.auth.setToken(token);
    await window.electronAPI.auth.setUser(user);
  }

  /**
   * Clear all auth data
   */
  private async clearAuth(): Promise<void> {
    this.token = null;
    await window.electronAPI.auth.clearToken();
  }
}

// Singleton instance
export const authService = new AuthService();
