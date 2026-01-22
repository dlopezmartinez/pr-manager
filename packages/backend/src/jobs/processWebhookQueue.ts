import { prisma } from '../lib/prisma.js';
import { logWebhookError } from '../services/webhookAudit.js';

/**
 * Process webhook retry queue
 * Run periodically (job scheduler)
 */
export async function processWebhookQueue(): Promise<void> {
  const now = new Date();

  try {
    console.log('[WebhookQueue] Starting processing...');

    // Find webhooks ready for retry
    const readyForRetry = await prisma.webhookQueue.findMany({
      where: {
        nextRetry: { lte: now },
      },
      include: {
        webhookEvent: true,
      },
    });

    if (readyForRetry.length === 0) {
      console.log('[WebhookQueue] No webhooks to retry');
      return;
    }

    console.log(`[WebhookQueue] Processing ${readyForRetry.length} webhook retries`);

    for (const queueItem of readyForRetry) {
      try {
        const event = queueItem.webhookEvent;

        console.log(
          `[WebhookQueue] Retrying: ${event.eventName} (attempt ${queueItem.retryCount})`
        );

        // Re-process the webhook - mark as unprocessed so it can be retried
        // In production, this would call the actual webhook handlers
        // For now, we mark it as unprocessed and let the manual replay handle it

        // Update event to allow reprocessing
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: {
            processed: false,
            error: null,
          },
        });

        // Remove from queue so it doesn't retry again immediately
        await prisma.webhookQueue.delete({
          where: { id: queueItem.id },
        });

        console.log(`[WebhookQueue] Reset webhook for manual replay: ${event.id}`);
      } catch (error) {
        console.error('[WebhookQueue] Error retrying webhook:', error);
        try {
          await logWebhookError(queueItem.webhookEventId, error as Error, false);
        } catch (auditError) {
          console.error('[WebhookQueue] Failed to log retry error:', auditError);
        }
      }
    }

    console.log('[WebhookQueue] Processing complete');
  } catch (error) {
    console.error('[WebhookQueue] Fatal error:', error);
  }
}
