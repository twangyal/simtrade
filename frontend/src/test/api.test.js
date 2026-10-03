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
