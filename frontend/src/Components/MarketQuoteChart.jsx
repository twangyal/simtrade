import { useEffect, useId, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { quoteRangeStats, selectQuoteRange } from '../quotes';
import { formatQuotePrice, formatReceiptTime } from '../quoteFormat';
import { quoteAxis, formatAxisPrice } from '../quoteAxis';
import { quoteTimeLabels } from '../quoteTimeAxis';
import './MarketQuoteChart.css';

const HEIGHT = 320;
const TOP = 24;
const BOTTOM = 280;
const LEFT = 14;
const RIGHT = 88;

function geometry(points, width, stats) {
  if (!stats) return null;
  const axis = quoteAxis(stats.low, stats.high);
  const { low, high } = axis;
  const firstTime = points[0].time;
  const duration = points.at(-1).time - firstTime;
  const ticks = [...axis.ticks].reverse();
  const labels = ticks.map((price) => formatAxisPrice(price, axis.step));
  const axisWidth = Math.max(RIGHT, ...labels.map((label) => label.length * 5.7 + 22));
  const right = Math.max(LEFT + 40, width - axisWidth);
  const priceY = (price) => BOTTOM - ((price - low) / (high - low)) * (BOTTOM - TOP);
  const position = (point) => ({
    x: duration ? LEFT + ((point.time - firstTime) / duration) * (right - LEFT) : (LEFT + right) / 2,
    y: priceY(point.price),
  });
  const plotted = points.map(position);
  const line = plotted.map(({ x, y }, index) => `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${line} L${plotted.at(-1).x.toFixed(2)},${BOTTOM} L${plotted[0].x.toFixed(2)},${BOTTOM} Z`;
  const grid = ticks.map((price, index) => ({
    y: priceY(price), label: labels[index],
  }));
  return { plotted, line, area, grid, right, timeLabels: quoteTimeLabels(points, plotted) };
}

export default function MarketQuoteChart({ points, symbol }) {
  const [range, setRange] = useState('All');
  const [inspectedTime, setInspectedTime] = useState(null);
  const [width, setWidth] = useState(800);
  const plot = useRef(null);
  const gradientId = `quote-fill-${useId().replaceAll(':', '')}`;
  const hintId = `quote-hint-${useId().replaceAll(':', '')}`;
  const visible = useMemo(() => selectQuoteRange(points, range), [points, range]);
  const stats = useMemo(() => quoteRangeStats(visible), [visible]);
  const shape = useMemo(() => geometry(visible, width, stats), [visible, width, stats]);
  const foundIndex = visible.findIndex((point) => point.time === inspectedTime);
  const activeIndex = foundIndex < 0 ? visible.length - 1 : foundIndex;
  const active = visible[activeIndex];
  const activePosition = shape?.plotted[activeIndex];
  const inspecting = foundIndex >= 0;
  const measured = visible.length >= 2;
  const tone = measured && stats?.change < 0 ? 'negative' : measured && stats?.change > 0 ? 'positive' : 'neutral';

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(Math.max(240, entry.contentRect.width));
    });
    observer.observe(plot.current);
    return () => observer.disconnect();
  }, []);

  const inspectPointer = (event) => {
    if (!shape || !visible.length) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width) return;
    const x = ((event.clientX - bounds.left) / bounds.width) * width;
    let nearest = 0;
    for (let index = 1; index < shape.plotted.length; index += 1) {
      if (Math.abs(shape.plotted[index].x - x) < Math.abs(shape.plotted[nearest].x - x)) nearest = index;
    }
    setInspectedTime(visible[nearest].time);
  };

  const signedChange = stats ? `${stats.change > 0 ? '+' : ''}${formatQuotePrice(stats.change)}` : '';
  const signedPercent = stats?.percent != null ? `${stats.percent > 0 ? '+' : ''}${stats.percent.toFixed(2)}%` : 'Percentage unavailable';

  return (
    <section className="market-chart" aria-label={`${symbol} received quote history`}>
      <div className="market-chart-toolbar">
        <div>
          <span className="market-chart-eyebrow">Observed change</span>
          <div className={`market-chart-change is-${tone}`} aria-label="Observed range change">
            {measured && stats ? <>{signedChange} <span>({signedPercent})</span></> : 'Collecting ticks'}
          </div>
        </div>
        <div className="market-chart-ranges" role="group" aria-label="Chart range">
          {['1m', '5m', 'All'].map((option) => (
            <button key={option} type="button" aria-pressed={range === option} onClick={() => {
              setRange(option);
              setInspectedTime(null);
            }}>{option}</button>
          ))}
        </div>
      </div>
      <div className="market-chart-readout">
        <span>{inspecting ? 'Inspecting quote' : 'Latest quote'}</span>
        {active ? <><strong>{formatQuotePrice(active.price)}</strong><time dateTime={new Date(active.time).toISOString()}>{formatReceiptTime(active.time)}</time></> : <span>—</span>}
      </div>
      <div ref={plot} className="market-chart-plot" onPointerMove={inspectPointer} onPointerLeave={() => setInspectedTime(null)}>
        <svg className={`market-chart-svg is-${tone}`} role="img" aria-label={`${symbol} price chart from received quotes`}
          data-point-count={visible.length} viewBox={`0 0 ${width} ${HEIGHT}`}>
          <title>{symbol} · received quotes</title>
          <desc>{visible.length} quotes received in this browser. No historical data is added.</desc>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.17" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {(shape?.grid ?? Array.from({ length: 5 }, (_, index) => ({ y: TOP + (index / 4) * (BOTTOM - TOP) }))).map((row, index) => (
            <g key={index}>
              <line className="market-chart-gridline" x1={LEFT} y1={row.y} x2={shape?.right ?? width - RIGHT} y2={row.y} />
              {row.label !== undefined && <text className="market-chart-axis" x={shape.right + 14} y={row.y + 4}>{row.label}</text>}
            </g>
          ))}
          {shape && measured && <>
            <path d={shape.area} fill={`url(#${gradientId})`} />
            <path data-testid="quote-price-line" className="market-chart-line" d={shape.line} />
          </>}
          {activePosition && <>
            {inspecting && <line className="market-chart-crosshair" x1={activePosition.x} x2={activePosition.x} y1={TOP} y2={BOTTOM} />}
            <circle className="market-chart-point-halo" cx={activePosition.x} cy={activePosition.y} r="9" />
            <circle className="market-chart-point" cx={activePosition.x} cy={activePosition.y} r="4" />
          </>}
          {shape?.timeLabels.map(({ time, x, anchor, label }) => (
            <text key={time} className="market-chart-axis" x={x} y={HEIGHT - 12}
              textAnchor={anchor}>{label}</text>
          ))}
        </svg>
        {!visible.length && <div className="market-chart-empty"><span className="market-chart-empty-mark" aria-hidden="true">↗</span><strong>Waiting for the first quote</strong><p>Your chart begins when a price arrives.</p></div>}
      </div>
      {visible.length === 1 && <p className="market-chart-collecting">One quote received. Waiting for the next tick to show a trend.</p>}
      {measured && <label className="market-chart-inspector">
        <span>Inspect ticks</span>
        <input type="range" aria-label="Inspect received quotes" aria-describedby={hintId} min="0" max={visible.length - 1} step="1" value={activeIndex}
          aria-valuetext={`${formatQuotePrice(active.price)} at ${formatReceiptTime(active.time)}`}
          onChange={(event) => setInspectedTime(visible[Number(event.target.value)].time)} />
        <span>{visible.length.toLocaleString('en-US')} ticks</span>
      </label>}
      <div className="market-chart-footnote" id={hintId}>
        <span>{range === 'All' ? 'All received quotes (up to 1,800).' : `${range} ending at the latest received quote.`} Browser receipt times.</span>
        <span>Move over the chart or use the tick slider with arrow keys.</span>
      </div>
    </section>
  );
}

MarketQuoteChart.propTypes = {
  symbol: PropTypes.string.isRequired,
  points: PropTypes.arrayOf(PropTypes.shape({ time: PropTypes.number.isRequired, price: PropTypes.number.isRequired })).isRequired,
};
