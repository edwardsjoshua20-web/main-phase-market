import { invokeNamedSupabaseFunction } from '@/services/supabaseFunctions';

const FUNCTION_NAME = 'instajudge-error-reports';

export const rulingReportService = Object.freeze({
  async create(report) {
    return invokeNamedSupabaseFunction(FUNCTION_NAME, { action: 'create_report', report });
  },
  async list(filters = {}) {
    return invokeNamedSupabaseFunction(FUNCTION_NAME, { action: 'list_reports', filters }, { authenticated: true });
  },
  async get(id) {
    return invokeNamedSupabaseFunction(FUNCTION_NAME, { action: 'get_report', id }, { authenticated: true });
  },
  async update(id, changes) {
    return invokeNamedSupabaseFunction(FUNCTION_NAME, { action: 'update_report', id, changes }, { authenticated: true });
  }
});
