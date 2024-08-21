import React, { useState } from "react";
import axios from "axios";

function TradeControls({ selectedOption }) {
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
        <div className="flex flex-col lg:flex-row items-center lg:items-start lg:justify-between p-4 bg-white shadow-md rounded-lg max-w-md mx-auto">
            <div className="flex flex-col w-full lg:w-auto space-y-4 lg:space-y-0 lg:space-x-4">
                <input 
                    type="number" 
                    value={shares} 
                    onChange={handleSharesChange} 
                    placeholder="Enter number of shares"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex flex-col lg:flex-row w-full lg:w-auto gap-4">
                    <button 
                        onClick={handleBuy} 
                        className="w-full lg:w-auto bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        Buy
                    </button>
                    <button 
                        onClick={handleSell} 
                        className="w-full lg:w-auto bg-red-500 text-white py-2 px-4 rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                        Sell
                    </button>
                </div>
            </div>
            {error && <p className="text-red-500 mt-4 lg:mt-0">{error}</p>}
        </div>
    );
}

export default TradeControls;
