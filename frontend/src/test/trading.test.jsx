import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import TradeControls from '../Components/TradeControls';
import Dashboard from '../Components/Dashboard';
import TradeHistory from '../Components/TradeHistory';
import Price from '../Components/price';

vi.mock('axios', () => {
  const client = { get: vi.fn(), post: vi.fn(), interceptors: { response: { use: vi.fn() } } };
  client.create = () => client;
  return { default: client };
});
vi.mock('highcharts-react-official', () => ({ default: () => <div /> }));

function renderPage(page) {
  return render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{page}</MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('accessToken', 'test-token');
});

describe('order entry', () => {
  it.each(['', '0', '-1', '1e309'])('rejects invalid quantity %s before sending an order', (quantity) => {
    render(<TradeControls selectedOption="BTC/USD" />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: quantity } });
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    expect(axios.post).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/finite.*greater than zero/i);
  });

  it('submits fractional quantities and prevents a second order until completion', async () => {
    let complete;
    axios.post.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    render(<TradeControls selectedOption="BTC/USD" />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0.125' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    expect(screen.getByRole('button', { name: 'Sell' }).disabled).toBe(true);
    expect(axios.post).toHaveBeenCalledWith(expect.stringMatching(/\/BUY$/),
      { symbol: 'BTC/USD', quantity: 0.125 }, expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }));
    await act(async () => complete({ data: { msg: 'Trade created successfully' } }));
    expect(screen.getByRole('status').textContent).toMatch(/buy.*0.125.*BTC\/USD.*completed/i);
    expect(screen.getByRole('button', { name: 'Sell' }).disabled).toBe(false);
  });

  it('shows the server rejection without reporting success', async () => {
    axios.post.mockRejectedValueOnce({ response: { data: { detail: 'Insufficient balance' } } });
    render(<TradeControls selectedOption="AAPL" />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Insufficient balance');
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('account views', () => {
  it('renders zero-valued account metrics accurately', async () => {
    axios.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith('/user_data')
      ? { username: 'Trader', balance: 0, short_liability: 0, networth: 0 } : [] }));
    renderPage(<Dashboard />);
    expect(await screen.findByText('Welcome, Trader')).toBeTruthy();
    expect(screen.getAllByText('$0.00')).toHaveLength(4);
    expect(screen.queryByText('$50,000')).toBeNull();
  });

  it('shows account request failures', async () => {
    axios.get.mockRejectedValue({ response: { data: { detail: 'Session expired' } } });
    renderPage(<Dashboard />);
    expect((await screen.findAllByRole('alert'))[0].textContent).toContain('Session expired');
  });

  it('does not show page 1 of 0 for empty history', async () => {
    axios.get.mockResolvedValueOnce({ data: { trades: [], totalPages: 0 } });
    renderPage(<TradeHistory />);
    expect(await screen.findByText('No trades available')).toBeTruthy();
    expect(screen.queryByText(/Page 1 of 0/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(true);
  });

  it('cancels history requests when the view unmounts', async () => {
    axios.get.mockImplementationOnce(() => new Promise(() => {}));
    const { unmount } = renderPage(<TradeHistory />);
    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(1));
    const signal = axios.get.mock.calls[0][1].signal;
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });
});

it('shows zero bid/ask quotes without treating them as missing', () => {
  render(<Price data={{ symbol: 'AAPL', price: 0, bid: 0, ask: 0 }} parentChange="AAPL" />);
  expect(screen.getByText('Ask: 0')).toBeTruthy();
  expect(screen.getByText('Bid: 0')).toBeTruthy();
});

it('ignores an older history response after an effect is cleaned up', async () => {
  let completeOldRequest;
  axios.get.mockImplementationOnce(() => new Promise((resolve) => { completeOldRequest = resolve; }));
  axios.get.mockResolvedValueOnce({ data: { trades: [
    { id: 2, symbol: 'AAPL', quantity: 0.5, price: 100, timestamp: '2026-01-02T12:00:00Z' },
  ], totalPages: 1 } });
  renderPage(<StrictMode><TradeHistory /></StrictMode>);
  expect(await screen.findByText('AAPL')).toBeTruthy();
  await act(async () => completeOldRequest({ data: { trades: [
    { id: 1, symbol: 'QQQ', quantity: 1, price: 100, timestamp: '2026-01-01T12:00:00Z' },
  ], totalPages: 1 } }));
  expect(screen.queryByText('QQQ')).toBeNull();
  expect(screen.getByText('AAPL')).toBeTruthy();
});
