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

async function navigateWorkspace(page, label) {
  const opener = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await opener.isVisible()) {
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Navigation', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole(label === 'Log Out' ? 'button' : 'link', { name: label, exact: true }).click();
    await expect(dialog).not.toBeVisible();
    return;
  }
  if (label === 'Log Out') {
    await page.getByRole('button', { name: label, exact: true }).click();
    return;
  }
  await page.getByRole('navigation', { name: 'Main navigation', exact: true })
    .getByRole('link', { name: label, exact: true }).click();
}

async function expectNoHorizontalOverflow(page) {
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(widths.document, 'The document must fit the viewport').toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.body, 'The body must fit the viewport').toBeLessThanOrEqual(widths.viewport + 1);
}

async function captureLayout(page, testInfo, name) {
  await page.evaluate(() => document.fonts.ready);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true, animations: 'disabled' });
}

async function registerAndLogin(page, testInfo, screenshotPrefix) {
  // A long, unbroken account name exercises header wrapping at narrow widths.
  const username = `investor_with_a_deliberately_long_name_${randomUUID().replaceAll('-', '')}`;
  const password = `PaperTrade-${randomUUID()}`;
  await page.goto(`${FRONTEND_ORIGIN}/register`);
  await expect(page.getByRole('heading', { name: 'Register', exact: true })).toBeVisible();
  await captureLayout(page, testInfo, `${screenshotPrefix}-register`);
  await page.getByLabel(/^Username:?$/).fill(username);
  await page.getByLabel(/^Password:?$/).fill(password);
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page).toHaveURL(`${FRONTEND_ORIGIN}/login`);
  await expect(page.getByText('Account created. Log in to start trading.', { exact: true })).toBeVisible();
  // Capture auth screens before filling credentials; screenshots never contain a token.
  await captureLayout(page, testInfo, `${screenshotPrefix}-login`);
  await page.getByLabel(/^Username:?$/).fill(username);
  await page.getByLabel(/^Password:?$/).fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(`${FRONTEND_ORIGIN}/dashboard`);
  await expect(page.getByRole('heading', { name: `Welcome, ${username}`, exact: true })).toBeVisible();
  return username;
}

async function expectReceivedQuoteChart(page, symbol) {
  const chart = page.getByRole('img', { name: `${symbol} price chart from received quotes`, exact: true });
  await expect(chart).toBeVisible();
  await expect.poll(async () => Number(await chart.getAttribute('data-point-count'))).toBeGreaterThanOrEqual(3);
  await expect(chart.getByTestId('quote-price-line')).toBeVisible();
  return chart;
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

test('desktop registration, real quote chart, fractional replay, and protected routes', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const symbol = 'BTC/USD';
  const quantity = 0.125;
  const username = await registerAndLogin(page, testInfo, 'desktop');
  await expect(page.getByRole('heading', { name: 'Demo market data', exact: true })).toBeVisible();
  await expect(page.getByText('No assets in portfolio', { exact: true })).toBeVisible();
  await captureLayout(page, testInfo, 'desktop-overview-empty');
  const before = await accountSnapshot(page);
  expect(before.account.username).toBe(username);
  expect(before.portfolio).toEqual([]);
  expect(before.history.trades).toEqual([]);

  const tradeLink = page.getByRole('navigation', { name: 'Main navigation', exact: true })
    .getByRole('link', { name: 'Trade', exact: true });
  await tradeLink.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`${FRONTEND_ORIGIN}/trade`);
  await expect(page.getByLabel('Instrument', { exact: true })).toHaveValue(symbol);
  await expect(page.getByText(`Fresh quote available for ${symbol}.`, { exact: true })).toBeVisible();
  await expect(page.getByRole('note')).toHaveText('Demo quote: this price is synthetic, not live market data.');
  await expectReceivedQuoteChart(page, symbol);
  const quoteInspector = page.getByRole('slider', { name: 'Inspect received quotes', exact: true });
  await quoteInspector.focus();
  await page.keyboard.press('Home');
  await expect(quoteInspector).toHaveValue('0');
  await page.keyboard.press('ArrowRight');
  await expect(quoteInspector).toHaveValue('1');
  await expect(page.getByText('Inspecting quote', { exact: true })).toBeVisible();
  await captureLayout(page, testInfo, 'desktop-trade');
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

  await navigateWorkspace(page, 'Overview');
  await expect(page.getByRole('img', { name: 'Position exposure chart', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: `Trade ${symbol}`, exact: true })).toBeVisible();
  await captureLayout(page, testInfo, 'desktop-overview-populated');

  await navigateWorkspace(page, 'Activity');
  await expect(page).toHaveURL(`${FRONTEND_ORIGIN}/trade-history`);
  await expect(page.getByRole('heading', { name: 'Trade History', exact: true })).toBeVisible();
  const tradeRows = page.locator('tbody tr');
  await expect(tradeRows).toHaveCount(1);
  await expect(tradeRows.first().getByRole('cell', { name: symbol, exact: true })).toBeVisible();
  await expect(tradeRows.first().getByRole('cell', { name: String(quantity), exact: true })).toBeVisible();
  await expect(tradeRows.first().getByRole('cell', { name: 'Buy', exact: true })).toBeVisible();
  await expect(page.getByText('Page 1 of 1', { exact: true })).toBeVisible();
  await captureLayout(page, testInfo, 'desktop-activity');

  await navigateWorkspace(page, 'Log Out');
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

test('public landing page fits desktop and mobile viewports', async ({ page }, testInfo) => {
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(FRONTEND_ORIGIN);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await captureLayout(page, testInfo, `${viewport.name}-landing`);
    await page.getByRole('link', { name: 'Start practicing', exact: true }).click();
    await expect(page).toHaveURL(`${FRONTEND_ORIGIN}/register`);
    await expect(page.getByRole('heading', { name: 'Register', exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test('mobile layouts keep trading usable and trap and restore navigation focus', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await registerAndLogin(page, testInfo, 'mobile');
  await expect(page.getByText('No assets in portfolio', { exact: true })).toBeVisible();
  await captureLayout(page, testInfo, 'mobile-overview-empty');

  const opener = page.getByRole('button', { name: 'Open navigation', exact: true });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Navigation', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.getByRole('button', { name: 'Close navigation', exact: true })).toBeFocused();
  await captureLayout(page, testInfo, 'mobile-navigation');
  const focusable = dialog.locator('a[href], button:not([disabled])');
  const focusableCount = await focusable.count();
  expect(focusableCount).toBeGreaterThan(1);
  for (let index = 0; index <= focusableCount; index += 1) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement)), 'Tab must remain inside navigation').toBe(true);
  }
  await focusable.first().focus();
  await page.keyboard.press('Shift+Tab');
  await expect(focusable.last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();

  await navigateWorkspace(page, 'Trade');
  await expect(page).toHaveURL(`${FRONTEND_ORIGIN}/trade`);
  await expectReceivedQuoteChart(page, 'BTC/USD');
  await captureLayout(page, testInfo, 'mobile-trade');
  await page.getByLabel('Quantity of BTC/USD', { exact: true }).fill('0.125');
  await page.getByRole('button', { name: 'Buy', exact: true }).click();
  await expect(page.getByText('Buy order for 0.125 BTC/USD completed.', { exact: true })).toBeVisible();

  await navigateWorkspace(page, 'Overview');
  await expect(page.getByRole('img', { name: 'Position exposure chart', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Trade BTC/USD', exact: true })).toBeVisible();
  await captureLayout(page, testInfo, 'mobile-overview-populated');

  await navigateWorkspace(page, 'Activity');
  await expect(page.getByRole('heading', { name: 'Trade History', exact: true })).toBeVisible();
  await expect(page.getByText('Page 1 of 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'BTC/USD', exact: true })).toBeVisible();
  await captureLayout(page, testInfo, 'mobile-activity');

  await navigateWorkspace(page, 'Log Out');
  await expect(page).toHaveURL(`${FRONTEND_ORIGIN}/login`);
  expect(await page.evaluate(() => localStorage.getItem('accessToken'))).toBeNull();
});
