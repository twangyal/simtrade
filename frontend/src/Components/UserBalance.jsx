import React, { useState, useEffect } from 'react';
import axios from 'axios';

const UserBalance = ({ username }) => {
    const [balance, setBalance] = useState(null);

    useEffect(() => {
        const fetchBalance = async () => {
        try {
            const response = await axios.get(`http://localhost:8000/balance/${username}`);
            setBalance(response.data.balance);
        } catch (error) {
            console.error('Error fetching balance:', error);
        }
        };

        fetchBalance();
    }, [username]);

    return (
        <div>
        <h2>Balance</h2>
        {balance !== null ? <p>{balance}</p> : <p>Loading...</p>}
        </div>
    );
};

export default UserBalance;