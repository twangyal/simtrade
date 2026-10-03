"""Valuation retains valid tiny marks until final cent rounding; no live feed."""

from decimal import getcontext, localcontext, ROUND_UP
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from databases import Database
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

with patch.dict(os.environ, {
    "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
    "SECRET_KEY": "valuation-tests-only-signing-key-more-than-32-bytes",
    "MARKET_DATA_MODE": "disabled",
    "MARKET_DATA_ENABLED": "false",
}), patch("dotenv.load_dotenv", return_value=False):
    import main
    from database import Base
    from market import QuoteBook
    from models import User
    from security import create_access_token


class ValuationPrecisionTests(unittest.TestCase):
    def setUp(self):
        directory = self.enterContext(tempfile.TemporaryDirectory())
        url = f"sqlite:///{Path(directory) / 'valuation.sqlite'}"
        self.engine = create_engine(url)
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)
        self.db = Database(url)

        async def isolated_db():
            async with self.db:
                async with self.db.transaction():
                    yield self.db

        main.app.dependency_overrides[main.get_db] = isolated_db
        self.addCleanup(main.app.dependency_overrides.pop, main.get_db, None)
        self.enterContext(patch.object(main, "quote_book", QuoteBook()))
        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)
        with self.engine.begin() as connection:
            connection.execute(User.__table__.insert().values(
                username="valuation-trader", hashed_password="unused",
                balance=100000, short_liability=0, networth=100000,
            ))
        self.headers = {"Authorization": f"Bearer {create_access_token({'sub': 'valuation-trader'})}"}

    def quote(self, symbol, price):
        self.assertTrue(main.quote_book.update({"symbol": symbol, "price": price}))

    def order(self, side, symbol, quantity=1):
        response = self.client.post(f"/{side}", headers=self.headers,
                                    json={"symbol": symbol, "quantity": quantity})
        self.assertEqual(response.status_code, 200, response.text)

    def account(self):
        response = self.client.get("/user_data", headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertFalse(response.json()["valuation_estimated"])
        return response.json()

    def assert_tiny_quote_valuation(self, side, tiny):
        # Every opening order satisfies the minimum notional; an existing mark
        # can subsequently fall to any supported positive floating-point price.
        for symbol in ("AAPL", "QQQ"):
            self.quote(symbol, 1)
            self.order(side, symbol)
        self.quote("AAPL", 1.005)
        self.quote("QQQ", tiny)
        account = self.account()
        if side == "BUY":
            self.assertEqual(account["balance"], 99998)
            self.assertEqual(account["networth"], 99999.01)
            self.assertEqual(account["short_liability"], 0)
        else:
            self.assertEqual(account["balance"], 100002)
            self.assertEqual(account["networth"], 100000.99)
            self.assertEqual(account["short_liability"], -1.01)

    def test_long_marks_keep_a_tiny_positive_term_above_a_half_cent(self):
        self.assert_tiny_quote_valuation("BUY", 1e-308)

    def test_long_marks_keep_the_smallest_positive_float_above_a_half_cent(self):
        self.assert_tiny_quote_valuation("BUY", 5e-324)

    def test_short_marks_keep_a_tiny_negative_term_below_a_half_cent(self):
        self.assert_tiny_quote_valuation("SELL", 1e-308)

    def test_short_marks_keep_the_smallest_positive_float_below_a_half_cent(self):
        self.assert_tiny_quote_valuation("SELL", 5e-324)

    def test_normal_long_half_cent_ties_round_to_even(self):
        self.quote("AAPL", 1)
        self.order("BUY", "AAPL")
        for mark, networth in ((1.005, 100000), (1.015, 100000.02), (1.025, 100000.02)):
            with self.subTest(mark=mark):
                self.quote("AAPL", mark)
                self.assertEqual(self.account()["networth"], networth)

    def test_normal_short_half_cent_ties_round_to_even(self):
        self.quote("AAPL", 1)
        self.order("SELL", "AAPL")
        for mark, networth, liability in ((1.005, 100000, -1), (1.015, 99999.98, -1.02), (1.025, 99999.98, -1.02)):
            with self.subTest(mark=mark):
                self.quote("AAPL", mark)
                account = self.account()
                self.assertEqual((account["networth"], account["short_liability"]), (networth, liability))

    def test_large_cancellation_keeps_tiny_terms_independent_of_position_order(self):
        # Sell proceeds fund the matching long. Later quotes produce opposing
        # trillion-dollar marks without exceeding any order or cash limit.
        for side, symbol, quantity in (("SELL", "QQQ", 1000000), ("BUY", "AAPL", 1000000),
                                       ("BUY", "INFY", 1), ("BUY", "TRP", 1)):
            self.quote(symbol, 1)
            self.order(side, symbol, quantity)
        for symbol, mark in (("QQQ", 1000000), ("AAPL", 1000000), ("INFY", 1.005), ("TRP", 5e-324)):
            self.quote(symbol, mark)
        original_get_portfolio = main.crud.get_portfolio
        for ordering in ((0, 1, 2, 3), (3, 2, 1, 0), (0, 3, 2, 1)):
            async def ordered_portfolio(*args, **kwargs):
                records = sorted(await original_get_portfolio(*args, **kwargs), key=lambda item: item.id)
                return [records[index] for index in ordering]

            with self.subTest(ordering=ordering), patch.object(main.crud, "get_portfolio", ordered_portfolio):
                account = self.account()
                self.assertEqual(account["balance"], 99998)
                self.assertEqual(account["networth"], 99999.01)
                self.assertEqual(account["short_liability"], -1000000000000)

    def test_valuation_does_not_change_or_inherit_the_callers_rounding_policy(self):
        self.quote("AAPL", 1)
        self.order("BUY", "AAPL")
        self.quote("AAPL", 1.005)
        with localcontext() as caller:
            caller.prec = 19
            caller.rounding = ROUND_UP
            self.assertEqual(self.account()["networth"], 100000)
            self.assertIs(getcontext(), caller)
            self.assertEqual(caller.prec, 19)
            self.assertEqual(caller.rounding, ROUND_UP)


if __name__ == "__main__":
    unittest.main()
