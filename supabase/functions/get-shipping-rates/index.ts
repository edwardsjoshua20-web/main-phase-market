import { handleCors } from '../_shared/cors.ts';
import { getFallbackShippingRates, getUSPSRates } from '../_shared/commerce.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    const payload = await req.json();
    const destinationZip = String(payload.destinationZip || '').trim();
    const weightOz = Number(payload.weightOz) || 3;

    if (destinationZip && !/^\d{5}$/.test(destinationZip)) {
      return errorResponse('A valid 5-digit ZIP code is required.', 400);
    }

    const rates = destinationZip ? await getUSPSRates(destinationZip, weightOz) : [];
    if (rates.length > 0) {
      return jsonResponse({ rates, fallback: false });
    }

    return jsonResponse({ rates: getFallbackShippingRates(), fallback: true });
  } catch (error) {
    console.error('get-shipping-rates error:', error);
    return jsonResponse({
      rates: getFallbackShippingRates(),
      fallback: true,
      error: error instanceof Error ? error.message : String(error || 'Unexpected error')
    });
  }
});
