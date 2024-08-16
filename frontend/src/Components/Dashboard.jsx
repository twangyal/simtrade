// src/Dashboard.js
import Info from './Info.jsx';
import React from 'react';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.removeItem('accessToken');
        navigate('/login');
    };

    return (
        <div>
            <h1>Welcome to your Dashboard</h1>
            <p>Your personalized content goes here.</p>
            
            <Info />
            <button onClick={handleLogout}>Logout</button>
        </div>
    );
};

export default Dashboard;
