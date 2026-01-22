import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';

export interface WebhookAuditLog {
  eventId: string;
  eventName: string;
  data: Record<string, unknown>;
}

/**
 * Log webhook event to audit trail (INMEDIATO, antes de procesamiento)
 * Garantiza que nunca perdamos datos aunque el procesamiento falle
 */
export async function logWebhookEvent(
  eventId: string,
  eventName: string,
  data: Record<string, unknown>
): Promise<string> {
  try {
    const event = await prisma.webhookEvent.create({
      data: {
        eventId,
        eventName,
        data: data as Prisma.InputJsonValue,
        processed: false,
      },
    });

    console.log(`[WebhookAudit] Event logged: ${eventName} (${eventId})`);
    return event.id;
  } catch (error) {
    // Check if this is a unique constraint violation (duplicate event ID)
    if (error instanceof Error && error.message.includes('unique constraint')) {
      console.warn(`[WebhookAudit] Duplicate event ID: ${eventId}, using existing record`);
      const existing = await prisma.webhookEvent.findUnique({
        where: { eventId },
      });
      if (existing) {
        return existing.id;
      }
    }

    console.error('[WebhookAudit] Failed to log webhook event:', error);
    throw error;
  }
}

/**
 * Mark webhook as successfully processed
 */
export async function markWebhookProcessed(
  webhookEventId: string
): Promise<void> {
  await prisma.webhookEvent.update({
    where: { id: webhookEventId },
    data: {
      processed: true,
      processedAt: new Date(),
    },
  });

  console.log(`[WebhookAudit] Event marked processed: ${webhookEventId}`);
}

/**
 * Log webhook processing error and enqueue for retry
 */
export async function logWebhookError(
  webhookEventId: string,
  error: Error | string,
  shouldRetry = true
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : String(error);

  const updated = await prisma.webhookEvent.update({
    where: { id: webhookEventId },
    data: {
      error: errorMessage,
      errorCount: { increment: 1 },
    },
  });

  console.error(
    `[WebhookAudit] Event error (attempt ${updated.errorCount}): ${webhookEventId}`,
    errorMessage
  );

  if (shouldRetry && updated.errorCount < 5) {
    // Enqueue for retry
    const delayMs = getRetryDelay(updated.errorCount);
    await enqueueForRetry(webhookEventId, delayMs);
  }
}

/**
 * Calculate exponential backoff delay
 * Attempt 1: 5 min
 * Attempt 2: 30 min
 * Attempt 3: 2 hours
 * Attempt 4: 24 hours
 */
function getRetryDelay(attemptNumber: number): number {
  const delays = [
    5 * 60 * 1000,        // 5 minutes
    30 * 60 * 1000,       // 30 minutes
    2 * 60 * 60 * 1000,   // 2 hours
    24 * 60 * 60 * 1000,  // 24 hours
  ];

  return delays[Math.min(attemptNumber - 1, delays.length - 1)];
}

/**
 * Enqueue webhook for retry
 */
export async function enqueueForRetry(
  webhookEventId: string,
  delayMs: number
): Promise<void> {
  const nextRetry = new Date(Date.now() + delayMs);

  // Check if already in queue
  const existing = await prisma.webhookQueue.findUnique({
    where: { webhookEventId },
  });

  if (existing) {
    // Update existing queue item
    await prisma.webhookQueue.update({
      where: { webhookEventId },
      data: {
        nextRetry,
        retryCount: { increment: 1 },
      },
    });
  } else {
    // Create new queue item
    await prisma.webhookQueue.create({
      data: {
        webhookEventId,
        nextRetry,
        retryCount: 1,
      },
    });
  }

  console.log(
    `[WebhookAudit] Event enqueued for retry: ${webhookEventId} at ${nextRetry.toISOString()}`
  );
}

/**
 * Get webhook event details (para debugging)
 */
export async function getWebhookEvent(webhookEventId: string) {
  return prisma.webhookEvent.findUnique({
    where: { id: webhookEventId },
    include: {
      queueItem: true,
    },
  });
}

/**
 * Get pending webhooks for replay/investigation
 */
export async function getPendingWebhooks(limit = 100) {
  return prisma.webhookEvent.findMany({
    where: {
      processed: false,
      errorCount: { lt: 5 },
    },
    include: {
      queueItem: true,
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
}

/**
 * Get failed webhooks (error_count >= 5)
 */
export async function getFailedWebhooks(limit = 100) {
  return prisma.webhookEvent.findMany({
    where: {
      errorCount: { gte: 5 },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Replay a specific webhook (para testing/debugging)
 */
export async function replayWebhook(webhookEventId: string) {
  const event = await getWebhookEvent(webhookEventId);

  if (!event) {
    throw new Error(`Webhook event not found: ${webhookEventId}`);
  }

  // Re-process the event
  console.log(`[WebhookAudit] Replaying webhook: ${webhookEventId}`);

  // El webhook será procesado por el scheduler
  await prisma.webhookEvent.update({
    where: { id: webhookEventId },
    data: {
      processed: false,
      error: null,
    },
  });
}
