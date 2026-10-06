# Account query indexes

`001_account_query_indexes.sql` adds non-unique B-tree indexes for account holdings,
symbol lookup, and trade history. The trade index also supports reading an account's
history in descending timestamp/ID order via a backward scan. Account-scoped counts
can use its leading `user_id` column. Query planners may still choose sequential
scans for small tables or unselective requests.

New tables get these indexes from `Base.metadata.create_all`. **Existing tables do
not:** SQLAlchemy skips existing tables, including any newly declared indexes.
Apply the migration explicitly to existing PostgreSQL databases. It works with the
schema on `main` and does not require PR #9 or change account/trade data.

## Apply to an existing database

Use the normal database role with table-owner privileges. Select the intended
database and schema using your usual libpq configuration (`PGSERVICE`, for example).
Do not put passwords in shell history. Take the normal backup and inspect the target
before applying schema changes. First rehearse on a disposable copy.

```sh
psql -X -v ON_ERROR_STOP=1 -c 'SELECT current_database(), current_schema();'
psql -X -v ON_ERROR_STOP=1 -f backend/migrations/001_account_query_indexes.sql
```

Do not use `--single-transaction`, `BEGIN`, or a transaction-wrapping migration
runner: PostgreSQL forbids `CREATE INDEX CONCURRENTLY` in a transaction. Concurrent
builds allow normal writes but take CPU, I/O and brief locks, and may wait for old
transactions. Schedule them for an appropriate maintenance period. The connection's
`search_path` must resolve the same tables as the application.

Verify both definitions and validity (not just the index names):

```sql
SELECT i.relname AS index_name, x.indisvalid, x.indisready,
       pg_get_indexdef(i.oid) AS definition
FROM pg_index x
JOIN pg_class i ON i.oid = x.indexrelid
WHERE x.indrelid IN ('portfolios'::regclass, 'trades'::regclass)
  AND i.relname IN ('ix_portfolios_user_symbol', 'ix_trades_user_timestamp_id');
```

Both indexes must be valid and ready, with the columns shown in the migration.
`IF NOT EXISTS` makes a successful rerun harmless, but **does not repair an invalid
index or validate a same-named index's definition**. If a build is interrupted,
inspect its state and remove only the affected invalid index with `DROP INDEX
CONCURRENTLY <schema>.<index_name>` before rerunning. Investigate definition
conflicts rather than silently replacing existing indexes.

For rollback, drop the two indexes concurrently, outside a transaction, using the
same schema. This leaves account and trading data intact and restores the previous
query performance. No migration runs automatically during application startup.

## Regression checks

Use Python 3.12 and a fresh virtual environment with PostgreSQL development headers
and a C compiler available for the pinned `psycopg2` dependency:

```sh
python3.12 -m venv /tmp/simtrade-index-tests
/tmp/simtrade-index-tests/bin/pip install -r backend/dependencies.txt aiosqlite==0.20.0
PYTHONPATH=backend /tmp/simtrade-index-tests/bin/python -m unittest discover -s backend/tests -v
```

The tests create disposable SQLite databases with synthetic accounts and trades.
They verify selective query plans, account isolation, ordered pagination including
same-timestamp ties, and continued detection of duplicate legacy holdings. They do
not load local environment files, contact a vendor, or require credentials.

For PostgreSQL plan verification, seed a disposable database with many accounts,
run `ANALYZE portfolios; ANALYZE trades;`, and compare these queries before and after
migration using `EXPLAIN (ANALYZE, BUFFERS)`:

```sql
SELECT * FROM portfolios WHERE user_id = 5000;
SELECT * FROM portfolios WHERE user_id = 5000 AND symbol = 'AAPL' LIMIT 2;
SELECT * FROM trades WHERE user_id = 5000 ORDER BY timestamp DESC, id DESC LIMIT 10;
SELECT count(*) FROM trades WHERE user_id = 5000;
```

Compare results as well as plans. Measure buffers and rows read; avoid asserting
wall-clock timing thresholds. These indexes do not change `main`'s API pagination
or accounting behavior; those existing fixes are tracked separately in PR #9.

### Reproducible PostgreSQL migration regression

Install PostgreSQL server/client binaries (including `initdb`, `pg_ctl`, and `psql`)
and use the test virtual environment above. Run as a non-root user:

```sh
SIMTRADE_TEST_PG_BIN=/path/to/postgresql/bin PYTHONPATH=backend \
  /tmp/simtrade-index-tests/bin/python -B -m unittest discover -s backend/tests -v
```

All seven tests must pass with no skips. Without `SIMTRADE_TEST_PG_BIN`, the two
PostgreSQL tests are explicitly skipped; the five SQLite tests still run. A cloud
sandbox may require supported command-scoped network permission even for a private
Unix socket. Keep proxy, TLS, and sandbox protections enabled.

The PostgreSQL tests initialize their own temporary cluster, disable TCP listeners,
reject host authentication, and use a private Unix socket inside a temporary
directory. They never use an existing database URL or load an environment file.
The cluster is stopped and removed through unittest cleanup, including on test
failures. Local trust authentication applies only to this disposable cluster.

The fixture uses the application's actual table definitions without the new
indexes, with 10,000 synthetic accounts, 20,000 holdings, and 200,000 trades.
Tests apply the real migration with `psql -X -v ON_ERROR_STOP=1`, rerun it, and
assert unchanged ordered row-content digests, valid/ready non-unique B-tree index
columns, and continued acceptance of duplicate legacy holdings. Plans must replace
sequential scans with the intended indexes, including a backward history scan
without a sort; query results must remain unchanged. No planner settings or timing
thresholds are forced. This rehearses the migration, not production deployment or
concurrent-write performance.

The rerun regression also injects conflicting libpq `PGHOSTADDR` and `PGSERVICE`
settings independently, plus wrong host/port/user/database/search-path/passfile
settings. Both psycopg2 and the real `psql` migration must still use the owned
cluster. It verifies the server's data directory, Unix-socket transport, role,
database, and unchanged caller environment. The harness removes ambient `PG*`
variables only during psycopg2 connection creation and in the `psql` child
environment, and uses an empty passfile. Proxy/CA variables are preserved. No saved
environment or security configuration is modified. The temporary process-environment
patch assumes this single-threaded unittest harness; do not reuse it in concurrent
application connection code.
