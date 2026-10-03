import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import TableRegion from '../Components/TableRegion';

let geometry;
let observers;

beforeEach(() => {
  geometry = { width: 320, content: 800 };
  observers = [];
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function () {
    return this.classList.contains('table-scroll') ? geometry.width : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function () {
    return this.classList.contains('table-scroll') ? geometry.content : 0;
  });
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) {
      this.notify = callback;
      this.observe = vi.fn();
      this.disconnect = vi.fn();
      observers.push(this);
    }
  });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function table(label = 'Portfolio holdings') {
  return <TableRegion label={label}><table><thead><tr><th scope="col">Asset</th><th scope="col">Unrealized P&amp;L</th></tr></thead><tbody><tr><td>AAPL</td><td>$12.00</td></tr></tbody></table></TableRegion>;
}

it('preserves table semantics and adds no controls when every column fits', () => {
  geometry.content = geometry.width;
  render(table());
  const region = screen.getByRole('region', { name: 'Portfolio holdings' });
  expect(region.tabIndex).toBe(0);
  expect(region.contains(screen.getByRole('table'))).toBe(true);
  expect(screen.getByRole('columnheader', { name: 'Unrealized P&L' })).toBeTruthy();
  expect(screen.queryByText('More columns')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
  expect(region.hasAttribute('aria-describedby')).toBe(false);
});

it('reveals actual overflow with contextual controls and a region description', () => {
  render(table());
  const region = screen.getByRole('region', { name: 'Portfolio holdings' });
  const left = screen.getByRole('button', { name: 'Scroll Portfolio holdings left' });
  const right = screen.getByRole('button', { name: 'Scroll Portfolio holdings right' });
  expect(left.disabled).toBe(true);
  expect(right.disabled).toBe(false);
  expect(right.getAttribute('aria-controls')).toBe(region.id);
  expect(document.getElementById(region.getAttribute('aria-describedby')).textContent).toMatch(/More columns.*scroll/i);
  expect(observers[0].observe.mock.calls.map(([element]) => element)).toEqual([region, screen.getByRole('table')]);
});

it('updates boundaries after native scrolling, including subpixel rounding', () => {
  render(table());
  const region = screen.getByRole('region', { name: 'Portfolio holdings' });
  const left = screen.getByRole('button', { name: 'Scroll Portfolio holdings left' });
  const right = screen.getByRole('button', { name: 'Scroll Portfolio holdings right' });
  region.scrollLeft = 200;
  fireEvent.scroll(region);
  expect(left.disabled).toBe(false);
  expect(right.disabled).toBe(false);
  region.scrollLeft = 479.7;
  fireEvent.scroll(region);
  expect(right.disabled).toBe(true);
  region.scrollLeft = 0;
  fireEvent.scroll(region);
  expect(left.disabled).toBe(true);
  expect(right.disabled).toBe(false);
  // Arrow keys remain native scrolling controls; the wrapper does not cancel them.
  expect(fireEvent.keyDown(region, { key: 'ArrowRight' })).toBe(true);
});

it.each([false, true])('scrolls in both directions and respects reduced motion: %s', (reduced) => {
  window.matchMedia.mockReturnValue({ matches: reduced });
  render(table('Trade records'));
  const region = screen.getByRole('region', { name: 'Trade records' });
  region.scrollBy = vi.fn();
  fireEvent.click(screen.getByRole('button', { name: 'Scroll Trade records right' }));
  expect(region.scrollBy).toHaveBeenLastCalledWith({ left: 256, behavior: reduced ? 'auto' : 'smooth' });
  region.scrollLeft = 256;
  fireEvent.scroll(region);
  fireEvent.click(screen.getByRole('button', { name: 'Scroll Trade records left' }));
  expect(region.scrollBy).toHaveBeenLastCalledWith({ left: -256, behavior: reduced ? 'auto' : 'smooth' });
  expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
});

it('responds to table and container resizes, then disconnects on unmount', () => {
  geometry.content = 320;
  const { unmount } = render(table());
  expect(screen.queryByText('More columns')).toBeNull();
  geometry.content = 900;
  act(() => observers[0].notify());
  expect(screen.getByText('More columns')).toBeTruthy();
  geometry.width = 1000;
  act(() => observers[0].notify());
  expect(screen.queryByRole('button')).toBeNull();
  unmount();
  expect(observers[0].disconnect).toHaveBeenCalledOnce();
});

it('has a window resize fallback without ResizeObserver and measures changed content', () => {
  vi.stubGlobal('ResizeObserver', undefined);
  geometry.content = 320;
  const { rerender } = render(table());
  geometry.content = 800;
  fireEvent(window, new Event('resize'));
  expect(screen.getByText('More columns')).toBeTruthy();
  geometry.content = 320;
  rerender(table());
  expect(screen.queryByRole('button')).toBeNull();
});

it('keeps descriptions and controlled region IDs unique for multiple tables', () => {
  render(<>{table()}{table('Trade records')}</>);
  const holdings = screen.getByRole('region', { name: 'Portfolio holdings' });
  const trades = screen.getByRole('region', { name: 'Trade records' });
  expect(holdings.id).not.toBe(trades.id);
  expect(holdings.getAttribute('aria-describedby')).not.toBe(trades.getAttribute('aria-describedby'));
  expect(screen.getByRole('button', { name: 'Scroll Trade records right' }).getAttribute('aria-controls')).toBe(trades.id);
});
