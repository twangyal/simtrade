import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { authHeaders, errorMessage, formatMoney } from '../api';
import { portfolioGain, positionGain } from '../portfolio';
import { instrumentDetails } from '../instruments';
import AppShell from './AppShell';
import Icon from './Icon';
import MarketStatus from './MarketStatus';
import PortfolioExposure from './PortfolioExposure';
import TableRegion from './TableRegion';

const Dashboard = () => {
    const [account, setAccount] = useState(null);
    const [portfolio, setPortfolio] = useState([]);
    const [portfolioReady, setPortfolioReady] = useState(false);
    const [errors, setErrors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [revision, setRevision] = useState(0);
    const [updatedAt, setUpdatedAt] = useState(null);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setErrors([]);
        const fetchData = async () => {
            try {
                const options = { headers: authHeaders(), signal: controller.signal };
                const results = await Promise.allSettled([
                    api.get('/user_data', options), api.get('/portfolio', options),
                ]);
                if (controller.signal.aborted) return;
                const failures = [];
                if (results[0].status === 'fulfilled') setAccount(results[0].value.data);
                else { setAccount(null); failures.push(errorMessage(results[0].reason, 'Unable to load account data.')); }
                if (results[1].status === 'fulfilled') {
                    setPortfolio(results[1].value.data);
                    setPortfolioReady(true);
                } else {
                    setPortfolio([]);
                    setPortfolioReady(false);
                    failures.push(errorMessage(results[1].reason, 'Unable to load portfolio.'));
                }
                setUpdatedAt(failures.length ? null : new Date());
                setErrors([...new Set(failures)]);
            } catch (error) {
                if (!controller.signal.aborted) setErrors([errorMessage(error, 'Unable to load your account.')]);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        fetchData();
        return () => controller.abort();
    }, [revision]);

    const unrealized = portfolioReady ? portfolioGain(portfolio) : null;
    const metrics = [
        ['Net Account Value', account?.networth, 'Cash + signed position value', 'layers'],
        ['Cash Balance', account?.balance, 'Simulated funds available', 'wallet'],
        ['Unrealized P&L', unrealized, 'Open positions · last known marks', 'chart'],
        ['Short Liability', account?.short_liability, 'Value of open short positions', 'down'],
    ];
    return <AppShell section="Overview">
        <div className="page-heading">
            <div><p className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</p><h1>{account ? `Welcome, ${account.username}` : 'Dashboard'}</h1><p className="page-description">A clear view of your portfolio. A little more perspective for your next move.</p></div>
            <Link className="button button-primary" to="/trade">Explore markets<Icon name="arrow" size={18} /></Link>
        </div>
        <MarketStatus />
        <div className="section-toolbar"><div><span className="section-label">Account snapshot</span><span className="snapshot-time">{updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Values in USD'}</span></div><button className="text-button" aria-label="Refresh account" disabled={loading} onClick={() => setRevision((value) => value + 1)}><Icon name="refresh" size={15} />{loading ? 'Refreshing' : 'Refresh'}</button></div>
        {loading && <p role="status" className="loading-message">Loading your account…</p>}
        {errors.map((error) => <p key={error} role="alert" className="notice notice-error">{error}</p>)}
        <div className="metrics-grid" aria-busy={loading}>
            {metrics.map(([label, value, caption, icon], index) => <section key={label} className={`metric-card${index === 0 ? ' metric-featured' : ''}`}>
                <h2>{label}</h2><span className="metric-icon"><Icon name={icon} size={18} /></span>
                <p className={`metric-value${label === 'Unrealized P&L' && value != null ? value < 0 ? ' value-negative' : value > 0 ? ' value-positive' : '' : ''}`}>{formatMoney(value)}</p>
                <p className="metric-caption">{caption}</p>
            </section>)}
        </div>
        {account?.valuation_estimated && <p className="notice notice-warning">Net account value includes estimates at entry prices where a market quote is unavailable.</p>}
        <div className="portfolio-grid">
            <section className="panel holdings-panel" aria-labelledby="holdings-title">
                <div className="panel-heading"><div><p className="eyebrow">WHAT YOU HOLD</p><h2 id="holdings-title">Portfolio</h2></div><span className="count-badge">{portfolioReady ? `${portfolio.length} position${portfolio.length === 1 ? '' : 's'}` : '—'}</span></div>
                <TableRegion label="Portfolio holdings">
                    <table className="data-table holdings-table">
                        <thead><tr>{['Asset', 'Quantity', 'Average Price', 'Total Value', 'Unrealized P&L'].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
                        <tbody>{portfolio.map((item) => {
                            const instrument = instrumentDetails(item.symbol);
                            const gain = positionGain(item);
                            return <tr key={item.id ?? item.symbol}>
                                <td><Link className="asset-cell" to={`/trade?symbol=${encodeURIComponent(item.symbol)}`} aria-label={`Trade ${item.symbol}`}><span className={`asset-badge asset-${instrument.category.toLowerCase()}`} aria-hidden="true">{instrument.badge}</span><span><strong>{item.symbol}</strong><small>{item.quantity < 0 ? 'Short' : 'Long'} position</small></span></Link></td>
                                <td>{item.quantity}</td><td>{formatMoney(item.avg_price)}</td><td>{formatMoney(item.current_price == null ? null : item.quantity * item.current_price)}</td><td className={gain == null || gain === 0 ? '' : gain < 0 ? 'value-negative' : 'value-positive'}>{formatMoney(gain)}</td>
                            </tr>;
                        })}</tbody>
                    </table>
                </TableRegion>
                {!loading && portfolioReady && !portfolio.length && <div className="empty-state"><span className="empty-state-icon"><Icon name="layers" size={28} /></span><h3>No assets in portfolio</h3><p>Every portfolio starts with a first idea.<br />Find an instrument and make it yours.</p><Link className="button button-secondary" to="/trade">Make your first trade<Icon name="arrow" size={16} /></Link></div>}
                {!loading && !portfolioReady && <div className="empty-state"><Icon name="refresh" size={24} /><h3>Your holdings could not load</h3><p>Refresh your account to try again.</p></div>}
                <div className="panel-footnote">Unrealized P&L uses average entry prices and the last known quote. It excludes realized gains, losses, and cash rounding.</div>
            </section>
            <PortfolioExposure holdings={portfolio} loading={loading} unavailable={!loading && !portfolioReady} />
        </div>
        <div className="learning-banner"><span className="learning-icon"><Icon name="shield" size={25} /></span><div><strong>Room to experiment. Space to learn.</strong><p>Your balance is virtual. Use it to explore position sizes, compare instruments, and develop your approach.</p></div><Link className="text-button" to="/trade-history">Review activity<Icon name="arrow" size={17} /></Link></div>
    </AppShell>;
};
export default Dashboard;
