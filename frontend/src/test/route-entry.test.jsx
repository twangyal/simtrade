import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import axios from 'axios';
import App from '../App';

vi.mock('axios', () => {
  const client = { get: vi.fn(), post: vi.fn(), interceptors: { response: { use: vi.fn() } } };
  client.create = () => client;
  return { default: client };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('WebSocket', class { close() {} });
  vi.stubGlobal('scrollTo', vi.fn());
  vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
  axios.post.mockResolvedValue({ data: { access_token: 'route-token' } });
  axios.get.mockImplementation(async (url) => ({ data: url === '/market_status'
    ? { mode: 'disabled', supported_symbols: ['AAPL', 'BTC/USD'], ready_symbols: [] }
    : url === '/user_data' ? { username: 'Trader', balance: 100000, short_liability: 0, networth: 100000 }
      : url.startsWith('/trades') ? { trades: [], totalPages: 0 } : [] }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function NavigationControls() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate(-1)}>Browser Back</button><button onClick={() => navigate('/trade?symbol=AAPL#order-ticket')}>Same-page hash navigation</button></>;
}
function renderApp(path = '/', authenticated = false) {
  if (authenticated) localStorage.setItem('accessToken', 'initial-token');
  return render(<MemoryRouter initialEntries={[path]}><NavigationControls /><App /></MemoryRouter>);
}

it('starts a new public page at its main content after a lower landing-page link', () => {
  renderApp();
  const footerLink = screen.getByRole('link', { name: 'Create an account', exact: true });
  footerLink.focus();
  fireEvent.click(footerLink);
  expect(screen.getByRole('heading', { name: 'Register' })).toBeTruthy();
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
  expect(document.activeElement).toBe(screen.getByRole('main'));
});

it('leaves ordinary initial page entry and browser Back scroll restoration alone', async () => {
  renderApp('/dashboard', true);
  await screen.findByText('Welcome, Trader');
  expect(window.scrollTo).not.toHaveBeenCalled();
  expect(document.activeElement).not.toBe(screen.getByRole('main'));
  fireEvent.click(screen.getByRole('link', { name: 'Trade', exact: true }));
  await screen.findByLabelText('Instrument');
  expect(document.activeElement).toBe(screen.getByRole('main'));
  vi.mocked(window.scrollTo).mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Browser Back' }));
  await screen.findByText('Welcome, Trader');
  expect(window.scrollTo).not.toHaveBeenCalled();
  expect(document.activeElement).not.toBe(screen.getByRole('main'));
});

it('preserves instrument-selector focus and scroll for query-only and same-page hash updates', async () => {
  renderApp('/trade', true);
  const instrument = await screen.findByLabelText('Instrument');
  instrument.focus();
  fireEvent.change(instrument, { target: { value: 'AAPL' } });
  expect(instrument.value).toBe('AAPL');
  expect(document.activeElement).toBe(instrument);
  expect(window.scrollTo).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Same-page hash navigation' }));
  expect(document.activeElement).toBe(instrument);
  expect(window.scrollTo).not.toHaveBeenCalled();
  expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
});

it('honors an initial hash target after its route content mounts', async () => {
  renderApp('/trade?symbol=AAPL#order-ticket', true);
  await screen.findByLabelText('Instrument');
  expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' });
  expect(document.activeElement).toBe(document.getElementById('order-ticket'));
  expect(window.scrollTo).not.toHaveBeenCalled();
});

it('focuses a login redirect, then honors the original destination hash after authentication', async () => {
  renderApp('/trade?symbol=AAPL#order-ticket');
  await screen.findByRole('heading', { name: 'Login' });
  expect(document.activeElement).toBe(screen.getByRole('main'));
  fireEvent.change(screen.getByLabelText('Username:'), { target: { value: 'Trader' } });
  fireEvent.change(screen.getByLabelText('Password:'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));
  const instrument = await screen.findByLabelText('Instrument');
  expect(instrument.value).toBe('AAPL');
  expect(document.activeElement).toBe(document.getElementById('order-ticket'));
});

it('preserves drawer dismissal focus but focuses the destination after choosing another page', async () => {
  renderApp('/dashboard', true);
  await screen.findByText('Welcome, Trader');
  const opener = screen.getByRole('button', { name: 'Open navigation' });
  opener.focus();
  fireEvent.click(opener);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Close navigation' }), { key: 'Escape' });
  expect(document.activeElement).toBe(opener);
  expect(window.scrollTo).not.toHaveBeenCalled();
  fireEvent.click(opener);
  fireEvent.click(screen.getByRole('link', { name: 'Trade', exact: true }));
  await screen.findByLabelText('Instrument');
  expect(document.activeElement).toBe(screen.getByRole('main'));
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
});

it('does not replay a hash jump when browser Back returns to an earlier hash route', async () => {
  renderApp('/trade?symbol=AAPL#order-ticket', true);
  await screen.findByLabelText('Instrument');
  expect(document.activeElement).toBe(document.getElementById('order-ticket'));
  fireEvent.click(screen.getByRole('link', { name: 'Overview', exact: true }));
  await screen.findByText('Welcome, Trader');
  vi.mocked(window.scrollTo).mockClear();
  vi.mocked(HTMLElement.prototype.scrollIntoView).mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Browser Back' }));
  await screen.findByLabelText('Instrument');
  expect(window.scrollTo).not.toHaveBeenCalled();
  expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  expect(document.activeElement).not.toBe(document.getElementById('order-ticket'));
});

it.each([
  ['/login#username', 'Username:'],
  ['/register#register-password', 'Password'],
])('keeps a native hash-targeted form control in the Tab order at %s', (path, label) => {
  renderApp(path);
  const input = screen.getByLabelText(label);
  expect(document.activeElement).toBe(input);
  expect(input.tabIndex).toBe(0);
  expect(input.hasAttribute('tabindex')).toBe(false);
});
