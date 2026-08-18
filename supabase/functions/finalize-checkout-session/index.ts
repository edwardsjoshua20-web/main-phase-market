import { handleCors } from '../_shared/cors.ts';
import {
  buildOrderFromCheckoutSession,
  finalizeCheckoutOrderAtomically,
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

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent']
    });

    if (!session || session.payment_status !== 'paid') {
      return errorResponse('Checkout session is not paid yet.', 400);
    }

    const orderPayload = buildOrderFromCheckoutSession(session);
    const finalization = await finalizeCheckoutOrderAtomically(sessionId, orderPayload);

    if (!finalization.alreadyFinalized) {
      try {
        await sendOrderConfirmationEmail(finalization.order);
      } catch (emailError) {
        console.warn('finalize-checkout-session email warning:', emailError);
      }
    }

    return jsonResponse({ order: finalization.order, alreadyFinalized: finalization.alreadyFinalized });
  } catch (error) {
    console.error('finalize-checkout-session error:', error);
    return errorResponse(error);
  }
});
