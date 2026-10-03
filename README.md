# SimTrade

SimTrade is a paper-trading app with a React/Vite frontend and a FastAPI backend. Each account starts with $100,000 of simulated cash. It supports long and short positions, portfolio valuation, and paginated trade history. Orders never reach a broker.

## Local setup

Use Python 3.12, Node.js 22.12+ (or 24+), npm, and a PostgreSQL database. Installing the pinned `psycopg2` package may also require a C compiler and PostgreSQL development headers (`libpq-dev` on Debian/Ubuntu).

Run these commands from the repository root:

```sh
python3.12 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/dependencies.txt -r backend/test-dependencies.txt
cp backend/api.env.example backend/api.env
```

Use the new `backend/.venv`. Historical `backend/bin`, `backend/lib`, and `backend/pyvenv.cfg` files may remain in older working copies; they are machine-specific, ignored by Git, and are not a portable Python installation.

Create a PostgreSQL database and edit `backend/api.env`:

```dotenv
SQLALCHEMY_DATABASE_URI=postgresql://your_user:your_password@localhost:5432/simtrade
SECRET_KEY=
MARKET_DATA_MODE=disabled
```

Replace the signing-key placeholder with a newly generated secret, for example the output of:

```sh
backend/.venv/bin/python -c 'import secrets; print(secrets.token_urlsafe(32))'
```

`SECRET_KEY` is required and must contain at least 32 bytes after surrounding whitespace is removed. Generate a random value; a length check cannot establish randomness. There is no default signing key. Rotating the key invalidates existing login tokens. Keep `backend/api.env` private; it is ignored by Git.

Both configuration loaders resolve `backend/api.env` relative to their source files, and values already set in the process environment take precedence. Database tables are created when the API starts; existing schemas are not migrated automatically.

Start the API:

```sh
backend/.venv/bin/python -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```

The API is available at [http://localhost:8000](http://localhost:8000), with interactive documentation at [http://localhost:8000/docs](http://localhost:8000/docs).

In another terminal, start the frontend:

```sh
cd frontend
npm ci
npm run dev -- --host 127.0.0.1
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173), register, and log in.

## Configuration

Backend values belong in `backend/api.env` or the process environment:

| Variable | Purpose | Default |
| --- | --- | --- |
| `SQLALCHEMY_DATABASE_URI` | PostgreSQL connection URL, using the `postgresql://` scheme | Required |
| `SECRET_KEY` | Random HS256 signing key, at least 32 bytes | Required |
| `MARKET_DATA_MODE` | `disabled`, `demo` (invented offline quotes), or `live` (Twelve Data) | `disabled` |
| `MARKET_DATA_ENABLED` | Legacy flag: `true` selects live data only when `MARKET_DATA_MODE` is unset | `false` |
| `API_KEY` | Twelve Data key; required only in live mode | Unset |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API | `http://localhost:5173,http://127.0.0.1:5173` |

The frontend accepts these optional values in `frontend/.env.local`. Restart the Vite dev server after changing them; production builds embed the values at build time.

| Variable | Purpose | Default |
| --- | --- | --- |
| `VITE_API_URL` | Backend HTTP base URL | `http://localhost:8000` |
| `VITE_WS_URL` | Complete browser WebSocket URL | API URL with `ws`/`wss` and `/ws` appended |

Only public endpoint URLs belong in frontend configuration. Vendor credentials and the signing key stay in the backend.

## Offline demo

To practice without a vendor key or network service, create a separate database for demo accounts and set these values in `backend/api.env`:

```dotenv
SQLALCHEMY_DATABASE_URI=postgresql://your_user:your_password@localhost:5432/simtrade_demo
MARKET_DATA_MODE=demo
```

Keep the same required signing-key setup, restart the API, then register a new account. The demo feed immediately seeds all supported instruments and refreshes them once per second using repeatable, invented prices. They are not observations, forecasts, or historical market data. Demo mode never creates a vendor connection or uses an API key. Do not share a database between demo and live-market accounts: switching a feed changes the prices used to value existing positions.

`GET /market_status` reports the active mode, supported symbols, symbols with a fresh quote, and quote lifetime. Demo WebSocket messages include `source: "demo"`, including initial snapshots. Mode changes require an API restart.

## Quotes and accounting

Market networking is disabled by default. Registration, login, and account/history views work without a vendor key, while orders return `503` until a fresh quote is available. To receive live quotes, set `MARKET_DATA_MODE=live` and provide `API_KEY`. The feed reconnects with bounded backoff and resubscribes after a disconnect.

The market transport uses proxy-aware websockets 17.2. For the secure vendor connection, it honors `HTTPS_PROXY` or `WSS_PROXY` and respects `NO_PROXY`; `HTTP_PROXY` alone applies to plain `ws://` connections. Lowercase proxy variables take precedence. Proxy URLs may use an HTTP CONNECT endpoint. TLS certificate and hostname verification remain enabled for the vendor and for HTTPS proxy connections, using the Python runtime's configured trust roots. Transport debug logging remains disabled to keep credential-bearing URLs out of logs.

Supported symbols are `AAPL`, `INFY`, `QQQ`, `IXIC`, `TRP`, `EUR/USD`, `USD/JPY`, and `BTC/USD`. Orders require a valid quote no more than 60 seconds old. Vendor timestamps are checked for age and ordering; delayed ticks retain only their remaining lifetime. Buys use the ask and sells use the bid when a complete spread is available; otherwise they use the last price.

Selling more than the current holding opens or increases a simulated short position. Buying a short position covers it, and crossing through zero opens a position in the other direction. There is no margin, collateral, liquidation, or stock-borrow model. Short-sale proceeds increase cash, but the negative position remains a liability when calculating net worth.

Cash settles to cents: buy debits round up and sell credits round down. This conservative rounding can reduce a fractional fill's value by less than one cent, and prevents manufacturing cash by splitting fills. An order's unrounded value must be at least $0.01 and at most $1 billion. Reducing an existing position is exempt from the minimum so small residual holdings can always be closed. Quantities support eight decimal places, with a maximum of one million units per order or net position. Quotes above $1 million per unit and cash balances above $10 billion are outside the simulation limits. These bounds retain cent-level cash precision with the existing Float database columns.

Account net worth is cash plus the signed market value of all positions. When fresh quotes are unavailable, portfolio/account snapshots retain the last known quote or persisted mark. Holdings with no known mark keep a null `current_price`; account totals estimate their value at average entry price and return `valuation_estimated: true`, which the dashboard labels explicitly. A displayed valuation does not guarantee that an order can execute at that price.

The dashboard calculates unrealized profit/loss as signed quantity times the difference between the mark and average entry price, for each open position and the portfolio total. Missing marks display `N/A`. These figures exclude realized gains/losses and the small cash effects of cent settlement; they are not a historical performance chart.

## Checks

From the repository root, with the dependencies installed:

```sh
PYTHONPATH=backend PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python -m unittest discover -s backend/tests -v
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
```

The default backend test run uses disposable SQLite databases and synthetic signing keys. Quote-feed tests inject fake connections, while transport regressions exercise real WebSocket subscriptions and quotes through a local HTTP CONNECT proxy. Frontend tests mock API/WebSocket traffic. These tests do not contact the market-data vendor and do not require a running PostgreSQL server or a vendor API key.

Three concurrency tests require an isolated PostgreSQL database and otherwise skip. To run them locally, set `SIMTRADE_TEST_POSTGRES_URL` to a dedicated PostgreSQL database whose name ends in `_test`, then rerun the backend command above. The database role needs permission to create schemas; each test creates and drops its own randomly named schema. Use test credentials and a disposable database.

GitHub Actions runs the backend tests and frontend test/lint/build checks on pushes and pull requests using Python 3.12 and Node.js 22. It supplies a disposable PostgreSQL 16 service so the concurrency tests also run in CI.

Password hashing uses bcrypt directly and continues to verify existing Passlib-generated `$2a$`, `$2b$`, and `$2y$` hashes. Passwords over 72 UTF-8 bytes are rejected rather than truncated. The backend uses PyJWT for token handling; unused Passlib and python-jose dependencies have been removed.
