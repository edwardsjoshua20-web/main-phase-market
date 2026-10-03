import { handleCors } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')?.replace(/\/+$/, '') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ADMIN_EMAIL = 'admin@mainphasemarket.net';
const VALID_STATUSES = new Set(['new', 'reviewing', 'confirmed_bug', 'expected_behavior', 'fixed', 'closed']);

function serviceHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function requestRest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { ...serviceHeaders(), ...(init.headers || {}) }
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.message || payload?.error || `Report storage failed (${response.status}).`);
  return payload;
}

function boundedText(value: unknown, max: number, required = false) {
  const text = String(value || '').trim().slice(0, max);
  if (required && !text) throw new Error('The report is missing required ruling details.');
  return text || null;
}

function boundedStringArray(value: unknown, maxItems = 20) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map((item) => String(item || '').trim().slice(0, 200)).filter(Boolean);
}

function boundedJson(value: unknown, maxBytes: number) {
  if (value == null) return null;
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).length > maxBytes) throw new Error('The report diagnostic payload is too large.');
  return JSON.parse(serialized);
}

async function requireAdmin(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization || authorization === `Bearer ${SERVICE_ROLE_KEY}`) throw new Error('Administrator access is required.');
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: serviceHeaders({ Authorization: authorization })
  });
  if (!response.ok) throw new Error('Your sign-in session is no longer valid.');
  const user = await response.json();
  const role = String(user?.app_metadata?.role || user?.user_metadata?.role || '').toLowerCase();
  const email = String(user?.email || '').toLowerCase();
  if (role !== 'admin' && email !== ADMIN_EMAIL) throw new Error('Administrator access is required.');
  return user;
}

async function createReport(report: Record<string, unknown>) {
  const row = {
    game: boundedText(report.game, 40, true),
    session_id: boundedText(report.sessionId, 160),
    ruling_id: boundedText(report.rulingId, 160),
    judge_id: boundedText(report.judgeId, 80),
    judge_name: boundedText(report.judgeName, 120),
    route: boundedText(report.route, 500),
    user_message: boundedText(report.userMessage, 6000, true),
    judge_answer: boundedText(report.judgeAnswer, 6000, true),
    explanation: boundedText(report.explanation, 12000),
    user_note: boundedText(report.userNote, 2000),
    engine_operation: boundedText(report.engineOperation, 160),
    engine_verdict: boundedText(report.engineVerdict, 80),
    result_class: boundedText(report.resultClass, 120),
    ai_involved: Boolean(report.aiInvolved),
    app_version: boundedText(report.appVersion, 160),
    scenario_fingerprint: boundedText(report.scenarioFingerprint, 160, true),
    card_names: boundedStringArray(report.cardNames),
    state_snapshot: boundedJson(report.stateSnapshot, 100_000),
    diagnostic_payload: boundedJson(report.diagnosticPayload, 160_000) || {}
  };
  const rows = await requestRest('/rest/v1/instajudge_error_reports', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row)
  });
  return { report: rows?.[0] ? { id: rows[0].id, createdAt: rows[0].created_at, status: rows[0].status } : null };
}

async function listReports(filters: Record<string, unknown>) {
  const sort = filters.sort === 'oldest' ? 'created_at.asc' : 'created_at.desc';
  const params = new URLSearchParams({ select: '*', order: sort, limit: '200' });
  const status = boundedText(filters.status, 40);
  const operation = boundedText(filters.operation, 160);
  const judge = boundedText(filters.judge, 80);
  const fingerprint = boundedText(filters.fingerprint, 160);
  const cardName = boundedText(filters.cardName, 200);
  const search = boundedText(filters.search, 200);
  if (status && VALID_STATUSES.has(status)) params.set('status', `eq.${status}`);
  if (operation) params.set('engine_operation', `eq.${operation}`);
  if (judge) params.set('judge_id', `eq.${judge}`);
  if (fingerprint) params.set('scenario_fingerprint', `eq.${fingerprint}`);
  if (cardName) params.set('card_names', `cs.{${cardName.replace(/[{},]/g, ' ')}}`);
  if (filters.unresolved === true) params.set('status', 'in.(new,reviewing,confirmed_bug)');
  if (typeof filters.aiInvolved === 'boolean') params.set('ai_involved', `eq.${filters.aiInvolved}`);
  if (search) {
    const escaped = search.replace(/[(),]/g, ' ');
    params.set('or', `(user_message.ilike.*${escaped}*,judge_answer.ilike.*${escaped}*,user_note.ilike.*${escaped}*,scenario_fingerprint.ilike.*${escaped}*)`);
  }
  const reports = await requestRest(`/rest/v1/instajudge_error_reports?${params.toString()}`);
  return { reports };
}

async function getReport(id: string) {
  const params = new URLSearchParams({ id: `eq.${id}`, select: '*', limit: '1' });
  const rows = await requestRest(`/rest/v1/instajudge_error_reports?${params.toString()}`);
  if (!rows?.[0]) throw new Error('Report not found.');
  return { report: rows[0] };
}

async function updateReport(id: string, changes: Record<string, unknown>, admin: Record<string, unknown>) {
  const current = (await getReport(id)).report;
  const status = boundedText(changes.status, 40) || current.status;
  if (!VALID_STATUSES.has(status)) throw new Error('Invalid report status.');
  const history = Array.isArray(current.status_history) ? current.status_history : [];
  const statusChanged = status !== current.status;
  const row = {
    status,
    admin_notes: boundedText(changes.adminNotes, 12000),
    status_history: statusChanged ? [...history, {
      from: current.status,
      to: status,
      at: new Date().toISOString(),
      adminId: admin.id || null
    }].slice(-100) : history,
    resolved_at: ['fixed', 'closed'].includes(status) ? (current.resolved_at || new Date().toISOString()) : null
  };
  const params = new URLSearchParams({ id: `eq.${id}` });
  const rows = await requestRest(`/rest/v1/instajudge_error_reports?${params.toString()}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row)
  });
  return { report: rows?.[0] || null };
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;
  if (request.method !== 'POST') return errorResponse('Only POST is supported.', 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return errorResponse('Ruling reports are not configured.', 503);

  try {
    const body = await request.json();
    const action = String(body?.action || '');
    if (action === 'create_report') return jsonResponse(await createReport(body.report || {}), 201);

    const admin = await requireAdmin(request);
    if (action === 'list_reports') return jsonResponse(await listReports(body.filters || {}));
    if (action === 'get_report') return jsonResponse(await getReport(boundedText(body.id, 80, true) as string));
    if (action === 'update_report') return jsonResponse(await updateReport(
      boundedText(body.id, 80, true) as string,
      body.changes || {},
      admin
    ));
    return errorResponse('Unsupported report action.', 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to process ruling report.';
    const status = /administrator|sign-in|session/i.test(message) ? 401 : /missing|required|invalid|large|unsupported/i.test(message) ? 400 : 500;
    return errorResponse(message, status);
  }
});
