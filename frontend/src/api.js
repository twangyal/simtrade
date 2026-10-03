import axios from 'axios';
import { clearSession, getAccessToken } from './session';

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
export const WS_URL = import.meta.env.VITE_WS_URL || `${API_URL.replace(/^http/, 'ws')}/ws`;

const api = axios.create({ baseURL: API_URL, timeout: 15000 });
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const config = error.config;
    const publicAuth = config?.url === '/login' || config?.url === '/register';
    const authorization = config?.headers?.Authorization ?? config?.headers?.authorization;
    if (error.response?.status === 401 && !publicAuth && typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
      clearSession(authorization.slice(7));
    }
    return Promise.reject(error);
  },
);
export default api;

export function authHeaders() {
  const token = getAccessToken();
  if (!token) throw new Error('Please log in to continue.');
  return { Authorization: `Bearer ${token}` };
}

export function errorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((item) => item.msg).filter(Boolean).join('; ') || fallback;
  return error?.message === 'Please log in to continue.' ? error.message : fallback;
}

export function formatMoney(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'N/A';
  return Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
