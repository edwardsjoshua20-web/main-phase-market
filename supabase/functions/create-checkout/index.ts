import { handleCors } from '../_shared/cors.ts';
import { getEnv } from '../_shared/env.ts';
import { buildOrderFromCheckoutSession, getStripeClient, normalizeCartItem, normalizeShippingInfo, roundMoney, validateCheckoutPayload } from '../_shared/commerce.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    const stripe = getStripeClient();
    const payload = await req.json();
    const cartItems = Array.isArray(payload.cartItems) ? payload.cartItems.map(normalizeCartItem) : [];
    const shippingInfo = normalizeShippingInfo(payload.shippingInfo || {});
    validateCheckoutPayload(cartItems, shippingInfo);

    const shippingCost = roundMoney(Math.max(Number(payload.shippingCost) || 0, 0));
    const lineItems = cartItems.map((item) => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.card_name,
          images: item.card_image ? [item.card_image] : []
        },
        unit_amount: Math.round(item.price * 100)
      },
      quantity: item.quantity
    }));

    if (shippingCost > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Shipping' },
          unit_amount: Math.round(shippingCost * 100)
        },
        quantity: 1
      });
    }

    const publicAppUrl = getEnv('PUBLIC_APP_URL').replace(/\/+$/, '');
    const requestOrigin = String(req.headers.get('origin') || '').trim().replace(/\/+$/, '');
    const origin = publicAppUrl || requestOrigin;
    if (!origin) {
      throw new Error('PUBLIC_APP_URL is not configured.');
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout`,
      customer_email: shippingInfo.email,
      metadata: {
        shipping_info: JSON.stringify(shippingInfo),
        cart_items: JSON.stringify(cartItems),
        user_email: String(payload.userEmail || shippingInfo.email || '').trim().toLowerCase()
      }
    });

    return jsonResponse({ url: session.url, preview_order: buildOrderFromCheckoutSession(session) });
  } catch (error) {
    console.error('create-checkout error:', error);
    return errorResponse(error);
  }
});
