import { buildTrackingPayload, findOrderByNumber } from '../_shared/commerce.ts';
import { handleCors } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    const payload = await req.json();
    const orderNumber = String(payload.order_number || '').trim();
    const customerEmail = String(payload.email || '').trim().toLowerCase();

    if (!orderNumber) {
      return errorResponse('Order number is required.', 400);
    }

    const order = await findOrderByNumber(orderNumber, customerEmail);
    if (!order) {
      return jsonResponse({
        error: customerEmail
          ? 'Order not found for that order number and email.'
          : 'Order not found.'
      });
    }

    return jsonResponse({
      order,
      tracking: buildTrackingPayload(order)
    });
  } catch (error) {
    console.error('get-order-status error:', error);
    return errorResponse(error);
  }
});
