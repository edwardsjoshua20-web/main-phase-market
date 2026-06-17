import { corsHeaders } from './cors.ts';

export function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

export function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error || 'Unexpected error');
  return jsonResponse({ error: message }, status);
}
