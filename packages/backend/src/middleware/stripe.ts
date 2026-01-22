import { Request, Response, NextFunction } from 'express';
import { stripe } from '../lib/stripe.js';
import Stripe from 'stripe';

declare global {
  namespace Express {
    interface Request {
      stripeEvent?: Stripe.Event;
    }
  }
}

export function verifyStripeWebhook(req: Request, res: Response, next: NextFunction): void {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    res.status(400).json({ error: 'Missing stripe-signature header' });
    return;
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  try {
    // req.body should be the raw buffer for webhook verification
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    req.stripeEvent = event;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Webhook signature verification failed:', message);
    res.status(400).json({ error: `Webhook Error: ${message}` });
  }
}
