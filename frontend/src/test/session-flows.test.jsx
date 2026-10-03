import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import axios from 'axios';
import App from '../App';

vi.mock('axios', () => {
  const client = { get: vi.fn(), post: vi.fn(), rejectResponse: null };
  client.interceptors = { response: { use: vi.fn((_fulfilled, rejected) => { client.rejectResponse = rejected; }) } };
  client.create = () => client;
  return { default: client };
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal('WebSocket', class { close() {} });
});
afterEach(() => vi.unstubAllGlobals());

function Back() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>Browser Back</button>;
}
function renderApp(path = '/') {
  return render(<MemoryRouter initialEntries={[path]}><Back /><App /></MemoryRouter>);
}
function fillLogin(username) {
  fireEvent.change(screen.getByLabelText('Username:'), { target: { value: username } });
  fireEvent.change(screen.getByLabelText('Password:'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));
}
function accountRequests(username = 'Trader') {
  axios.get.mockImplementation((url) => Promise.resolve({ data: url.startsWith('/user_data')
    ? { username, balance: 1000, short_liability: 0, networth: 1000 }
    : url.startsWith('/trades') ? { trades: [], totalPages: 0 } : [] }));
}
function storageChange(token) {
  const oldValue = localStorage.getItem('accessToken');
  if (token === null) localStorage.removeItem('accessToken');
  else localStorage.setItem('accessToken', token);
  window.dispatchEvent(new StorageEvent('storage', { key: 'accessToken', oldValue, newValue: token, storageArea: localStorage }));
}

it.each(['/dashboard', '/trade', '/trade-history'])('requires login at %s', async (path) => {
  renderApp(path);
  expect(await screen.findByRole('heading', { name: 'Login' })).toBeTruthy();
  expect(axios.get).not.toHaveBeenCalled();
});

it('returns to the requested private route after login', async () => {
  axios.post.mockResolvedValueOnce({ data: { access_token: 'token' } });
  accountRequests();
  renderApp('/trade-history');
  await screen.findByRole('heading', { name: 'Login' });
  fillLogin('Trader');
  expect(await screen.findByRole('heading', { name: 'Trade History' })).toBeTruthy();
});

it('does not restore a private screen through Back after logout', async () => {
  localStorage.setItem('accessToken', 'token');
  accountRequests();
  renderApp('/dashboard');
  await screen.findByText('Welcome, Trader');
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  fireEvent.click(screen.getByRole('button', { name: 'Log Out' }));
  expect(await screen.findByRole('heading', { name: 'Login' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Browser Back' }));
  expect(screen.getByRole('heading', { name: 'Login' })).toBeTruthy();
  expect(localStorage.getItem('accessToken')).toBeNull();
});

it('prevents an abandoned login from replacing a newer account', async () => {
  let finishOldLogin;
  axios.post.mockImplementationOnce(() => new Promise((resolve) => { finishOldLogin = resolve; }));
  axios.post.mockResolvedValueOnce({ data: { access_token: 'newer-account-token' } });
  accountRequests('SecondAccount');
  renderApp('/login');
  fillLogin('FirstAccount');
  const oldSignal = axios.post.mock.calls[0][2]?.signal;
  fireEvent.click(screen.getByText('Register here'));
  fireEvent.click(screen.getByText('Login Here'));
  fillLogin('SecondAccount');
  await screen.findByText('Welcome, SecondAccount');
  await act(async () => finishOldLogin({ data: { access_token: 'older-account-token' } }));
  expect(localStorage.getItem('accessToken')).toBe('newer-account-token');
  expect(oldSignal?.aborted).toBe(true);
  expect(screen.getByText('Welcome, SecondAccount')).toBeTruthy();
});

it('ignores an abandoned registration response after a new login', async () => {
  let finishRegistration;
  axios.post.mockImplementationOnce(() => new Promise((resolve) => { finishRegistration = resolve; }));
  axios.post.mockResolvedValueOnce({ data: { access_token: 'token' } });
  accountRequests();
  renderApp('/register');
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'Trader' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Register' }));
  const oldSignal = axios.post.mock.calls[0][2]?.signal;
  fireEvent.click(screen.getByText('Login Here'));
  fillLogin('Trader');
  await screen.findByText('Welcome, Trader');
  await act(async () => finishRegistration({ data: { msg: 'ok' } }));
  expect(screen.getByText('Welcome, Trader')).toBeTruthy();
  expect(oldSignal?.aborted).toBe(true);
});

it('replaces stale account data when another tab switches accounts', async () => {
  localStorage.setItem('accessToken', 'first-token');
  accountRequests('FirstAccount');
  renderApp('/dashboard');
  await screen.findByText('Welcome, FirstAccount');
  accountRequests('SecondAccount');
  act(() => storageChange('second-token'));
  expect(screen.queryByText('Welcome, FirstAccount')).toBeNull();
  expect(await screen.findByText('Welcome, SecondAccount')).toBeTruthy();
  expect(axios.get.mock.calls.at(-1)[1].headers.Authorization).toBe('Bearer second-token');
});

it('leaves private routes when another tab logs out', async () => {
  localStorage.setItem('accessToken', 'token');
  accountRequests();
  renderApp('/dashboard');
  await screen.findByText('Welcome, Trader');
  act(() => storageChange(null));
  expect(await screen.findByRole('heading', { name: 'Login' })).toBeTruthy();
});

it('registers, logs in, places a fractional order, reads history and logs out across App routes', async () => {
  const trades = [];
  axios.post.mockImplementation(async (url, payload) => {
    if (url === '/login') return { data: { access_token: 'flow-token' } };
    if (url === '/BUY') trades.push({ id: 1, ...payload, price: 100, timestamp: '2026-01-01T12:00:00Z' });
    return { data: { msg: 'ok' } };
  });
  axios.get.mockImplementation(async (url) => ({ data: url.startsWith('/user_data')
    ? { username: 'FlowTrader', balance: 1000, short_liability: 0, networth: 1000 }
    : url.startsWith('/trades') ? { trades: [...trades], totalPages: trades.length ? 1 : 0 } : [] }));
  renderApp('/register');
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'FlowTrader' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Register' }));
  await screen.findByRole('heading', { name: 'Login' });
  expect(screen.getByRole('status').textContent).toContain('Account created');
  fillLogin('FlowTrader');
  await screen.findByText('Welcome, FlowTrader');
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  fireEvent.click(screen.getByRole('link', { name: 'Trade', exact: true }));
  fireEvent.change(await screen.findByRole('spinbutton'), { target: { value: '0.25' } });
  fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
  await screen.findByText('Buy order for 0.25 BTC/USD completed.');
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  fireEvent.click(screen.getByRole('link', { name: 'Activity' }));
  await screen.findByText('BTC/USD');
  expect(screen.getByText('0.25')).toBeTruthy();
  expect(screen.getByText('$25.00')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  fireEvent.click(screen.getByRole('button', { name: 'Log Out' }));
  await waitFor(() => expect(localStorage.getItem('accessToken')).toBeNull());
  expect(screen.getByRole('heading', { name: 'Login' })).toBeTruthy();
});

it('clears an expired session and redirects when the authenticated API returns 401', async () => {
  localStorage.setItem('accessToken', 'expired-token');
  axios.get.mockImplementation((url, config) => axios.rejectResponse({
    config: { ...config, url }, response: { status: 401, data: { detail: 'Could not validate credentials' } },
  }));
  renderApp('/dashboard');
  expect(await screen.findByRole('heading', { name: 'Login' })).toBeTruthy();
  expect(localStorage.getItem('accessToken')).toBeNull();
  expect(screen.getByText('Please log in to continue.')).toBeTruthy();
});

it('cancels a pending login after queued cross-tab login/logout events even when the final token is unchanged', async () => {
  let finishLogin;
  axios.post.mockImplementationOnce(() => new Promise((resolve) => { finishLogin = resolve; }));
  accountRequests();
  renderApp('/login');
  fillLogin('Trader');
  const signal = axios.post.mock.calls[0][2].signal;
  // Storage events are queued: another tab can finish both writes before this tab handles either event.
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'accessToken', oldValue: null, newValue: 'other-tab-token', storageArea: localStorage }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'accessToken', oldValue: 'other-tab-token', newValue: null, storageArea: localStorage }));
  });
  await act(async () => finishLogin({ data: { access_token: 'abandoned-login-token' } }));
  expect(localStorage.getItem('accessToken')).toBeNull();
  expect(signal.aborted).toBe(true);
  expect(screen.getByRole('heading', { name: 'Login' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Login' }).disabled).toBe(false);
});
