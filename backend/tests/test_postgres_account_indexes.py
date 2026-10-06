"""Opt-in migration regression; owns a temporary Unix-socket-only PG cluster.

SIMTRADE_TEST_PG_BIN=/path/to/postgresql/bin PYTHONPATH=backend \
python -B -m unittest discover -s backend/tests -v
No existing database URL, environment file or vendor credentials are used.
"""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

import psycopg2

from test_account_indexes import Base


@unittest.skipUnless(os.environ.get('SIMTRADE_TEST_PG_BIN'),
                     'set SIMTRADE_TEST_PG_BIN to opt into disposable PostgreSQL')
class PostgresAccountIndexTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bin = Path(os.environ['SIMTRADE_TEST_PG_BIN'])
        cls.temp = tempfile.TemporaryDirectory(prefix='simtrade-index-')
        cls.addClassCleanup(cls.temp.cleanup)
        cls.root = Path(cls.temp.name)
        cls.data = cls.root / 'data'
        cls.socket = cls.root / 'socket'
        cls.socket.mkdir()
        cls.run_pg('initdb', '-D', str(cls.data), '-U', 'synthetic',
                   '--auth-local=trust', '--auth-host=reject', '--no-locale')
        cls.addClassCleanup(cls.stop_pg)
        cls.run_pg('pg_ctl', '-D', str(cls.data), '-l', str(cls.root / 'server.log'),
                   '-o', f'-k {cls.socket} -h "" -p 55441', '-w', 'start')
        cls.connection = psycopg2.connect(host=str(cls.socket), port=55441,
                                         user='synthetic', dbname='postgres')
        cls.connection.autocommit = True
        cls.addClassCleanup(cls.connection.close)

    @classmethod
    def run_pg(cls, command, *args):
        subprocess.run([str(cls.bin / command), *args], check=True,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    @classmethod
    def stop_pg(cls):
        # Register before startup: pg_ctl can time out with a server still running.
        stopped = subprocess.run(
            [str(cls.bin / 'pg_ctl'), '-D', str(cls.data), '-m', 'immediate',
             '-w', 'stop'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        if stopped.returncode:
            status = subprocess.run(
                [str(cls.bin / 'pg_ctl'), '-D', str(cls.data), 'status'],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            )
            if status.returncode == 0:
                raise RuntimeError('Disposable PostgreSQL server did not stop')

    def setUp(self):
        self.cursor = self.connection.cursor()
        self.addCleanup(self.cursor.close)
        self.cursor.execute('DROP SCHEMA IF EXISTS fixture CASCADE; CREATE SCHEMA fixture')
        self.cursor.execute('SET search_path TO fixture')
        # Compile the actual application tables, but model the existing pre-index schema.
        from sqlalchemy.schema import CreateTable
        from sqlalchemy.dialects import postgresql
        for table in Base.metadata.sorted_tables:
            self.cursor.execute(str(CreateTable(table).compile(dialect=postgresql.dialect())))
        self.cursor.execute("INSERT INTO users (id, username) SELECT n, 'synthetic-' || n FROM generate_series(1, 10000) n")
        self.cursor.execute("""INSERT INTO portfolios (user_id, symbol, quantity, avg_price)
            SELECT n, symbol, 1, 100 FROM generate_series(1,10000) n
            CROSS JOIN (VALUES ('AAPL'), ('QQQ')) symbols(symbol)""")
        self.cursor.execute("""INSERT INTO trades (user_id, symbol, quantity, price, trade_type, timestamp)
            SELECT n, 'AAPL', 1, 100, 'BUY', TIMESTAMP '2026-01-01' + (fill / 2) * INTERVAL '1 second'
            FROM generate_series(1,10000) n CROSS JOIN generate_series(1,20) fill""")
        self.cursor.execute('ANALYZE portfolios; ANALYZE trades')

    def migrate(self):
        # psql executes each CONCURRENTLY statement outside a transaction and stops on errors.
        migration = Path(__file__).resolve().parents[1] / 'migrations/001_account_query_indexes.sql'
        env = {**os.environ, 'PGOPTIONS': '-c search_path=fixture'}
        subprocess.run([str(self.bin / 'psql'), '-X', '-h', str(self.socket),
                        '-p', '55441', '-U', 'synthetic', '-d', 'postgres',
                        '-v', 'ON_ERROR_STOP=1', '-f', str(migration)],
                       env=env, check=True, stdout=subprocess.PIPE,
                       stderr=subprocess.PIPE, text=True)

    def snapshot(self):
        result = []
        for table in ('users', 'portfolios', 'trades'):
            self.cursor.execute(f"SELECT count(*), md5(string_agg(row_to_json(t)::text, '' ORDER BY id)) FROM {table} t")
            result.append(self.cursor.fetchone())
        return result

    def plan(self, query):
        self.cursor.execute('EXPLAIN (FORMAT JSON) ' + query)
        return self.cursor.fetchone()[0][0]['Plan']

    def nodes(self, plan):
        yield plan
        for child in plan.get('Plans', []):
            yield from self.nodes(child)

    def test_migration_rerun_preserves_data_and_valid_nonunique_definitions(self):
        before = self.snapshot()
        self.migrate()
        self.migrate()
        self.assertEqual(self.snapshot(), before)
        self.cursor.execute("""SELECT c.relname, i.indisvalid, i.indisready, i.indisunique,
            am.amname, ARRAY(SELECT a.attname FROM unnest(i.indkey) WITH ORDINALITY k(attnum, ord)
                JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum ORDER BY k.ord)
            FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
            JOIN pg_am am ON am.oid=c.relam
            WHERE i.indrelid IN ('portfolios'::regclass, 'trades'::regclass) ORDER BY c.relname""")
        indexes = {r[0]: r[1:] for r in self.cursor.fetchall()}
        self.assertIn('ix_portfolios_user_symbol', indexes)
        self.assertIn('ix_trades_user_timestamp_id', indexes)
        self.assertEqual(indexes['ix_portfolios_user_symbol'], (True, True, False, 'btree', ['user_id', 'symbol']))
        self.assertEqual(indexes['ix_trades_user_timestamp_id'], (True, True, False, 'btree', ['user_id', 'timestamp', 'id']))
        self.cursor.execute("INSERT INTO portfolios(user_id, symbol, quantity) VALUES (5000, 'AAPL', 2)")
        self.cursor.execute("SELECT quantity FROM portfolios WHERE user_id=5000 AND symbol='AAPL' ORDER BY quantity")
        self.assertEqual(self.cursor.fetchall(), [(1.0,), (2.0,)])

    def test_migration_replaces_scans_and_history_sort_without_changing_results(self):
        queries = [
            ('SELECT * FROM portfolios WHERE user_id=5000', 'ix_portfolios_user_symbol'),
            ("SELECT * FROM portfolios WHERE user_id=5000 AND symbol='AAPL' LIMIT 2", 'ix_portfolios_user_symbol'),
            ('SELECT * FROM trades WHERE user_id=5000 ORDER BY timestamp DESC, id DESC LIMIT 10 OFFSET 5', 'ix_trades_user_timestamp_id'),
            ('SELECT count(*) FROM trades WHERE user_id=5000', 'ix_trades_user_timestamp_id'),
        ]
        before = []
        for query, _ in queries:
            self.assertTrue(any(n['Node Type'] == 'Seq Scan' for n in self.nodes(self.plan(query))))
            self.cursor.execute(query)
            before.append(self.cursor.fetchall())
        self.migrate()
        for (query, index), expected in zip(queries, before):
            nodes = list(self.nodes(self.plan(query)))
            self.assertTrue(any(n.get('Index Name') == index for n in nodes), nodes)
            self.assertFalse(any(n['Node Type'] in ('Seq Scan', 'Sort') for n in nodes), nodes)
            self.cursor.execute(query)
            actual = self.cursor.fetchall()
            if 'ORDER BY' in query:
                self.assertEqual(actual, expected)
            else:
                self.assertEqual(sorted(actual), sorted(expected))
        history = list(self.nodes(self.plan(queries[2][0])))
        self.assertTrue(any(n.get('Scan Direction') == 'Backward' for n in history), history)


if __name__ == '__main__':
    unittest.main()
