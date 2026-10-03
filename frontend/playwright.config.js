import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const apiOrigin = 'http://127.0.0.1:18765';
const frontendOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.SIMTRADE_TEST_POSTGRES_URL;
let database;
try {
  database = new URL(databaseUrl);
} catch {
  throw new Error('Browser tests require SIMTRADE_TEST_POSTGRES_URL for a dedicated local PostgreSQL *_test database.');
}
if (database.protocol !== 'postgresql:'
  || !['localhost', '127.0.0.1', '[::1]'].includes(database.hostname)
  || !/^\/[A-Za-z0-9_]+_test$/.test(database.pathname)
  || database.search
  || database.hash) {
  throw new Error('Browser tests require a loopback postgresql:// URL with a database name ending in _test and no query or fragment.');
}

// Quote the executable as one shell argument; database credentials are passed only through env.
const python = (process.env.SIMTRADE_TEST_PYTHON || 'python3').replaceAll("'", "'\\''");
const frontendDirectory = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  outputDir: './test-results',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: frontendOrigin,
    browserName: 'chromium',
    channel: 'chrome',
    launchOptions: { chromiumSandbox: true },
    serviceWorkers: 'block',
    // Traces can contain bearer tokens and request bodies; publish screenshots only.
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'sandboxed-chrome' }],
  webServer: [
    {
      command: `'${python}' -m uvicorn main:app --app-dir ../backend --host 127.0.0.1 --port 18765`,
      cwd: frontendDirectory,
      url: `${apiOrigin}/market_status`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        SQLALCHEMY_DATABASE_URI: databaseUrl,
        SECRET_KEY: 'browser-tests-only-synthetic-signing-key-never-for-production',
        MARKET_DATA_MODE: 'demo',
        MARKET_DATA_ENABLED: 'false',
        API_KEY: '',
        CORS_ORIGINS: frontendOrigin,
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONUNBUFFERED: '1',
      },
    },
    {
      command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
      cwd: frontendDirectory,
      url: frontendOrigin,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_API_URL: apiOrigin,
        VITE_WS_URL: 'ws://127.0.0.1:18765/ws',
      },
    },
  ],
});
