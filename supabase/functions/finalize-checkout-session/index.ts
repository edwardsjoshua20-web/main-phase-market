import { handleCors } from '../_shared/cors.ts';
import {
  buildOrderFromCheckoutSession,
  createEntity,
  decrementInventoryForOrder,
  filterEntities,
  getStripeClient,
  sendOrderConfirmationEmail
} from '../_shared/commerce.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    const stripe = getStripeClient();
    const payload = await req.json();
    const sessionId = String(payload.session_id || '').trim();
    if (!sessionId) {
      return errorResponse('session_id is required.', 400);
    }

    const existingOrder = (await filterEntities('Order', { stripe_session_id: sessionId }))[0] || null;
    if (existingOrder) {
      return jsonResponse({ order: existingOrder, alreadyFinalized: true });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent']
    });

    if (!session || session.payment_status !== 'paid') {
      return errorResponse('Checkout session is not paid yet.', 400);
    }

    const orderPayload = buildOrderFromCheckoutSession(session);
    const order = await createEntity('Order', orderPayload);

    await decrementInventoryForOrder(order);

    try {
      await sendOrderConfirmationEmail(order);
    } catch (emailError) {
      console.warn('finalize-checkout-session email warning:', emailError);
    }

    return jsonResponse({ order, alreadyFinalized: false });
  } catch (error) {
    console.error('finalize-checkout-session error:', error);
    return errorResponse(error);
  }
});
