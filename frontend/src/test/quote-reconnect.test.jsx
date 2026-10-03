import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Info from '../Components/Info';


let sockets;
let rejectConnection;
beforeEach(() => {
  vi.useFakeTimers();
  sockets = [];
  rejectConnection = false;
  vi.stubGlobal('WebSocket', class {
    constructor() {
      if (rejectConnection) throw new Error('Network unavailable');
      sockets.push(this);
    }
    close = vi.fn();
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const tick = (milliseconds) => act(() => vi.advanceTimersByTime(milliseconds));
const quote = (socket, price, symbol = 'AAPL') => act(() => socket.onmessage({
  data: JSON.stringify({ symbol, price }),
}));

it('recovers from a disconnect, preserving the last quote until replacement data arrives', () => {
  render(<Info instrumentSelect="AAPL" />);
  quote(sockets[0], 123);
  act(() => sockets[0].onclose());
  expect(screen.getByRole('status').textContent).toMatch(/disconnected.*reconnect/i);
  expect(screen.getByLabelText('Last received price').textContent).toBe('123.00');
  expect(screen.getByRole('img').getAttribute('data-point-count')).toBe('1');
  tick(999);
  expect(sockets).toHaveLength(1);
  tick(1);
  expect(sockets).toHaveLength(2);
  act(() => sockets[1].onopen());
  quote(sockets[1], 125);
  expect(screen.getByLabelText('Last received price').textContent).toBe('125.00');
  expect(screen.getByRole('img').getAttribute('data-point-count')).toBe('2');
  expect(screen.getByTestId('quote-price-line')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toBe('Last received quote');
  quote(sockets[0], 999);
  act(() => sockets[0].onclose());
  expect(screen.queryByText('999.00')).toBeNull();
  expect(screen.getByRole('status').textContent).toBe('Last received quote');
});

it('treats error followed by close as one failed connection', () => {
  render(<Info instrumentSelect="AAPL" />);
  act(() => { sockets[0].onerror(); sockets[0].onclose(); });
  expect(sockets[0].close).toHaveBeenCalledOnce();
  tick(1000);
  expect(sockets).toHaveLength(2);
  tick(30000);
  expect(sockets).toHaveLength(2);
});

it('backs off repeated failures, caps the delay, and resets after a valid quote', () => {
  render(<Info instrumentSelect="AAPL" />);
  for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
    const count = sockets.length;
    act(() => { sockets.at(-1).onopen(); sockets.at(-1).onclose(); });
    tick(delay - 1);
    expect(sockets).toHaveLength(count);
    tick(1);
    expect(sockets).toHaveLength(count + 1);
  }
  quote(sockets.at(-1), 126);
  const count = sockets.length;
  act(() => sockets.at(-1).onclose());
  tick(1000);
  expect(sockets).toHaveLength(count + 1);
});

it('cancels a pending reconnect on unmount', () => {
  const { unmount } = render(<Info instrumentSelect="AAPL" />);
  act(() => sockets[0].onclose());
  unmount();
  tick(30000);
  expect(sockets).toHaveLength(1);
});

it('closes the active socket and ignores its late callbacks after unmount', () => {
  const { unmount } = render(<Info instrumentSelect="AAPL" />);
  unmount();
  expect(sockets[0].close).toHaveBeenCalledOnce();
  act(() => { sockets[0].onerror(); sockets[0].onclose(); });
  tick(30000);
  expect(sockets).toHaveLength(1);
});

it('cancels the old instrument retry and listens only to the new instrument', () => {
  const { rerender } = render(<Info instrumentSelect="AAPL" />);
  quote(sockets[0], 123);
  act(() => sockets[0].onclose());
  rerender(<Info instrumentSelect="QQQ" />);
  expect(screen.queryByText('123.00')).toBeNull();
  expect(sockets).toHaveLength(2);
  tick(30000);
  expect(sockets).toHaveLength(2);
  quote(sockets[0], 999);
  quote(sockets[1], 456, 'QQQ');
  expect(screen.queryByText('999.00')).toBeNull();
  expect(screen.getByLabelText('Last received price').textContent).toBe('456.00');
});

it('recovers if creating the initial browser socket throws', () => {
  rejectConnection = true;
  render(<Info instrumentSelect="AAPL" />);
  expect(screen.getByRole('status').textContent).toMatch(/unavailable.*reconnect/i);
  rejectConnection = false;
  tick(1000);
  expect(sockets).toHaveLength(1);
  quote(sockets[0], 127);
  expect(screen.getByLabelText('Last received price').textContent).toBe('127.00');
});
