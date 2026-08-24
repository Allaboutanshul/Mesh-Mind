const API_BASE = '/api';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
}

export const api = {
  health: () => fetchJSON<{ status: string }>('/health'),
  getNetwork: () => fetchJSON<any>('/network'),
  setNetworkStatus: (status: { internetAvailable?: boolean; cellularAvailable?: boolean }) =>
    fetchJSON<any>('/network/status', { method: 'POST', body: JSON.stringify(status) }),
  getNodes: () => fetchJSON<any[]>('/nodes'),
  getNode: (id: string) => fetchJSON<any>(`/nodes/${id}`),
  updateNode: (id: string, data: any) => fetchJSON<any>(`/nodes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getLinks: () => fetchJSON<any[]>('/links'),
  getMessages: () => fetchJSON<any[]>('/messages'),
  sendMessage: (data: any) => fetchJSON<any>('/messages', { method: 'POST', body: JSON.stringify(data) }),
  findRoute: (data: { sourceId: string; destId: string; isEmergency: boolean }) =>
    fetchJSON<any>('/route', { method: 'POST', body: JSON.stringify(data) }),
  startSimulation: (preset?: string) => fetchJSON<any>('/simulation/start', { method: 'POST', body: JSON.stringify({ preset }) }),
  stopSimulation: () => fetchJSON<any>('/simulation/stop', { method: 'POST' }),
  applyPreset: (preset: string) => fetchJSON<any>('/simulation/preset', { method: 'POST', body: JSON.stringify({ preset }) }),
  disableNode: (id: string) => fetchJSON<any>(`/simulation/node/${id}/disable`, { method: 'POST' }),
  enableNode: (id: string) => fetchJSON<any>(`/simulation/node/${id}/enable`, { method: 'POST' }),
  resetSimulation: () => fetchJSON<any>('/simulation/reset', { method: 'POST' }),
  getAnalytics: (limit?: number) => fetchJSON<any[]>(`/analytics${limit ? `?limit=${limit}` : ''}`),
  getEvents: (limit?: number) => fetchJSON<any[]>(`/events${limit ? `?limit=${limit}` : ''}`),
};
