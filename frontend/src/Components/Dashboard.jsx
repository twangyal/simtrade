// src/Dashboard.js
import Info from './Info.jsx';
import { useNavigate } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import axios from 'axios';

const Dashboard = () => {
    const navigate = useNavigate();
    const [balance, setBalance] = useState(null);
    const [error, setError] = useState(null);

    const handleLogout = () => {
        localStorage.removeItem('accessToken');
        navigate('/login');
    };

    useEffect(() => {
        const fetchBalance = async () => {
            try {
                const token = localStorage.getItem('accessToken');
                if (!token) {
                    setError('User not authenticated');
                    return;
                }
                const response = await axios.get('http://localhost:8000/balance', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                setBalance(response.data.current_balance);
            } catch (error) {
                setError('Error fetching balance');
                console.error(error);
            }
        };
    
        fetchBalance();
    }, []);
    

    return (
        <div>
            <h1>Welcome to your Dashboard</h1>
            <div>
                <h1>Dashboard</h1>
                {error && <p>{error}</p>}
                {balance !== null ? (
                    <p>Your current balance is: ${balance.toFixed(2)}</p>
                ) : (
                    <p>Loading balance...</p>
                )}
            </div>
            <button onClick={() => navigate('/trade')}>Trade</button>
            <p></p>
            <button onClick={handleLogout}>Logout</button>
        </div>
    );
};


export default Dashboard;