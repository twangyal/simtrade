"""HTTP success must follow a completed transaction, using disposable SQLite."""

import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from databases import Database
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select

with patch.dict(os.environ, {
    "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
    "SECRET_KEY": "transaction-lifecycle-tests-only-signing-key-more-than-32-bytes",
    "MARKET_DATA_ENABLED": "false",
}):
    import main
    from database import Base
    from market import QuoteBook
    from models import Portfolio, Trade, User
    from security import create_access_token


class TransactionLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.url = f"sqlite:///{Path(self.directory.name) / 'transactions.sqlite'}"
        self.engine = create_engine(self.url)
        Base.metadata.create_all(self.engine)
        self.db = Database(self.url)
        self.events = []
        self.fail_commit = False
        self.capture_snapshot = False
        self.header_snapshot = None
        # Synthetic legacy bcrypt fixture; no account credentials are read.
        with self.engine.begin() as connection:
            connection.execute(User.__table__.insert().values(
                username="trader",
                hashed_password="$2b$12$abcdefghijklmnopqrstuu/WYNrRb1FEPlWDRZSh17g1.o8TXrECK",
                balance=100000, short_liability=0, networth=100000,
            ))

        async def isolated_db():
            async with self.db:
                transaction = self.db.transaction()
                original_commit = transaction.commit

                async def observed_commit():
                    self.events.append("commit_attempt")
                    if self.fail_commit:
                        # Inject the failure at the transaction commit boundary;
                        # rollback keeps the disposable connection reusable.
                        await transaction.rollback()
                        self.events.append("commit_failed")
                        raise RuntimeError("simulated commit failure")
                    await original_commit()
                    self.events.append("commit_complete")

                transaction.commit = observed_commit
                async with transaction:
                    yield self.db

        async def observed_app(scope, receive, send):
            async def observed_send(message):
                if message["type"] == "http.response.start":
                    self.events.append(("response_start", message["status"]))
                    if self.capture_snapshot:
                        self.header_snapshot = self.snapshot()
                await send(message)

            await main.app(scope, receive, observed_send)

        main.app.dependency_overrides[main.get_db] = isolated_db
        self.client = TestClient(observed_app, raise_server_exceptions=False)
        quotes = QuoteBook()
        self.assertTrue(quotes.update({"symbol": "AAPL", "price": 100}))
        self.quote_patch = patch.object(main, "quote_book", quotes)
        self.quote_patch.start()
        self.headers = {"Authorization": f"Bearer {create_access_token({'sub': 'trader'})}"}

    def tearDown(self):
        self.client.close()
        main.app.dependency_overrides.pop(main.get_db, None)
        self.quote_patch.stop()
        self.engine.dispose()
        self.directory.cleanup()

    def snapshot(self):
        # A separate connection sees only committed writes.
        with self.engine.connect() as connection:
            balance = connection.execute(
                select(User.balance).where(User.username == "trader")
            ).scalar_one()
            trades = connection.execute(select(func.count()).select_from(Trade)).scalar_one()
            positions = connection.execute(select(func.count()).select_from(Portfolio)).scalar_one()
        return {"balance": balance, "trades": trades, "positions": positions}

    def requests(self):
        return (
            ("POST", "/register", {"username": "new-trader", "password": "new-test-password"}),
            ("POST", "/login", {"username": "trader", "password": "legacy-test-password"}),
            ("GET", "/user_data", None),
            ("GET", "/portfolio", None),
            ("GET", "/trades", None),
            ("POST", "/BUY", {"symbol": "AAPL", "quantity": 1}),
            ("POST", "/SELL", {"symbol": "AAPL", "quantity": 1}),
        )

    def test_every_database_route_commits_before_success_headers(self):
        for method, path, body in self.requests():
            with self.subTest(path=path):
                self.events.clear()
                response = self.client.request(method, path, json=body, headers=self.headers)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(self.events, [
                    "commit_attempt", "commit_complete", ("response_start", 200),
                ])

    def test_commit_failure_cannot_report_success_on_any_database_route(self):
        self.fail_commit = True
        for method, path, body in self.requests():
            with self.subTest(path=path):
                self.events.clear()
                response = self.client.request(method, path, json=body, headers=self.headers)
                self.assertEqual(response.status_code, 500, response.text)
                self.assertEqual(self.events, [
                    "commit_attempt", "commit_failed", ("response_start", 500),
                ])
                self.assertNotIn("simulated commit failure", response.text)

    def test_order_writes_are_visible_when_success_headers_are_sent(self):
        self.capture_snapshot = True
        response = self.client.post(
            "/BUY", json={"symbol": "AAPL", "quantity": 1}, headers=self.headers,
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.header_snapshot, {"balance": 99900, "trades": 1, "positions": 1})

    def test_failed_order_commit_returns_error_with_no_persisted_fill(self):
        self.fail_commit = True
        self.capture_snapshot = True
        for side in ("BUY", "SELL"):
            with self.subTest(side=side):
                response = self.client.post(
                    f"/{side}", json={"symbol": "AAPL", "quantity": 1}, headers=self.headers,
                )
                self.assertEqual(response.status_code, 500, response.text)
                self.assertEqual(self.header_snapshot, {"balance": 100000, "trades": 0, "positions": 0})
                self.assertEqual(self.snapshot(), self.header_snapshot)


if __name__ == "__main__":
    unittest.main()
