"""Portfolio regressions using a fresh SQLite database for every test."""

import os
from pathlib import Path
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from databases import Database
from sqlalchemy import create_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
# Importing models configures the app database; never use a developer database.
with patch.dict(os.environ, {"SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"}):
    import crud
    from database import Base
    from models import Portfolio, Trade, User


class PortfolioAccountingTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        url = f"sqlite:///{self.directory.name}/portfolio.sqlite3"
        engine = create_engine(url)
        Base.metadata.create_all(engine)
        engine.dispose()
        self.db = Database(url)
        await self.db.connect()
        self.addAsyncCleanup(self.db.disconnect)
        self.user_id = await self.db.execute(
            User.__table__.insert().values(username="trader", hashed_password="unused")
        )

    async def position(self, symbol="AAPL", user_id=None):
        return await self.db.fetch_one(
            Portfolio.__table__.select().where(
                Portfolio.user_id == (self.user_id if user_id is None else user_id),
                Portfolio.symbol == symbol,
            )
        )

    async def test_open_long_and_short_use_fill_price_as_initial_market_price(self):
        for symbol, quantity in (("AAPL", 2.5), ("QQQ", -2.5)):
            with self.subTest(quantity=quantity):
                await crud.add_to_portfolio(self.db, self.user_id, symbol, quantity, 100)
                position = await self.position(symbol)
                self.assertEqual(position.quantity, quantity)
                self.assertEqual(position.avg_price, 100)
                self.assertEqual(position.current_price, 100)

    async def test_adding_to_long_and_short_weights_only_same_direction_fills(self):
        for symbol, direction in (("AAPL", 1), ("QQQ", -1)):
            with self.subTest(direction=direction):
                await crud.add_to_portfolio(self.db, self.user_id, symbol, 10 * direction, 100)
                await crud.add_to_portfolio(self.db, self.user_id, symbol, 5 * direction, 130)
                position = await self.position(symbol)
                self.assertEqual(position.quantity, 15 * direction)
                self.assertEqual(position.avg_price, 110)

    async def test_partial_long_sale_and_short_cover_preserve_cost_basis(self):
        for symbol, direction in (("AAPL", 1), ("QQQ", -1)):
            with self.subTest(direction=direction):
                await crud.add_to_portfolio(self.db, self.user_id, symbol, 10 * direction, 100)
                await crud.add_to_portfolio(self.db, self.user_id, symbol, -4 * direction, 160)
                position = await self.position(symbol)
                self.assertEqual(position.quantity, 6 * direction)
                self.assertEqual(position.avg_price, 100)
                self.assertEqual(position.current_price, 160)

    async def test_full_long_sale_and_short_cover_delete_position(self):
        for symbol, direction in (("AAPL", 1), ("QQQ", -1)):
            with self.subTest(direction=direction):
                await crud.add_to_portfolio(self.db, self.user_id, symbol, 10 * direction, 100)
                await crud.add_to_portfolio(self.db, self.user_id, symbol, -10 * direction, 160)
                self.assertIsNone(await self.position(symbol))

    async def test_reversing_long_or_short_starts_remaining_position_at_fill_price(self):
        for symbol, direction in (("AAPL", 1), ("QQQ", -1)):
            with self.subTest(direction=direction):
                await crud.add_to_portfolio(self.db, self.user_id, symbol, 10 * direction, 100)
                await crud.add_to_portfolio(self.db, self.user_id, symbol, -14 * direction, 160)
                position = await self.position(symbol)
                self.assertEqual(position.quantity, -4 * direction)
                self.assertEqual(position.avg_price, 160)

    async def test_fractional_close_removes_floating_point_dust(self):
        for symbol, direction in (("AAPL", 1), ("QQQ", -1)):
            with self.subTest(direction=direction):
                await crud.add_to_portfolio(self.db, self.user_id, symbol, 0.1 * direction, 100)
                await crud.add_to_portfolio(self.db, self.user_id, symbol, 0.2 * direction, 130)
                await crud.add_to_portfolio(self.db, self.user_id, symbol, -0.3 * direction, 160)
                self.assertIsNone(await self.position(symbol))

    async def test_small_legitimate_positions_are_not_rounded_away(self):
        await crud.add_to_portfolio(self.db, self.user_id, "AAPL", 1e-13, 100)
        self.assertEqual((await self.position()).quantity, 1e-13)
        await crud.add_to_portfolio(self.db, self.user_id, "AAPL", -4e-14, 160)
        position = await self.position()
        self.assertAlmostEqual(position.quantity, 6e-14, delta=1e-28)
        self.assertEqual(position.avg_price, 100)

    async def test_many_fractional_fills_close_without_creating_a_reverse_position(self):
        for symbol, direction in (("AAPL", 1), ("QQQ", -1)):
            with self.subTest(direction=direction):
                for _ in range(100):
                    await crud.add_to_portfolio(self.db, self.user_id, symbol, 0.1 * direction, 100)
                await crud.add_to_portfolio(self.db, self.user_id, symbol, -10 * direction, 160)
                self.assertIsNone(await self.position(symbol))

    async def test_close_does_not_erase_small_remainder_of_a_large_position(self):
        for symbol, fill, remainder, basis in (
            ("AAPL", -(1e16 - 2), 2, 100),
            ("QQQ", -(1e16 + 2), -2, 160),
        ):
            with self.subTest(remainder=remainder):
                await crud.add_to_portfolio(self.db, self.user_id, symbol, 1e16, 100)
                await crud.add_to_portfolio(self.db, self.user_id, symbol, fill, 160)
                position = await self.position(symbol)
                self.assertIsNotNone(position)
                self.assertEqual(position.quantity, remainder)
                self.assertEqual(position.avg_price, basis)

    async def test_close_does_not_erase_a_representable_fractional_remainder(self):
        await crud.add_to_portfolio(self.db, self.user_id, "AAPL", 1, 100)
        await crud.add_to_portfolio(self.db, self.user_id, "AAPL", -0.9999999999999999, 160)
        position = await self.position()
        self.assertIsNotNone(position)
        self.assertAlmostEqual(position.quantity, 1e-16, delta=1e-30)
        self.assertEqual(position.avg_price, 100)

    async def test_closing_a_position_does_not_change_other_users_or_symbols(self):
        other_user = await self.db.execute(
            User.__table__.insert().values(username="other", hashed_password="unused")
        )
        await crud.add_to_portfolio(self.db, self.user_id, "AAPL", 1, 100)
        await crud.add_to_portfolio(self.db, other_user, "AAPL", 5, 90)
        await crud.add_to_portfolio(self.db, self.user_id, "QQQ", -3, 120)
        await crud.add_to_portfolio(self.db, self.user_id, "AAPL", -1, 150)
        self.assertIsNone(await self.position())
        self.assertEqual((await self.position(user_id=other_user)).quantity, 5)
        self.assertEqual((await self.position("QQQ")).quantity, -3)

    async def test_trade_and_portfolio_changes_roll_back_together(self):
        with self.assertRaisesRegex(RuntimeError, "abort transaction"):
            async with self.db.transaction():
                await crud.create_trade(self.db, self.user_id, "AAPL", 2, 100, "LONG")
                raise RuntimeError("abort transaction")
        self.assertIsNone(await self.position())
        self.assertEqual(await crud.get_trades(self.db, self.user_id), [])

    async def test_history_is_paginated_newest_first_with_stable_timestamp_ties(self):
        timestamp = datetime(2024, 1, 1)
        for trade_id, date in ((1, timestamp), (2, timestamp + timedelta(days=1)), (3, timestamp)):
            await self.db.execute(
                Trade.__table__.insert().values(
                    id=trade_id, user_id=self.user_id, symbol="AAPL", quantity=1,
                    price=100, trade_type="LONG", timestamp=date,
                )
            )
        trades = await crud.get_trades(self.db, self.user_id, limit=2, offset=1)
        self.assertEqual([trade.id for trade in trades], [3, 1])
        all_trades = await crud.get_trades(self.db, self.user_id)
        self.assertEqual([trade.id for trade in all_trades], [2, 3, 1])

    async def test_trade_count_is_scoped_to_user(self):
        await crud.create_trade(self.db, self.user_id, "AAPL", 2, 100, "LONG")
        other_user = await self.db.execute(
            User.__table__.insert().values(username="other", hashed_password="unused")
        )
        await crud.create_trade(self.db, other_user, "AAPL", 2, 100, "LONG")
        self.assertEqual(await crud.get_trade_count(self.db, self.user_id), 1)
        self.assertEqual(await crud.get_trade_count(self.db, 999), 0)

    async def test_user_can_be_selected_for_update_within_transaction(self):
        async with self.db.transaction():
            user = await crud.get_user(self.db, "trader", for_update=True)
            self.assertEqual(user.id, self.user_id)


if __name__ == "__main__":
    unittest.main()
