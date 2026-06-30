import { localBackend } from '@/services/providers/localBackend';
import { supabaseBackend } from '@/services/providers/supabaseBackend';

const rawProviderName =
  (/** @type {{ env?: Record<string, string> }} */ (import.meta).env?.VITE_APP_BACKEND_PROVIDER) ||
  'local';

const providerName = String(rawProviderName || 'local').trim().toLowerCase();

const providerMap = {
  local: localBackend,
  supabase: supabaseBackend
};

const shouldPreferLocalSupabaseBridge = (() => {
  if (typeof window === 'undefined') {
    return false;
  }

  return providerName === 'supabase'
    && ['main-phase-market.pages.dev', 'mainphasemarket.net', 'www.mainphasemarket.net'].includes(window.location.hostname);
})();

export const backend = shouldPreferLocalSupabaseBridge
  ? localBackend
  : (providerMap[providerName] || localBackend);
export const activeBackendProvider = providerName;

if (typeof window !== 'undefined') {
  console.info('[MPM backend provider]', activeBackendProvider);
}
