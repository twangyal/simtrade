import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import App from '../App';

vi.mock('axios', () => {
  const client = { get: vi.fn(), interceptors: { response: { use: vi.fn() } } };
  client.create = () => client;
  return { default: client };
});
vi.mock('../Components/Trade.jsx', async () => { throw new Error('Expected route download failure'); });

function preventExpectedError(event) {
  if (event.error?.cause?.message === 'Expected route download failure') event.preventDefault();
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('scrollTo', vi.fn());
  window.addEventListener('error', preventExpectedError);
  localStorage.setItem('accessToken', 'initial-token');
  axios.get.mockImplementation(async (url) => ({ data: url === '/market_status'
    ? { mode: 'disabled', supported_symbols: ['BTC/USD'], ready_symbols: [] }
    : url === '/user_data' ? { username: 'Trader', balance: 100000, short_liability: 0, networth: 100000 } : [] }));
});
afterEach(() => {
  window.removeEventListener('error', preventExpectedError);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('opens recovery at the top and focuses its main landmark when a new route fails to load', async () => {
  render(<MemoryRouter initialEntries={['/dashboard']}><App /></MemoryRouter>);
  await screen.findByText('Welcome, Trader');
  fireEvent.click(screen.getByRole('link', { name: 'Trade', exact: true }));
  await screen.findByRole('heading', { name: 'The trading page could not load.' });
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
  expect(document.activeElement).toBe(screen.getByRole('main'));
});
