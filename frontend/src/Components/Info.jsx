import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Price from './price.jsx';
import { WS_URL } from '../api';
import { appendQuote, normalizeQuote } from '../quotes';
import MarketQuoteChart from './MarketQuoteChart';

function Info({ instrumentSelect, onQuote }) {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState('Connecting to market data…');
  const quoteListener = useRef(onQuote);

  useEffect(() => {
    quoteListener.current = onQuote;
  }, [onQuote]);

  useEffect(() => {
    let active = true;
    let currentSocket = null;
    let reconnectTimer;
    let retryDelay = 1000;
    setData(null);
    setHistory([]);
    setStatus('Connecting to market data…');
    quoteListener.current?.(null);

    const retry = (message) => {
      if (!active) return;
      setStatus(`${message} Reconnecting…`);
      reconnectTimer = setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30000);
    };
    function connect() {
      if (!active) return;
      setStatus('Connecting to market data…');
      let ws;
      try {
        ws = new WebSocket(WS_URL);
      } catch {
        retry('Market data unavailable.');
        return;
      }
      currentSocket = ws;
      const isCurrent = () => active && currentSocket === ws;
      ws.onopen = () => {
        if (isCurrent()) setStatus('Waiting for a quote…');
      };
      ws.onmessage = (event) => {
        if (!isCurrent()) return;
        try {
          const quote = normalizeQuote(JSON.parse(event.data), instrumentSelect);
          if (!quote) return;
          const receivedAt = Date.now();
          retryDelay = 1000;
          setData(quote);
          setStatus('Last received quote');
          setHistory((points) => appendQuote(points, quote, receivedAt));
          quoteListener.current?.({ ...quote, receivedAt });
        } catch {
          setStatus('Unable to read market data. Waiting for the next quote…');
        }
      };
      const disconnect = (message) => {
        if (!isCurrent()) return;
        // Ignore error/close pairs and late callbacks from this replaced socket.
        currentSocket = null;
        ws.close();
        retry(message);
      };
      ws.onclose = () => disconnect('Market data disconnected.');
      ws.onerror = () => disconnect('Market data unavailable.');
    }
    connect();
    return () => {
      active = false;
      clearTimeout(reconnectTimer);
      currentSocket?.close();
    };
  }, [instrumentSelect]);

  return (
    <section className="quote-panel" aria-label={`${instrumentSelect} market quotes`}>
      <div className="quote-panel-heading">
        <h2>Instrument: {instrumentSelect}</h2>
        <p role="status" className={`quote-connection ${status === 'Last received quote' ? 'is-received' : ''}`}>{status}</p>
      </div>
      <Price data={data} parentChange={instrumentSelect} />
      <MarketQuoteChart key={instrumentSelect} points={data?.symbol === instrumentSelect ? history : []} symbol={instrumentSelect} />
      {data?.symbol === instrumentSelect && data.source === 'demo' && <p role="note" className="quote-demo-note">
        Demo quote: this price is synthetic, not live market data.
      </p>}
    </section>
  );
}

Info.propTypes = { instrumentSelect: PropTypes.string.isRequired, onQuote: PropTypes.func };
export default Info;
