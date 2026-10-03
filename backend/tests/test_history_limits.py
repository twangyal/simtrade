"""History pagination accepts SQLite/PostgreSQL offsets through signed int64."""

from datetime import datetime, timedelta
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
    "SECRET_KEY": "history-limit-tests-only-signing-key-more-than-32-bytes",
    "MARKET_DATA_ENABLED": "false",
}), patch("dotenv.load_dotenv", return_value=False):
    import main
    from database import Base
    from models import Trade, User
    from security import create_access_token


MAX_OFFSET = 2**63 - 1


class HistoryPaginationLimitsTests(unittest.TestCase):
    def setUp(self):
        directory = self.enterContext(tempfile.TemporaryDirectory())
        url = f"sqlite:///{Path(directory) / 'history.sqlite'}"
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
        self.client = TestClient(main.app, raise_server_exceptions=False)
        self.addCleanup(self.client.close)
        with self.engine.begin() as connection:
            connection.execute(User.__table__.insert().values(
                id=1, username="history-trader", hashed_password="unused",
            ))
            for trade_id in range(1, 4):
                connection.execute(Trade.__table__.insert().values(
                    id=trade_id, user_id=1, symbol="AAPL", quantity=1,
                    price=100, trade_type="LONG",
                    timestamp=datetime(2024, 1, 1) + timedelta(days=trade_id),
                ))
        self.headers = {
            "Authorization": f"Bearer {create_access_token({'sub': 'history-trader'})}",
        }

    def history(self, *, limit, page):
        return self.client.get(f"/trades?limit={limit}&page={page}", headers=self.headers)

    def assert_offset_rejected_before_queries(self, *, limit, page):
        with patch.object(self.db, "fetch_one", wraps=self.db.fetch_one) as fetch_one, \
                patch.object(self.db, "fetch_val", wraps=self.db.fetch_val) as fetch_val, \
                patch.object(self.db, "fetch_all", wraps=self.db.fetch_all) as fetch_all:
            response = self.history(limit=limit, page=page)
        self.assertEqual(response.status_code, 422, response.text)
        self.assertIn("offset", response.json()["detail"].lower())
        fetch_one.assert_not_called()
        fetch_val.assert_not_called()
        fetch_all.assert_not_called()

    def test_limit_100_accepts_largest_representable_page(self):
        page = MAX_OFFSET // 100 + 1
        response = self.history(limit=100, page=page)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"totalPages": 1, "trades": []})

    def test_limit_100_rejects_next_page_before_database_queries(self):
        self.assert_offset_rejected_before_queries(limit=100, page=MAX_OFFSET // 100 + 2)

    def test_limit_1_accepts_maximum_signed_64_bit_offset(self):
        response = self.history(limit=1, page=MAX_OFFSET + 1)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"totalPages": 3, "trades": []})

    def test_limit_1_rejects_offset_above_signed_64_bit_maximum(self):
        self.assert_offset_rejected_before_queries(limit=1, page=MAX_OFFSET + 2)

    def test_hundred_digit_page_is_a_client_error(self):
        self.assert_offset_rejected_before_queries(limit=100, page=int("9" * 100))

    def test_normal_pagination_keeps_newest_first_order_and_total_pages(self):
        first = self.history(limit=2, page=1)
        second = self.history(limit=2, page=2)
        for response in (first, second):
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["totalPages"], 2)
        self.assertEqual([trade["id"] for trade in first.json()["trades"]], [3, 2])
        self.assertEqual([trade["id"] for trade in second.json()["trades"]], [1])


if __name__ == "__main__":
    unittest.main()
