import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { test as base, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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

async function captureLayout(page, testInfo, name, { fullPage = true } = {}) {
  await page.evaluate(() => document.fonts.ready);
  // Preserve the actual screen even if the following accessibility check fails.
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage, animations: 'disabled' });
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  // Keep useful diagnostics without HTML, input values, or session metadata.
  const findings = violations.map(({ id, impact, help, helpUrl, nodes }) => ({
    id, impact, help, helpUrl,
    nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
  }));
  const reportPath = testInfo.outputPath(`${name}-accessibility.json`);
  await writeFile(reportPath, JSON.stringify(findings, null, 2));
  await testInfo.attach(`${name}-accessibility-violations`, {
    path: reportPath,
    contentType: 'application/json',
  });
  // Collect all page findings in one run; any violation still fails the test.
  expect.soft(findings, `${name} must meet WCAG 2.1 AA checks`).toEqual([]);
  await expectNoHorizontalOverflow(page);
}

async function registerAndLogin(page, testInfo, screenshotPrefix, { shortUsername = false } = {}) {
  // A long, unbroken account name exercises header wrapping at narrow widths.
  const username = shortUsername
    ? `ChartExplorer_${randomUUID().slice(0, 8)}`
    : `investor_with_a_deliberately_long_name_${randomUUID().replaceAll('-', '')}`;
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

async function expectLastPriceEstimates(page, quantity) {
  await expect(page.getByLabel('Indicative buy value', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Indicative sell value', { exact: true })).toBeVisible();
  await expect(page.getByText('USD estimates only. Final price and cent rounding may vary. A recent receipt does not guarantee an executable quote.', { exact: true })).toBeVisible();
  // Read all displayed amounts in one browser turn, between demo quote updates.
  const values = await page.evaluate(() => {
    const amount = (label) => Number(document.querySelector(`[aria-label="${label}"]`).textContent.replace(/[^0-9.-]/g, ''));
    return {
      price: amount('Last received price'),
      buy: amount('Indicative buy value'),
      sell: amount('Indicative sell value'),
    };
  });
  const notional = quantity * values.price;
  expect(notional).toBeGreaterThan(0);
  expect(values.buy).toBeGreaterThanOrEqual(notional - 0.000001);
  expect(values.buy).toBeLessThan(notional + 0.010001);
  expect(values.sell).toBeLessThanOrEqual(notional + 0.000001);
  expect(values.sell).toBeGreaterThan(notional - 0.010001);
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

async function expectTableColumnsReachable(page, label, finalHeading) {
  // Exercise the controls themselves: locator visibility does not detect clipping.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const region = page.getByRole('region', { name: label, exact: true });
  const left = page.getByRole('button', { name: `Scroll ${label} left`, exact: true });
  const right = page.getByRole('button', { name: `Scroll ${label} right`, exact: true });
  await expect(region.getByRole('columnheader', { name: finalHeading, exact: true })).toBeVisible();
  await expect(left).toBeDisabled();
  await expect(right).toBeEnabled();
  await expect(right).toHaveAttribute('aria-controls', await region.getAttribute('id'));
  const start = await region.evaluate((element) => element.scrollLeft);
  await right.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(start);
  for (let step = 0; step < 8; step += 1) {
    const atEnd = await region.evaluate((element) =>
      element.scrollLeft >= element.scrollWidth - element.clientWidth - 1);
    if (atEnd) break;
    await right.click();
  }
  await expect(right).toBeDisabled();
  await expect(left).toBeEnabled();
  const geometry = await region.evaluate((element) => {
    const viewport = element.getBoundingClientRect();
    const leftEdge = viewport.left + element.clientLeft;
    const rightEdge = leftEdge + element.clientWidth;
    return [...element.querySelectorAll('thead th:last-child, tbody td:last-child')].map((cell) => {
      const bounds = cell.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, leftEdge, rightEdge };
    });
  });
  expect(geometry.length, 'Check both the final heading and its data cells').toBeGreaterThan(1);
  for (const cell of geometry) {
    expect(cell.left, `${finalHeading} must fit inside the scroll viewport`).toBeGreaterThanOrEqual(cell.leftEdge - 1);
    expect(cell.right, `${finalHeading} must fit inside the scroll viewport`).toBeLessThanOrEqual(cell.rightEdge + 1);
  }
}

async function fillLocalDemoOrders(page, orders) {
  // The token remains in the authenticated browser; only synthetic orders leave it.
  return page.evaluate(async ({ apiOrigin, fills }) => {
    const token = localStorage.getItem('accessToken');
    if (!token) throw new Error('The browser must be logged in before placing demo orders');
    const results = [];
    for (const { side, ...order } of fills) {
      const response = await fetch(`${apiOrigin}/${side}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(order),
      });
      results.push({ symbol: order.symbol, status: response.status });
    }
    return results;
  }, {
    apiOrigin: API_ORIGIN,
    fills: orders.map((order) => ({ ...order, client_order_id: randomUUID() })),
  });
}

async function expectMixedExposure(page, holdings) {
  const money = (value) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
  const marked = holdings.map(({ symbol, quantity, current_price }) => ({
    symbol, quantity, value: Math.abs(quantity) * current_price,
  }));
  expect(marked).toHaveLength(3);
  expect(marked.filter(({ quantity }) => quantity > 0)).toHaveLength(2);
  expect(marked.filter(({ quantity }) => quantity < 0)).toHaveLength(1);
  const gross = marked.reduce((total, { value }) => total + value, 0);
  const long = marked.filter(({ quantity }) => quantity > 0).reduce((total, { value }) => total + value, 0);
  const short = marked.filter(({ quantity }) => quantity < 0).reduce((total, { value }) => total + value, 0);
  expect(short).toBeGreaterThan(0);
  expect(gross).toBeGreaterThan(long);
  const exposure = page.getByRole('region', { name: 'Position exposure', exact: true });
  const chart = exposure.getByRole('img', { name: 'Position exposure chart', exact: true });
  await expect(chart).toBeVisible();
  await expect(chart.locator('desc')).toContainText(`Gross exposure ${money(gross)}`);
  await expect(chart.locator('desc')).toContainText(`Long positions ${money(long)}`);
  await expect(chart.locator('desc')).toContainText(`short positions ${money(short)}`);
  await expect(chart.locator('desc')).toContainText('Short positions are liabilities.');
  const rows = exposure.getByRole('list', { name: 'Marked position breakdown', exact: true }).getByRole('listitem');
  await expect(rows).toHaveCount(3);
  for (const position of marked) {
    expect(position.value).toBeGreaterThan(0);
    const name = `${position.symbol} · ${position.quantity < 0 ? 'Short' : 'Long'}`;
    const row = rows.filter({ has: page.getByText(name, { exact: true }) });
    await expect(row.getByText(name, { exact: true })).toBeVisible();
    await expect(row.getByText(money(position.value), { exact: true })).toBeVisible();
    const weight = position.value / gross * 100;
    await expect(row.getByText(weight < 0.1 ? '<0.1%' : `${Number(weight.toFixed(1))}%`, { exact: true })).toBeVisible();
  }
  // A box can fit while its currency text wraps mid-number. Measure actual text
  // fragments, including both legend amounts and long/short direction totals.
  const panelBounds = await exposure.boundingBox();
  const currencyValues = new Set([...marked.map(({ value }) => value), long, short].map(money));
  for (const value of currencyValues) {
    const amounts = exposure.getByText(value, { exact: true });
    await expect(amounts.first()).toBeVisible();
    for (const amount of await amounts.all()) {
      const fragments = await amount.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0)
          .map(({ top, left, right }) => ({ top, left, right }));
      });
      expect(fragments.length, `${value} must have visible text`).toBeGreaterThan(0);
      const lineTops = fragments.map(({ top }) => top);
      expect(Math.max(...lineTops) - Math.min(...lineTops), `${value} must remain on one line`).toBeLessThanOrEqual(1);
      for (const fragment of fragments) {
        expect(fragment.left, `${value} must remain inside the exposure panel`).toBeGreaterThanOrEqual(panelBounds.x - 1);
        expect(fragment.right, `${value} must remain inside the exposure panel`).toBeLessThanOrEqual(panelBounds.x + panelBounds.width + 1);
      }
    }
  }
  const segments = chart.locator('[data-exposure-segment]');
  await expect(segments).toHaveCount(3);
  const weights = await segments.evaluateAll((elements) => elements.map((element) =>
    Number(element.getAttribute('stroke-dasharray').split(' ')[0])));
  expect(weights.reduce((total, value) => total + value, 0)).toBeCloseTo(100, 8);
  expect(weights.every((value) => value > 0 && value < 100)).toBe(true);
  const expectedWeights = marked.map(({ value }) => value / gross * 100).sort((left, right) => right - left);
  weights.forEach((weight, index) => expect(weight).toBeCloseTo(expectedWeights[index], 8));
  const layout = await exposure.evaluate((panel) => {
    const bounds = panel.getBoundingClientRect();
    return [...panel.querySelectorAll('svg, ul, li, li > span')].map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, panelLeft: bounds.left, panelRight: bounds.right };
    });
  });
  for (const element of layout) {
    expect(element.left, 'The chart and every legend field must remain within their panel').toBeGreaterThanOrEqual(element.panelLeft - 1);
    expect(element.right, 'The chart and every legend field must remain within their panel').toBeLessThanOrEqual(element.panelRight + 1);
  }
}

test('desktop registration, real quote chart, fractional replay, and protected routes', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const symbol = 'BTC/USD';
  const quantity = 0.125;
  const username = await registerAndLogin(page, testInfo, 'desktop');
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).not.toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main navigation', exact: true })).toBeVisible();
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
  await page.getByLabel(`Quantity of ${symbol}`, { exact: true }).fill(String(quantity * 2));
  await expectLastPriceEstimates(page, quantity * 2);
  await page.getByLabel(`Quantity of ${symbol}`, { exact: true }).fill(String(quantity));
  await expectLastPriceEstimates(page, quantity);
  await captureLayout(page, testInfo, 'desktop-trade');

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
  test.setTimeout(90_000);
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
  await captureLayout(page, testInfo, 'mobile-navigation', { fullPage: false });
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
  await page.getByRole('link', { name: 'Jump to order ticket', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Order ticket', exact: true })).toBeInViewport({ ratio: 1 });
  await page.getByLabel('Quantity of BTC/USD', { exact: true }).fill('0.125');
  await expectLastPriceEstimates(page, 0.125);
  await captureLayout(page, testInfo, 'mobile-order-ticket', { fullPage: false });
  await page.getByRole('button', { name: 'Buy', exact: true }).click();
  await expect(page.getByText('Buy order for 0.125 BTC/USD completed.', { exact: true })).toBeVisible();

  await navigateWorkspace(page, 'Overview');
  await expect(page.getByRole('img', { name: 'Position exposure chart', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Trade BTC/USD', exact: true })).toBeVisible();
  await captureLayout(page, testInfo, 'mobile-overview-populated');
  await expectTableColumnsReachable(page, 'Portfolio holdings', 'Unrealized P&L');
  await captureLayout(page, testInfo, 'mobile-overview-values');

  await navigateWorkspace(page, 'Activity');
  await expect(page.getByRole('heading', { name: 'Trade History', exact: true })).toBeVisible();
  await expect(page.getByText('Page 1 of 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'BTC/USD', exact: true })).toBeVisible();
  await captureLayout(page, testInfo, 'mobile-activity');
  await expectTableColumnsReachable(page, 'Trade records', 'Notional');
  await captureLayout(page, testInfo, 'mobile-activity-notional');

  await navigateWorkspace(page, 'Log Out');
  await expect(page).toHaveURL(`${FRONTEND_ORIGIN}/login`);
  expect(await page.evaluate(() => localStorage.getItem('accessToken'))).toBeNull();
});

test('mixed long and short exposure fits desktop, tablet, and narrow mobile layouts', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await registerAndLogin(page, testInfo, 'mixed', { shortUsername: true });
  await navigateWorkspace(page, 'Trade');
  await expectReceivedQuoteChart(page, 'BTC/USD');
  const fills = await fillLocalDemoOrders(page, [
    { symbol: 'AAPL', side: 'BUY', quantity: 40 },
    { symbol: 'BTC/USD', side: 'BUY', quantity: 0.125 },
    { symbol: 'QQQ', side: 'SELL', quantity: 15 },
  ]);
  expect(fills).toEqual([
    { symbol: 'AAPL', status: 200 },
    { symbol: 'BTC/USD', status: 200 },
    { symbol: 'QQQ', status: 200 },
  ]);
  // Use the exact marks that Dashboard renders, not a later independent request.
  const portfolioResponse = page.waitForResponse((response) =>
    response.url() === `${API_ORIGIN}/portfolio` && response.request().method() === 'GET');
  await navigateWorkspace(page, 'Overview');
  const holdings = await (await portfolioResponse).json();
  expect(holdings).toEqual(expect.arrayContaining([
    expect.objectContaining({ symbol: 'AAPL', quantity: 40 }),
    expect.objectContaining({ symbol: 'BTC/USD', quantity: 0.125 }),
    expect.objectContaining({ symbol: 'QQQ', quantity: -15 }),
  ]));
  const snapshot = await accountSnapshot(page);
  expect(snapshot.history.trades).toHaveLength(3);
  expect(snapshot.account.short_liability).toBeLessThan(0);

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'tablet-landscape', width: 1024, height: 768 },
    { name: 'tablet-portrait', width: 768, height: 1024 },
    { name: 'narrow-mobile', width: 320, height: 812 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(page.getByRole('region', { name: 'Portfolio holdings', exact: true }).locator('tbody tr')).toHaveCount(3);
    await expect(page.getByRole('img', { name: 'Position exposure chart', exact: true })).toBeVisible();
    const opener = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (viewport.width >= 1100) {
      await expect(opener).not.toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Main navigation', exact: true })).toBeVisible();
    } else {
      await expect(opener).toBeVisible();
    }
    await captureLayout(page, testInfo, `${viewport.name}-mixed-overview`);
    await expectMixedExposure(page, holdings);
  }

  await expectTableColumnsReachable(page, 'Portfolio holdings', 'Unrealized P&L');
  await captureLayout(page, testInfo, 'narrow-mobile-mixed-values');
  await navigateWorkspace(page, 'Activity');
  await expect(page.getByRole('region', { name: 'Trade records', exact: true }).locator('tbody tr')).toHaveCount(3);
  await expectTableColumnsReachable(page, 'Trade records', 'Notional');
  await captureLayout(page, testInfo, 'narrow-mobile-mixed-activity');

  // Use real, permitted demo fills to exercise long currency values. The short
  // proceeds fund both buys; all three positions and each order stay in limits.
  const largeFills = await fillLocalDemoOrders(page, [
    { symbol: 'QQQ', side: 'SELL', quantity: 999_984 },
    { symbol: 'AAPL', side: 'BUY', quantity: 499_960 },
    { symbol: 'BTC/USD', side: 'BUY', quantity: 5_000 },
  ]);
  expect(largeFills).toEqual([
    { symbol: 'QQQ', status: 200 },
    { symbol: 'AAPL', status: 200 },
    { symbol: 'BTC/USD', status: 200 },
  ]);
  const largePortfolioResponse = page.waitForResponse((response) =>
    response.url() === `${API_ORIGIN}/portfolio` && response.request().method() === 'GET');
  await navigateWorkspace(page, 'Overview');
  const largeHoldings = await (await largePortfolioResponse).json();
  expect(largeHoldings).toEqual(expect.arrayContaining([
    expect.objectContaining({ symbol: 'AAPL', quantity: 500_000 }),
    expect.objectContaining({ symbol: 'BTC/USD', quantity: 5_000.125 }),
    expect.objectContaining({ symbol: 'QQQ', quantity: -999_999 }),
  ]));
  expect(largeHoldings.filter(({ quantity, current_price }) => Math.abs(quantity) * current_price > 100_000_000)).toHaveLength(2);
  for (const viewport of [
    { name: 'narrow-mobile', width: 320, height: 812 },
    { name: 'tablet-portrait', width: 768, height: 1024 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(page.getByRole('img', { name: 'Position exposure chart', exact: true })).toBeVisible();
    await captureLayout(page, testInfo, `${viewport.name}-large-exposure`);
    await expectMixedExposure(page, largeHoldings);
  }
});
