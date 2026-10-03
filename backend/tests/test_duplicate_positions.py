"""Ambiguous legacy holdings must not amplify or erase an order's quantity."""

import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from databases import Database
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select

with patch.dict(os.environ, {
    "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
    "SECRET_KEY": "duplicate-position-tests-only-signing-key-more-than-32-bytes",
    "MARKET_DATA_ENABLED": "false",
}), patch("dotenv.load_dotenv"):
    import crud
    import main
    from database import Base
    from market import QuoteBook
    from models import Portfolio, Trade, User
    from security import create_access_token


class DuplicatePositionFixture:
    def prepare_database(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.url = f"sqlite:///{Path(directory.name) / 'duplicates.sqlite'}"
        self.engine = create_engine(self.url)
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)
        self.db = Database(self.url)
        with self.engine.begin() as connection:
            for username in ("trader", "other-trader"):
                connection.execute(User.__table__.insert().values(
                    username=username, hashed_password="unused", balance=100000,
                    short_liability=0, networth=100000,
                ))
            connection.execute(Portfolio.__table__.insert(), [
                {"user_id": 1, "symbol": "AAPL", "quantity": 10, "avg_price": 100, "current_price": 100},
                {"user_id": 1, "symbol": "AAPL", "quantity": 10, "avg_price": 120, "current_price": 110},
                {"user_id": 1, "symbol": "QQQ", "quantity": 2, "avg_price": 200, "current_price": 200},
                {"user_id": 2, "symbol": "AAPL", "quantity": 5, "avg_price": 90, "current_price": 100},
            ])

    def set_duplicate_quantities(self, first, second):
        with self.engine.begin() as connection:
            connection.execute(Portfolio.__table__.update().where(Portfolio.id == 1).values(quantity=first))
            connection.execute(Portfolio.__table__.update().where(Portfolio.id == 2).values(quantity=second))

    def snapshot(self):
        with self.engine.connect() as connection:
            return {
                model.__tablename__: [dict(row) for row in connection.execute(
                    select(model.__table__).order_by(model.id)
                ).mappings()]
                for model in (User, Portfolio, Trade)
            }


class DuplicatePositionApiTests(DuplicatePositionFixture, unittest.TestCase):
    def setUp(self):
        self.prepare_database()

        async def isolated_db():
            async with self.db:
                async with self.db.transaction():
                    yield self.db

        main.app.dependency_overrides[main.get_db] = isolated_db
        self.addCleanup(main.app.dependency_overrides.pop, main.get_db, None)
        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)
        book = QuoteBook()
        book.update({"symbol": "AAPL", "price": 100})
        book.update({"symbol": "QQQ", "price": 200})
        quotes = patch.object(main, "quote_book", book)
        quotes.start()
        self.addCleanup(quotes.stop)

    def order(self, side, quantity, *, username="trader", symbol="AAPL"):
        token = create_access_token({"sub": username})
        return self.client.post(
            f"/{side}", json={"symbol": symbol, "quantity": quantity},
            headers={"Authorization": f"Bearer {token}"},
        )

    def assert_conflict_preserves_every_record(self, side, quantity):
        before = self.snapshot()
        response = self.order(side, quantity)
        self.assertEqual(response.status_code, 409, response.text)
        self.assertIn("duplicate", response.json()["detail"].lower())
        self.assertEqual(self.snapshot(), before)

    def test_buy_rejects_duplicate_long_rows(self):
        self.assert_conflict_preserves_every_record("BUY", 1)

    def test_partial_sell_rejects_duplicate_long_rows(self):
        self.assert_conflict_preserves_every_record("SELL", 1)

    def test_exact_close_does_not_delete_duplicate_long_rows(self):
        self.assert_conflict_preserves_every_record("SELL", 10)

    def test_exact_cover_does_not_delete_duplicate_short_rows(self):
        self.set_duplicate_quantities(-10, -10)
        self.assert_conflict_preserves_every_record("BUY", 10)

    def test_reversal_rejects_duplicate_rows(self):
        self.assert_conflict_preserves_every_record("SELL", 15)

    def test_opposite_sign_duplicates_are_not_silently_netted(self):
        self.set_duplicate_quantities(10, -5)
        self.assert_conflict_preserves_every_record("BUY", 1)

    def test_other_users_and_symbols_can_still_trade(self):
        duplicate_rows = self.snapshot()["portfolios"][:2]
        self.assertEqual(self.order("BUY", 1, username="other-trader").status_code, 200)
        self.assertEqual(self.order("BUY", 1, symbol="QQQ").status_code, 200)
        positions = self.snapshot()["portfolios"]
        self.assertEqual(positions[:2], duplicate_rows)
        self.assertEqual(positions[2]["quantity"], 3)
        self.assertEqual(positions[3]["quantity"], 6)


class DuplicatePositionCrudTests(DuplicatePositionFixture, unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.prepare_database()
        await self.db.connect()
        self.addAsyncCleanup(self.db.disconnect)

    async def assert_direct_fill_rejected(self, quantity):
        before = self.snapshot()
        # No surrounding transaction: the guard itself must precede any writes.
        with self.assertRaisesRegex(ValueError, "[Dd]uplicate"):
            await crud.add_to_portfolio(self.db, 1, "AAPL", quantity, 100)
        self.assertEqual(self.snapshot(), before)

    async def test_quantity_read_rejects_ambiguous_rows(self):
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, "[Dd]uplicate"):
            await crud.get_total_quantity_by_symbol(self.db, 1, "AAPL")
        self.assertEqual(self.snapshot(), before)

    async def test_direct_increase_rejects_duplicate_rows_before_writes(self):
        await self.assert_direct_fill_rejected(1)

    async def test_direct_reduction_rejects_duplicate_rows_before_writes(self):
        await self.assert_direct_fill_rejected(-1)

    async def test_direct_exact_close_cannot_delete_both_rows(self):
        await self.assert_direct_fill_rejected(-10)

    async def test_direct_exact_cover_cannot_delete_both_short_rows(self):
        self.set_duplicate_quantities(-10, -10)
        await self.assert_direct_fill_rejected(10)

    async def test_direct_reversal_rejects_duplicate_rows(self):
        await self.assert_direct_fill_rejected(-15)

    async def test_create_trade_does_not_insert_history_for_conflict(self):
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, "[Dd]uplicate"):
            await crud.create_trade(self.db, 1, "AAPL", 1, 100, "LONG")
        self.assertEqual(self.snapshot(), before)


if __name__ == "__main__":
    unittest.main()
