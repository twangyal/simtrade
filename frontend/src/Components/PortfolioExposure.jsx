import { useId } from 'react';
import PropTypes from 'prop-types';
import { formatMoney } from '../api';
import { portfolioExposure } from '../exposure';
import './PortfolioExposure.css';

const COLORS = ['#087f6a', '#6c91ae', '#c59a52', '#9784b7', '#8fb7a3', '#5e7b88', '#bc8d89', '#b2b580'];
const compactMoney = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1,
});
const percent = (value) => value > 0 && value < 0.1 ? '<0.1%' : `${Number(value.toFixed(1))}%`;

function PortfolioExposure({ holdings = [], loading = false, unavailable = false }) {
  const id = useId();
  const exposure = portfolioExposure(holdings);
  const { gross, long, short, positions, openCount, excludedCount } = exposure;
  const partial = excludedCount > 0;
  const hasChart = !loading && !unavailable && positions.length > 0;
  const longWeight = gross ? long / gross * 100 : 0;
  const shortWeight = gross ? short / gross * 100 : 0;
  let stateTitle;
  let stateDetail;
  if (loading) {
    stateTitle = 'Loading position exposure…';
    stateDetail = 'Your portfolio breakdown will appear here.';
  } else if (unavailable) {
    stateTitle = 'Position exposure unavailable';
    stateDetail = 'Refresh your portfolio to view its allocation.';
  } else if (openCount === 0) {
    stateTitle = 'No open positions';
    stateDetail = 'Your position mix will appear after your first trade.';
  } else if (!positions.length) {
    stateTitle = 'Market values unavailable';
    stateDetail = `${excludedCount} open ${excludedCount === 1 ? 'position has' : 'positions have'} no usable market mark yet.`;
  }

  return (
    <section className="exposure-panel" aria-labelledby={`${id}-heading`} aria-busy={loading}>
      <div className="exposure-panel__header">
        <div>
          <h2 id={`${id}-heading`}>Position exposure</h2>
          <p>Absolute marked market value</p>
        </div>
        {hasChart && <span className={`exposure-panel__badge${partial ? ' exposure-panel__badge--partial' : ''}`}>
          {partial ? 'Partial view' : `${positions.length} ${positions.length === 1 ? 'position' : 'positions'}`}
        </span>}
      </div>

      {hasChart ? <>
        <div className="exposure-panel__body">
          <div className="exposure-panel__chart">
            <svg viewBox="0 0 220 220" role="img" aria-labelledby={`${id}-chart-title`}
              aria-describedby={`${id}-chart-description`}>
              <title id={`${id}-chart-title`}>Position exposure chart</title>
              <desc id={`${id}-chart-description`}>
                {`Gross exposure ${formatMoney(gross)}, based on absolute marked market value. Long positions ${formatMoney(long)} (${percent(longWeight)}); short positions ${formatMoney(short)} (${percent(shortWeight)}). Short positions are liabilities.${partial ? ` ${excludedCount} positions with unavailable market values are excluded.` : ''}`}
              </desc>
              <circle cx="110" cy="110" r="84" fill="none" stroke="#edf3ef" strokeWidth="22" />
              <g transform="rotate(-90 110 110)" aria-hidden="true">
                {positions.map((position, index) => <circle key={position.key} data-exposure-segment=""
                  cx="110" cy="110" r="84" fill="none" stroke={COLORS[index % COLORS.length]} strokeWidth="22"
                  pathLength="100" strokeDasharray={`${position.weight} ${100 - position.weight}`}
                  strokeDashoffset={-position.offset} />)}
              </g>
            </svg>
            <div className="exposure-panel__center">
              <span>{partial ? 'Known gross exposure' : 'Gross exposure'}</span>
              <strong title={formatMoney(gross)}>{gross >= 10000 ? compactMoney.format(gross) : formatMoney(gross)}</strong>
              <span className="exposure-panel__center-note">across marked positions</span>
            </div>
          </div>

          <ul className="exposure-panel__positions" aria-label="Marked position breakdown">
            {positions.map((position, index) => <li key={position.key}>
              <span className="exposure-panel__dot" style={{ backgroundColor: COLORS[index % COLORS.length] }} aria-hidden="true" />
              <span className="exposure-panel__position-name">{`${position.symbol} · ${position.side}`}</span>
              <span className="exposure-panel__position-value">{formatMoney(position.value)}</span>
              <span className="exposure-panel__weight">{percent(position.value / gross * 100)}</span>
            </li>)}
          </ul>
        </div>

        <dl className="exposure-panel__directions">
          <div>
            <dt><span className="exposure-panel__direction-mark" aria-hidden="true">↗</span>Long positions</dt>
            <dd>{formatMoney(long)}<span>{percent(longWeight)}</span></dd>
          </div>
          <div>
            <dt><span className="exposure-panel__direction-mark exposure-panel__direction-mark--short" aria-hidden="true">↘</span>Short positions</dt>
            <dd>{formatMoney(short)}<span>{percent(shortWeight)}</span></dd>
          </div>
        </dl>
        {partial && <p className="exposure-panel__partial-note">
          {excludedCount} {excludedCount === 1 ? 'position excluded' : 'positions excluded'} because {excludedCount === 1 ? 'its market value is' : 'their market values are'} unavailable.
        </p>}
      </> : <div className="exposure-panel__state" role="status">
        <div className="exposure-panel__empty-ring" aria-hidden="true" />
        <p className="exposure-panel__state-title">{stateTitle}</p>
        <p>{stateDetail}</p>
      </div>}
      <p className="exposure-panel__footnote">Shorts are liabilities; chart shares use absolute values. Cash is excluded.</p>
    </section>
  );
}

PortfolioExposure.propTypes = {
  holdings: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    symbol: PropTypes.string,
    quantity: PropTypes.number,
    current_price: PropTypes.number,
  })),
  loading: PropTypes.bool,
  unavailable: PropTypes.bool,
};

export default PortfolioExposure;
