import './App.css';
import Trade from './Components/Trade.jsx';
import Login from './Components/Login.jsx';
import Dashboard from './Components/Dashboard';
import Register from './Components/Register.jsx';
import React, { useEffect, useState } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import axios from 'axios';

function App() {

    return (
        <div className="App">
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/dashboard" element= {<Dashboard />}/>
                <Route path="/trade" element= {<Trade />} />
            </Routes>
        </div>
    );
}

export default App;
