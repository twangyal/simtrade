"""Optional real PostgreSQL order concurrency checks.

Set SIMTRADE_TEST_POSTGRES_URL to a PostgreSQL URL whose database name ends
in ``_test`` (for example, ``simtrade_test``). The role needs CREATE SCHEMA
permission. Each test creates and drops only its own random schema; the pool
search_path excludes public and no existing tables are read or changed.

Run from the repository root:
    PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend \
        python -m unittest discover -s backend/tests -p test_concurrency.py -v

Without the URL, these tests skip. They never start the API lifespan or feed.
"""

import asyncio
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from uuid import uuid4

from databases import Database
from fastapi import HTTPException
from sqlalchemy.engine import make_url
from sqlalchemy.schema import CreateIndex, CreateSchema, CreateTable, DropSchema


@unittest.skipUnless(
    os.getenv("SIMTRADE_TEST_POSTGRES_URL"),
    "Set SIMTRADE_TEST_POSTGRES_URL to an isolated PostgreSQL *_test database",
)
class ConcurrentOrderTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        url = os.environ["SIMTRADE_TEST_POSTGRES_URL"]
        try:
            parsed = make_url(url)
        except Exception:
            raise ValueError("SIMTRADE_TEST_POSTGRES_URL must be a valid PostgreSQL test URL") from None
        if parsed.get_backend_name() not in {"postgres", "postgresql"} or not (
            parsed.database and parsed.database.endswith("_test")
        ):
            raise ValueError("Concurrency tests require a PostgreSQL database name ending in _test")

        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        # App imports must remain safe even when running this test file by itself.
        with patch.dict(os.environ, {
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "SECRET_KEY": "concurrency-tests-only-signing-key-more-than-32-bytes",
            "MARKET_DATA_ENABLED": "false",
        }):
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
        self.user = TokenData(username="concurrency-trader")

        self.schema = f"simtrade_test_{uuid4().hex}"
        self.admin = Database(url, min_size=1, max_size=1)
        await self.admin.connect()
        self.addAsyncCleanup(self.admin.disconnect)
        await self.admin.execute(CreateSchema(self.schema))
        self.addAsyncCleanup(self.admin.execute, DropSchema(self.schema, cascade=True))

        self.db = Database(
            url, min_size=2, max_size=8,
            server_settings={
                "search_path": f'"{self.schema}"',
                "statement_timeout": "10000",
                "lock_timeout": "5000",
            },
        )
        await self.db.connect()
        self.addAsyncCleanup(self.db.disconnect)
        self.assertEqual(await self.db.fetch_val("SELECT current_schema()"), self.schema)
        for table in Base.metadata.sorted_tables:
            await self.db.execute(CreateTable(table))
            for index in table.indexes:
                await self.db.execute(CreateIndex(index))
        self.user_id = await self.db.execute(User.__table__.insert().values(
            username=self.user.username, hashed_password="unused", balance=1000,
            short_liability=0, networth=1000,
        ))
        quotes = QuoteBook()
        self.assertTrue(quotes.update({"symbol": "AAPL", "price": 100}))
        quote_patch = patch.object(main, "quote_book", quotes)
        quote_patch.start()
        self.addCleanup(quote_patch.stop)

    async def concurrent_orders(self, orders):
        """Start each order in a distinct pooled connection and transaction."""
        barrier = asyncio.Barrier(len(orders))
        backend_ids = set()

        async def place(side, quantity):
            try:
                async with self.db.transaction():
                    backend_ids.add(await self.db.fetch_val("SELECT pg_backend_pid()"))
                    await barrier.wait()
                    await self.main.execute_order(
                        self.TradeCreate(symbol="AAPL", quantity=quantity),
                        self.user, self.db, side,
                    )
                return 200
            except HTTPException as exc:
                return exc.status_code

        results = await asyncio.wait_for(
            asyncio.gather(*(place(side, quantity) for side, quantity in orders)),
            timeout=15,
        )
        self.assertEqual(len(backend_ids), len(orders))
        return results

    async def assert_account(self, *, balance, quantity, trades):
        user = await self.crud.get_user(self.db, self.user.username)
        self.assertEqual(user.balance, balance)
        holdings = await self.crud.get_portfolio(self.db, self.user_id)
        self.assertEqual(len(holdings), 1 if quantity else 0)
        if quantity:
            self.assertEqual(holdings[0].symbol, "AAPL")
            self.assertEqual(holdings[0].quantity, quantity)
            self.assertEqual(holdings[0].avg_price, 100)
        history = await self.crud.get_trades(self.db, self.user_id)
        self.assertEqual(len(history), trades)
        self.assertEqual(sum(trade.quantity for trade in history), quantity)
        self.assertEqual(balance + quantity * 100, 1000)

    async def test_simultaneous_buys_cannot_spend_the_same_cash(self):
        statuses = await self.concurrent_orders([("BUY", 6), ("BUY", 6)])
        self.assertCountEqual(statuses, [200, 400])
        await self.assert_account(balance=400, quantity=6, trades=1)

    async def test_simultaneous_sells_create_one_correct_short_position(self):
        statuses = await self.concurrent_orders([("SELL", 1)] * 8)
        self.assertEqual(statuses, [200] * 8)
        await self.assert_account(balance=1800, quantity=-8, trades=8)

    async def test_simultaneous_buys_and_sells_preserve_every_fill(self):
        orders = [("BUY", 1), ("SELL", 0.5), ("BUY", 2), ("SELL", 1)] * 2
        statuses = await self.concurrent_orders(orders)
        self.assertEqual(statuses, [200] * 8)
        await self.assert_account(balance=700, quantity=3, trades=8)


if __name__ == "__main__":
    unittest.main()
