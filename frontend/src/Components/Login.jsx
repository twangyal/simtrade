// src/Login.js
import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './Login.css'; // Optional: Add your CSS styles

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
        <div className="container">
            <h1>Login</h1>
            <form onSubmit={handleSubmit}>
                <label htmlFor="username">Username:</label>
                <input
                    type="text"
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                />
                <label htmlFor="password">Password:</label>
                <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                />
                <button type="submit">Login</button>
                {error && <p className="error-message">{error}</p>}
                <p>Don't have an account? </p>
                <button className="registration-button" onClick={() => navigate('/register')}>Register here</button>
                <p>Want a Trial?</p>
                <button className="registration-button" onClick={() => handleTrial}>Trial</button>
            </form>
            
        </div>
    );
};

export default Login;
