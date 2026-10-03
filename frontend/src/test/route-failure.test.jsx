import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import App from '../App';
import { clearSession } from '../session';

vi.mock('axios', () => {
  const client = { get: vi.fn(), interceptors: { response: { use: vi.fn() } } };
  client.create = () => client;
  return { default: client };
});
vi.mock('../Components/Trade.jsx', async () => {
  throw new Error('Failed to fetch private/internal-chunk-address.js');
});

function preventExpectedLoadError(event) {
  if (event.error?.cause?.message === 'Failed to fetch private/internal-chunk-address.js') event.preventDefault();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  window.addEventListener('error', preventExpectedLoadError);
  localStorage.setItem('accessToken', 'route-failure-session');
  axios.get.mockImplementation(async (url) => ({ data: url === '/market_status'
    ? { mode: 'disabled', supported_symbols: ['AAPL'], ready_symbols: [] }
    : url === '/user_data' ? { username: 'Trader', balance: 100000, short_liability: 0, networth: 100000 } : [] }));
});
afterEach(() => {
  window.removeEventListener('error', preventExpectedLoadError);
  vi.restoreAllMocks();
});

it('offers recovery after a rejected trading page download and keeps dashboard navigation usable', async () => {
  render(<MemoryRouter initialEntries={['/trade']}><App /></MemoryRouter>);
  expect((await screen.findByRole('alert')).textContent).toMatch(/trading page.*could not.*load/i);
  expect(screen.getByRole('button', { name: 'Reload page' })).toBeTruthy();
  expect(screen.queryByText(/private\/internal-chunk-address/)).toBeNull();
  fireEvent.click(screen.getByRole('link', { name: 'Return to dashboard' }));
  expect(await screen.findByText('Welcome, Trader')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('still leaves a failed private route when the current session ends', async () => {
  render(<MemoryRouter initialEntries={['/trade']}><App /></MemoryRouter>);
  await screen.findByRole('alert');
  act(() => clearSession());
  expect(await screen.findByRole('heading', { name: 'Login' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Reload page' })).toBeNull();
});
