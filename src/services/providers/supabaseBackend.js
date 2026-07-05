import {
  canUseSupabaseFunctionForAction,
  invokeSupabaseAction,
  uploadSupabaseFile
} from '@/services/supabaseFunctions';

const providerError = (feature) =>
  new Error(
    `Supabase backend provider is not implemented for ${feature} yet. Keep VITE_APP_BACKEND_PROVIDER=local until the next migration pass.`
  );

const fail = (feature) => () => {
  throw providerError(feature);
};

const failAsync = (feature) => async () => {
  throw providerError(feature);
};

export const supabaseBackend = {
  app: {
    hasSessionToken() {
      return false;
    },
    getHealthStatus: failAsync('system health'),
    getAutomationControlStatus() {
      return Promise.resolve({
        available: false,
        mode: 'supabase-provider',
        reason: 'Manual automation controls require the local operations backend.'
      });
    },
    runAutomationJob: failAsync('manual automation controls'),
    getPublicSettings: failAsync('app public settings')
  },
  auth: {
    isAuthenticated: failAsync('auth'),
    getCurrentUser: failAsync('auth'),
    redirectToLogin: fail('auth'),
    logout: fail('auth'),
    updateProfile: failAsync('profile updates')
  },
  data: new Proxy(
    {},
    {
      get() {
        throw providerError('data access');
      }
    }
  ),
  actions: {
    async invoke(name, payload = {}) {
      if (canUseSupabaseFunctionForAction(name)) {
        return invokeSupabaseAction(name, payload);
      }

      throw providerError('server actions');
    }
  },
  files: {
    async upload({ file }) {
      if (!file) {
        throw new Error('No file provided.');
      }

      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
        reader.readAsDataURL(file);
      });

      return uploadSupabaseFile({
        filename: file.name || 'upload',
        type: file.type || 'application/octet-stream',
        data
      });
    }
  },
  ai: {
    invoke: failAsync('AI actions')
  },
  email: {
    send: failAsync('email')
  },
  activity: {
    logPageView: failAsync('activity logging')
  }
};
