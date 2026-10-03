import './App.css';
import { lazy, Suspense } from 'react';
import Login from './Components/Login.jsx';
import Dashboard from './Components/Dashboard';
import Register from './Components/Register.jsx';
import Lander from './Components/Lander.jsx';
import TradeHistory from './Components/TradeHistory.jsx';
import { Route, Routes } from 'react-router-dom';
import './styles.css';
import RequireSession from './Components/RequireSession';
import TradePageBoundary from './Components/TradePageBoundary';

const Trade = lazy(() => import('./Components/Trade.jsx'));

function App() {

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
                            <Suspense fallback={<p role="status" className="min-h-screen bg-gray-100 p-6">Loading trading page…</p>}>
                                <Trade />
                            </Suspense>
                        </TradePageBoundary>
                    } />
                    <Route path="/trade-history" element={<TradeHistory />} />
                </Route>
            </Routes>
        </div>
    );
}

export default App;
