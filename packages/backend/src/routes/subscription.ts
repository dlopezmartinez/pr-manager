import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { stripe, STRIPE_PRICES, TRIAL_PERIOD_DAYS } from '../lib/stripe.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * GET /subscription/status
 * Get current user's subscription status
 */
router.get('/status', authenticate, async (req: Request, res: Response) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!subscription) {
      res.json({
        active: false,
        status: 'none',
        message: 'No active subscription',
      });
      return;
    }

    // Check if subscription is active
    const activeStatuses = ['active', 'trialing'];
    const isActive = activeStatuses.includes(subscription.status);

    // Check if trial is still valid
    const isTrialing = subscription.status === 'trialing';
    const trialDaysLeft = isTrialing && subscription.trialEndsAt
      ? Math.ceil((subscription.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : 0;

    res.json({
      active: isActive,
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      trialEndsAt: subscription.trialEndsAt,
      trialDaysLeft: trialDaysLeft > 0 ? trialDaysLeft : 0,
      isTrialing,
    });
  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
});

/**
 * POST /subscription/create-checkout
 * Create a Stripe Checkout session for subscription
 */
router.post('/create-checkout', authenticate, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      priceId: z.enum(['monthly', 'yearly']),
      successUrl: z.string().url().optional(),
      cancelUrl: z.string().url().optional(),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors,
      });
      return;
    }

    const { priceId, successUrl, cancelUrl } = validation.data;

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: { subscription: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Check if user already has an active subscription
    if (user.subscription && ['active', 'trialing'].includes(user.subscription.status)) {
      res.status(400).json({ error: 'You already have an active subscription' });
      return;
    }

    // Get or create Stripe customer
    let customerId = user.subscription?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: {
          userId: user.id,
        },
      });
      customerId = customer.id;
    }

    // Get the actual Stripe price ID
    const stripePriceId = priceId === 'monthly' ? STRIPE_PRICES.MONTHLY : STRIPE_PRICES.YEARLY;

    // Default URLs
    const frontendUrl = process.env.FRONTEND_URL || 'https://prmanager.app';
    const defaultSuccessUrl = `${frontendUrl}/success?session_id={CHECKOUT_SESSION_ID}`;
    const defaultCancelUrl = `${frontendUrl}/pricing`;

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: successUrl || defaultSuccessUrl,
      cancel_url: cancelUrl || defaultCancelUrl,
      subscription_data: {
        trial_period_days: TRIAL_PERIOD_DAYS,
        metadata: {
          userId: user.id,
        },
      },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      customer_update: {
        address: 'auto',
        name: 'auto',
      },
    });

    res.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('Create checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

/**
 * POST /subscription/manage
 * Create a Stripe Customer Portal session for subscription management
 */
router.post('/manage', authenticate, async (req: Request, res: Response) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!subscription) {
      res.status(404).json({ error: 'No subscription found' });
      return;
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://prmanager.app';

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${frontendUrl}/settings`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Create portal session error:', error);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

/**
 * POST /subscription/cancel
 * Cancel subscription at period end
 */
router.post('/cancel', authenticate, async (req: Request, res: Response) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!subscription) {
      res.status(404).json({ error: 'No subscription found' });
      return;
    }

    // Cancel at period end via Stripe
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    // Update local record
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true },
    });

    res.json({
      message: 'Subscription will be canceled at the end of the billing period',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: subscription.currentPeriodEnd,
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

/**
 * POST /subscription/reactivate
 * Reactivate a subscription that was set to cancel at period end
 */
router.post('/reactivate', authenticate, async (req: Request, res: Response) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!subscription) {
      res.status(404).json({ error: 'No subscription found' });
      return;
    }

    if (!subscription.cancelAtPeriodEnd) {
      res.status(400).json({ error: 'Subscription is not scheduled for cancellation' });
      return;
    }

    // Reactivate via Stripe
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    // Update local record
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: false },
    });

    res.json({
      message: 'Subscription reactivated successfully',
      cancelAtPeriodEnd: false,
    });
  } catch (error) {
    console.error('Reactivate subscription error:', error);
    res.status(500).json({ error: 'Failed to reactivate subscription' });
  }
});

export default router;
