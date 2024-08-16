// src/App.js
import Price from './Components/Price.jsx';
import DropdownMenu from './Components/Dropdown.jsx';
import Login from './Components/Login.jsx';
import Dashboard from './Components/Dashboard';
import Register from './Components/Register.jsx';
import React, { useEffect, useState } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import axios from 'axios';

function App() {
  const [data, setData] = useState([]);
  const isAuthenticated = !!localStorage.getItem('accessToken');


  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws');
    
    // On connection
    ws.onopen = () => {
      console.log("Connected to WebSocket server");
    };
    
    // On receiving data from server
    ws.onmessage = (event) => {
      const newData = JSON.parse(event.data);
      console.log("Received data:", newData);
      setData(newData);
    };
    
    // On closing connection
    ws.onclose = () => {
      console.log("Disconnected from WebSocket server");
    };
    
    // On error
    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
  }, []);

    return (
        <div className="App">
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route
                    path="/dashboard"
                    element= {<Dashboard />}
                />
                
            </Routes>
        </div>
    );
  return (
    
    <div>
    <h1>Trading App</h1>
    <div className="App">
      <Price data={data} />
      <DropdownMenu />
      <Login />
    </div>
  </div>
  );
}

export default App;
