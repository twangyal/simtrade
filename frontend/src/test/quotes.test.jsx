import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Info from '../Components/Info';

vi.mock('highcharts-react-official', () => ({ default: () => <div /> }));

let sockets;
beforeEach(() => {
  sockets = [];
  vi.stubGlobal('WebSocket', class {
    constructor(url) { this.url = url; sockets.push(this); }
    close = vi.fn();
  });
});
afterEach(() => vi.unstubAllGlobals());

it('shows market data failure without making up a quote', () => {
  render(<Info instrumentSelect="AAPL" />);
  act(() => sockets[0].onerror());
  expect(screen.getByRole('status').textContent).toContain('Market data unavailable');
  expect(screen.queryByText('Quotes received during this session.')).toBeNull();
});

it('clears the previous instrument and ignores quotes from its closed socket', () => {
  const { rerender, unmount } = render(<Info instrumentSelect="AAPL" />);
  act(() => sockets[0].onmessage({ data: JSON.stringify({ symbol: 'AAPL', price: 123 }) }));
  expect(screen.getByText('123')).toBeTruthy();
  rerender(<Info instrumentSelect="QQQ" />);
  expect(sockets[0].close).toHaveBeenCalledOnce();
  expect(screen.getByText('Instrument: QQQ')).toBeTruthy();
  expect(screen.queryByText('123')).toBeNull();
  act(() => sockets[0].onmessage({ data: JSON.stringify({ symbol: 'AAPL', price: 124 }) }));
  expect(screen.queryByText('124')).toBeNull();
  act(() => sockets[1].onmessage({ data: JSON.stringify({ symbol: 'QQQ', price: 456 }) }));
  expect(screen.getByText('456')).toBeTruthy();
  unmount();
  expect(sockets[1].close).toHaveBeenCalledOnce();
});

it('ignores missing or invalid quotes and recovers after a malformed message', () => {
  render(<Info instrumentSelect="AAPL" />);
  act(() => sockets[0].onmessage({ data: '{' }));
  expect(screen.getByRole('status').textContent).toContain('Unable to read market data');
  act(() => sockets[0].onmessage({ data: JSON.stringify({ symbol: 'AAPL', price: [0] }) }));
  expect(screen.queryByText('Quotes received during this session.')).toBeNull();
  act(() => sockets[0].onmessage({ data: JSON.stringify({ symbol: 'AAPL', price: [125] }) }));
  expect(screen.getByText('125')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toBe('Last received quote');
});
