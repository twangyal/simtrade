import { useEffect, useState } from 'react';
import api, { authHeaders, errorMessage, formatMoney } from '../api';
import Sidebar from './Sidebar';
import { portfolioGain, positionGain } from '../portfolio';
import MarketStatus from './MarketStatus';

const Dashboard = () => {
    const [account, setAccount] = useState(null);
    const [portfolio, setPortfolio] = useState([]);
    const [portfolioReady, setPortfolioReady] = useState(false);
    const [errors, setErrors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        const fetchData = async () => {
            try {
                const options = { headers: authHeaders(), signal: controller.signal };
                const results = await Promise.allSettled([
                    api.get('/user_data', options), api.get('/portfolio', options),
                ]);
                if (controller.signal.aborted) return;
                const failures = [];
                if (results[0].status === 'fulfilled') setAccount(results[0].value.data);
                else failures.push(errorMessage(results[0].reason, 'Unable to load account data.'));
                if (results[1].status === 'fulfilled') {
                    setPortfolio(results[1].value.data);
                    setPortfolioReady(true);
                }
                else failures.push(errorMessage(results[1].reason, 'Unable to load portfolio.'));
                setErrors([...new Set(failures)]);
            } catch (error) {
                if (!controller.signal.aborted) setErrors([errorMessage(error, 'Unable to load your account.')]);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        fetchData();
        return () => controller.abort();
    }, []);

    return (
        <div className="min-h-screen bg-gray-100 p-6 relative">
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
            <button aria-label="Open navigation" aria-expanded={sidebarOpen}
                className={`fixed top-4 right-4 text-2xl text-gray-600 ${sidebarOpen ? 'invisible' : ''}`}
                onClick={() => setSidebarOpen(true)}>&#9776;</button>
            <div className="max-w-7xl mx-auto">
                <h1 className="text-3xl font-bold mb-6">{account ? `Welcome, ${account.username}` : 'Dashboard'}</h1>
                <MarketStatus />
                {loading && <p role="status" className="mb-4">Loading your account…</p>}
                {errors.map((error) => <p key={error} role="alert" className="text-red-600 mb-4">{error}</p>)}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                    {[
                        ['Cash Balance', account?.balance],
                        ['Short Liability', account?.short_liability],
                        ['Net Account Value', account?.networth],
                        ['Unrealized P&L', portfolioReady ? portfolioGain(portfolio) : null],
                    ].map(([label, value]) => (
                        <div key={label} className="bg-white p-6 rounded-lg shadow-md">
                            <h2 className="text-lg font-semibold">{label}</h2>
                            <p className="text-2xl font-bold">{formatMoney(value)}</p>
                        </div>
                    ))}
                </div>
                {account?.valuation_estimated && <p className="mb-6 text-sm text-amber-800">Net account value includes estimates at entry prices where a market quote is unavailable.</p>}
                <div className="bg-white p-6 rounded-lg shadow-md mb-6 overflow-x-auto">
                    <h2 className="text-lg font-semibold mb-4">Portfolio</h2>
                    <table className="min-w-full bg-white">
                        <thead><tr>
                            <th scope="col" className="py-2">Asset</th>
                            <th scope="col" className="py-2">Quantity</th>
                            <th scope="col" className="py-2">Average Price</th>
                            <th scope="col" className="py-2">Total Value</th>
                            <th scope="col" className="py-2">Unrealized P&L</th>
                        </tr></thead>
                        <tbody>
                            {portfolio.map((item) => (
                                <tr key={item.id ?? item.symbol}>
                                    <td className="border-t px-6 py-4">{item.symbol}</td>
                                    <td className="border-t px-6 py-4">{item.quantity}</td>
                                    <td className="border-t px-6 py-4">{formatMoney(item.avg_price)}</td>
                                    <td className="border-t px-6 py-4">{formatMoney(item.current_price == null ? null : item.quantity * item.current_price)}</td>
                                    <td className="border-t px-6 py-4">{formatMoney(positionGain(item))}</td>
                                </tr>
                            ))}
                            {!loading && !errors.length && !portfolio.length && <tr>
                                <td colSpan="5" className="border-t px-6 py-4 text-center">No assets in portfolio</td>
                            </tr>}
                        </tbody>
                    </table>
                </div>
                <p className="text-sm text-gray-600">Unrealized P&L uses average entry prices and the last known quote. It excludes realized gains, losses, and cash rounding.</p>
            </div>
        </div>
    );
};

export default Dashboard;
