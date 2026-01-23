import { Request, Response, NextFunction } from 'express';
import { hashSecret, getAdminSecretByHash, updateLastUsed } from '../services/adminSecretService.js';

/**
 * Admin Secret Middleware
 *
 * Supports TWO types of admin secrets:
 *
 * 1. GLOBAL ADMIN SECRET (legacy, for initial setup):
 *    Environment variable: ADMIN_SECRET_KEY
 *    Usage: Authorization: AdminSecret your-global-secret
 *    Use case: Initial testing before any users exist
 *
 * 2. PER-USER ADMIN SECRETS (recommended):
 *    Stored in database, one per SUPERUSER
 *    Created with: npm run admin:create-secret
 *    Usage: Authorization: AdminSecret user-specific-secret
 *    Use case: Production - each admin has their own secret
 *
 * How it works:
 * 1. Check Authorization header for "AdminSecret <secret>"
 * 2. Try global secret first (if configured)
 * 3. Try per-user secrets in database
 * 4. If valid, set req.user with admin info + secret metadata
 * 5. Log usage for audit trail
 */

export async function requireAdminSecret(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  // Check for AdminSecret format
  if (!authHeader || !authHeader.startsWith('AdminSecret ')) {
    next();
    return;
  }

  const providedSecret = authHeader.substring('AdminSecret '.length).trim();

  // Try global admin secret first (if configured)
  const globalSecret = process.env.ADMIN_SECRET_KEY;
  if (globalSecret && providedSecret === globalSecret) {
    (req as any).adminSecretValid = true;
    (req as any).secretType = 'global';
    console.log('[AdminSecret] Accessed with global admin secret');
    next();
    return;
  }

  // Try per-user secrets in database
  try {
    const secretHash = hashSecret(providedSecret);
    const adminSecret = await getAdminSecretByHash(secretHash);

    if (!adminSecret) {
      res.status(401).json({ error: 'Invalid admin secret' });
      return;
    }

    // Check if revoked
    if (adminSecret.revokedAt) {
      res.status(401).json({ error: 'Admin secret has been revoked' });
      return;
    }

    // Valid! Set user context with secret info
    (req as any).user = {
      userId: adminSecret.userId,
      email: adminSecret.user.email,
      role: 'SUPERUSER',
    };
    (req as any).adminSecretValid = true;
    (req as any).secretType = 'user-secret';
    (req as any).secretId = adminSecret.id;
    (req as any).secretName = adminSecret.name;

    // Update last used (non-blocking)
    updateLastUsed(adminSecret.id).catch(console.error);

    console.log('[AdminSecret] Accessed with user secret', {
      userId: adminSecret.userId,
      email: adminSecret.user.email,
      secretName: adminSecret.name,
    });

    next();
    return;
  } catch (error) {
    console.error('[AdminSecret] Error validating secret', error);
    res.status(401).json({ error: 'Invalid admin secret' });
    return;
  }
}
