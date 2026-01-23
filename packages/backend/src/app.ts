import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';

import authRoutes from './routes/auth.js';
import subscriptionRoutes from './routes/subscription.js';
import webhookRoutes from './routes/webhook.js';
import checkoutRoutes from './routes/checkout.js';
import downloadRoutes from './routes/download.js';
import adminRoutes from './routes/admin.js';
import {
  loginLimiter,
  signupLimiter,
  globalLimiter,
} from './middleware/rateLimit.js';
import { requestLogger, errorLogger } from './middleware/requestLogger.js';
import logger from './lib/logger.js';

export function createApp() {
  const app = express();

  // CORS configuration
  const corsOptions = {
    origin: process.env.CORS_ORIGINS?.split(',') || [
      'http://localhost:5173',
      'https://prmanager.app',
      'https://www.prmanager.app',
    ],
    credentials: true,
  };

  app.use(cors(corsOptions));

  // Request logging (early to capture all requests)
  app.use(requestLogger);

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow embedding from other origins (needed for some integrations)
  }));

  // Webhook routes need raw body for LemonSqueezy signature verification
  // Must be before express.json() middleware
  app.use('/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

  // JSON body parser for other routes
  app.use(express.json());

  // Global rate limiter (applies to all routes)
  app.use(globalLimiter);

  // Health check endpoint (no rate limit)
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    });
  });

  // API routes
  app.use('/auth', authRoutes);
  app.use('/subscription', subscriptionRoutes);
  app.use('/checkout', checkoutRoutes);
  app.use('/download', downloadRoutes);
  app.use('/admin', adminRoutes);

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error logging middleware (logs errors with request context)
  app.use(errorLogger);

  // Global error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    // Error already logged by errorLogger middleware
    const statusCode = res.statusCode !== 200 ? res.statusCode : 500;

    res.status(statusCode).json({
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      ...(req.requestId && { requestId: req.requestId }),
    });
  });

  return app;
}
