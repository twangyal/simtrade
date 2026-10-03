import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import Dashboard from '../Components/Dashboard';
import TradeHistory from '../Components/TradeHistory';

vi.mock('axios', () => {
  const client = { get: vi.fn(), interceptors: { response: { use: vi.fn() } } };
  client.create = () => client;
  return { default: client };
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('accessToken', 'price-display-token');
});

it('shows precise execution prices without changing cent-formatted trade notionals', async () => {
  const prices = [1.10011, 1.105270001, 1.105270002, 1e-25, 100];
  axios.get.mockResolvedValue({ data: { trades: prices.map((price, index) => ({
    id: index + 1, symbol: 'EUR/USD', quantity: 1000, price, timestamp: '2026-10-03T12:00:00Z',
  })), totalPages: 1 } });
  render(<MemoryRouter><TradeHistory /></MemoryRouter>);
  await screen.findAllByText('EUR/USD');
  const rows = within(screen.getByRole('region', { name: 'Trade records' })).getAllByRole('row').slice(1);
  expect(rows.map((row) => within(row).getAllByRole('cell')[4].textContent)).toEqual([
    '$1.10011', '$1.105270001', '$1.105270002', '$1e-25', '$100.00',
  ]);
  expect(rows.map((row) => within(row).getAllByRole('cell')[5].textContent)).toEqual([
    '$1,100.11', '$1,105.27', '$1,105.27', '$0.00', '$100,000.00',
  ]);
});

it('preserves average-basis precision while marked values, account metrics and P&L remain cents', async () => {
  axios.get.mockImplementation(async (url) => ({ data: url === '/market_status'
    ? { mode: 'disabled', supported_symbols: ['EUR/USD'], ready_symbols: [] }
    : url === '/user_data' ? { username: 'Trader', balance: 100000, short_liability: 0, networth: 100000 }
      : [{ id: 1, symbol: 'EUR/USD', quantity: 1000, avg_price: 1.1001100000000001, current_price: 1.10012 }] }));
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  await screen.findByText('Welcome, Trader');
  const row = within(screen.getByRole('region', { name: 'Portfolio holdings' })).getAllByRole('row')[1];
  const cells = within(row).getAllByRole('cell');
  expect(cells[2].textContent).toBe('$1.1001100000000001');
  expect(cells[3].textContent).toBe('$1,100.12');
  expect(cells[4].textContent).toBe('$0.01');
  const balance = screen.getByRole('heading', { name: 'Cash Balance' }).parentElement;
  expect(within(balance).getByText('$100,000.00')).toBeTruthy();
});
