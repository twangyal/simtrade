import './App.css';
import { lazy, Suspense, useEffect } from 'react';
import Login from './Components/Login.jsx';
import Dashboard from './Components/Dashboard';
import Register from './Components/Register.jsx';
import Lander from './Components/Lander.jsx';
import TradeHistory from './Components/TradeHistory.jsx';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import './styles.css';
import RequireSession from './Components/RequireSession';
import TradePageBoundary from './Components/TradePageBoundary';
import AppShell from './Components/AppShell';
import useSession from './useSession';

const Trade = lazy(() => import('./Components/Trade.jsx'));

function App() {
    const { pathname } = useLocation();
    const session = useSession();
    useEffect(() => {
        const titles = { '/': 'Practice with perspective', '/login': 'Login', '/register': 'Register', '/dashboard': 'Overview', '/trade': 'Trade', '/trade-history': 'Activity' };
        document.title = `${titles[pathname] ?? 'Page not found'} · SimTrade`;
    }, [pathname]);

    return (
        <div className="App">
            <Routes>
                <Route path="/" element={<Lander />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route element={<RequireSession />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/trade" element={
                        <TradePageBoundary>
                            <Suspense fallback={<AppShell section="Trade"><div className="panel route-recovery"><p role="status">Loading trading page…</p><div className="loading-bars" aria-hidden="true"><span /><span /><span /></div></div></AppShell>}>
                                <Trade />
                            </Suspense>
                        </TradePageBoundary>
                    } />
                    <Route path="/trade-history" element={<TradeHistory />} />
                </Route>
                <Route path="*" element={<main className="not-found"><span className="eyebrow">SIMTRADE / 404</span><h1>A little off course.</h1><p>This page doesn’t exist. Let’s get you back to familiar ground.</p><Link className="button button-primary" to={session ? '/dashboard' : '/'}>{session ? 'Return to dashboard' : 'Return home'}</Link></main>} />
            </Routes>
        </div>
    );
}

export default App;
