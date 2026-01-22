import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';
import { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

/**
 * Authentication middleware - verify access token
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization header required' });
    return;
  }

  const token = authHeader.substring(7);

  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET not configured');
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as JWTPayload;
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
      });
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    res.status(401).json({ error: 'Authentication failed' });
  }
}

/**
 * Generate Access Token (JWT, short-lived)
 * Validity: 15 minutes
 */
export function generateAccessToken(payload: {
  userId: string;
  email: string;
  role: UserRole;
}): string {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET not configured');
  }

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '15m', // 15 minutes - short lived
  });
}

/**
 * Generate Refresh Token (random string, long-lived)
 * Saved to database for verification and revocation
 * Returns unhashed token to send to client
 */
export async function generateRefreshToken(userId: string): Promise<string> {
  // Generate random 256-bit token (32 bytes = 256 bits)
  const token = randomBytes(32).toString('hex');

  // Hash token before storing (never store plaintext)
  const tokenHash = createHash('sha256').update(token).digest('hex');

  // Save to database
  await prisma.session.create({
    data: {
      userId,
      token: tokenHash,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  });

  return token; // Return unhashed for client
}

/**
 * Generate both Access and Refresh tokens (convenience function)
 */
export async function generateTokens(payload: {
  userId: string;
  email: string;
  role: UserRole;
}) {
  const accessToken = generateAccessToken(payload);
  const refreshToken = await generateRefreshToken(payload.userId);

  return {
    accessToken,
    refreshToken,
    expiresIn: 15 * 60, // seconds (15 minutes)
  };
}

/**
 * Verify Refresh Token and get user ID
 * Returns userId if valid, null if invalid or expired
 */
export async function verifyRefreshToken(token: string): Promise<string | null> {
  try {
    // Hash the token to compare with DB
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // Look up in database
    const session = await prisma.session.findFirst({
      where: {
        token: tokenHash,
        expiresAt: { gt: new Date() }, // Not expired
      },
    });

    if (!session) return null;

    return session.userId;
  } catch (error) {
    console.error('[Auth] Error verifying refresh token:', error);
    return null;
  }
}

/**
 * Backwards compatibility - old code may still use generateToken
 * Use generateAccessToken or generateTokens instead
 */
export function generateToken(payload: {
  userId: string;
  email: string;
  role: UserRole;
}): string {
  return generateAccessToken(payload);
}
