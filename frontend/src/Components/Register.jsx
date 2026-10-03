import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from './AuthLayout';
import useAuthRequest from '../useAuthRequest';

function Register() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const { busy, error, setError, submit } = useAuthRequest();
    const navigate = useNavigate();

    const handleRegister = (event) => {
        event.preventDefault();
        if (busy) return;
        setError('');
        if (!username.trim() || !password) {
            setError('Enter a username and password.');
            return;
        }
        submit('/register', { username: username.trim(), password }, () => {
            navigate('/login', { replace: true, state: { registered: true } });
        }, 'Unable to register. Please try again.');
    };

    return (
        <AuthLayout registering>
            <h1>Register</h1>
            <p className="auth-intro">A fresh start. $100,000 in virtual funds. All yours.</p>
            {error && <p role="alert" className="auth-message auth-message-error">{error}</p>}
            <form aria-busy={busy} onSubmit={handleRegister} className="auth-form">
                <div className="auth-field">
                    <label htmlFor="register-username">Username</label>
                    <input type="text" id="register-username" autoComplete="username" autoCapitalize="none" spellCheck={false}
                        disabled={busy} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Choose a username" required />
                </div>
                <div className="auth-field">
                    <label htmlFor="register-password">Password</label>
                    <input type="password" id="register-password" autoComplete="new-password"
                        disabled={busy} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a password" required />
                </div>
                <button type="submit" disabled={busy} className="public-button auth-submit">
                    {busy ? 'Registering…' : 'Register'}<span aria-hidden="true">{busy ? '…' : '↗'}</span>
                </button>
            </form>
            <p className="auth-switch">Already have an account? <Link to="/login">Login Here</Link></p>
            <div className="auth-note"><span aria-hidden="true">◇</span><p>No deposit needed.<br />Your balance and trades are entirely virtual.</p></div>
        </AuthLayout>
    );
}

export default Register;
