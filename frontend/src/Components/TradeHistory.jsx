import { useEffect, useState } from 'react';
import api, { authHeaders, errorMessage, formatMoney } from '../api';
import Sidebar from './Sidebar';

const ITEMS_PER_PAGE = 10;

const TradeHistory = () => {
    const [trades, setTrades] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);

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
    }, [currentPage]);

    return (
        <div className="min-h-screen bg-gray-100 p-6 relative">
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
            <button aria-label="Open navigation" aria-expanded={sidebarOpen}
                className={`fixed top-4 right-4 text-2xl text-gray-600 ${sidebarOpen ? 'invisible' : ''}`}
                onClick={() => setSidebarOpen(true)}>&#9776;</button>
            <div className="max-w-7xl mx-auto">
                <h1 className="text-3xl font-bold mb-6">Trade History</h1>
                <p className="text-sm text-gray-600 mb-4">Notional is quantity times execution price. Cash debits for buys round up to cents; credits for sells round down.</p>
                {error && <p role="alert" className="text-red-600 mb-4">{error}</p>}
                {loading && <p role="status" className="mb-4">Loading trade history…</p>}
                <div className="bg-white p-6 rounded-lg shadow-md overflow-x-auto">
                    <table className="min-w-full bg-white">
                        <thead><tr>
                            {['Date', 'Side', 'Symbol', 'Quantity', 'Price', 'Notional'].map((heading) =>
                                <th key={heading} scope="col" className="py-2">{heading}</th>)}
                        </tr></thead>
                        <tbody>
                            {trades.map((trade) => (
                                <tr key={trade.id}>
                                    <td className="border-t px-6 py-4">{new Date(trade.timestamp).toLocaleString()}</td>
                                    <td className="border-t px-6 py-4">{trade.quantity < 0 ? 'Sell' : 'Buy'}</td>
                                    <td className="border-t px-6 py-4">{trade.symbol}</td>
                                    <td className="border-t px-6 py-4">{Math.abs(trade.quantity)}</td>
                                    <td className="border-t px-6 py-4">{formatMoney(trade.price)}</td>
                                    <td className="border-t px-6 py-4">{formatMoney(Math.abs(trade.quantity) * trade.price)}</td>
                                </tr>
                            ))}
                            {!loading && !error && !trades.length && <tr>
                                <td colSpan="6" className="border-t px-6 py-4 text-center">No trades available</td>
                            </tr>}
                        </tbody>
                    </table>
                </div>
                <div className="flex justify-between items-center mt-6">
                    <button className="bg-blue-500 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                        onClick={() => setCurrentPage((page) => page - 1)} disabled={loading || currentPage <= 1}>Previous</button>
                    <span className="text-lg">{totalPages > 0 ? `Page ${currentPage} of ${totalPages}` : 'No pages'}</span>
                    <button className="bg-blue-500 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                        onClick={() => setCurrentPage((page) => page + 1)} disabled={loading || Boolean(error) || currentPage >= totalPages}>Next</button>
                </div>
            </div>
        </div>
    );
};

export default TradeHistory;
