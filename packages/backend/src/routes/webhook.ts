import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { verifyLemonSqueezyWebhook, LemonSqueezyWebhookEvent } from '../middleware/lemonsqueezy.js';
import { authenticate } from '../middleware/auth.js';
import {
  logWebhookEvent,
  markWebhookProcessed,
  logWebhookError,
} from '../services/webhookAudit.js';

const router = Router();

/**
 * POST /webhooks/lemonsqueezy
 * Handle LemonSqueezy webhook events with audit trail
 * Note: This route uses raw body parsing for signature verification
 */
router.post('/lemonsqueezy', verifyLemonSqueezyWebhook, async (req: Request, res: Response) => {
  const event = req.lemonSqueezyEvent!;
  const eventName = event.meta.event_name;
  const eventId = event.data.id; // LemonSqueezy event ID for deduplication

  console.log(`[Webhook] Received: ${eventName} (${eventId})`);

  let webhookEventId: string = '';

  try {
    // PASO 1: LOG INMEDIATAMENTE (antes de procesar)
    webhookEventId = await logWebhookEvent(eventId, eventName, event.data);

    // PASO 2: Procesamiento (con try-catch)
    switch (eventName) {
      case 'subscription_created':
        await handleSubscriptionCreated(event);
        break;

      case 'subscription_updated':
        await handleSubscriptionUpdated(event);
        break;

      case 'subscription_cancelled':
        await handleSubscriptionCancelled(event);
        break;

      case 'subscription_resumed':
        await handleSubscriptionResumed(event);
        break;

      case 'subscription_expired':
        await handleSubscriptionExpired(event);
        break;

      case 'subscription_paused':
        await handleSubscriptionPaused(event);
        break;

      case 'subscription_unpaused':
        await handleSubscriptionUnpaused(event);
        break;

      case 'subscription_payment_success':
        await handlePaymentSuccess(event);
        break;

      case 'subscription_payment_failed':
        await handlePaymentFailed(event);
        break;

      default:
        console.log(`[Webhook] Unhandled event type: ${eventName}`);
    }

    // PASO 3: Mark as processed successfully
    await markWebhookProcessed(webhookEventId);

    // PASO 4: SIEMPRE respond 200 (LemonSqueezy requirement)
    res.json({ received: true, eventId: webhookEventId });
  } catch (error) {
    console.error(`[Webhook] Error handling ${eventName}:`, error);

    // Log error to audit trail (pero no re-throw)
    if (webhookEventId) {
      await logWebhookError(webhookEventId, error as Error, true);
    }

    // IMPORTANTE: Still return 200 to LemonSqueezy
    // Error is logged in audit trail and will be retried
    res.json({
      received: true,
      eventId: webhookEventId,
      warning: 'Processing failed but logged for retry',
    });
  }
});

/**
 * Handle subscription created
 */
async function handleSubscriptionCreated(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data, meta } = event;
  const userId = meta.custom_data?.user_id;

  if (!userId) {
    console.error('No user_id in subscription custom_data:', data.id);
    return;
  }

  const attrs = data.attributes;

  // Calculate period dates
  const now = new Date();
  const renewsAt = attrs.renews_at ? new Date(attrs.renews_at) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  await prisma.subscription.upsert({
    where: { lemonSqueezySubscriptionId: data.id },
    update: {
      status: attrs.status,
      lemonSqueezyVariantId: String(attrs.variant_id),
      currentPeriodStart: now,
      currentPeriodEnd: renewsAt,
      cancelAtPeriodEnd: attrs.cancelled,
      trialEndsAt: attrs.trial_ends_at ? new Date(attrs.trial_ends_at) : null,
    },
    create: {
      userId,
      lemonSqueezyCustomerId: String(attrs.customer_id),
      lemonSqueezySubscriptionId: data.id,
      lemonSqueezyVariantId: String(attrs.variant_id),
      status: attrs.status,
      currentPeriodStart: now,
      currentPeriodEnd: renewsAt,
      cancelAtPeriodEnd: attrs.cancelled,
      trialEndsAt: attrs.trial_ends_at ? new Date(attrs.trial_ends_at) : null,
    },
  });

  console.log(`Subscription ${data.id} created for user ${userId}: ${attrs.status}`);
}

/**
 * Handle subscription updated
 */
async function handleSubscriptionUpdated(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;
  const attrs = data.attributes;

  const renewsAt = attrs.renews_at ? new Date(attrs.renews_at) : undefined;

  await prisma.subscription.updateMany({
    where: { lemonSqueezySubscriptionId: data.id },
    data: {
      status: attrs.status,
      lemonSqueezyVariantId: String(attrs.variant_id),
      currentPeriodEnd: renewsAt,
      cancelAtPeriodEnd: attrs.cancelled,
      trialEndsAt: attrs.trial_ends_at ? new Date(attrs.trial_ends_at) : null,
    },
  });

  console.log(`Subscription ${data.id} updated: ${attrs.status}`);
}

/**
 * Handle subscription cancelled (set to cancel at period end)
 */
async function handleSubscriptionCancelled(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;
  const attrs = data.attributes;

  await prisma.subscription.updateMany({
    where: { lemonSqueezySubscriptionId: data.id },
    data: {
      status: attrs.status,
      cancelAtPeriodEnd: true,
    },
  });

  console.log(`Subscription ${data.id} cancelled (will end at period end)`);
}

/**
 * Handle subscription resumed
 */
async function handleSubscriptionResumed(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;
  const attrs = data.attributes;

  await prisma.subscription.updateMany({
    where: { lemonSqueezySubscriptionId: data.id },
    data: {
      status: attrs.status,
      cancelAtPeriodEnd: false,
    },
  });

  console.log(`Subscription ${data.id} resumed`);
}

/**
 * Handle subscription expired
 */
async function handleSubscriptionExpired(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;

  await prisma.subscription.updateMany({
    where: { lemonSqueezySubscriptionId: data.id },
    data: {
      status: 'expired',
    },
  });

  console.log(`Subscription ${data.id} expired`);
}

/**
 * Handle subscription paused
 */
async function handleSubscriptionPaused(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;

  await prisma.subscription.updateMany({
    where: { lemonSqueezySubscriptionId: data.id },
    data: {
      status: 'paused',
    },
  });

  console.log(`Subscription ${data.id} paused`);
}

/**
 * Handle subscription unpaused
 */
async function handleSubscriptionUnpaused(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;
  const attrs = data.attributes;

  await prisma.subscription.updateMany({
    where: { lemonSqueezySubscriptionId: data.id },
    data: {
      status: attrs.status,
    },
  });

  console.log(`Subscription ${data.id} unpaused`);
}

/**
 * Handle successful payment
 */
async function handlePaymentSuccess(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;
  const attrs = data.attributes;

  // Update status to active if it was past_due
  await prisma.subscription.updateMany({
    where: {
      lemonSqueezySubscriptionId: data.id,
      status: 'past_due',
    },
    data: {
      status: 'active',
      currentPeriodEnd: attrs.renews_at ? new Date(attrs.renews_at) : undefined,
    },
  });

  console.log(`Payment succeeded for subscription ${data.id}`);
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;

  console.log(`Payment failed for subscription ${data.id}`);

  // Status will be updated via subscription_updated webhook
  // Here you could send an email notification to the user

  // TODO: Implement email notification
  // const subscription = await prisma.subscription.findUnique({
  //   where: { lemonSqueezySubscriptionId: data.id },
  //   include: { user: true },
  // });
  // if (subscription) {
  //   await sendEmail(subscription.user.email, 'payment_failed', {});
  // }
}

// Helper to safely extract query params
function getQueryString(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function getQueryNumber(value: string | string[] | undefined, defaultValue: number): number {
  const str = getQueryString(value);
  if (!str) return defaultValue;
  const num = parseInt(str, 10);
  return isNaN(num) ? defaultValue : num;
}

/**
 * GET /webhooks/audit/events
 * List all webhook events (with pagination)
 * Admin only (requires authentication)
 */
router.get('/audit/events', authenticate, async (req: Request, res: Response) => {
  try {
    const skip = getQueryNumber(req.query.skip as any, 0);
    const take = Math.min(getQueryNumber(req.query.take as any, 100), 100);
    const processedParam = getQueryString(req.query.processed as any);

    const where: any = {};
    if (processedParam === 'true') where.processed = true;
    if (processedParam === 'false') where.processed = false;

    const events = await prisma.webhookEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });

    res.json(events);
  } catch (error) {
    console.error('[Webhook] Error fetching audit events:', error);
    res.status(500).json({ error: 'Failed to fetch audit events' });
  }
});

/**
 * GET /webhooks/audit/events/:id
 * Get specific webhook event details
 */
router.get('/audit/events/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const event = await prisma.webhookEvent.findUnique({
      where: { id },
      include: { queueItem: true },
    });

    if (!event) {
      res.status(404).json({ error: 'Webhook event not found' });
      return;
    }

    res.json(event);
  } catch (error) {
    console.error('[Webhook] Error fetching event details:', error);
    res.status(500).json({ error: 'Failed to fetch event details' });
  }
});

/**
 * POST /webhooks/audit/events/:id/replay
 * Replay a failed webhook
 * Admin only (requires authentication)
 */
router.post('/audit/events/:id/replay', authenticate, async (req: Request, res: Response) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const event = await prisma.webhookEvent.findUnique({
      where: { id },
    });

    if (!event) {
      res.status(404).json({ error: 'Webhook event not found' });
      return;
    }

    // Reset for reprocessing
    await prisma.webhookEvent.update({
      where: { id },
      data: {
        processed: false,
        error: null,
        errorCount: 0,
      },
    });

    res.json({ message: 'Webhook queued for replay', eventId: id });
  } catch (error) {
    console.error('[Webhook] Error replaying event:', error);
    res.status(500).json({ error: 'Failed to replay event' });
  }
});

export default router;
