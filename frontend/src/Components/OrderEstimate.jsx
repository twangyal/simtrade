import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { formatMoney } from '../api';
import { getOrderEstimate } from '../orderEstimate';
import './OrderEstimate.css';

const UNAVAILABLE = {
  quantity: 'Enter a quantity to preview the order value.',
  missing: 'Waiting for a received quote to estimate this order.',
  stale: 'No quote received in the last 60 seconds. Estimate unavailable.',
  invalid: 'An indicative value is unavailable for these order details.',
};

export default function OrderEstimate({ quantity, symbol, quote }) {
  const [clock, setClock] = useState(Date.now);
  const receivedAt = quote?.symbol === symbol ? quote.receivedAt : null;

  useEffect(() => {
    if (!Number.isFinite(receivedAt)) return;
    let timer;
    const updateAge = () => {
      const now = Date.now();
      setClock(now);
      const remaining = 60_000 - (now - receivedAt);
      if (remaining > 0 && now >= receivedAt) timer = setTimeout(updateAge, Math.min(1_000, remaining));
    };
    updateAge();
    return () => clearTimeout(timer);
  }, [receivedAt]);

  // Read the current clock on quote/quantity updates as well as timer renders.
  const estimate = getOrderEstimate(quantity, symbol, quote, Math.max(clock, Date.now()));

  return <section className="order-estimate" aria-label="Indicative order values">
    {estimate.status === 'ready' ? <>
      <dl className="order-estimate-values">
        <div><dt>Indicative buy value</dt><dd aria-label="Indicative buy value">{formatMoney(estimate.buyValue)}</dd></div>
        <div><dt>Indicative sell value</dt><dd aria-label="Indicative sell value">{formatMoney(estimate.sellValue)}</dd></div>
      </dl>
      <p className="order-estimate-source">{estimate.pricing === 'spread' ? 'Ask / bid estimate' : 'Last-price estimate'}<span aria-hidden="true"> · </span>Received {estimate.ageSeconds}s ago</p>
      <p className="order-estimate-caption">USD estimates only. Final price and cent rounding may vary. A recent receipt does not guarantee an executable quote.</p>
    </> : <p className="order-estimate-unavailable">{UNAVAILABLE[estimate.status]}</p>}
  </section>;
}

OrderEstimate.propTypes = {
  quantity: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  symbol: PropTypes.string.isRequired,
  quote: PropTypes.shape({
    symbol: PropTypes.string.isRequired, price: PropTypes.number.isRequired,
    bid: PropTypes.number, ask: PropTypes.number, receivedAt: PropTypes.number.isRequired,
  }),
};
