import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import App from '../App';

const tradeGate = vi.hoisted(() => {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
});
vi.mock('../Components/Trade.jsx', async (importOriginal) => {
  await tradeGate.promise;
  return importOriginal();
});
vi.mock('axios', () => {
  const client = { get: vi.fn(), interceptors: { response: { use: vi.fn() } } };
  client.create = () => client;
  return { default: client };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('WebSocket', class { close() {} });
  vi.stubGlobal('scrollTo', vi.fn());
  localStorage.setItem('accessToken', 'initial-token');
  axios.get.mockImplementation(async (url) => ({ data: url === '/market_status'
    ? { mode: 'disabled', supported_symbols: ['BTC/USD'], ready_symbols: [] }
    : url === '/user_data' ? { username: 'Trader', balance: 100000, short_liability: 0, networth: 100000 } : [] }));
});
afterEach(() => vi.unstubAllGlobals());

it('waits for deferred Trade content before scrolling and focusing its main landmark', async () => {
  render(<MemoryRouter initialEntries={['/dashboard']}><App /></MemoryRouter>);
  await screen.findByText('Welcome, Trader');
  const link = screen.getByRole('link', { name: 'Trade', exact: true });
  link.focus();
  fireEvent.click(link);
  expect(screen.getByText('Loading trading page…')).toBeTruthy();
  expect(window.scrollTo).not.toHaveBeenCalled();
  await act(async () => tradeGate.release());
  await screen.findByLabelText('Instrument');
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
  expect(document.activeElement).toBe(screen.getByRole('main'));
});

