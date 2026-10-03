import { randomUUID } from 'node:crypto';
import { test as base, expect } from '@playwright/test';

const FRONTEND_ORIGIN = 'http://127.0.0.1:4173';
const API_ORIGIN = 'http://127.0.0.1:18765';
const HTTP_ORIGINS = new Set([FRONTEND_ORIGIN, API_ORIGIN]);
const WS_ORIGINS = new Set(['ws://127.0.0.1:4173', 'ws://127.0.0.1:18765']);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const test = base.extend({
  localNetworkAudit: [async ({ context }, use, testInfo) => {
    const audit = { blockedRequests: [], consoleErrors: [], pageErrors: [], failedResponses: [] };
    const watchPage = (page) => {
      page.on('pageerror', (error) => audit.pageErrors.push(error.message));
    };
    context.on('page', watchPage);
    context.pages().forEach(watchPage);
    context.on('console', (message) => {
      if (message.type() === 'error') audit.consoleErrors.push(message.text());
    });
    context.on('response', (response) => {
      if (response.status() >= 400) audit.failedResponses.push(`${response.status()} ${response.url()}`);
    });
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (HTTP_ORIGINS.has(new URL(url).origin)) {
        await route.continue();
        return;
      }
      audit.blockedRequests.push(`HTTP ${url}`);
      await route.abort('blockedbyclient');
    });
    await context.routeWebSocket(/.*/, async (socket) => {
      const url = socket.url();
      if (WS_ORIGINS.has(new URL(url).origin)) {
        socket.connectToServer();
        return;
      }
      audit.blockedRequests.push(`WebSocket ${url}`);
      await socket.close({ code: 1008, reason: 'Only the local frontend and API are allowed' });
    });

    try {
      await use(audit);
    } finally {
      await testInfo.attach('browser-network-and-errors', {
        body: JSON.stringify(audit, null, 2),
        contentType: 'application/json',
      });
      expect.soft(audit.blockedRequests, 'Unexpected network destinations were blocked').toEqual([]);
      expect.soft(audit.failedResponses, 'All observed HTTP responses must succeed').toEqual([]);
      expect.soft(audit.pageErrors, 'No uncaught browser page errors').toEqual([]);
      expect.soft(audit.consoleErrors, 'No console.error messages').toEqual([]);
    }
  }, { auto: true }],
});

async function navigateWithSidebar(page, label) {
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: label, exact: true }).click();
}

async function accountSnapshot(page) {
  return page.evaluate(async (apiOrigin) => {
    const token = localStorage.getItem('accessToken');
    if (!token) throw new Error('The browser must be logged in before reading account state');
    const read = async (path) => {
      const response = await fetch(`${apiOrigin}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Account snapshot ${path} failed: ${response.status}`);
      return response.json();
    };
    return {
      account: await read('/user_data'),
      portfolio: await read('/portfolio'),
      history: await read('/trades?page=1&limit=100'),
    };
  }, API_ORIGIN);
}

test('registers, trades a fraction once despite replay, and protects private routes after logout', async ({ page }) => {
  const username = `e2e_${randomUUID().replaceAll('-', '')}`;
  const password = `PaperTrade-${randomUUID()}`;
  const symbol = 'BTC/USD';
  const quantity = 0.125;

  await page.goto(`${FRONTEND_ORIGIN}/register`);
  await expect(page.getByRole('heading', { name: 'Register', exact: true })).toBeVisible();
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page).toHaveURL(`${FRONTEND_ORIGIN}/login`);
  await expect(page.getByText('Account created. Log in to start trading.', { exact: true })).toBeVisible();

  await page.getByLabel('Username:', { exact: true }).fill(username);
  await page.getByLabel('Password:', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(`${FRONTEND_ORIGIN}/dashboard`);
  await expect(page.getByRole('heading', { name: `Welcome, ${username}`, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Demo market data', exact: true })).toBeVisible();
  await expect(page.getByText('No assets in portfolio', { exact: true })).toBeVisible();
  const before = await accountSnapshot(page);
  expect(before.account.username).toBe(username);
  expect(before.portfolio).toEqual([]);
  expect(before.history.trades).toEqual([]);

  await navigateWithSidebar(page, 'Trade');
  await expect(page).toHaveURL(`${FRONTEND_ORIGIN}/trade`);
  await expect(page.getByLabel('Instrument', { exact: true })).toHaveValue(symbol);
  await expect(page.getByText(`Fresh quote available for ${symbol}.`, { exact: true })).toBeVisible();
  await expect(page.getByRole('note')).toHaveText('Demo quote: this price is synthetic, not live market data.');
  await page.getByLabel(`Quantity of ${symbol}`, { exact: true }).fill(String(quantity));

  const fillResponsePromise = page.waitForResponse((response) =>
    response.url() === `${API_ORIGIN}/BUY` && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Buy', exact: true }).click();
  const fillResponse = await fillResponsePromise;
  expect(fillResponse.status()).toBe(200);
  const payload = fillResponse.request().postDataJSON();
  expect(payload).toEqual({ symbol, quantity, client_order_id: expect.stringMatching(UUID_V4) });
  const receipt = await fillResponse.json();
  await expect(page.getByText(`Buy order for ${quantity} ${symbol} completed.`, { exact: true })).toBeVisible();

  const afterFill = await accountSnapshot(page);
  expect(afterFill.history.trades).toHaveLength(1);
  expect(afterFill.history.totalPages).toBe(1);
  const trade = afterFill.history.trades[0];
  expect(trade).toMatchObject({ symbol, quantity });
  expect(trade.price).toBeGreaterThan(0);
  expect(afterFill.portfolio).toHaveLength(1);
  expect(afterFill.portfolio[0]).toMatchObject({ symbol, quantity, avg_price: trade.price });
  const cashDebit = before.account.balance - afterFill.account.balance;
  const notional = quantity * trade.price;
  expect(cashDebit).toBeGreaterThan(0);
  expect(cashDebit).toBeGreaterThanOrEqual(notional - 0.000001);
  expect(cashDebit).toBeLessThan(notional + 0.010001);

  const replay = await page.evaluate(async ({ apiOrigin, order }) => {
    const token = localStorage.getItem('accessToken');
    if (!token) throw new Error('The browser session disappeared before replay');
    const response = await fetch(`${apiOrigin}/BUY`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(order),
    });
    return { status: response.status, receipt: await response.json() };
  }, { apiOrigin: API_ORIGIN, order: payload });
  expect(replay.status).toBe(200);
  expect(replay.receipt).toEqual(receipt);

  const afterReplay = await accountSnapshot(page);
  expect(afterReplay.account.balance).toBe(afterFill.account.balance);
  expect(afterReplay.account.short_liability).toBe(afterFill.account.short_liability);
  expect(afterReplay.history).toEqual(afterFill.history);
  const positions = (snapshot) => snapshot.portfolio.map(({ id, symbol: asset, quantity: held, avg_price }) =>
    ({ id, symbol: asset, quantity: held, avg_price }));
  expect(positions(afterReplay)).toEqual(positions(afterFill));

  await navigateWithSidebar(page, 'View Trade History');
  await expect(page).toHaveURL(`${FRONTEND_ORIGIN}/trade-history`);
  await expect(page.getByRole('heading', { name: 'Trade History', exact: true })).toBeVisible();
  const tradeRows = page.locator('tbody tr');
  await expect(tradeRows).toHaveCount(1);
  await expect(tradeRows.first().getByRole('cell', { name: symbol, exact: true })).toBeVisible();
  await expect(tradeRows.first().getByRole('cell', { name: String(quantity), exact: true })).toBeVisible();
  await expect(tradeRows.first().getByRole('cell', { name: 'Buy', exact: true })).toBeVisible();
  await expect(page.getByText('Page 1 of 1', { exact: true })).toBeVisible();

  await navigateWithSidebar(page, 'Log Out');
  await expect(page).toHaveURL(`${FRONTEND_ORIGIN}/login`);
  await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('accessToken'))).toBeNull();
  await page.goBack();
  await expect(page).toHaveURL(`${FRONTEND_ORIGIN}/login`);
  await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toHaveCount(0);

  for (const path of ['/dashboard', '/trade', '/trade-history']) {
    await page.goto(`${FRONTEND_ORIGIN}${path}`);
    await expect(page).toHaveURL(`${FRONTEND_ORIGIN}/login`);
    await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toHaveCount(0);
    await expect(page.getByRole('table')).toHaveCount(0);
  }
});
