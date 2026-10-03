import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import axios from 'axios';
import App from '../App';
import { clearSession } from '../session';

vi.mock('axios', () => {
  const client = { get: vi.fn(), post: vi.fn(), interceptors: { response: { use: vi.fn() } } };
  client.create = () => client;
  return { default: client };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('WebSocket', class { close() {} });
  axios.post.mockResolvedValue({ data: { access_token: 'new-token' } });
  axios.get.mockImplementation(async (url) => ({ data: url === '/market_status'
    ? { mode: 'disabled', supported_symbols: ['AAPL', 'BTC/USD'], ready_symbols: [] }
    : url === '/user_data' ? { username: 'Trader', balance: 1000, short_liability: 0, networth: 1000 }
      : url.startsWith('/trades') ? { trades: [], totalPages: 0 } : [] }));
});
afterEach(() => vi.unstubAllGlobals());

function Location() {
  const location = useLocation();
  return <output data-testid="current-location">{location.pathname}{location.search}{location.hash}</output>;
}
function renderApp(entry) {
  render(<MemoryRouter initialEntries={[entry]}><Location /><App /></MemoryRouter>);
}
async function logIn() {
  await screen.findByRole('heading', { name: 'Login' });
  fireEvent.change(screen.getByLabelText('Username:'), { target: { value: 'Trader' } });
  fireEvent.change(screen.getByLabelText('Password:'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));
}

it('restores an instrument deep link including its query and fragment after login', async () => {
  renderApp('/trade?symbol=AAPL#order');
  await logIn();
  expect((await screen.findByLabelText('Instrument')).value).toBe('AAPL');
  expect(screen.getByTestId('current-location').textContent).toBe('/trade?symbol=AAPL#order');
});

it('keeps the selected instrument when a session expires and the trader logs in again', async () => {
  localStorage.setItem('accessToken', 'initial-token');
  renderApp('/trade?symbol=AAPL#order');
  expect((await screen.findByLabelText('Instrument')).value).toBe('AAPL');
  act(() => clearSession());
  await logIn();
  expect((await screen.findByLabelText('Instrument')).value).toBe('AAPL');
  expect(screen.getByTestId('current-location').textContent).toBe('/trade?symbol=AAPL#order');
});

it.each([
  'https://example.com/trade?symbol=AAPL',
  'https://simtrade.local/trade?symbol=AAPL',
  '//example.com/trade?symbol=AAPL',
  '/\\example.com/trade?symbol=AAPL',
  '/trade\\?symbol=AAPL',
  '/trade\n?symbol=AAPL',
  '/login?symbol=AAPL',
  '/unavailable?symbol=AAPL',
  '/elsewhere/../trade?symbol=AAPL',
  { pathname: '/trade' },
])('falls back to the dashboard for an unsafe or unrecognized return location %j', async (from) => {
  renderApp({ pathname: '/login', state: { from } });
  await logIn();
  await screen.findByText('Welcome, Trader');
  expect(screen.getByTestId('current-location').textContent).toBe('/dashboard');
});

it('preserves an allowed trade history return path', async () => {
  renderApp({ pathname: '/login', state: { from: '/trade-history?view=recent#history' } });
  await logIn();
  await screen.findByRole('heading', { name: 'Trade History' });
  expect(screen.getByTestId('current-location').textContent).toBe('/trade-history?view=recent#history');
});
