import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className="bg-white shadow-md rounded-lg p-8 max-w-md w-full">
                <h2 className="text-3xl font-bold text-center mb-6">Register</h2>
                {error && <p role="alert" className="text-red-600 text-sm mb-4">{error}</p>}
                <form aria-busy={busy} onSubmit={handleRegister} className="space-y-6">
                    <div>
                        <label htmlFor="register-username" className="block text-sm font-medium text-gray-700">Username</label>
                        <input
                            type="text"
                            id="register-username"
                            autoComplete="username"
                            disabled={busy}
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        />
                    </div>
                    <div>
                        <label htmlFor="register-password" className="block text-sm font-medium text-gray-700">Password</label>
                        <input
                            type="password"
                            id="register-password"
                            autoComplete="new-password"
                            disabled={busy}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={busy}
                        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors duration-300"
                    >
                        {busy ? 'Registering…' : 'Register'}
                    </button>
                </form>
                <div className="mt-6 text-center">
                    <p className="text-sm">Have an account?</p>
                    <button
                        className="mt-2 text-blue-600 hover:underline"
                        onClick={() => navigate('/login')}
                    >
                        Login Here
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Register;
