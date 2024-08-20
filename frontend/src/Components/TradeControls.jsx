import React, { useState } from "react";
import axios from "axios";

function TradeControls({ selectedOption, token }) {
    const [shares, setShares] = useState(0);
    const [error, setError] = useState(null);

    const handleSharesChange = (event) => {
        setShares(event.target.value);
    };

    const handleBuy = async () => {
        const token = localStorage.getItem('accessToken');
        if (!token) {
            setError('User not authenticated');
            return;
        }
        try {
            const response = await axios.post('http://localhost:8000/BUY', {
                symbol: selectedOption,
                quantity: shares
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            console.log(response.data);
        } catch (error) {
            console.error(error);
            setError('Failed to buy shares');
        }
    };

    const handleSell = async () => {
        const token = localStorage.getItem('accessToken');
        if (!token) {
            setError('User not authenticated');
            return;
        }
        try {
            const response = await axios.post('http://localhost:8000/SELL', {
                symbol: selectedOption,
                quantity: shares
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            console.log(response.data);
        } catch (error) {
            console.error(error);
            setError('Failed to sell shares');
        }
    };

    return (
        <div>
            <input 
                type="number" 
                value={shares} 
                onChange={handleSharesChange} 
                placeholder="Enter number of shares"
            />
            <button onClick={handleBuy}>Buy</button>
            <button onClick={handleSell}>Sell</button>
            {error && <p>{error}</p>}
        </div>
    );
}

export default TradeControls;