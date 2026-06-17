const rawSupabaseUrl =
  (/** @type {{ env?: Record<string, string> }} */ (import.meta).env?.VITE_SUPABASE_URL) ||
  '';
const rawSupabaseAnonKey =
  (/** @type {{ env?: Record<string, string> }} */ (import.meta).env?.VITE_SUPABASE_ANON_KEY) ||
  '';

const supabaseUrl = String(rawSupabaseUrl || '').trim().replace(/\/+$/, '');
const supabaseAnonKey = String(rawSupabaseAnonKey || '').trim();

const actionFunctionMap = {
  createCheckout: 'create-checkout',
  finalizeCheckoutSession: 'finalize-checkout-session',
  getShippingRates: 'get-shipping-rates',
  getOrderStatus: 'get-order-status',
  sendProductRequest: 'send-product-request'
};

function getFunctionBaseUrl() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return '';
  }

  return `${supabaseUrl}/functions/v1`;
}

export function hasSupabaseFunctionBridge() {
  return Boolean(getFunctionBaseUrl());
}

export function canUseSupabaseFunctionForAction(actionName) {
  return Boolean(actionFunctionMap[String(actionName || '').trim()]);
}

async function callSupabaseFunction(functionName, body, extraHeaders = {}) {
  const functionBaseUrl = getFunctionBaseUrl();
  if (!functionBaseUrl) {
    throw new Error('Supabase function bridge is not configured.');
  }

  const response = await fetch(`${functionBaseUrl}/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      ...extraHeaders
    },
    body: JSON.stringify(body || {})
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      payload?.error ||
      payload?.message ||
      text ||
      `Supabase function request failed: ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.data = payload;
    throw error;
  }

  return payload;
}

export async function invokeSupabaseAction(actionName, payload = {}) {
  const functionName = actionFunctionMap[String(actionName || '').trim()];
  if (!functionName) {
    throw new Error(`No Supabase function is configured for action "${actionName}".`);
  }

  const result = await callSupabaseFunction(functionName, payload);
  return result && typeof result === 'object' && 'data' in result ? result : { data: result };
}

export async function uploadSupabaseFile({ filename, type, data }) {
  const result = await callSupabaseFunction('upload-public-file', {
    filename,
    type,
    data
  });

  return result && typeof result === 'object' && 'file_url' in result ? result : { data: result };
}
