import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { LEMONSQUEEZY_CONFIG, lemonSqueezyFetch, LemonSqueezyResponse, LemonSqueezyCheckout } from '../lib/lemonsqueezy.js';

const router = Router();

/**
 * POST /checkout/create
 * Create a public LemonSqueezy Checkout session (no auth required)
 * Used by landing page for new customers
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      priceId: z.enum(['monthly', 'yearly']),
      email: z.string().email().optional(),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors,
      });
      return;
    }

    const { priceId, email } = validation.data;

    // Get the variant ID based on price selection
    const variantId = priceId === 'monthly'
      ? LEMONSQUEEZY_CONFIG.VARIANT_MONTHLY
      : LEMONSQUEEZY_CONFIG.VARIANT_YEARLY;

    if (!variantId) {
      res.status(500).json({ error: 'Payment configuration error' });
      return;
    }

    // Create checkout without requiring user account
    // LemonSqueezy will collect email during checkout if not provided
    const checkoutData: Record<string, unknown> = {
      custom: {
        plan: priceId,
        source: 'landing',
      },
    };

    // Pre-fill email if provided
    if (email) {
      checkoutData.email = email;
    }

    const response = await lemonSqueezyFetch<LemonSqueezyResponse<LemonSqueezyCheckout>>(
      '/checkouts',
      {
        method: 'POST',
        body: JSON.stringify({
          data: {
            type: 'checkouts',
            attributes: {
              checkout_data: checkoutData,
              checkout_options: {
                embed: false,
                media: true,
                button_color: '#0ea5e9',
              },
              product_options: {
                enabled_variants: [parseInt(variantId)],
                redirect_url: `${process.env.FRONTEND_URL || 'https://prmanager.app'}/success`,
              },
              expires_at: null,
            },
            relationships: {
              store: {
                data: {
                  type: 'stores',
                  id: LEMONSQUEEZY_CONFIG.STORE_ID,
                },
              },
              variant: {
                data: {
                  type: 'variants',
                  id: variantId,
                },
              },
            },
          },
        }),
      }
    );

    res.json({
      url: response.data.attributes.url,
      checkoutId: response.data.id,
    });
  } catch (error) {
    console.error('Create public checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

export default router;
