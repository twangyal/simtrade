import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it('uses a configured HTTPS API base and derives its secure WebSocket endpoint', async () => {
  vi.stubEnv('VITE_API_URL', 'https://example.test/api/');
  vi.stubEnv('VITE_WS_URL', '');
  const { default: api, WS_URL } = await import('../api');
  expect(api.defaults.baseURL).toBe('https://example.test/api');
  expect(WS_URL).toBe('wss://example.test/api/ws');
});

it('supports a separate WebSocket endpoint', async () => {
  vi.stubEnv('VITE_WS_URL', 'wss://stream.example.test/quotes');
  const { WS_URL } = await import('../api');
  expect(WS_URL).toBe('wss://stream.example.test/quotes');
});

it('clears the matching session when an authenticated request returns 401', async () => {
  const { default: api, authHeaders } = await import('../api');
  localStorage.setItem('accessToken', 'expired-token');
  api.defaults.adapter = (config) => Promise.reject({ config, response: { status: 401, data: { detail: 'Expired' } } });
  await expect(api.get('/user_data', { headers: authHeaders() })).rejects.toMatchObject({ response: { status: 401 } });
  expect(localStorage.getItem('accessToken')).toBeNull();
});

it('does not clear a newer session for an old request returning 401', async () => {
  const { default: api } = await import('../api');
  localStorage.setItem('accessToken', 'newer-token');
  api.defaults.adapter = (config) => Promise.reject({ config, response: { status: 401 } });
  await expect(api.get('/user_data', { headers: { Authorization: 'Bearer older-token' } })).rejects.toBeTruthy();
  expect(localStorage.getItem('accessToken')).toBe('newer-token');
});

it('does not clear a session when public login rejects invalid credentials', async () => {
  const { default: api } = await import('../api');
  localStorage.setItem('accessToken', 'current-token');
  api.defaults.adapter = (config) => Promise.reject({ config, response: { status: 401 } });
  await expect(api.post('/login', { username: 'wrong', password: 'wrong' })).rejects.toBeTruthy();
  expect(localStorage.getItem('accessToken')).toBe('current-token');
});

it('retains a valid session for a forbidden request', async () => {
  const { default: api, authHeaders } = await import('../api');
  localStorage.setItem('accessToken', 'current-token');
  api.defaults.adapter = (config) => Promise.reject({ config, response: { status: 403 } });
  await expect(api.get('/user_data', { headers: authHeaders() })).rejects.toBeTruthy();
  expect(localStorage.getItem('accessToken')).toBe('current-token');
});
