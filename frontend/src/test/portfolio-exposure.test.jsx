import { expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import PortfolioExposure from '../Components/PortfolioExposure';

const mixedHoldings = [
  { symbol: 'AAPL', quantity: 3, current_price: 100 },
  { symbol: 'TRP', quantity: -2, current_price: 50 },
];

it('renders an accessible chart and a visible value/weight breakdown for both directions', () => {
  render(<PortfolioExposure holdings={mixedHoldings} />);
  expect(screen.getByRole('heading', { name: 'Position exposure' })).toBeTruthy();
  const chart = screen.getByRole('img', { name: 'Position exposure chart' });
  const description = document.getElementById(chart.getAttribute('aria-describedby'));
  expect(description.textContent).toMatch(/absolute marked market value/i);
  expect(description.textContent).toMatch(/short positions are liabilities/i);
  const list = screen.getByRole('list', { name: 'Marked position breakdown' });
  const [long, short] = within(list).getAllByRole('listitem');
  expect(long.textContent).toContain('AAPL · Long');
  expect(long.textContent).toContain('$300.00');
  expect(long.textContent).toContain('75%');
  expect(short.textContent).toContain('TRP · Short');
  expect(short.textContent).toContain('$100.00');
  expect(short.textContent).toContain('25%');
  expect(screen.getByText('Gross exposure')).toBeTruthy();
  expect(screen.getByText('$400.00')).toBeTruthy();
  expect(screen.getByText(/shorts are liabilities/i)).toBeTruthy();
  expect(screen.queryByText('AAPL', { exact: true })).toBeNull();
  const arcs = chart.querySelectorAll('circle[data-exposure-segment]');
  expect(arcs).toHaveLength(2);
  expect(arcs[0].getAttribute('stroke-dasharray')).toBe('75 25');
  expect(arcs[1].getAttribute('stroke-dashoffset')).toBe('-75');
});

it('labels a partial chart and does not draw or list unknown marks', () => {
  render(<PortfolioExposure holdings={[
    ...mixedHoldings,
    { symbol: 'QQQ', quantity: 2, current_price: null, avg_price: 500 },
  ]} />);
  expect(screen.getByText('Partial view')).toBeTruthy();
  expect(screen.getByText(/1 position excluded/i)).toBeTruthy();
  expect(screen.getByText('Known gross exposure')).toBeTruthy();
  expect(screen.getByRole('img', { name: 'Position exposure chart' })).toBeTruthy();
  expect(within(screen.getByRole('list', { name: 'Marked position breakdown' })).queryByText(/QQQ/)).toBeNull();
});

it('shows unavailable values rather than a zero chart when all marks are unknown', () => {
  render(<PortfolioExposure holdings={[{ symbol: 'QQQ', quantity: 2, current_price: null }]} />);
  expect(screen.getByText('Market values unavailable')).toBeTruthy();
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.queryByText('$0.00')).toBeNull();
  expect(screen.queryByText('No open positions')).toBeNull();
});

it('distinguishes loading, a failed request, and a loaded empty portfolio', () => {
  const { rerender } = render(<PortfolioExposure holdings={[]} loading />);
  expect(screen.getByRole('status').textContent).toContain('Loading position exposure');
  expect(screen.queryByText('No open positions')).toBeNull();
  rerender(<PortfolioExposure holdings={[]} unavailable />);
  expect(screen.getByText('Position exposure unavailable')).toBeTruthy();
  expect(screen.queryByText('No open positions')).toBeNull();
  rerender(<PortfolioExposure holdings={[{ symbol: 'AAPL', quantity: 0, current_price: 100 }]} />);
  expect(screen.getByText('No open positions')).toBeTruthy();
  expect(screen.queryByRole('img')).toBeNull();
});

it('uses unique accessible chart labels when multiple panels are rendered', () => {
  render(<><PortfolioExposure holdings={mixedHoldings} /><PortfolioExposure holdings={mixedHoldings} /></>);
  const charts = screen.getAllByRole('img', { name: 'Position exposure chart' });
  expect(charts[0].getAttribute('aria-labelledby')).not.toBe(charts[1].getAttribute('aria-labelledby'));
  for (const chart of charts) expect(document.getElementById(chart.getAttribute('aria-describedby'))).toBeTruthy();
});

it('uses rounded decimal money for its description, center, legend and direction totals', () => {
  render(<PortfolioExposure holdings={[
    { symbol: 'AAPL', quantity: 0.1, current_price: 100.05 },
    { symbol: 'QQQ', quantity: 0.1, current_price: 100.05 },
    { symbol: 'TRP', quantity: -0.1, current_price: 100.05 },
  ]} />);
  const chart = screen.getByRole('img', { name: 'Position exposure chart' });
  const description = document.getElementById(chart.getAttribute('aria-describedby')).textContent;
  expect(description).toContain('Gross exposure $30.02');
  expect(description).toContain('Long positions $20.01');
  expect(description).toContain('short positions $10.00');
  expect(screen.getByTitle('$30.02').textContent).toBe('$30.02');
  const positions = within(screen.getByRole('list', { name: 'Marked position breakdown' })).getAllByRole('listitem');
  for (const position of positions) expect(position.textContent).toContain('$10.00');
  expect(screen.getByText('Long positions').nextElementSibling.textContent).toContain('$20.01');
  expect(screen.getByText('Short positions').nextElementSibling.textContent).toContain('$10.00');
  // Arc shares still come from unrounded marked exposure, not rounded legend values.
  expect(Number(chart.querySelector('[data-exposure-segment]').getAttribute('stroke-dasharray').split(' ')[0])).toBeCloseTo(100 / 3);
});

it('bases its compact center and full-value title on final rounded money', () => {
  render(<PortfolioExposure holdings={[{ symbol: 'AAPL', quantity: 1, current_price: 9999.995 }]} />);
  expect(screen.getByTitle('$10,000.00').textContent).toBe('$10K');
});

it('shows unavailable money instead of coercing an unsafe amount to zero or a compact amount', () => {
  render(<PortfolioExposure holdings={[{ symbol: 'AAPL', quantity: 1e14, current_price: 1 }]} />);
  const chart = screen.getByRole('img', { name: 'Position exposure chart' });
  const description = document.getElementById(chart.getAttribute('aria-describedby')).textContent;
  expect(description).toContain('Gross exposure N/A');
  expect(screen.getByTitle('N/A').textContent).toBe('N/A');
  expect(screen.queryByText('$100T')).toBeNull();
  expect(within(screen.getByRole('list', { name: 'Marked position breakdown' })).getByText('N/A')).toBeTruthy();
});
