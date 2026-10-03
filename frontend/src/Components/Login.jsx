import { useState } from 'react';
import useAuthRequest from '../useAuthRequest';
import { setSession } from '../session';
import { useLocation, useNavigate } from 'react-router-dom';

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
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className="bg-white shadow-md rounded-lg p-8 max-w-md w-full">
                <h1 className="text-3xl font-bold text-center mb-6">Login</h1>
                {location.state?.loginRequired && <p role="status" className="text-gray-700 mb-4">Please log in to continue.</p>}
                {location.state?.registered && <p role="status" className="text-green-700 mb-4">Account created. Log in to start trading.</p>}
                <form aria-busy={busy} onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="username" className="block text-sm font-medium text-gray-700">Username:</label>
                        <input
                            type="text"
                            id="username"
                            autoComplete="username"
                            disabled={busy}
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
                            autoComplete="current-password"
                            disabled={busy}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        />
                    </div>
                    {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
                    <button
                        type="submit"
                        disabled={busy}
                        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors duration-300"
                    >
                        {busy ? 'Logging in…' : 'Login'}
                    </button>
                </form>
                <div className="mt-6 text-center">
                    <p className="text-sm">Create your own paper trading account.</p>
                    <button
                        className="mt-2 text-blue-600 hover:underline"
                        onClick={() => navigate('/register')}
                    >
                        Register here
                    </button>
                </div>

            </div>
        </div>
    );
};

export default Login;
