import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import App from '../App';
import { clearSession } from '../session';

vi.mock('axios', () => {
  const client = { get: vi.fn(), post: vi.fn(), interceptors: { response: { use: vi.fn() } } };
  client.create = () => client;
  return { default: client };
});
vi.mock('highcharts-react-official', () => ({ default: () => <div /> }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('WebSocket', class { close() {} });
  axios.get.mockImplementation(async (url) => ({ data: url === '/market_status'
    ? { mode: 'disabled', supported_symbols: ['BTC/USD'], ready_symbols: [] }
    : url === '/user_data' ? { username: 'Trader', balance: 1000, short_liability: 0, networth: 1000 } : [] }));
});
afterEach(() => vi.unstubAllGlobals());

it('announces deferred trading-page loading and leaves the route when its session ends', async () => {
  localStorage.setItem('accessToken', 'initial-token');
  render(<MemoryRouter initialEntries={['/trade']}><App /></MemoryRouter>);
  expect(screen.getByRole('status').textContent).toBe('Loading trading page…');
  act(() => clearSession());
  expect(await screen.findByRole('heading', { name: 'Login' })).toBeTruthy();
  expect(screen.queryByRole('spinbutton')).toBeNull();
  expect(screen.queryByText('Loading trading page…')).toBeNull();
});

it('opens the protected trading page after login and supports returning to the dashboard', async () => {
  axios.post.mockResolvedValueOnce({ data: { access_token: 'new-token' } });
  render(<MemoryRouter initialEntries={['/trade']}><App /></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Login' });
  fireEvent.change(screen.getByLabelText('Username:'), { target: { value: 'Trader' } });
  fireEvent.change(screen.getByLabelText('Password:'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));
  expect(await screen.findByRole('spinbutton')).toBeTruthy();
  expect(screen.getByLabelText('Instrument')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  fireEvent.click(screen.getByRole('button', { name: 'Home' }));
  expect(await screen.findByText('Welcome, Trader')).toBeTruthy();
  expect(screen.queryByRole('spinbutton')).toBeNull();
});
