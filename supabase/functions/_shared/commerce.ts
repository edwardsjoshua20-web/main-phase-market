import Stripe from 'npm:stripe@17.5.0';
import { getEnv, requireEnv } from './env.ts';
import { restRequest } from './rest.ts';

export function matchesEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function normalizeExternalImageUrl(value: string) {
  const candidate = String(value || '').trim();
  if (!candidate) {
    return '';
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return '';
  }

  return '';
}

export function normalizeCartItem(rawItem: Record<string, unknown> = {}) {
  const quantity = Math.max(1, Number(rawItem.quantity) || 1);
  const unitPrice = roundMoney(Math.max(Number(rawItem.price) || 0, 1));

  return {
    card_id: String(rawItem.card_id || '').trim(),
    card_name: String(rawItem.card_name || 'Item').trim() || 'Item',
    card_image: normalizeExternalImageUrl(String(rawItem.card_image || '')),
    price: unitPrice,
    quantity
  };
}

export function normalizeShippingInfo(rawShipping: Record<string, unknown> = {}) {
  return {
    name: String(rawShipping.name || '').trim(),
    email: String(rawShipping.email || '').trim().toLowerCase(),
    address: String(rawShipping.address || rawShipping.street || '').trim(),
    city: String(rawShipping.city || '').trim(),
    state: String(rawShipping.state || '').trim(),
    zip: String(rawShipping.zip || '').trim(),
    country: String(rawShipping.country || 'US').trim() || 'US'
  };
}

export function validateCheckoutPayload(cartItems: unknown[], shippingInfo: ReturnType<typeof normalizeShippingInfo>) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new Error('Your cart is empty.');
  }

  if (!shippingInfo.name || !shippingInfo.address || !shippingInfo.city || !shippingInfo.state || !shippingInfo.zip) {
    throw new Error('Shipping information is incomplete.');
  }

  if (!matchesEmail(shippingInfo.email)) {
    throw new Error('A valid email address is required.');
  }
}

function parseJsonSafely(value: string, fallback: unknown) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function buildOrderNumber() {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(2, 14);
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase();
  return `MPM-${stamp}-${suffix}`;
}

export function getStripeClient() {
  return new Stripe(requireEnv('STRIPE_SECRET_KEY'));
}

export function buildOrderFromCheckoutSession(session: Stripe.Checkout.Session) {
  const shippingInfo = (parseJsonSafely(String(session?.metadata?.shipping_info || '{}'), {}) || {}) as Record<string, unknown>;
  const cartItems = (parseJsonSafely(String(session?.metadata?.cart_items || '[]'), []) || []) as Record<string, unknown>[];
  const normalizedItems = Array.isArray(cartItems) ? cartItems.map(normalizeCartItem) : [];
  const subtotal = roundMoney(normalizedItems.reduce((sum, item) => sum + item.price * item.quantity, 0));
  const sessionTotal = roundMoney((Number(session?.amount_total) || 0) / 100);
  const shippingCost = roundMoney(Math.max(sessionTotal - subtotal, 0));

  return {
    stripe_session_id: session.id,
    stripe_payment_intent_id: String(session.payment_intent || '').trim() || null,
    order_number: buildOrderNumber(),
    customer_email: String(shippingInfo.email || '').trim().toLowerCase(),
    customer_name: String(shippingInfo.name || '').trim(),
    items: normalizedItems,
    subtotal,
    shipping_cost: shippingCost,
    total: sessionTotal,
    shipping_address: {
      street: String(shippingInfo.address || '').trim(),
      city: String(shippingInfo.city || '').trim(),
      state: String(shippingInfo.state || '').trim(),
      zip: String(shippingInfo.zip || '').trim(),
      country: String(shippingInfo.country || 'US').trim() || 'US'
    },
    status: 'confirmed'
  };
}

function buildGenericEntityRecord(entityName: string, payload: Record<string, unknown>, existing: Record<string, unknown> | null = null) {
  const timestamp = new Date().toISOString();
  const createdDate = String(payload.created_date || existing?.created_date || timestamp);
  const updatedDate = timestamp;
  const id = String(payload.id || existing?.id || crypto.randomUUID());

  const data = {
    ...(existing || {}),
    ...(payload || {}),
    id,
    created_date: createdDate,
    updated_date: updatedDate
  };

  return {
    entity_name: entityName,
    id,
    created_date: createdDate,
    updated_date: updatedDate,
    data
  };
}

function normalizeGenericEntityRow(row: Record<string, unknown> | null) {
  const data = row?.data && typeof row.data === 'object' ? row.data as Record<string, unknown> : {};
  return {
    ...data,
    id: String(data.id || row?.id || ''),
    created_date: String(data.created_date || row?.created_date || row?.created_at || ''),
    updated_date: String(data.updated_date || row?.updated_date || row?.updated_at || '')
  };
}

export async function getEntityById(entityName: string, id: string) {
  const rows = await restRequest(
    `/rest/v1/app_entities?select=*&entity_name=eq.${encodeURIComponent(entityName)}&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ? normalizeGenericEntityRow(row) : null;
}

export async function filterEntities(entityName: string, filters: Record<string, unknown>) {
  const rows = await restRequest(
    `/rest/v1/app_entities?select=*&entity_name=eq.${encodeURIComponent(entityName)}&order=created_date.desc`
  );
  const normalized = (Array.isArray(rows) ? rows : []).map(normalizeGenericEntityRow);

  return normalized.filter((row) =>
    Object.entries(filters || {}).every(([key, value]) => String(row?.[key] || '') === String(value || ''))
  );
}

export async function createEntity(entityName: string, payload: Record<string, unknown>) {
  const record = buildGenericEntityRecord(entityName, payload);
  const rows = await restRequest('/rest/v1/app_entities', {
    method: 'POST',
    body: JSON.stringify(record)
  });
  return normalizeGenericEntityRow(Array.isArray(rows) ? rows[0] : rows);
}

export async function updateEntity(entityName: string, id: string, updates: Record<string, unknown>) {
  const current = await getEntityById(entityName, id);
  if (!current) {
    throw new Error(`Record not found for ${entityName}:${id}`);
  }

  const record = buildGenericEntityRecord(entityName, { ...updates, id }, current);
  const rows = await restRequest(
    `/rest/v1/app_entities?entity_name=eq.${encodeURIComponent(entityName)}&id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        created_date: record.created_date,
        updated_date: record.updated_date,
        data: record.data
      })
    }
  );

  return normalizeGenericEntityRow(Array.isArray(rows) ? rows[0] : rows);
}

export async function findOrderByNumber(orderNumber: string, customerEmail = '') {
  const normalizedOrderNumber = String(orderNumber || '').trim().toLowerCase();
  const normalizedEmail = String(customerEmail || '').trim().toLowerCase();
  if (!normalizedOrderNumber) {
    return null;
  }

  const rows = await filterEntities('Order', {});
  return rows.find((order) => {
    const sameOrderNumber = String(order?.order_number || '').trim().toLowerCase() === normalizedOrderNumber;
    if (!sameOrderNumber) {
      return false;
    }

    if (!normalizedEmail) {
      return true;
    }

    return String(order?.customer_email || '').trim().toLowerCase() === normalizedEmail;
  }) || null;
}

export function buildTrackingPayload(order: Record<string, unknown> | null) {
  const trackingEvents = Array.isArray(order?.tracking_events) ? order?.tracking_events : [];
  const events = trackingEvents
    .map((event) => {
      const entry = typeof event === 'object' && event ? event as Record<string, unknown> : {};
      return {
        description: String(entry.description || entry.status || '').trim(),
        location: String(entry.location || '').trim(),
        timestamp: String(entry.timestamp || entry.date || '').trim()
      };
    })
    .filter((event) => event.description || event.location || event.timestamp);

  if (!order?.tracking_number && events.length === 0) {
    return null;
  }

  return {
    tracking_number: String(order?.tracking_number || ''),
    events
  };
}

export async function decrementInventoryForOrder(order: Record<string, unknown>) {
  const items = Array.isArray(order?.items) ? order.items as Record<string, unknown>[] : [];
  for (const item of items) {
    const itemId = String(item.card_id || '').trim();
    if (!itemId) {
      continue;
    }

    for (const entityName of ['Card', 'Product']) {
      const current = await getEntityById(entityName, itemId);
      if (!current) {
        continue;
      }

      await updateEntity(entityName, itemId, {
        quantity: Math.max(0, Number(current.quantity || 0) - Number(item.quantity || 0))
      });
      break;
    }
  }
}

export async function sendOrderConfirmationEmail(order: Record<string, unknown>) {
  const resendApiKey = getEnv('RESEND_API_KEY');
  if (!resendApiKey || !order?.customer_email) {
    return { sent: false, skipped: true };
  }

  const items = Array.isArray(order.items) ? order.items as Record<string, unknown>[] : [];
  const itemsHtml = items.map((item) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${String(item.card_name || '')}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${Number(item.quantity || 0)}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${roundMoney(Number(item.price || 0) * Number(item.quantity || 0)).toFixed(2)}</td>
    </tr>
  `).join('');

  const emailHtml = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0;">Order Confirmed!</h1>
        </div>
        <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; margin-bottom: 20px;">Hi ${String(order.customer_name || 'there')},</p>
          <p style="margin-bottom: 20px;">Thank you for your order! We've received your payment and are preparing your items for shipment.</p>
          <div style="background: #f9fafb; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
            <strong>Order Number:</strong> ${String(order.order_number || '')}
          </div>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background: #f9fafb;">
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Item</th>
                <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Qty</th>
                <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Price</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          <div style="text-align: right; padding-top: 15px; border-top: 2px solid #e5e7eb;">
            <p style="margin: 5px 0;"><strong>Subtotal:</strong> $${roundMoney(Number(order.subtotal || 0)).toFixed(2)}</p>
            <p style="margin: 5px 0;"><strong>Shipping:</strong> $${roundMoney(Number(order.shipping_cost || 0)).toFixed(2)}</p>
            <p style="font-size: 18px; margin: 10px 0 0 0; color: #2563eb;"><strong>Total:</strong> $${roundMoney(Number(order.total || 0)).toFixed(2)}</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Main Phase Market <orders@mainphasemarket.com>',
      to: String(order.customer_email || ''),
      subject: `Order Confirmation - ${String(order.order_number || '')}`,
      html: emailHtml
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || `Resend API error: ${response.status}`);
  }

  return {
    sent: true,
    emailId: payload?.id || null
  };
}

async function getUSPSToken() {
  const consumerKey = getEnv('USPS_CONSUMER_KEY');
  const consumerSecret = getEnv('USPS_CONSUMER_SECRET');
  if (!consumerKey || !consumerSecret) {
    return null;
  }

  const response = await fetch('https://apis.usps.com/oauth2/v3/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: consumerKey,
      client_secret: consumerSecret
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `USPS token request failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload?.access_token || null;
}

export async function getUSPSRates(destinationZip: string, weightOz = 3) {
  const token = await getUSPSToken();
  if (!token) {
    return [];
  }

  const originZip = getEnv('USPS_ORIGIN_ZIP', '40272');
  const mailClasses = [
    { id: 'USPS_GROUND_ADVANTAGE', label: 'USPS Ground Advantage', days: '2-5 business days' },
    { id: 'PRIORITY_MAIL', label: 'Priority Mail', days: '1-3 business days' },
    { id: 'PRIORITY_MAIL_EXPRESS', label: 'Priority Mail Express', days: '1-2 business days' }
  ];

  const rates: Array<{ id: string; name: string; price: number; days: string }> = [];
  for (const mailClass of mailClasses) {
    try {
      const response = await fetch('https://apis.usps.com/prices/v3/base-rates/search', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          originZIPCode: originZip,
          destinationZIPCode: destinationZip,
          weight: Number(weightOz || 3) / 16,
          length: 9,
          width: 6,
          height: 1,
          mailClass: mailClass.id,
          processingCategory: mailClass.id === 'USPS_GROUND_ADVANTAGE' ? 'MACHINABLE' : 'NON_MACHINABLE',
          destinationEntryFacilityType: 'NONE',
          rateIndicator: 'SP',
          priceType: 'RETAIL'
        })
      });

      if (!response.ok) {
        continue;
      }

      const payload = await response.json();
      const price = payload?.rates?.[0]?.price ?? payload?.totalBasePrice ?? payload?.price;
      if (price != null) {
        rates.push({
          id: mailClass.id.toLowerCase(),
          name: mailClass.label,
          price: roundMoney(Number(price)),
          days: mailClass.days
        });
      }
    } catch {
      // Fall back to static rates below.
    }
  }

  return rates;
}

export function getFallbackShippingRates() {
  return [
    { id: 'usps_ground_advantage', name: 'USPS Ground Advantage', price: 5.99, days: '3-7 business days' },
    { id: 'priority', name: 'Priority Mail', price: 12.99, days: '1-3 business days' },
    { id: 'express', name: 'Priority Mail Express', price: 29.99, days: '1-2 business days' }
  ];
}
