"""Order retry receipts are account-scoped and atomic with every fill write."""

import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

from databases import Database
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select

with patch.dict(os.environ, {
    "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
    "SECRET_KEY": "order-idempotency-tests-only-signing-key-more-than-32-bytes",
    "MARKET_DATA_ENABLED": "false",
}), patch("dotenv.load_dotenv"):
    import crud
    import main
    from database import Base
    from market import QuoteBook
    from models import Portfolio, Trade, User
    from security import create_access_token


class OrderIdempotencyTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.url = f"sqlite:///{Path(directory.name) / 'orders.sqlite'}"
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

        async def isolated_db():
            async with self.db:
                async with self.db.transaction():
                    yield self.db

        main.app.dependency_overrides[main.get_db] = isolated_db
        self.addCleanup(main.app.dependency_overrides.pop, main.get_db, None)
        self.client = TestClient(main.app, raise_server_exceptions=False)
        self.addCleanup(self.client.close)
        self.book = QuoteBook()
        self.book.update({"symbol": "AAPL", "price": 100})
        self.book.update({"symbol": "QQQ", "price": 200})
        quote_patch = patch.object(main, "quote_book", self.book)
        quote_patch.start()
        self.addCleanup(quote_patch.stop)

    def order(self, order_id=None, *, side="BUY", symbol="AAPL", quantity=1, username="trader"):
        body = {"symbol": symbol, "quantity": quantity}
        if order_id is not None:
            body["client_order_id"] = str(order_id)
        token = create_access_token({"sub": username})
        return self.client.post(
            f"/{side}", json=body,
            headers={"Authorization": f"Bearer {token}"},
        )

    def receipts(self):
        table = Base.metadata.tables.get("order_receipts")
        if table is None:
            return []
        with self.engine.connect() as connection:
            return [dict(row) for row in connection.execute(
                table.select().order_by(table.c.id)
            ).mappings()]

    def snapshot(self):
        with self.engine.connect() as connection:
            records = {
                model.__tablename__: [dict(row) for row in connection.execute(
                    select(model.__table__).order_by(model.id)
                ).mappings()]
                for model in (User, Portfolio, Trade)
            }
        records["order_receipts"] = self.receipts()
        return records

    def test_exact_retry_returns_original_response_without_another_fill(self):
        order_id = uuid4()
        first = self.order(order_id)
        self.assertEqual(first.status_code, 200, first.text)
        before = self.snapshot()
        self.book.update({"symbol": "AAPL", "price": 150})
        retry = self.order(order_id)
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(retry.json(), first.json())
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(len(self.receipts()), 1)
        self.assertEqual(self.receipts()[0]["response"], first.json())

    def test_exact_retry_succeeds_without_a_fresh_quote(self):
        order_id = uuid4()
        first = self.order(order_id)
        self.assertEqual(first.status_code, 200, first.text)
        before = self.snapshot()
        with patch.object(main, "quote_book", QuoteBook()):
            retry = self.order(order_id)
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(retry.json(), first.json())
        self.assertEqual(self.snapshot(), before)

    def test_exact_retry_precedes_duplicate_position_checks(self):
        order_id = uuid4()
        self.assertEqual(self.order(order_id).status_code, 200)
        with self.engine.begin() as connection:
            connection.execute(Portfolio.__table__.insert().values(
                user_id=1, symbol="AAPL", quantity=1, avg_price=100, current_price=100,
            ))
        before = self.snapshot()
        self.assertEqual(self.order(order_id).status_code, 200)
        self.assertEqual(self.snapshot(), before)

    def test_changed_order_payload_conflicts_without_mutation(self):
        order_id = uuid4()
        self.assertEqual(self.order(order_id).status_code, 200)
        before = self.snapshot()
        for changes in ({"side": "SELL"}, {"symbol": "QQQ"}, {"quantity": 2}):
            with self.subTest(changes=changes), patch.object(main, "quote_book", QuoteBook()):
                response = self.order(order_id, **changes)
                self.assertEqual(response.status_code, 409, response.text)
                self.assertEqual(self.snapshot(), before)

    def test_equivalent_uuid_and_quantity_spellings_replay_one_order(self):
        order_id = uuid4()
        first = self.order(order_id, quantity=1)
        self.assertEqual(first.status_code, 200, first.text)
        before = self.snapshot()
        retry = self.order(str(order_id).upper(), quantity="1.00000000")
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.receipts()[0]["quantity"], "1")

    def test_same_id_is_independent_for_different_accounts(self):
        order_id = uuid4()
        self.assertEqual(self.order(order_id).status_code, 200)
        self.assertEqual(self.order(order_id, username="other-trader").status_code, 200)
        records = self.snapshot()
        self.assertEqual(len(records["trades"]), 2)
        self.assertEqual([row["balance"] for row in records["users"]], [99900, 99900])
        self.assertEqual({row["user_id"] for row in self.receipts()}, {1, 2})

    def test_new_ids_and_legacy_orders_each_create_a_fill(self):
        for order_id in (uuid4(), uuid4(), None, None):
            self.assertEqual(self.order(order_id).status_code, 200)
        records = self.snapshot()
        self.assertEqual(len(records["trades"]), 4)
        self.assertEqual(records["portfolios"][0]["quantity"], 4)
        self.assertEqual(len(self.receipts()), 2)

    def test_invalid_uuid_is_rejected_before_writes(self):
        before = self.snapshot()
        self.assertEqual(self.order("not-a-uuid").status_code, 422)
        self.assertEqual(self.snapshot(), before)

    def test_failed_order_does_not_reserve_id_or_payload(self):
        order_id = uuid4()
        before = self.snapshot()
        rejected = self.order(order_id, quantity=1001)
        self.assertEqual(rejected.status_code, 400, rejected.text)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.order(order_id, quantity=1).status_code, 200)
        self.assertEqual(len(self.receipts()), 1)

    def test_quote_failure_can_retry_same_id_after_market_recovers(self):
        order_id = uuid4()
        before = self.snapshot()
        with patch.object(main, "quote_book", QuoteBook()):
            self.assertEqual(self.order(order_id).status_code, 503)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.order(order_id).status_code, 200)
        self.assertEqual(len(self.receipts()), 1)

    def test_receipt_write_failure_rolls_back_entire_fill_and_allows_retry(self):
        order_id = uuid4()
        before = self.snapshot()
        with patch.object(crud, "create_order_receipt", create=True, side_effect=RuntimeError("synthetic receipt failure")):
            response = self.order(order_id)
        self.assertEqual(response.status_code, 500, response.text)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.order(order_id).status_code, 200)
        self.assertEqual(len(self.receipts()), 1)
        self.assertEqual(len(self.snapshot()["trades"]), 1)


if __name__ == "__main__":
    unittest.main()
