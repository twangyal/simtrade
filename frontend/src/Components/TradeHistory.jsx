import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Sidebar from './Sidebar';

const ITEMS_PER_PAGE = 10;

const TradeHistory = () => {
    const [trades, setTrades] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [error, setError] = useState(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const toggleSidebar = () => {
        setSidebarOpen(!sidebarOpen);
    };

    useEffect(() => {
        const fetchTrades = async () => {
            try {
                const token = localStorage.getItem('accessToken');
                if (!token) {
                    setError('User not authenticated');
                    return;
                }
                const response = await axios.get(`http://localhost:8000/trades?page=${currentPage}&limit=${ITEMS_PER_PAGE}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                setTrades(response.data.trades);
                setTotalPages(response.data.totalPages); // Assuming API returns total pages info
            } catch (error) {
                setError('Error fetching trade history');
                console.error(error);
            }
        };

        fetchTrades();
        console.log('Trades:', trades);
    }, [currentPage]);

    const handlePageChange = (page) => {
        if (page > 0 && page <= totalPages) {
            setCurrentPage(page);
        }
    };
    
    const formatDate = (date) => {
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        return new Date(date).toLocaleDateString('en-US', options);
    }


    return (
        <div className="min-h-screen bg-gray-100 p-6 relative">
        {/* Sidebar */}
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Sidebar Toggle Button */}
        <button 
            className={`fixed top-4 right-4 text-2xl text-gray-600 transition-transform duration-300 ease-in-out ${sidebarOpen ? 'opacity-0' : 'opacity-100'}`} 
            onClick={toggleSidebar}
        >
            &#9776;
        </button>

        <div className="min-h-screen bg-gray-100 p-6">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-3xl font-bold mb-6">Trade History</h1>
                {error && <p className="text-red-500 mb-4">{error}</p>}
                <div className="bg-white p-6 rounded-lg shadow-md">
                    <table className="min-w-full bg-white">
                        <thead>
                            <tr>
                                <th className="py-2">Date</th>
                                <th className="py-2">Symbol</th>
                                <th className="py-2">Quantity</th>
                                <th className="py-2">Price</th>
                                <th className="py-2">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {trades.length > 0 ? (
                                trades.map((trade) => (
                                    <tr key={trade.id}>
                                        <td className="border-t px-6 py-4">{formatDate(trade.timestamp)}</td>
                                        <td className="border-t px-6 py-4">{trade.symbol}</td>
                                        <td className="border-t px-6 py-4">{trade.quantity}</td>
                                        <td className="border-t px-6 py-4">${trade.price}</td>
                                        <td className="border-t px-6 py-4">${(trade.quantity * trade.price)}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="5" className="border-t px-6 py-4 text-center">No trades available</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                <div className="flex justify-between items-center mt-6">
                    <button
                        className={`bg-blue-500 text-white px-4 py-2 rounded-lg ${currentPage <= 1 ? 'invisible' : ''}`}
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage <= 1}
                    >
                        Previous
                    </button>
                    <span className="text-lg">
                        Page {currentPage} of {totalPages}
                    </span>
                    <button
                        className={`bg-blue-500 text-white px-4 py-2 rounded-lg ${currentPage >= totalPages ? 'invisible' : ''}`}
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage >= totalPages}
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    </div>
    );
};

export default TradeHistory;
