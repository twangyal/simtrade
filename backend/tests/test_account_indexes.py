"""Query-plan regressions using only a disposable SQLite database.

Install backend/dependencies.txt and aiosqlite==0.20.0, then run:
PYTHONPATH=backend python -m unittest discover -s backend/tests -v
"""
from datetime import datetime, timedelta
import os
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine

with patch.dict(os.environ, {'SQLALCHEMY_DATABASE_URI': 'sqlite://'}), \
        patch('dotenv.load_dotenv', return_value=False):
    from database import Base
    from models import Portfolio, Trade, User


class AccountIndexTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        Base.metadata.create_all(self.engine)
        with self.engine.begin() as connection:
            connection.exec_driver_sql('PRAGMA foreign_keys = ON')
            connection.execute(User.__table__.insert(), [
                {'id': account, 'username': f'synthetic-{account}'}
                for account in range(1, 501)
            ])
            connection.execute(Portfolio.__table__.insert(), [
                {'user_id': account, 'symbol': symbol, 'quantity': 1,
                 'avg_price': 100, 'current_price': 100}
                for account in range(1, 501) for symbol in ('AAPL', 'QQQ')
            ])
            connection.execute(Trade.__table__.insert(), [
                {'user_id': account, 'symbol': 'AAPL', 'quantity': 1,
                 'price': 100, 'trade_type': 'BUY',
                 'timestamp': datetime(2026, 1, 1) + timedelta(seconds=fill // 2)}
                for account in range(1, 501) for fill in range(20)
            ])
            connection.exec_driver_sql('ANALYZE')
        self.addCleanup(self.engine.dispose)

    def assert_indexed(self, connection, sql, parameters):
        plan = connection.exec_driver_sql(
            'EXPLAIN QUERY PLAN ' + sql, parameters,
        ).fetchall()
        details = ' '.join(row[3] for row in plan).upper()
        self.assertIn('SEARCH', details, details)
        self.assertNotIn('SCAN ', details, details)
        self.assertNotIn('TEMP B-TREE', details, details)

    def test_account_holdings_do_not_scan_other_accounts(self):
        sql = 'SELECT * FROM portfolios WHERE user_id = ?'
        with self.engine.connect() as connection:
            rows = connection.exec_driver_sql(sql, (250,)).mappings().all()
            self.assertEqual({row['symbol'] for row in rows}, {'AAPL', 'QQQ'})
            self.assertEqual({row['user_id'] for row in rows}, {250})
            self.assert_indexed(connection, sql, (250,))

    def test_symbol_lookup_preserves_duplicate_detection(self):
        # The index must not silently add a uniqueness constraint to legacy data.
        with self.engine.begin() as connection:
            connection.execute(Portfolio.__table__.insert().values(
                user_id=250, symbol='AAPL', quantity=2, avg_price=90,
            ))
            sql = 'SELECT * FROM portfolios WHERE user_id = ? AND symbol = ? LIMIT 2'
            rows = connection.exec_driver_sql(sql, (250, 'AAPL')).mappings().all()
            self.assertEqual(sorted(row['quantity'] for row in rows), [1, 2])
            self.assert_indexed(connection, sql, (250, 'AAPL'))

    def test_account_history_does_not_scan_other_accounts(self):
        sql = 'SELECT * FROM trades WHERE user_id = ?'
        with self.engine.connect() as connection:
            rows = connection.exec_driver_sql(sql, (250,)).mappings().all()
            self.assertEqual(len(rows), 20)
            self.assertEqual({row['user_id'] for row in rows}, {250})
            self.assert_indexed(connection, sql, (250,))

    def test_ordered_history_uses_index_without_sorting(self):
        sql = ('SELECT * FROM trades WHERE user_id = ? '
               'ORDER BY timestamp DESC, id DESC LIMIT 10 OFFSET 5')
        with self.engine.connect() as connection:
            rows = connection.exec_driver_sql(sql, (250,)).mappings().all()
            self.assertEqual([row['id'] for row in rows], list(range(4995, 4985, -1)))
            self.assert_indexed(connection, sql, (250,))

    def test_account_trade_count_does_not_scan_other_accounts(self):
        sql = 'SELECT count(*) FROM trades WHERE user_id = ?'
        with self.engine.connect() as connection:
            self.assertEqual(connection.exec_driver_sql(sql, (250,)).scalar_one(), 20)
            self.assert_indexed(connection, sql, (250,))


if __name__ == '__main__':
    unittest.main()
