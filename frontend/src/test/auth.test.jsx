import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import axios from 'axios';
import Login from '../Components/Login';
import Register from '../Components/Register';

vi.mock('axios', () => {
  const client = { post: vi.fn() };
  client.create = () => client;
  return { default: client };
});

beforeEach(() => vi.resetAllMocks());

function renderAuth(path = '/login') {
  return render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/dashboard" element={<h1>Account dashboard</h1>} />
    </Routes>
  </MemoryRouter>);
}

it('offers personal registration instead of a shared trial login', () => {
  renderAuth();
  expect(screen.queryByRole('button', { name: 'Trial' })).toBeNull();
  fireEvent.click(screen.getByText('Register here'));
  expect(screen.getByRole('heading', { name: 'Register' })).toBeTruthy();
  expect(axios.post).not.toHaveBeenCalled();
});

it('prevents repeated login submissions while awaiting the token', async () => {
  let complete;
  axios.post.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
  renderAuth();
  fireEvent.change(screen.getByLabelText('Username:'), { target: { value: 'Trader' } });
  fireEvent.change(screen.getByLabelText('Password:'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));
  expect(screen.getByRole('button', { name: /logging in/i }).disabled).toBe(true);
  await act(async () => complete({ data: { access_token: 'new-token' } }));
  expect(screen.getByRole('heading', { name: 'Account dashboard' })).toBeTruthy();
  expect(localStorage.getItem('accessToken')).toBe('new-token');
});

it('shows server registration errors', async () => {
  axios.post.mockRejectedValueOnce({ response: { data: { detail: 'Username already registered' } } });
  renderAuth('/register');
  const inputs = screen.getAllByRole('textbox');
  fireEvent.change(inputs[0], { target: { value: 'Trader' } });
  fireEvent.change(document.querySelector('input[type="password"]'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Register' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Username already registered');
});
