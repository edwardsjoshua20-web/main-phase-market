import { createEntity, matchesEmail } from '../_shared/commerce.ts';
import { handleCors } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    const payload = await req.json();
    const customerEmail = String(payload.customerEmail || '').trim().toLowerCase();
    if (!matchesEmail(customerEmail)) {
      return errorResponse('A valid customer email is required.', 400);
    }

    const record = await createEntity('ProductRequest', {
      customer_email: customerEmail,
      product_name: String(payload.productName || '').trim(),
      set_name: String(payload.setName || '').trim(),
      card_number: String(payload.cardNumber || '').trim(),
      rarity: String(payload.rarity || '').trim(),
      request_type: String(payload.requestType || 'product').trim(),
      status: 'open'
    });

    return jsonResponse({
      success: true,
      id: record.id
    });
  } catch (error) {
    console.error('send-product-request error:', error);
    return errorResponse(error);
  }
});
