-- PostgreSQL only. Run with psql -X -v ON_ERROR_STOP=1 -f <this file>.
-- CONCURRENTLY must run outside a transaction; do not use psql --single-transaction.
-- Uses the connection's search_path, just like the unqualified application tables.
-- Non-unique on purpose: preserve legacy duplicate holdings for explicit repair.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_portfolios_user_symbol
    ON portfolios (user_id, symbol);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_trades_user_timestamp_id
    ON trades (user_id, timestamp, id);
