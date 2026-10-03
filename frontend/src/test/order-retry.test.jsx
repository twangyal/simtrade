import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import axios from 'axios';
import TradeControls from '../Components/TradeControls';

vi.mock('axios', () => {
  const client = { post: vi.fn(), interceptors: { response: { use: vi.fn() } } };
  client.create = () => client;
  return { default: client };
});

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.setItem('accessToken', 'order-token');
  let sequence = 0;
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`) });
});
afterEach(() => vi.unstubAllGlobals());

function quantity(value = '0.25') {
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value } });
}
function buy() { fireEvent.click(screen.getByRole('button', { name: 'Buy' })); }
function keyFor(call) { return axios.post.mock.calls[call][1].client_order_id; }
function failThenSucceed(error = new Error('Network Error')) {
  axios.post.mockRejectedValueOnce(error);
  axios.post.mockResolvedValueOnce({ data: { msg: 'Trade created successfully' } });
}

it.each([
  ['a network failure', new Error('Network Error')],
  ['a timeout', { code: 'ECONNABORTED', message: 'timeout exceeded' }],
  ['a server error', { response: { status: 500, data: { detail: 'Server error' } } }],
  ['service unavailable', { response: { status: 503, data: { detail: 'Service unavailable' } } }],
])('reuses the same UUID only when the unchanged order is manually retried after %s', async (_label, error) => {
  failThenSucceed(error);
  render(<TradeControls selectedOption="BTC/USD" />);
  quantity();
  buy();
  await screen.findByRole('alert');
  const firstKey = keyFor(0);
  expect(firstKey).toMatch(uuidPattern);
  expect(axios.post).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/retry the unchanged order on this page/i)).toBeTruthy();
  expect(screen.getByText(/reload.*leave.*change details/i)).toBeTruthy();
  buy();
  await screen.findByRole('status');
  expect(keyFor(1)).toBe(firstKey);
  expect(axios.post.mock.calls[1][1]).toEqual(axios.post.mock.calls[0][1]);
  expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
});

it('gives a new UUID to an intentional identical order after success', async () => {
  axios.post.mockResolvedValue({ data: { msg: 'ok' } });
  render(<TradeControls selectedOption="AAPL" />);
  quantity('1');
  buy();
  await screen.findByRole('status');
  quantity('1');
  buy();
  await screen.findByRole('status');
  expect(keyFor(0)).toMatch(uuidPattern);
  expect(keyFor(1)).toMatch(uuidPattern);
  expect(keyFor(1)).not.toBe(keyFor(0));
});

it.each(['side', 'symbol', 'quantity'])('starts a new order when the %s changes after an uncertain result', async (changed) => {
  failThenSucceed();
  const { rerender } = render(<TradeControls selectedOption="AAPL" />);
  quantity('1');
  buy();
  await screen.findByRole('alert');
  if (changed === 'symbol') rerender(<TradeControls selectedOption="QQQ" />);
  if (changed === 'quantity') quantity('2');
  fireEvent.click(screen.getByRole('button', { name: changed === 'side' ? 'Sell' : 'Buy' }));
  await screen.findByRole('status');
  expect(keyFor(1)).toMatch(uuidPattern);
  expect(keyFor(1)).not.toBe(keyFor(0));
});

it.each(['symbol', 'quantity'])('invalidates the old retry when %s changes away and back', async (changed) => {
  failThenSucceed();
  const { rerender } = render(<TradeControls selectedOption="AAPL" />);
  quantity('1');
  buy();
  await screen.findByRole('alert');
  if (changed === 'symbol') {
    rerender(<TradeControls selectedOption="QQQ" />);
    rerender(<TradeControls selectedOption="AAPL" />);
  } else {
    quantity('2');
    quantity('1');
  }
  buy();
  await screen.findByRole('status');
  expect(keyFor(1)).not.toBe(keyFor(0));
});

it('keeps the retry ID when only the numeric formatting changes', async () => {
  failThenSucceed();
  render(<TradeControls selectedOption="AAPL" />);
  quantity('0.25');
  buy();
  await screen.findByRole('alert');
  quantity('0.250');
  buy();
  await screen.findByRole('status');
  expect(keyFor(0)).toMatch(uuidPattern);
  expect(keyFor(1)).toBe(keyFor(0));
});

it.each([400, 409, 422])('uses a new UUID after a confirmed %s rejection', async (status) => {
  failThenSucceed({ response: { status, data: { detail: 'Order rejected' } } });
  render(<TradeControls selectedOption="AAPL" />);
  quantity('1');
  buy();
  expect((await screen.findByRole('alert')).textContent).toBe('Order rejected');
  expect(screen.queryByText(/retry the unchanged order on this page/i)).toBeNull();
  buy();
  await screen.findByRole('status');
  expect(keyFor(0)).toMatch(uuidPattern);
  expect(keyFor(1)).not.toBe(keyFor(0));
});

it.each([429, 409])('preserves an uncertain order through a later %s rejection', async (status) => {
  axios.post.mockRejectedValueOnce(new Error('Network Error'));
  axios.post.mockRejectedValueOnce({ response: { status, data: { detail: 'Retry rejected' } } });
  axios.post.mockResolvedValueOnce({ data: { msg: 'ok' } });
  render(<TradeControls selectedOption="AAPL" />);
  quantity('1');
  buy();
  await screen.findByRole('alert');
  const firstKey = keyFor(0);
  buy();
  expect((await screen.findByRole('alert')).textContent).toBe('Retry rejected');
  expect(screen.getByText(/retry the unchanged order on this page/i)).toBeTruthy();
  expect(axios.post).toHaveBeenCalledTimes(2);
  buy();
  await screen.findByRole('status');
  expect(keyFor(1)).toBe(firstKey);
  expect(keyFor(2)).toBe(firstKey);
  expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
});

it('keeps the pending submission lock when the selected instrument changes', async () => {
  let finish;
  axios.post.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const { rerender } = render(<TradeControls selectedOption="AAPL" />);
  quantity('1');
  const button = screen.getByRole('button', { name: 'Buy' });
  fireEvent.click(button);
  fireEvent.click(button);
  rerender(<TradeControls selectedOption="QQQ" />);
  expect(screen.getByRole('button', { name: 'Sell' }).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Sell' }));
  expect(axios.post).toHaveBeenCalledTimes(1);
  expect(keyFor(0)).toMatch(uuidPattern);
  await act(async () => finish({ data: { msg: 'ok' } }));
  expect(screen.getByRole('status').textContent).toContain('1 AAPL completed');
});

it('uses secure random bytes when randomUUID is unavailable', async () => {
  vi.stubGlobal('crypto', { getRandomValues: vi.fn((bytes) => { bytes.fill(17); return bytes; }) });
  axios.post.mockResolvedValueOnce({ data: { msg: 'ok' } });
  render(<TradeControls selectedOption="AAPL" />);
  quantity('1');
  buy();
  await screen.findByRole('status');
  expect(keyFor(0)).toMatch(uuidPattern);
  expect(crypto.getRandomValues).toHaveBeenCalledOnce();
});

it('blocks submission when secure order IDs cannot be generated', async () => {
  vi.stubGlobal('crypto', {});
  render(<TradeControls selectedOption="AAPL" />);
  quantity('1');
  buy();
  expect((await screen.findByRole('alert')).textContent).toMatch(/secure order ID/i);
  expect(axios.post).not.toHaveBeenCalled();
});
