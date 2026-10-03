import { useEffect, useState } from 'react';
import api, { authHeaders, errorMessage, formatMoney } from '../api';
import AppShell from './AppShell';
import Icon from './Icon';
import { Link } from 'react-router-dom';

const ITEMS_PER_PAGE = 10;

const TradeHistory = () => {
    const [trades, setTrades] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [revision, setRevision] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError('');
        setTrades([]);
        const fetchTrades = async () => {
            try {
                const response = await api.get(`/trades?page=${currentPage}&limit=${ITEMS_PER_PAGE}`, {
                    headers: authHeaders(), signal: controller.signal,
                });
                if (controller.signal.aborted) return;
                const pages = Math.max(0, response.data.totalPages);
                setTotalPages(pages);
                if (currentPage > Math.max(1, pages)) {
                    setCurrentPage(Math.max(1, pages));
                    return;
                }
                setTrades(response.data.trades);
            } catch (error) {
                if (!controller.signal.aborted) setError(errorMessage(error, 'Unable to load trade history.'));
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        fetchTrades();
        return () => controller.abort();
    }, [currentPage, revision]);

    return <AppShell section="Activity">
        <div className="page-heading"><div><p className="eyebrow">EVERY MOVE TELLS A STORY</p><h1>Trade History</h1><p className="page-description">Your decisions, in order. Review the trades that shape your portfolio.</p></div><Link className="button button-primary" to="/trade">New trade<Icon name="arrow" size={18} /></Link></div>
        <section className="panel history-panel" aria-labelledby="activity-title">
            <div className="panel-heading"><div><p className="eyebrow">YOUR TRADING JOURNAL</p><h2 id="activity-title">Recent activity</h2></div><button className="text-button" aria-label="Refresh trade history" disabled={loading} onClick={() => setRevision((value) => value + 1)}><Icon name="refresh" size={15} />Refresh</button></div>
            {error && <p role="alert" className="notice notice-error history-notice">{error}</p>}
            {loading && <p role="status" className="loading-message history-notice">Loading trade history…</p>}
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Trade records">
                <table className="data-table history-table"><thead><tr>
                    {['Date', 'Side', 'Symbol', 'Quantity', 'Price', 'Notional'].map((heading) => <th key={heading} scope="col">{heading}</th>)}
                </tr></thead><tbody>{trades.map((trade) => <tr key={trade.id}>
                    <td><time dateTime={trade.timestamp}>{new Date(trade.timestamp).toLocaleString()}</time></td>
                    <td><span className={`side-badge ${trade.quantity < 0 ? 'side-sell' : 'side-buy'}`}>{trade.quantity < 0 ? 'Sell' : 'Buy'}</span></td>
                    <td><strong>{trade.symbol}</strong></td><td>{Math.abs(trade.quantity)}</td><td>{formatMoney(trade.price)}</td><td>{formatMoney(Math.abs(trade.quantity) * trade.price)}</td>
                </tr>)}</tbody></table>
            </div>
            {!loading && !error && !trades.length && <div className="empty-state history-empty"><span className="empty-state-icon"><Icon name="history" size={28} /></span><h3>No trades available</h3><p>Your first trade is the beginning of your story.<br />When you make a move, it will appear here.</p><Link className="button button-secondary" to="/trade">Explore instruments<Icon name="arrow" size={16} /></Link></div>}
            <div className="pagination"><button className="button button-quiet" onClick={() => setCurrentPage((page) => page - 1)} disabled={loading || currentPage <= 1}>Previous</button><span>{totalPages > 0 ? `Page ${currentPage} of ${totalPages}` : 'No pages'}</span><button className="button button-quiet" onClick={() => setCurrentPage((page) => page + 1)} disabled={loading || currentPage >= totalPages}>Next</button></div>
        </section>
        <p className="page-footnote">Notional is quantity times execution price. Cash debits for buys round up to cents; credits for sells round down. Times are shown in your local timezone.</p>
    </AppShell>;
};
export default TradeHistory;
