import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Sidebar from './Sidebar';
import PerformanceGraph from './PerformanceGraph';

const Dashboard = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [balance, setBalance] = useState(null);
    const [shortLiability, setShortLiability] = useState(null);
    const [buyingPower, setBuyingPower] = useState(null);
    const [netValue, setNetValue] = useState(null);
    const [portfolio, setPortfolio] = useState([]);
    const [error, setError] = useState(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const toggleSidebar = () => {
        setSidebarOpen(!sidebarOpen);
    };

    useEffect(() => {
        const fetchData = async () => {
            const token = localStorage.getItem('accessToken');
            if (!token) {
                setError('User not authenticated');
                return;
            }
            try {
                // Fetch user data
                const response = await axios.get('http://localhost:8000/user_data', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                setUser(response.data.username);
                setBalance(response.data.balance);
                setShortLiability(response.data.short_liability);
                setNetValue(response.data.networth);
                console.log(response.data);
            } catch (error) {
                setError('Error fetching user data');
                console.error(error);
            }
            try {
                const response = await axios.get('http://localhost:8000/portfolio', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                setPortfolio(response.data);
            } catch (error) {
                setError('Error fetching portfolio');
                console.error(error);
            }
        };
        fetchData();
    }, []);

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

            <div className="max-w-7xl mx-auto">
                <h1 className="text-3xl font-bold mb-6">Welcome, {user}</h1>

                {/* Overview Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                    <div className="bg-white p-6 rounded-lg shadow-md">
                        <h2 className="text-lg font-semibold">Buying Power</h2>
                        <p className="text-2xl font-bold">${balance || 'N/A'}</p>
                    </div>
                    <div className="bg-white p-6 rounded-lg shadow-md">
                        <h2 className="text-lg font-semibold">Credit</h2>
                        <p className="text-2xl font-bold">$50,000</p>
                    </div>
                    <div className="bg-white p-6 rounded-lg shadow-md">
                        <h2 className="text-lg font-semibold">Short Liability</h2>
                        <p className="text-2xl font-bold">${shortLiability || 'N/A'}</p>
                    </div>
                    <div className="bg-white p-6 rounded-lg shadow-md">
                        <h2 className="text-lg font-semibold">Portfolio Value</h2>
                        <p className="text-2xl font-bold">${netValue || 'N/A'}</p>
                    </div>
                </div>

                {/* Portfolio Section */}
                <div className="bg-white p-6 rounded-lg shadow-md mb-6">
                    <h2 className="text-lg font-semibold mb-4">Portfolio</h2>
                    <table className="min-w-full bg-white">
                        <thead>
                            <tr>
                                <th className="py-2">Asset</th>
                                <th className="py-2">Quantity</th>
                                <th className="py-2">Average Price</th>
                                <th className="py-2">Total Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            {portfolio.length > 0 ? (
                                portfolio.map((item) => (
                                    <tr key={item.id}>
                                        <td className="border-t px-6 py-4">{item.symbol}</td>
                                        <td className="border-t px-6 py-4">{item.quantity}</td>
                                        <td className="border-t px-6 py-4">${item.avg_price.toFixed(2)}</td>
                                        <td className="border-t px-6 py-4">
                                            ${(item.quantity * item.current_price).toFixed(2)}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="4" className="border-t px-6 py-4 text-center">No assets in portfolio</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Performance Graph Section */}
                <PerformanceGraph />
            </div>
        </div>
    );
};


export default Dashboard;