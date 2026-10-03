import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import Dashboard from '../Components/Dashboard';

vi.mock('axios', () => {
  const client = { get: vi.fn(), interceptors: { response: { use: vi.fn() } } };
  client.create = () => client;
  return { default: client };
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('accessToken', 'portfolio-test-token');
});

function showPortfolio(holdings, { fail = false, estimated = false } = {}) {
  axios.get.mockImplementation((url) => {
    if (url === '/market_status') return Promise.resolve({ data: { mode: 'disabled', supported_symbols: ['AAPL', 'TRP'], ready_symbols: [] } });
    if (url === '/user_data') return Promise.resolve({ data: { username: 'Trader', balance: 100000, short_liability: -1900, networth: 99050, valuation_estimated: estimated } });
    if (fail) return Promise.reject(new Error('portfolio unavailable'));
    return Promise.resolve({ data: holdings });
  });
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
}

it('shows actual long and short gains and removes the sample performance claim', async () => {
  showPortfolio([
    { id: 1, symbol: 'AAPL', quantity: 10, avg_price: 100, current_price: 95 },
    { id: 2, symbol: 'TRP', quantity: -20, avg_price: 100, current_price: 95 },
  ]);
  await screen.findByText('Welcome, Trader');
  const gainCard = screen.getByRole('heading', { name: 'Unrealized P&L' }).parentElement;
  expect(within(gainCard).getByText('$50.00')).toBeTruthy();
  expect(within(screen.getByText('AAPL').closest('tr')).getByText('-$50.00')).toBeTruthy();
  const gainColumn = screen.getAllByRole('columnheader').findIndex((cell) => cell.textContent === 'Unrealized P&L');
  expect(within(screen.getByText('TRP').closest('tr')).getAllByRole('cell')[gainColumn].textContent).toBe('$100.00');
  expect(screen.getByText(/excludes realized gains/i)).toBeTruthy();
  expect(screen.queryByText(/Demonstration data only/i)).toBeNull();
});

it('shows zero unrealized gain for an empty portfolio', async () => {
  showPortfolio([]);
  await screen.findByText('No assets in portfolio');
  const gainCard = screen.getByRole('heading', { name: 'Unrealized P&L' }).parentElement;
  expect(within(gainCard).getByText('$0.00')).toBeTruthy();
});

it('does not report a gain when a holding has no mark', async () => {
  showPortfolio([{ id: 1, symbol: 'AAPL', quantity: 10, avg_price: 100, current_price: null }], { estimated: true });
  await screen.findByText('Welcome, Trader');
  const gainCard = screen.getByRole('heading', { name: 'Unrealized P&L' }).parentElement;
  expect(within(gainCard).getByText('N/A')).toBeTruthy();
  expect(screen.getByText(/Net account value includes estimates at entry prices/i)).toBeTruthy();
});

it('does not report zero unrealized gain after a portfolio request fails', async () => {
  showPortfolio([], { fail: true });
  await screen.findByText('Unable to load portfolio.');
  const gainCard = screen.getByRole('heading', { name: 'Unrealized P&L' }).parentElement;
  expect(within(gainCard).getByText('N/A')).toBeTruthy();
});
