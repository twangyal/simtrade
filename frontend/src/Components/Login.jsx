import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate(); // Hook for navigation
    

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');

        try {
            const response = await axios.post('http://localhost:8000/login', {
                username,
                password
            });

            // Store token and handle redirection
            // In your login component, make sure to set the token correctly
            localStorage.setItem('accessToken', response.data.access_token);
            navigate('/dashboard');
        } catch (error) {
            setError('Invalid credentials or server error');
        }
    };
    const handleTrial = async (event) => {
        event.preventDefault();
        setError('');

        try {
            const response = await axios.post('http://localhost:8000/login', {
                username:"Tsering",
                password:"Tsering"
            });

            // Store token and handle redirection
            // In your login component, make sure to set the token correctly
            localStorage.setItem('accessToken', response.data.access_token);
            navigate('/dashboard');
        } catch (error) {
            setError('Invalid credentials or server error');
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className="bg-white shadow-md rounded-lg p-8 max-w-md w-full">
                <h1 className="text-3xl font-bold text-center mb-6">Login</h1>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="username" className="block text-sm font-medium text-gray-700">Username:</label>
                        <input
                            type="text"
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        />
                    </div>
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password:</label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        />
                    </div>
                    {error && <p className="text-red-500 text-sm">{error}</p>}
                    <button
                        type="submit"
                        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors duration-300"
                    >
                        Login
                    </button>
                </form>
                <div className="mt-6 text-center">
                    <p className="text-sm">Don't have an account?</p>
                    <button
                        className="mt-2 text-blue-600 hover:underline"
                        onClick={() => navigate('/register')}
                    >
                        Register here
                    </button>
                </div>
                <div className="mt-4 text-center">
                    <p className="text-sm">Want a Trial?</p>
                    <button
                        className="mt-2 text-blue-600 hover:underline"
                        onClick={handleTrial}
                    >
                        Trial
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Login;
