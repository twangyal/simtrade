"""Trade response timestamps preserve their UTC instant without rewriting rows."""

from datetime import datetime, timedelta, timezone
import json
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
    "SECRET_KEY": "timestamp-tests-only-signing-key-more-than-32-bytes",
    "MARKET_DATA_ENABLED": "false",
}), patch("dotenv.load_dotenv", return_value=False):
    import main
    from database import Base
    from models import Trade as StoredTrade, User
    from schema import Trade
    from security import create_access_token


class TradeTimestampSchemaTests(unittest.TestCase):
    def trade(self, timestamp):
        return Trade(id=1, symbol="AAPL", quantity=1, price=100,
                     trade_type="LONG", timestamp=timestamp)

    def test_naive_database_timestamp_serializes_with_explicit_utc(self):
        timestamp = datetime(2024, 3, 10, 6, 59, 58, 123456)
        trade = self.trade(timestamp)
        self.assertEqual(json.loads(trade.model_dump_json())["timestamp"],
                         "2024-03-10T06:59:58.123456Z")
        self.assertEqual(trade.timestamp, timestamp.replace(tzinfo=timezone.utc))

    def test_offset_timestamps_normalize_to_utc_without_changing_instant(self):
        for timestamp, expected in (
            (datetime(2024, 4, 7, 6, 15, tzinfo=timezone(timedelta(hours=5, minutes=30))),
             "2024-04-07T00:45:00Z"),
            (datetime(2024, 12, 31, 23, 45, tzinfo=timezone(timedelta(hours=-7))),
             "2025-01-01T06:45:00Z"),
        ):
            with self.subTest(timestamp=timestamp):
                trade = self.trade(timestamp)
                self.assertEqual(json.loads(trade.model_dump_json())["timestamp"], expected)
                self.assertEqual(trade.timestamp.utcoffset(), timedelta(0))
                self.assertEqual(trade.timestamp.timestamp(), timestamp.timestamp())

    def test_utc_timestamp_and_microseconds_are_preserved(self):
        timestamp = datetime(2026, 1, 2, 3, 4, 5, 654321, tzinfo=timezone.utc)
        self.assertEqual(json.loads(self.trade(timestamp).model_dump_json())["timestamp"],
                         "2026-01-02T03:04:05.654321Z")

    def test_parsed_iso_timestamp_is_normalized_after_datetime_validation(self):
        trade = self.trade("2026-01-02T03:04:05+02:00")
        self.assertEqual(json.loads(trade.model_dump_json())["timestamp"],
                         "2026-01-02T01:04:05Z")


class TradeTimestampApiTests(unittest.TestCase):
    def setUp(self):
        directory = self.enterContext(tempfile.TemporaryDirectory())
        url = f"sqlite:///{Path(directory) / 'timestamps.sqlite'}"
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
        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)
        with self.engine.begin() as connection:
            connection.execute(User.__table__.insert().values(
                id=1, username="timestamp-trader", hashed_password="unused",
            ))
        self.headers = {
            "Authorization": f"Bearer {create_access_token({'sub': 'timestamp-trader'})}",
        }

    def stored_timestamp(self):
        with self.engine.connect() as connection:
            return connection.exec_driver_sql("SELECT timestamp FROM trades WHERE id = 1").scalar_one()

    def assert_history_timestamp(self, expected):
        before = self.stored_timestamp()
        response = self.client.get("/trades", headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        actual = response.json()["trades"][0]["timestamp"]
        self.assertEqual(actual, expected)
        # Explicit UTC remains the same instant in every browser's local timezone.
        self.assertEqual(datetime.fromisoformat(actual).utcoffset(), timedelta(0))
        self.assertEqual(self.stored_timestamp(), before)

    def test_existing_naive_utc_row_is_returned_as_utc_without_rewriting_it(self):
        with self.engine.begin() as connection:
            connection.execute(StoredTrade.__table__.insert().values(
                id=1, user_id=1, symbol="AAPL", quantity=1, price=100,
                trade_type="LONG", timestamp=datetime(2024, 3, 10, 6, 59, 58, 123456),
            ))
        self.assert_history_timestamp("2024-03-10T06:59:58.123456Z")

    def test_aware_driver_timestamp_is_converted_to_utc_without_rewriting_it(self):
        # SQLite can return an offset-aware datetime from ISO text, unlike its
        # DateTime insert formatter. This exercises the real driver/API boundary.
        with self.engine.begin() as connection:
            connection.exec_driver_sql(
                "INSERT INTO trades (id, user_id, symbol, quantity, price, trade_type, timestamp) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (1, 1, "AAPL", 1, 100, "LONG", "2024-12-31T23:45:00-07:00"),
            )
        self.assert_history_timestamp("2025-01-01T06:45:00Z")


if __name__ == "__main__":
    unittest.main()
