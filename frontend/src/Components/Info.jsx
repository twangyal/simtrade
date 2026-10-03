import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import Price from './price.jsx';
import { WS_URL } from '../api';

function Info({ instrumentSelect }) {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState('Connecting to market data…');

  useEffect(() => {
    let active = true;
    let currentSocket = null;
    let reconnectTimer;
    let retryDelay = 1000;
    setData(null);
    setHistory([]);
    setStatus('Connecting to market data…');

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
          const quote = JSON.parse(event.data);
          if (quote.symbol !== instrumentSelect) return;
          const price = Number(Array.isArray(quote.price) ? quote.price[0] : quote.price);
          if (!Number.isFinite(price) || price <= 0) return;
          retryDelay = 1000;
          setData(quote);
          setStatus('Last received quote');
          setHistory((points) => [...points.slice(-99), [Date.now(), price]]);
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

  const graphOptions = {
    title: { text: `Price Trend for ${instrumentSelect}` },
    xAxis: { type: 'datetime' },
    yAxis: { title: { text: 'Price' } },
    series: [{ name: instrumentSelect, data: history, color: '#4A90E2' }],
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <h2 className="text-lg font-semibold mb-2">Instrument: {instrumentSelect}</h2>
      <p role="status" className="text-sm text-gray-600 mb-3">{status}</p>
      {data?.symbol === instrumentSelect && data.source === 'demo' && <p role="note" className="mb-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
        Demo quote: this price is synthetic, not live market data.
      </p>}
      <Price data={data} parentChange={instrumentSelect} />
      {history.length > 0 && <div className="mt-6">
        <p className="text-sm text-gray-600">Quotes received during this session.</p>
        <HighchartsReact highcharts={Highcharts} options={graphOptions} />
      </div>}
    </div>
  );
}

Info.propTypes = { instrumentSelect: PropTypes.string.isRequired };
export default Info;
