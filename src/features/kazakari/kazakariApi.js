import { requestPrivateLocalApi } from '@/services/providers/localBackend';

export const kazakariApi = {
  snapshot() {
    return requestPrivateLocalApi('/kazakari/snapshot');
  },
  async watches() {
    const response = await requestPrivateLocalApi('/kazakari/watches');
    return response.watches || [];
  },
  async createWatch(rule) {
    const response = await requestPrivateLocalApi('/kazakari/watches', {
      method: 'POST',
      body: JSON.stringify(rule),
    });
    return response.watch;
  },
  deleteWatch(id) {
    return requestPrivateLocalApi(`/kazakari/watches/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};
