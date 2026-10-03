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
  localStorage.setItem('accessToken', 'decimal-display-token');
});

async function showHoldings(holdings) {
  axios.get.mockImplementation(async (url) => ({ data: url === '/market_status'
    ? { mode: 'disabled', supported_symbols: ['AAPL', 'QQQ', 'TRP'], ready_symbols: [] }
    : url === '/user_data' ? { username: 'Trader', balance: 100000, short_liability: 0, networth: 100000 }
      : holdings }));
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  await screen.findByText('Welcome, Trader');
  return within(screen.getByRole('region', { name: 'Portfolio holdings' })).getAllByRole('row').slice(1)
    .map((row) => within(row).getAllByRole('cell'));
}

it('renders exact-decimal marked value and unrealized gain for a fractional holding', async () => {
  const [cells] = await showHoldings([{ id: 1, symbol: 'AAPL', quantity: 0.3, avg_price: 100, current_price: 100.05 }]);
  expect(cells[3].textContent).toBe('$30.02');
  expect(cells[4].textContent).toBe('$0.02');
  const gain = screen.getByRole('heading', { name: 'Unrealized P&L' }).parentElement;
  expect(within(gain).getByText('$0.02')).toBeTruthy();
  const cash = screen.getByRole('heading', { name: 'Cash Balance' }).parentElement;
  expect(within(cash).getByText('$100,000.00')).toBeTruthy();
});

it('rounds displayed ties to even and aggregates gains before rounding individual rows', async () => {
  const rows = await showHoldings([
    { id: 1, symbol: 'AAPL', quantity: 0.1, avg_price: 100, current_price: 100.05 },
    { id: 2, symbol: 'QQQ', quantity: 0.1, avg_price: 100, current_price: 100.05 },
    { id: 3, symbol: 'TRP', quantity: -0.1, avg_price: 100, current_price: 99.95 },
  ]);
  expect(rows.map((cells) => cells[3].textContent)).toEqual(['$10.00', '$10.00', '-$10.00']);
  expect(rows.map((cells) => cells[4].textContent)).toEqual(['$0.00', '$0.00', '$0.00']);
  const gain = screen.getByRole('heading', { name: 'Unrealized P&L' }).parentElement;
  expect(within(gain).getByText('$0.02')).toBeTruthy();
});

it('uses absolute exact-decimal notionals for buys and sells at both half-even tie directions', async () => {
  axios.get.mockResolvedValue({ data: { trades: [0.1, -0.1, 0.3, -0.3].map((quantity, index) => ({
    id: index + 1, symbol: 'AAPL', quantity, price: 100.05, timestamp: '2026-10-03T12:00:00Z',
  })), totalPages: 1 } });
  render(<MemoryRouter><TradeHistory /></MemoryRouter>);
  await screen.findAllByText('AAPL');
  const rows = within(screen.getByRole('region', { name: 'Trade records' })).getAllByRole('row').slice(1);
  expect(rows.map((row) => within(row).getAllByRole('cell')[5].textContent)).toEqual([
    '$10.00', '$10.00', '$30.02', '$30.02',
  ]);
  expect(rows.map((row) => within(row).getAllByRole('cell')[4].textContent)).toEqual(Array(4).fill('$100.05'));
});
