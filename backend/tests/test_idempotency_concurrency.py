"""Real PostgreSQL order retries, isolated in disposable per-test schemas.

Set SIMTRADE_TEST_POSTGRES_URL to a PostgreSQL *_test database whose role may
CREATE SCHEMA. Without that setting these tests skip. No existing application
tables are read or changed, and no API lifespan or market feed is started.
"""

import asyncio
import os
import unittest
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from databases import Database
from fastapi import HTTPException
from sqlalchemy.engine import make_url
from sqlalchemy.schema import CreateIndex, CreateSchema, CreateTable, DropSchema


@unittest.skipUnless(
    os.getenv("SIMTRADE_TEST_POSTGRES_URL"),
    "Set SIMTRADE_TEST_POSTGRES_URL to an isolated PostgreSQL *_test database",
)
class ConcurrentOrderRetryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        url = os.environ["SIMTRADE_TEST_POSTGRES_URL"]
        try:
            parsed = make_url(url)
        except Exception:
            raise ValueError("SIMTRADE_TEST_POSTGRES_URL must be a valid PostgreSQL test URL") from None
        if parsed.get_backend_name() not in {"postgres", "postgresql"} or not (
            parsed.database and parsed.database.endswith("_test")
        ):
            raise ValueError("Order retry tests require a PostgreSQL database name ending in _test")

        with patch.dict(os.environ, {
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "SECRET_KEY": "order-retry-tests-only-signing-key-more-than-32-bytes",
            "MARKET_DATA_MODE": "disabled",
        }), patch("dotenv.load_dotenv", return_value=False):
            import crud
            import main
            from database import Base
            from market import QuoteBook
            from models import User
            from schema import TradeCreate
            from security import TokenData
        self.crud = crud
        self.main = main
        self.User = User
        self.TradeCreate = TradeCreate
        self.TokenData = TokenData
        self.user = TokenData(username="retry-trader")

        schema = f"simtrade_retry_test_{uuid4().hex}"
        admin = Database(url, min_size=1, max_size=1)
        await admin.connect()
        self.addAsyncCleanup(admin.disconnect)
        await admin.execute(CreateSchema(schema))
        self.addAsyncCleanup(admin.execute, DropSchema(schema, cascade=True))
        self.db = Database(
            url, min_size=2, max_size=4,
            server_settings={
                "search_path": f'"{schema}"',
                "statement_timeout": "10000",
                "lock_timeout": "5000",
            },
        )
        await self.db.connect()
        self.addAsyncCleanup(self.db.disconnect)
        self.assertEqual(await self.db.fetch_val("SELECT current_schema()"), schema)
        for table in Base.metadata.sorted_tables:
            await self.db.execute(CreateTable(table))
            for index in table.indexes:
                await self.db.execute(CreateIndex(index))
        self.user_id = await self.db.execute(User.__table__.insert().values(
            username=self.user.username, hashed_password="unused", balance=1000,
            short_liability=0, networth=1000,
        ))
        self.now = 0.0
        self.quotes = QuoteBook(clock=lambda: self.now)
        self.assertTrue(self.quotes.update({"symbol": "AAPL", "price": 100}))
        self.enterContext(patch.object(main, "quote_book", self.quotes))

    async def execute(self, side, quantity, key, user=None):
        return await self.main.execute_order(
            self.TradeCreate(symbol="AAPL", quantity=quantity, client_order_id=key),
            user or self.user, self.db, side,
        )

    async def concurrent_orders(self, orders):
        barrier = asyncio.Barrier(len(orders))
        backend_ids = set()

        async def place(side, quantity, key, user=None):
            try:
                async with self.db.transaction():
                    backend_ids.add(await self.db.fetch_val("SELECT pg_backend_pid()"))
                    await barrier.wait()
                    response = await self.execute(side, quantity, key, user)
                return 200, response
            except HTTPException as exc:
                return exc.status_code, exc.detail

        results = await asyncio.wait_for(
            asyncio.gather(*(place(*order) for order in orders)), timeout=15,
        )
        self.assertEqual(len(backend_ids), len(orders))
        return results

    async def assert_account(self, *, balance, quantity, trades, user=None):
        account = await self.crud.get_user(self.db, (user or self.user).username)
        self.assertEqual(account.balance, balance)
        holdings = await self.crud.get_portfolio(self.db, account.id)
        self.assertEqual(len(holdings), 1 if quantity else 0)
        if quantity:
            self.assertEqual(holdings[0].symbol, "AAPL")
            self.assertEqual(holdings[0].quantity, quantity)
            self.assertEqual(holdings[0].avg_price, 100)
        history = await self.crud.get_trades(self.db, account.id)
        self.assertEqual(len(history), trades)
        self.assertEqual(sum(trade.quantity for trade in history), quantity)
        self.assertEqual(balance + quantity * 100, 1000)

    async def test_simultaneous_matching_keys_create_one_fill_and_replay_when_quote_expires(self):
        key = uuid4()
        results = await self.concurrent_orders([("BUY", 2, key)] * 4)
        self.assertEqual([status for status, _ in results], [200] * 4)
        self.assertTrue(all(payload == results[0][1] for _, payload in results))
        await self.assert_account(balance=800, quantity=2, trades=1)
        self.now = 61.0
        self.assertIsNone(self.quotes.get("AAPL", require_fresh=True))
        async with self.db.transaction():
            replay = await self.execute("BUY", 2, key)
        self.assertEqual(replay, results[0][1])
        await self.assert_account(balance=800, quantity=2, trades=1)

    async def test_same_key_with_different_quantity_conflicts_without_second_fill(self):
        key = uuid4()
        orders = [("BUY", 2, key), ("BUY", 3, key)]
        results = await self.concurrent_orders(orders)
        self.assertCountEqual([status for status, _ in results], [200, 409])
        winner = next(order for order, result in zip(orders, results) if result[0] == 200)
        quantity = winner[1]
        await self.assert_account(balance=1000 - quantity * 100, quantity=quantity, trades=1)

    async def test_same_key_with_different_side_conflicts_without_second_fill(self):
        key = uuid4()
        orders = [("BUY", 2, key), ("SELL", 2, key)]
        results = await self.concurrent_orders(orders)
        self.assertCountEqual([status for status, _ in results], [200, 409])
        winner = next(order for order, result in zip(orders, results) if result[0] == 200)
        quantity = 2 if winner[0] == "BUY" else -2
        await self.assert_account(balance=1000 - quantity * 100, quantity=quantity, trades=1)

    async def test_distinct_keys_create_both_affordable_orders(self):
        results = await self.concurrent_orders([("BUY", 2, uuid4()), ("BUY", 3, uuid4())])
        self.assertEqual([status for status, _ in results], [200, 200])
        await self.assert_account(balance=500, quantity=5, trades=2)

    async def test_same_key_on_different_accounts_creates_one_order_per_account(self):
        other = self.TokenData(username="other-retry-trader")
        await self.db.execute(self.User.__table__.insert().values(
            username=other.username, hashed_password="unused", balance=1000,
            short_liability=0, networth=1000,
        ))
        key = uuid4()
        results = await self.concurrent_orders([
            ("BUY", 2, key, self.user), ("BUY", 2, key, other),
        ])
        self.assertEqual([status for status, _ in results], [200, 200])
        await self.assert_account(balance=800, quantity=2, trades=1)
        await self.assert_account(balance=800, quantity=2, trades=1, user=other)

    async def test_outer_transaction_rollback_does_not_consume_order_key(self):
        key = uuid4()
        with self.assertRaisesRegex(RuntimeError, "abort transaction"):
            async with self.db.transaction():
                await self.execute("BUY", 2, key)
                raise RuntimeError("abort transaction")
        await self.assert_account(balance=1000, quantity=0, trades=0)
        results = await self.concurrent_orders([("BUY", 2, key)] * 2)
        self.assertEqual([status for status, _ in results], [200, 200])
        await self.assert_account(balance=800, quantity=2, trades=1)

    async def test_receipt_failure_rolls_back_cash_position_and_trade(self):
        key = uuid4()
        with patch.object(self.crud, "create_order_receipt", create=True,
                          new=AsyncMock(side_effect=RuntimeError("receipt unavailable"))):
            with self.assertRaisesRegex(RuntimeError, "receipt unavailable"):
                async with self.db.transaction():
                    await self.execute("BUY", 2, key)
        await self.assert_account(balance=1000, quantity=0, trades=0)
        results = await self.concurrent_orders([("BUY", 2, key)] * 2)
        self.assertEqual([status for status, _ in results], [200, 200])
        await self.assert_account(balance=800, quantity=2, trades=1)


if __name__ == "__main__":
    unittest.main()
