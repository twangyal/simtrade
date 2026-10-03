import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import axios from 'axios';
import MarketStatus from '../Components/MarketStatus';

vi.mock('axios', () => {
  const client = { get: vi.fn(), interceptors: { response: { use: vi.fn() } } };
  client.create = () => client;
  return { default: client };
});

function status(mode, ready = []) {
  return { data: { mode, supported_symbols: ['AAPL', 'BTC/USD'], ready_symbols: ready, quote_max_age_seconds: 60 } };
}
beforeEach(() => { vi.resetAllMocks(); });
afterEach(() => vi.useRealTimers());

it('explicitly labels demo prices as invented rather than live', async () => {
  axios.get.mockResolvedValueOnce(status('demo', ['AAPL', 'BTC/USD']));
  render(<MarketStatus selectedSymbol="BTC/USD" />);
  expect(await screen.findByRole('heading', { name: 'Demo market data' })).toBeTruthy();
  expect(screen.getByText(/synthetic, invented prices for practice/i)).toBeTruthy();
  expect(screen.getByText(/not live market quotes/i)).toBeTruthy();
});

it('explains that a disabled feed cannot supply quotes for orders', async () => {
  axios.get.mockResolvedValueOnce(status('disabled'));
  render(<MarketStatus />);
  expect(await screen.findByRole('heading', { name: 'Market data disabled' })).toBeTruthy();
  expect(screen.getByText(/no quotes are available for trading/i)).toBeTruthy();
});

it('distinguishes a live feed waiting for quotes from a ready instrument', async () => {
  axios.get.mockResolvedValueOnce(status('live', ['AAPL']));
  const { rerender } = render(<MarketStatus selectedSymbol="BTC/USD" />);
  expect(await screen.findByRole('heading', { name: 'Live market data' })).toBeTruthy();
  expect(screen.getByText(/waiting for a fresh quote for BTC\/USD/i)).toBeTruthy();
  rerender(<MarketStatus selectedSymbol="AAPL" />);
  expect(screen.getByText(/fresh quote available for AAPL/i)).toBeTruthy();
});

it('shows an explicit unknown status when the status request fails', async () => {
  axios.get.mockRejectedValueOnce(new Error('Offline'));
  render(<MarketStatus />);
  expect(await screen.findByRole('heading', { name: 'Market data status unknown' })).toBeTruthy();
  expect(screen.getByText(/unable to check market data/i)).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Live market data' })).toBeNull();
});

it('treats malformed status responses as unknown instead of making a mode claim', async () => {
  axios.get.mockResolvedValueOnce({ data: { mode: 'live' } });
  render(<MarketStatus />);
  expect(await screen.findByRole('heading', { name: 'Market data status unknown' })).toBeTruthy();
});

it('refreshes availability and clears the previous mode claim when refresh fails', async () => {
  vi.useFakeTimers();
  axios.get.mockResolvedValueOnce(status('live', ['AAPL']));
  axios.get.mockRejectedValueOnce(new Error('Offline'));
  axios.get.mockResolvedValueOnce(status('demo', ['AAPL']));
  render(<MarketStatus />);
  await act(async () => {});
  expect(screen.getByRole('heading', { name: 'Live market data' })).toBeTruthy();
  await act(async () => vi.advanceTimersByTimeAsync(15000));
  expect(screen.getByRole('heading', { name: 'Market data status unknown' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Live market data' })).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(15000));
  expect(screen.getByRole('heading', { name: 'Demo market data' })).toBeTruthy();
});

it('cancels the current request and stops polling on unmount', async () => {
  vi.useFakeTimers();
  let finish;
  axios.get.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const { unmount } = render(<MarketStatus />);
  const signal = axios.get.mock.calls[0][1].signal;
  unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => finish(status('live', ['AAPL'])));
  await act(async () => vi.advanceTimersByTimeAsync(30000));
  expect(axios.get).toHaveBeenCalledTimes(1);
});

it('clears a scheduled refresh when the page closes', async () => {
  vi.useFakeTimers();
  axios.get.mockResolvedValueOnce(status('demo', ['AAPL']));
  const { unmount } = render(<MarketStatus />);
  await act(async () => {});
  expect(screen.getByRole('heading', { name: 'Demo market data' })).toBeTruthy();
  unmount();
  await act(async () => vi.advanceTimersByTimeAsync(30000));
  expect(axios.get).toHaveBeenCalledTimes(1);
});
