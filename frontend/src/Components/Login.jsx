import { useState } from 'react';
import useAuthRequest from '../useAuthRequest';
import { setSession } from '../session';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from './AuthLayout';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const { busy, error, setError, submit } = useAuthRequest();
    const navigate = useNavigate();
    const location = useLocation();

    const handleSubmit = (event) => {
        event.preventDefault();
        if (busy) return;
        setError('');
        if (!username.trim() || !password) {
            setError('Enter your username and password.');
            return;
        }
        submit('/login', { username, password }, (response) => {
            setSession(response.data.access_token);
            const requestedPath = location.state?.from;
            const destination = ['/dashboard', '/trade', '/trade-history'].includes(requestedPath) ? requestedPath : '/dashboard';
            navigate(destination, { replace: true });
        }, 'Unable to log in. Please check your credentials and connection.');
    };

    return (
        <AuthLayout>
            <h1>Login</h1>
            <p className="auth-intro">Welcome back. Let’s pick up where you left off.</p>
            {location.state?.loginRequired && <p role="status" className="auth-message">Please log in to continue.</p>}
            {location.state?.registered && <p role="status" className="auth-message auth-message-success">Account created. Log in to start trading.</p>}
            <form aria-busy={busy} onSubmit={handleSubmit} className="auth-form">
                <div className="auth-field">
                    <label htmlFor="username">Username:</label>
                    <input type="text" id="username" autoComplete="username" autoCapitalize="none" spellCheck={false}
                        disabled={busy} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Your username" required />
                </div>
                <div className="auth-field">
                    <label htmlFor="password">Password:</label>
                    <input type="password" id="password" autoComplete="current-password"
                        disabled={busy} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" required />
                </div>
                {error && <p role="alert" className="auth-message auth-message-error">{error}</p>}
                <button type="submit" disabled={busy} className="public-button auth-submit">
                    {busy ? 'Logging in…' : 'Login'}<span aria-hidden="true">{busy ? '…' : '↗'}</span>
                </button>
            </form>
            <p className="auth-switch">New to SimTrade? <Link to="/register">Register here</Link></p>
            <div className="auth-note"><span aria-hidden="true">◇</span><p>Your personal paper trading account.<br />A space to practice, without real money.</p></div>
        </AuthLayout>
    );
};

export default Login;
