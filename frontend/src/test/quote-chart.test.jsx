import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import MarketQuoteChart from '../Components/MarketQuoteChart';

const points = [
  { time: 1_000, price: 100 },
  { time: 61_000, price: 102 },
  { time: 121_000, price: 101 },
];

it('shows an honest empty chart without invented prices or a trend', () => {
  render(<MarketQuoteChart points={[]} symbol="AAPL" />);
  expect(screen.getByText('Waiting for the first quote')).toBeTruthy();
  expect(screen.queryByTestId('quote-price-line')).toBeNull();
  expect(screen.queryByRole('slider')).toBeNull();
  expect(screen.getByRole('img', { name: 'AAPL price chart from received quotes' }).getAttribute('data-point-count')).toBe('0');
});

it('shows a single received tick without suggesting a measured trend', () => {
  render(<MarketQuoteChart points={points.slice(0, 1)} symbol="AAPL" />);
  expect(screen.getByText('One quote received. Waiting for the next tick to show a trend.')).toBeTruthy();
  expect(screen.queryByTestId('quote-price-line')).toBeNull();
  expect(screen.getByLabelText('Observed range change').textContent).toBe('Collecting ticks');
});

it('windows actual ticks and measures only the selected received range', () => {
  render(<MarketQuoteChart points={points} symbol="AAPL" />);
  const chart = screen.getByRole('img');
  expect(chart.getAttribute('data-point-count')).toBe('3');
  expect(screen.getByLabelText('Observed range change').textContent).toContain('+1.00');
  fireEvent.click(screen.getByRole('button', { name: '1m', exact: true }));
  expect(chart.getAttribute('data-point-count')).toBe('2');
  expect(screen.getByRole('button', { name: '1m', exact: true }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByLabelText('Observed range change').textContent).toContain('-1.00');
  expect(screen.getByText(/1m ending at the latest received quote/)).toBeTruthy();
  expect(screen.getByTestId('quote-price-line').getAttribute('d')).not.toMatch(/NaN|Infinity/);
});

it('provides a native keyboard slider and preserves the inspected tick as new quotes arrive', () => {
  const { rerender } = render(<MarketQuoteChart points={points} symbol="AAPL" />);
  const slider = screen.getByRole('slider', { name: 'Inspect received quotes' });
  expect(slider.value).toBe('2');
  fireEvent.change(slider, { target: { value: '0' } });
  expect(slider.getAttribute('aria-valuetext')).toContain('100.00');
  expect(screen.getByText('Inspecting quote')).toBeTruthy();
  rerender(<MarketQuoteChart points={[...points, { time: 181_000, price: 103 }]} symbol="AAPL" />);
  expect(slider.value).toBe('0');
  expect(slider.getAttribute('aria-valuetext')).toContain('100.00');
});

it('inspects the nearest received quote by pointer and returns to the latest on leave', () => {
  render(<MarketQuoteChart points={points} symbol="AAPL" />);
  const plot = screen.getByRole('img').parentElement;
  vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 800 });
  fireEvent(plot, new MouseEvent('pointermove', { bubbles: true, clientX: 20 }));
  expect(screen.getByRole('slider').value).toBe('0');
  fireEvent.pointerLeave(plot);
  expect(screen.getByRole('slider').value).toBe('2');
});

it('renders flat prices with finite geometry and a neutral zero change', () => {
  render(<MarketQuoteChart points={points.map((point) => ({ ...point, price: 0.01234 }))} symbol="EUR/USD" />);
  expect(screen.getByTestId('quote-price-line').getAttribute('d')).not.toMatch(/NaN|Infinity/);
  expect(screen.getByLabelText('Observed range change').textContent).toContain('0.00');
});

it.each([
  [100, 101, 102],
  [4.5e-287, 4.500000000000001e-287, 4.5000000000000013e-287],
])('aligns equal guide and quote prices across %s, %s and %s', (low, middle, high) => {
  render(<MarketQuoteChart points={[
    { time: 1_000, price: low }, { time: 2_000, price: middle }, { time: 3_000, price: high },
  ]} symbol="AAPL" />);
  fireEvent.change(screen.getByRole('slider'), { target: { value: '1' } });
  const chart = screen.getByRole('img');
  const guideLabel = [...chart.querySelectorAll('text')]
    .find((label) => Number(label.textContent.replaceAll(',', '')) === middle);
  expect(guideLabel).toBeTruthy();
  const guideY = Number(guideLabel.parentElement.querySelector('line').getAttribute('y1'));
  const pointY = Number(chart.querySelector('.market-chart-point').getAttribute('cy'));
  expect(guideY).toBeCloseTo(pointY, 8);
});

it('keeps tiny received prices nonzero in the readout, inspection, and change', () => {
  render(<MarketQuoteChart points={[{ time: 1_000, price: 1.2e-6 }, { time: 2_000, price: 1.3e-6 }]} symbol="AAPL" />);
  const inspectedPrice = screen.getByRole('slider').getAttribute('aria-valuetext').split(' at ')[0];
  expect(Number(inspectedPrice)).toBeGreaterThan(0);
  expect(screen.getByLabelText('Observed range change').textContent).not.toContain('+0.00');
  expect(screen.getByTestId('quote-price-line').getAttribute('d')).not.toMatch(/NaN|Infinity/);
});

it('keeps the finite price trace when only percentage change overflows', () => {
  render(<MarketQuoteChart points={[{ time: 1_000, price: 1e-308 }, { time: 2_000, price: 1 }]} symbol="AAPL" />);
  expect(screen.getByTestId('quote-price-line').getAttribute('d')).not.toMatch(/NaN|Infinity/);
  expect(screen.getByLabelText('Observed range change').textContent).toContain('+1.00');
  expect(screen.getByLabelText('Observed range change').textContent).toContain('Percentage unavailable');
  expect(screen.queryByText('Collecting ticks')).toBeNull();
  expect(screen.getByRole('img').getAttribute('data-point-count')).toBe('2');
});

it('omits an overlapping timestamp after a reconnect gap while keeping all observed points', () => {
  render(<MarketQuoteChart points={[{ time: 1_000, price: 100 }, { time: 2_000, price: 101 }, { time: 61_000, price: 102 }]} symbol="AAPL" />);
  const chart = screen.getByRole('img');
  const timeLabels = [...chart.querySelectorAll('text[y="308"]')];
  expect(timeLabels).toHaveLength(2);
  expect(timeLabels.map((label) => label.getAttribute('text-anchor'))).toEqual(['start', 'end']);
  expect(chart.getAttribute('data-point-count')).toBe('3');
  expect(screen.getByTestId('quote-price-line')).toBeTruthy();
});
