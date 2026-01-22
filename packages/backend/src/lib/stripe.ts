import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
  typescript: true,
});

export const STRIPE_PRICES = {
  MONTHLY: process.env.STRIPE_PRICE_MONTHLY || 'price_monthly',
  YEARLY: process.env.STRIPE_PRICE_YEARLY || 'price_yearly',
} as const;

export const TRIAL_PERIOD_DAYS = 14;
