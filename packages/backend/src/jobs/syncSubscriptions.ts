/**
 * Subscription Sync Job
 * Runs nightly to synchronize subscription statuses
 * Handles cases where webhooks may have failed or been delayed
 */

import { prisma } from '../lib/prisma.js';

/**
 * Sync subscriptions that have expired based on currentPeriodEnd
 * Updates status from 'active'/'on_trial' to 'expired' if the end date has passed
 */
export async function syncExpiredSubscriptions(): Promise<void> {
  const now = new Date();

  try {
    console.log('[SyncSubscriptions] Starting subscription sync...');

    // Find all active or trialing subscriptions where currentPeriodEnd has passed
    const expiredSubscriptions = await prisma.subscription.findMany({
      where: {
        status: {
          in: ['active', 'on_trial'],
        },
        currentPeriodEnd: {
          lt: now,
        },
      },
    });

    if (expiredSubscriptions.length === 0) {
      console.log('[SyncSubscriptions] No expired subscriptions found');
      return;
    }

    console.log(`[SyncSubscriptions] Found ${expiredSubscriptions.length} expired subscriptions to update`);

    // Update all expired subscriptions
    const result = await prisma.subscription.updateMany({
      where: {
        status: {
          in: ['active', 'on_trial'],
        },
        currentPeriodEnd: {
          lt: now,
        },
      },
      data: {
        status: 'expired',
      },
    });

    console.log(`[SyncSubscriptions] Updated ${result.count} subscriptions to expired status`);
  } catch (error) {
    console.error('[SyncSubscriptions] Error syncing subscriptions:', error);
    throw error;
  }
}

/**
 * Sync trial subscriptions that have reached their trial end date
 * Updates status from 'on_trial' to 'expired' if trialEndsAt has passed
 */
export async function syncExpiredTrials(): Promise<void> {
  const now = new Date();

  try {
    console.log('[SyncSubscriptions] Starting trial sync...');

    // Find all trial subscriptions where trialEndsAt has passed
    const expiredTrials = await prisma.subscription.findMany({
      where: {
        status: 'on_trial',
        trialEndsAt: {
          not: null,
          lt: now,
        },
      },
    });

    if (expiredTrials.length === 0) {
      console.log('[SyncSubscriptions] No expired trials found');
      return;
    }

    console.log(`[SyncSubscriptions] Found ${expiredTrials.length} expired trials to update`);

    // Update all expired trials
    const result = await prisma.subscription.updateMany({
      where: {
        status: 'on_trial',
        trialEndsAt: {
          not: null,
          lt: now,
        },
      },
      data: {
        status: 'expired',
      },
    });

    console.log(`[SyncSubscriptions] Updated ${result.count} trials to expired status`);
  } catch (error) {
    console.error('[SyncSubscriptions] Error syncing trials:', error);
    throw error;
  }
}

/**
 * Run all subscription sync operations
 */
export async function runSubscriptionSync(): Promise<void> {
  try {
    console.log('[SyncSubscriptions] Starting full subscription sync cycle');
    await syncExpiredSubscriptions();
    await syncExpiredTrials();
    console.log('[SyncSubscriptions] Subscription sync cycle completed successfully');
  } catch (error) {
    console.error('[SyncSubscriptions] Subscription sync cycle failed:', error);
    // Don't re-throw - we want the job to continue on next scheduled run
  }
}
