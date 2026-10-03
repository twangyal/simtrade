import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Info from '../Components/Info';


let sockets;
beforeEach(() => {
  sockets = [];
  vi.stubGlobal('WebSocket', class {
    constructor(url) { this.url = url; sockets.push(this); }
    close = vi.fn();
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('shows market data failure without making up a quote', () => {
  render(<Info instrumentSelect="AAPL" />);
  act(() => sockets[0].onerror());
  expect(screen.getByRole('status').textContent).toContain('Market data unavailable');
  expect(screen.getByRole('img').getAttribute('data-point-count')).toBe('0');
});

it('clears the previous instrument and ignores quotes from its closed socket', () => {
  const { rerender, unmount } = render(<Info instrumentSelect="AAPL" />);
  act(() => sockets[0].onmessage({ data: JSON.stringify({ symbol: 'AAPL', price: 123 }) }));
  expect(screen.getByLabelText('Last received price').textContent).toBe('123.00');
  rerender(<Info instrumentSelect="QQQ" />);
  expect(sockets[0].close).toHaveBeenCalledOnce();
  expect(screen.getByText('Instrument: QQQ')).toBeTruthy();
  expect(screen.queryByText('123.00')).toBeNull();
  act(() => sockets[0].onmessage({ data: JSON.stringify({ symbol: 'AAPL', price: 124 }) }));
  expect(screen.queryByText('124.00')).toBeNull();
  act(() => sockets[1].onmessage({ data: JSON.stringify({ symbol: 'QQQ', price: 456 }) }));
  expect(screen.getByLabelText('Last received price').textContent).toBe('456.00');
  unmount();
  expect(sockets[1].close).toHaveBeenCalledOnce();
});

it('ignores missing or invalid quotes and recovers after a malformed message', () => {
  render(<Info instrumentSelect="AAPL" />);
  act(() => sockets[0].onmessage({ data: '{' }));
  expect(screen.getByRole('status').textContent).toContain('Unable to read market data');
  act(() => sockets[0].onmessage({ data: JSON.stringify({ symbol: 'AAPL', price: [0] }) }));
  expect(screen.getByRole('img').getAttribute('data-point-count')).toBe('0');
  act(() => sockets[0].onmessage({ data: JSON.stringify({ symbol: 'AAPL', price: [125] }) }));
  expect(screen.getByLabelText('Last received price').textContent).toBe('125.00');
  expect(screen.getByRole('status').textContent).toBe('Last received quote');
});

it('labels a received demo quote as synthetic even when the connection reports an error', () => {
  render(<Info instrumentSelect="AAPL" />);
  act(() => sockets[0].onmessage({ data: JSON.stringify({ symbol: 'AAPL', price: 123, source: 'demo' }) }));

  expect(screen.getByRole('note').textContent).toMatch(/demo.*synthetic.*not live/i);
  expect(screen.getByLabelText('Last received price').textContent).toBe('123.00');

  act(() => sockets[0].onerror());
  expect(screen.getByRole('note').textContent).toMatch(/demo.*synthetic.*not live/i);
});

it('clears the demo notice when changing instruments until another demo quote arrives', () => {
  const { rerender } = render(<Info instrumentSelect="AAPL" />);
  act(() => sockets[0].onmessage({ data: JSON.stringify({ symbol: 'AAPL', price: 123, source: 'demo' }) }));
  expect(screen.getByRole('note')).toBeTruthy();

  rerender(<Info instrumentSelect="QQQ" />);
  expect(screen.queryByRole('note')).toBeNull();

  act(() => sockets[0].onmessage({ data: JSON.stringify({ symbol: 'AAPL', price: 124, source: 'demo' }) }));
  expect(screen.queryByRole('note')).toBeNull();

  act(() => sockets[1].onmessage({ data: JSON.stringify({ symbol: 'QQQ', price: 456, source: 'demo' }) }));
  expect(screen.getByRole('note').textContent).toMatch(/demo.*synthetic.*not live/i);
});

it('removes the demo notice when the next quote has a live source', () => {
  render(<Info instrumentSelect="AAPL" />);
  act(() => sockets[0].onmessage({ data: JSON.stringify({ symbol: 'AAPL', price: 123, source: 'demo' }) }));
  expect(screen.getByRole('note')).toBeTruthy();

  act(() => sockets[0].onmessage({ data: JSON.stringify({ symbol: 'AAPL', price: 124, source: 'live' }) }));
  expect(screen.queryByRole('note')).toBeNull();
  expect(screen.getByLabelText('Last received price').textContent).toBe('124.00');
});

it('charts valid received ticks once and resets the trace and range for a new instrument', () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
  const { rerender } = render(<Info instrumentSelect="AAPL" />);
  const receive = (payload) => act(() => sockets[0].onmessage({ data: JSON.stringify(payload) }));
  receive({ symbol: 'AAPL', price: 123 });
  receive({ symbol: 'AAPL', price: 123 });
  receive({ symbol: 'AAPL', price: true });
  receive(null);
  expect(screen.getByRole('img').getAttribute('data-point-count')).toBe('1');
  now.mockReturnValue(2_000);
  receive({ symbol: 'AAPL', price: 124 });
  expect(screen.getByRole('img').getAttribute('data-point-count')).toBe('2');
  expect(screen.getByTestId('quote-price-line')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '1m', exact: true }));
  rerender(<Info instrumentSelect="QQQ" />);
  expect(screen.getByRole('img').getAttribute('data-point-count')).toBe('0');
  expect(screen.queryByTestId('quote-price-line')).toBeNull();
  expect(screen.getByRole('button', { name: 'All', exact: true }).getAttribute('aria-pressed')).toBe('true');
});

it('reports sanitized quotes to the latest callback without reconnecting on callback changes', () => {
  vi.spyOn(Date, 'now').mockReturnValue(1_000);
  const first = vi.fn();
  const second = vi.fn();
  const { rerender } = render(<Info instrumentSelect="AAPL" onQuote={first} />);
  expect(first).toHaveBeenCalledWith(null);
  act(() => sockets[0].onmessage({ data: JSON.stringify({ symbol: 'AAPL', price: ['123'], bid: '122', ask: '124', source: 'demo' }) }));
  expect(first).toHaveBeenLastCalledWith({ symbol: 'AAPL', price: 123, bid: 122, ask: 124, source: 'demo', receivedAt: 1_000 });
  rerender(<Info instrumentSelect="AAPL" onQuote={second} />);
  expect(sockets).toHaveLength(1);
  act(() => sockets[0].onmessage({ data: JSON.stringify({ symbol: 'AAPL', price: 125 }) }));
  expect(first).toHaveBeenCalledTimes(2);
  expect(second).toHaveBeenLastCalledWith({ symbol: 'AAPL', price: 125, receivedAt: 1_000 });
  rerender(<Info instrumentSelect="QQQ" onQuote={second} />);
  expect(second).toHaveBeenLastCalledWith(null);
  act(() => sockets[0].onmessage({ data: JSON.stringify({ symbol: 'AAPL', price: 126 }) }));
  expect(second).toHaveBeenCalledTimes(2);
});
