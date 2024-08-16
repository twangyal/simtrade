// src/Register.jsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Login.css';

function Register() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleRegister = async (e) => {
        e.preventDefault();
        try {
            await axios.post('http://localhost:8000/register', {
                username,
                password
            });

            // Navigate to login page after successful registration
            navigate('/login');
        } catch (error) {
            setError('Error registering user');
        }
    };

    return (
        <div className="container">
            <h2>Register</h2>
            {error && <p className="error">{error}</p>}
            <form onSubmit={handleRegister}>
                <div>
                    <label>Username</label>
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                    />
                </div>
                <div>
                    <label>Password</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>
                <button type="submit">Register</button>
                <p>
                Have an account? 
                </p>
                <button className="registration-button" onClick={() => navigate('/login')}>Login Here</button>
            </form>
        </div>
    );
}

export default Register;
