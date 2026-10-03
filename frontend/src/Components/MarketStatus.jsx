import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import api from '../api';

const REFRESH_MS = 15000;

export default function MarketStatus({ selectedSymbol }) {
  const [market, setMarket] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let timer;
    const refresh = async () => {
      try {
        const { data } = await api.get('/market_status', { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!['disabled', 'demo', 'live'].includes(data?.mode) ||
            !Array.isArray(data.supported_symbols) || !data.supported_symbols.every((symbol) => typeof symbol === 'string') ||
            !Array.isArray(data.ready_symbols) || !data.ready_symbols.every((symbol) => data.supported_symbols.includes(symbol))) {
          throw new Error('Invalid market status');
        }
        setMarket(data);
        setFailed(false);
      } catch {
        if (!controller.signal.aborted) {
          setMarket(null);
          setFailed(true);
        }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, REFRESH_MS);
      }
    };
    refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  let title = 'Checking market data…';
  let description = '';
  let availability = '';
  if (failed) {
    title = 'Market data status unknown';
    description = 'Unable to check market data. We will try again shortly.';
  } else if (market?.mode === 'disabled') {
    title = 'Market data disabled';
    description = 'No quotes are available for trading. Orders are unavailable while market data is disabled.';
  } else if (market) {
    title = market.mode === 'demo' ? 'Demo market data' : 'Live market data';
    if (market.mode === 'demo') description = 'Synthetic, invented prices for practice. These are not live market quotes.';
    if (selectedSymbol) {
      availability = market.ready_symbols.includes(selectedSymbol)
        ? `Fresh quote available for ${selectedSymbol}.`
        : `Waiting for a fresh quote for ${selectedSymbol}. Orders for this instrument are unavailable until a quote arrives.`;
    } else {
      availability = market.ready_symbols.length
        ? `Fresh quotes available for ${market.ready_symbols.length} of ${market.supported_symbols.length} instruments.`
        : 'Waiting for fresh quotes. Orders are unavailable until quotes arrive.';
    }
  }

  return (
    <section aria-label="Market data status" aria-live="polite" className={`market-status market-status-${market?.mode ?? "unknown"}`}>
      <span className="market-status-indicator" aria-hidden="true" />
      <div className="market-status-copy"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{availability && <p>{availability}</p>}</div>
    </section>
  );
}

MarketStatus.propTypes = { selectedSymbol: PropTypes.string };
