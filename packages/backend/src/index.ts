import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

import authRoutes from './routes/auth.js';
import subscriptionRoutes from './routes/subscription.js';
import webhookRoutes from './routes/webhook.js';
import checkoutRoutes from './routes/checkout.js';
import downloadRoutes from './routes/download.js';
import { scheduleDaily, startScheduler, getSchedulerStatus } from './services/scheduler.js';
import { runSubscriptionSync } from './jobs/syncSubscriptions.js';

const app = express();
const PORT = process.env.PORT || 3001;

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

// Webhook routes need raw body for LemonSqueezy signature verification
// Must be before express.json() middleware
app.use('/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

// JSON body parser for other routes
app.use(express.json());

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

// Scheduler status endpoint (for monitoring)
app.get('/health/scheduler', (req: Request, res: Response) => {
  res.json(getSchedulerStatus());
});

// API routes
app.use('/auth', authRoutes);
app.use('/subscription', subscriptionRoutes);
app.use('/checkout', checkoutRoutes);
app.use('/download', downloadRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`PR Manager API server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

  if (process.env.NODE_ENV !== 'production') {
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Scheduler status: http://localhost:${PORT}/health/scheduler`);
  }

  // Register and start scheduled jobs
  // Sync subscriptions daily at 2:00 AM UTC
  scheduleDaily('syncSubscriptions', runSubscriptionSync, 2);

  // Start the scheduler
  startScheduler();
});

export default app;
