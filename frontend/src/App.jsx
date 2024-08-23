import './App.css';
import Trade from './Components/Trade.jsx';
import Login from './Components/Login.jsx';
import Dashboard from './Components/Dashboard';
import Register from './Components/Register.jsx';
import Lander from './Components/Lander.jsx';
import TradeHistory from './Components/TradeHistory.jsx';
import React, { useEffect, useState } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import './styles.css';

function App() {

    return (
        <div className="App">
            <Routes>
                <Route path="/" element={<Lander />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/dashboard" element= {<Dashboard />}/>
                <Route path="/trade" element= {<Trade />} />
                <Route path="/trade-history" element={<TradeHistory/>} />
            </Routes>
        </div>
    );
}

export default App;
