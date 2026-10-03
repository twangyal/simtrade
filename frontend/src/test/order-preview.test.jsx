import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import axios from 'axios';
import Trade from '../Components/Trade';
import TradeControls from '../Components/TradeControls';

vi.mock('axios', () => {
  const client = { get: vi.fn(), post: vi.fn(), interceptors: { response: { use: vi.fn() } } };
  client.create = () => client;
  return { default: client };
});

let sockets;
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('accessToken', 'preview-test-token');
  sockets = [];
  vi.stubGlobal('WebSocket', class {
    constructor() { sockets.push(this); }
    close = vi.fn();
  });
  axios.get.mockResolvedValue({ data: { mode: 'demo', supported_symbols: ['AAPL', 'BTC/USD', 'QQQ'], ready_symbols: ['AAPL', 'BTC/USD', 'QQQ'] } });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const quote = (extra = {}) => ({ symbol: 'AAPL', price: 100, receivedAt: Date.now(), ...extra });
const enterQuantity = (value = '0.125') => fireEvent.change(screen.getByRole('spinbutton'), { target: { value } });

it('shows fractional USD buy/sell estimates with exact conservative cent settlement', () => {
  render(<TradeControls selectedOption="AAPL" quote={quote({ ask: 100.005, bid: 99.995 })} />);
  enterQuantity();
  expect(screen.getByLabelText('Indicative buy value').textContent).toBe('$12.51');
  expect(screen.getByLabelText('Indicative sell value').textContent).toBe('$12.49');
  expect(screen.getByText(/final price.*cent rounding.*vary/i)).toBeTruthy();
  expect(screen.getByText(/USD/)).toBeTruthy();
  expect(axios.post).not.toHaveBeenCalled();
});

it('does not invent a value or prevent manual trading while a quote is missing', () => {
  render(<TradeControls selectedOption="AAPL" />);
  enterQuantity();
  expect(screen.queryByLabelText('Indicative buy value')).toBeNull();
  expect(screen.getByText(/waiting for a received quote/i)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Buy', exact: true }).disabled).toBe(false);
});

it('shows receipt age and hides estimates at sixty seconds without a new quote', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-03T12:00:00Z'));
  render(<TradeControls selectedOption="AAPL" quote={quote()} />);
  enterQuantity('1');
  expect(screen.getByLabelText('Indicative buy value').textContent).toBe('$100.00');
  act(() => vi.advanceTimersByTime(59_000));
  expect(screen.getByText(/received 59s ago/i)).toBeTruthy();
  expect(screen.getByLabelText('Indicative buy value')).toBeTruthy();
  act(() => vi.advanceTimersByTime(1_000));
  expect(screen.queryByLabelText('Indicative buy value')).toBeNull();
  expect(screen.getByText(/no quote received in the last 60 seconds/i)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Buy', exact: true }).disabled).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

it('cancels the receipt-age timer when the ticket unmounts', () => {
  vi.useFakeTimers();
  const { unmount } = render(<TradeControls selectedOption="AAPL" quote={quote()} />);
  expect(vi.getTimerCount()).toBe(1);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('immediately discards the old instrument estimate', () => {
  const current = quote();
  const { rerender } = render(<TradeControls selectedOption="AAPL" quote={current} />);
  enterQuantity('1');
  expect(screen.getByLabelText('Indicative buy value').textContent).toBe('$100.00');
  rerender(<TradeControls selectedOption="QQQ" quote={current} />);
  expect(screen.queryByLabelText('Indicative buy value')).toBeNull();
});

it('uses the existing Trade quote socket without reconnecting on each preview update', async () => {
  render(<MemoryRouter initialEntries={['/trade']}><Trade /></MemoryRouter>);
  await screen.findByText('Demo market data');
  enterQuantity('0.25');
  expect(sockets).toHaveLength(1);
  act(() => sockets[0].onmessage({ data: JSON.stringify({ symbol: 'BTC/USD', price: 60_000, source: 'demo' }) }));
  expect(screen.getByLabelText('Indicative buy value').textContent).toBe('$15,000.00');
  act(() => sockets[0].onmessage({ data: JSON.stringify({ symbol: 'BTC/USD', price: 60_004, source: 'demo' }) }));
  expect(screen.getByLabelText('Indicative buy value').textContent).toBe('$15,001.00');
  expect(sockets).toHaveLength(1);
  fireEvent.change(screen.getByRole('combobox', { name: 'Instrument' }), { target: { value: 'QQQ' } });
  expect(sockets).toHaveLength(2);
  expect(screen.queryByLabelText('Indicative buy value')).toBeNull();
  act(() => sockets[0].onmessage({ data: JSON.stringify({ symbol: 'BTC/USD', price: 60_008 }) }));
  expect(screen.queryByLabelText('Indicative buy value')).toBeNull();
  act(() => sockets[1].onmessage({ data: JSON.stringify({ symbol: 'QQQ', price: 400 }) }));
  expect(screen.getByLabelText('Indicative buy value').textContent).toBe('$100.00');
});

it('keeps an uncertain order UUID across quote changes and a manual retry', async () => {
  axios.post.mockRejectedValueOnce(new Error('Network failure'));
  axios.post.mockResolvedValueOnce({ data: { msg: 'ok' } });
  const { rerender } = render(<TradeControls selectedOption="AAPL" quote={quote()} />);
  enterQuantity('1');
  fireEvent.click(screen.getByRole('button', { name: 'Buy', exact: true }));
  await screen.findByRole('alert');
  const firstOrder = axios.post.mock.calls[0][1];
  rerender(<TradeControls selectedOption="AAPL" quote={quote({ price: 110 })} />);
  expect(screen.getByLabelText('Indicative buy value').textContent).toBe('$110.00');
  expect(axios.post).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Buy', exact: true }));
  await screen.findByRole('status');
  expect(axios.post.mock.calls[1][1]).toEqual(firstOrder);
});
