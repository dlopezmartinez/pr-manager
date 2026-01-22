import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { prisma } from '../lib/prisma.js';
import { verifyStripeWebhook } from '../middleware/stripe.js';

const router = Router();

/**
 * POST /webhooks/stripe
 * Handle Stripe webhook events
 * Note: This route uses raw body parsing for signature verification
 */
router.post('/stripe', verifyStripeWebhook, async (req: Request, res: Response) => {
  const event = req.stripeEvent!;

  console.log(`Received Stripe webhook: ${event.type}`);

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleTrialWillEnd(subscription);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error(`Error handling webhook ${event.type}:`, error);
    // Return 200 to prevent Stripe from retrying
    // Log the error for debugging
    res.json({ received: true, error: 'Handler error' });
  }
});

/**
 * Handle subscription created or updated
 */
async function handleSubscriptionUpdate(subscription: Stripe.Subscription): Promise<void> {
  const userId = subscription.metadata.userId;

  if (!userId) {
    console.error('No userId in subscription metadata:', subscription.id);
    return;
  }

  const priceId = subscription.items.data[0]?.price.id;

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: subscription.id },
    update: {
      status: subscription.status,
      stripePriceId: priceId,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    },
    create: {
      userId,
      stripeCustomerId: subscription.customer as string,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    },
  });

  console.log(`Subscription ${subscription.id} updated for user ${userId}: ${subscription.status}`);
}

/**
 * Handle subscription deleted
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: { status: 'canceled' },
  });

  console.log(`Subscription ${subscription.id} marked as canceled`);
}

/**
 * Handle trial ending soon (typically 3 days before)
 */
async function handleTrialWillEnd(subscription: Stripe.Subscription): Promise<void> {
  const userId = subscription.metadata.userId;

  if (!userId) {
    console.error('No userId in subscription metadata for trial ending:', subscription.id);
    return;
  }

  // Here you could send an email notification to the user
  // Or trigger an in-app notification
  console.log(`Trial ending soon for user ${userId}, subscription ${subscription.id}`);

  // TODO: Implement email notification
  // await sendEmail(userId, 'trial_ending_soon', { trialEnd: subscription.trial_end });
}

/**
 * Handle successful payment
 */
async function handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) {
    // Not a subscription invoice
    return;
  }

  console.log(`Payment succeeded for subscription ${subscriptionId}`);

  // Update subscription status if it was past_due
  await prisma.subscription.updateMany({
    where: {
      stripeSubscriptionId: subscriptionId,
      status: 'past_due',
    },
    data: { status: 'active' },
  });
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) {
    return;
  }

  console.log(`Payment failed for subscription ${subscriptionId}`);

  // The subscription status will be updated via subscription.updated webhook
  // Here you could send an email notification to the user

  // TODO: Implement email notification
  // const subscription = await prisma.subscription.findUnique({
  //   where: { stripeSubscriptionId: subscriptionId },
  //   include: { user: true },
  // });
  // if (subscription) {
  //   await sendEmail(subscription.userId, 'payment_failed', {});
  // }
}

/**
 * Handle checkout session completed
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  console.log(`Checkout completed: ${session.id}`);

  // The subscription will be created via subscription.created webhook
  // This event can be used for analytics or sending welcome emails

  if (session.customer_email) {
    console.log(`New customer checkout: ${session.customer_email}`);
    // TODO: Send welcome email
    // await sendEmail(session.customer_email, 'welcome', {});
  }
}

export default router;
