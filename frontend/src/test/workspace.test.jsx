import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import Dashboard from '../Components/Dashboard';
import TradeHistory from '../Components/TradeHistory';
import App from '../App';

vi.mock('axios', () => {
  const client = { get: vi.fn(), interceptors: { response: { use: vi.fn() } } };
  client.create = () => client;
  return { default: client };
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('accessToken', 'workspace-test-session');
});

it('refreshes a failed account snapshot and links a holding to its own instrument', async () => {
  let failed = true;
  axios.get.mockImplementation(async (url) => {
    if (url === '/market_status') return { data: { mode: 'disabled', supported_symbols: ['AAPL'], ready_symbols: [] } };
    if (failed) throw new Error('Offline');
    return { data: url === '/user_data'
      ? { username: 'Trader', balance: 99000, short_liability: 0, networth: 100100 }
      : [{ id: 1, symbol: 'AAPL', quantity: 10, avg_price: 100, current_price: 110 }] };
  });
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  await screen.findByText('Unable to load account data.');
  expect(screen.queryByRole('img', { name: 'Position exposure chart' })).toBeNull();
  failed = false;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh account' }));
  await screen.findByText('Welcome, Trader');
  expect(screen.queryAllByRole('alert')).toHaveLength(0);
  expect(screen.getByRole('link', { name: 'Trade AAPL' }).getAttribute('href')).toBe('/trade?symbol=AAPL');
  expect(screen.getByRole('img', { name: 'Position exposure chart' })).toBeTruthy();
});

it('offers a retry when trade history cannot load and cancels the replaced request', async () => {
  axios.get.mockRejectedValueOnce(new Error('Offline'));
  axios.get.mockResolvedValueOnce({ data: { trades: [{ id: 1, symbol: 'AAPL', quantity: 1, price: 100, timestamp: '2026-10-03T12:00:00Z' }], totalPages: 1 } });
  render(<MemoryRouter><TradeHistory /></MemoryRouter>);
  await screen.findByRole('alert');
  const firstSignal = axios.get.mock.calls[0][1].signal;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh trade history' }));
  await screen.findByText('AAPL');
  expect(firstSignal.aborted).toBe(true);
  expect(screen.queryByRole('alert')).toBeNull();
});

it.each([
  [false, '/', 'Return home'],
  [true, '/dashboard', 'Return to dashboard'],
])('provides a useful unknown-route fallback with signed-in state %s', async (signedIn, destination, label) => {
  if (!signedIn) localStorage.clear();
  render(<MemoryRouter initialEntries={['/not-a-page']}><App /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'A little off course.' })).toBeTruthy();
  expect(screen.getByRole('link', { name: label }).getAttribute('href')).toBe(destination);
  await waitFor(() => expect(document.title).toBe('Page not found · SimTrade'));
  expect(axios.get).not.toHaveBeenCalled();
});
