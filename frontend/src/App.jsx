import './App.css';
import Trade from './Components/Trade.jsx';
import Login from './Components/Login.jsx';
import Dashboard from './Components/Dashboard';
import Register from './Components/Register.jsx';
import Lander from './Components/Lander.jsx';
import TradeHistory from './Components/TradeHistory.jsx';
import { Route, Routes } from 'react-router-dom';
import './styles.css';
import RequireSession from './Components/RequireSession';

function App() {

    return (
        <div className="App">
            <Routes>
                <Route path="/" element={<Lander />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route element={<RequireSession />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/trade" element={<Trade />} />
                    <Route path="/trade-history" element={<TradeHistory />} />
                </Route>
            </Routes>
        </div>
    );
}

export default App;
