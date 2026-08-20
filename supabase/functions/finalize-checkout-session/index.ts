import { handleCors } from '../_shared/cors.ts';
import {
  CHECKOUT_MODES,
  assertCheckoutSessionMatchesMode,
  assertQaCheckoutOrderPayload,
  buildOrderFromCheckoutSession,
  finalizeCheckoutOrderAtomically,
  getCheckoutModeFromSessionId,
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
    const payload = await req.json();
    const sessionId = String(payload.session_id || '').trim();
    if (!sessionId) {
      return errorResponse('session_id is required.', 400);
    }

    const checkoutMode = getCheckoutModeFromSessionId(sessionId);
    const stripe = getStripeClient(checkoutMode);
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent']
    });
    assertCheckoutSessionMatchesMode(session, checkoutMode);

    if (!session || session.payment_status !== 'paid') {
      return errorResponse('Checkout session is not paid yet.', 400);
    }

    const orderPayload = buildOrderFromCheckoutSession(session);
    if (checkoutMode === CHECKOUT_MODES.QA_TEST) {
      await assertQaCheckoutOrderPayload(orderPayload);
    }

    const finalization = await finalizeCheckoutOrderAtomically(sessionId, orderPayload);

    let confirmation: Record<string, unknown> = {
      sent: false,
      skipped: true,
      reason: 'already_finalized'
    };
    if (!finalization.alreadyFinalized) {
      try {
        confirmation = await sendOrderConfirmationEmail(finalization.order);
      } catch (emailError) {
        console.warn('finalize-checkout-session email warning:', emailError);
        confirmation = {
          sent: false,
          skipped: true,
          reason: 'email_error'
        };
      }
    }

    return jsonResponse({ order: finalization.order, alreadyFinalized: finalization.alreadyFinalized, confirmation });
  } catch (error) {
    console.error('finalize-checkout-session error:', error);
    return errorResponse(error);
  }
});
