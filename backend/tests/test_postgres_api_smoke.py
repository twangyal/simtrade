"""Opt-in actual API regression against a newly created disposable PG schema.

The app runs in a fresh process so SQLite modules cached by other tests cannot
replace its real import-time configuration/create_all path. No env files or
vendor credentials are used. Install httpx==0.28.1 and see migrations/README.md.
"""
import os
from pathlib import Path
import subprocess
import sys
import unittest

from postgres_fixture import DisposablePostgres


@unittest.skipUnless(os.environ.get('SIMTRADE_TEST_PG_BIN'),
                     'set SIMTRADE_TEST_PG_BIN to opt into disposable PostgreSQL')
class PostgresApiSmokeTests(DisposablePostgres, unittest.TestCase):
    def test_new_schema_indexes_and_persisted_account_api_flow(self):
        env = {
            **self.connection_environment(),
            # Both SQLAlchemy/libpq and databases/asyncpg use this owned socket.
            # Put the port in the URL authority: databases ignores ?port=.
            'PGHOST': str(self.socket), 'PGPORT': '55441',
            'PGUSER': 'synthetic', 'PGDATABASE': 'postgres',
            'SQLALCHEMY_DATABASE_URI': 'postgresql://synthetic@:55441/postgres',
            'SECRET_KEY': 'synthetic-api-regression-signing-key',
            'API_KEY': 'synthetic-unused',
        }
        result = subprocess.run(
            [sys.executable, '-B', str(Path(__file__).resolve()),
             '--run-api-smoke', str(self.data)],
            env=env, capture_output=True, text=True, timeout=60,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        # Preserve existing application/dependency warnings in successful output.
        if result.stderr:
            print(result.stderr, file=sys.stderr, end='')


def run_api_smoke(data_directory):
    import asyncio
    from unittest.mock import patch

    import httpx

    check = unittest.TestCase()
    with patch('dotenv.load_dotenv', return_value=False), \
            patch('websockets.connect', side_effect=AssertionError(
                'Vendor access forbidden in the API regression')) as vendor:
        import main

        expected_server = (data_directory, None, 'synthetic', 'postgres')
        server_query = ("SELECT current_setting('data_directory'), "
                        'inet_server_addr(), current_user, current_database()')
        try:
            with main.engine.connect() as connection:
                check.assertEqual(tuple(connection.exec_driver_sql(server_query).one()),
                                  expected_server)
                indexes = connection.exec_driver_sql("""
                    SELECT c.relname, i.indisvalid, i.indisready, i.indisunique,
                        am.amname, ARRAY(SELECT a.attname
                            FROM unnest(i.indkey) WITH ORDINALITY k(attnum, ord)
                            JOIN pg_attribute a ON a.attrelid=i.indrelid
                                AND a.attnum=k.attnum ORDER BY k.ord)
                    FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
                    JOIN pg_am am ON am.oid=c.relam
                    WHERE i.indrelid IN ('portfolios'::regclass, 'trades'::regclass)
                """).all()
                definitions = {row[0]: tuple(row[1:]) for row in indexes}
                check.assertEqual(definitions.get('ix_portfolios_user_symbol'),
                                  (True, True, False, 'btree', ['user_id', 'symbol']))
                check.assertEqual(definitions.get('ix_trades_user_timestamp_id'),
                                  (True, True, False, 'btree', ['user_id', 'timestamp', 'id']))

            async def exercise_api():
                feed_ready = asyncio.Event()

                async def synthetic_feed():
                    main.instrument_list['AAPL'] = [100.0]
                    feed_ready.set()

                with patch.object(main, 'receive_data_from_api', synthetic_feed):
                    async with main.app.router.lifespan_context(main.app):
                        await asyncio.wait_for(feed_ready.wait(), timeout=5)
                        check.assertTrue(main.database.is_connected)
                        server = await main.database.fetch_one(server_query)
                        check.assertEqual(tuple(server.values()), expected_server)
                        async with httpx.AsyncClient(
                            transport=httpx.ASGITransport(app=main.app),
                            base_url='http://synthetic.test', timeout=10,
                        ) as client:
                            async def request(method, path, **kwargs):
                                response = await client.request(method, path, **kwargs)
                                check.assertEqual(response.status_code, 200, path)
                                return response.json()

                            accounts = []
                            for username in ('synthetic-owner', 'synthetic-other'):
                                credentials = {'username': username,
                                               'password': 'synthetic-password'}
                                await request('POST', '/register', json=credentials)
                                login = await request('POST', '/login', json=credentials)
                                check.assertEqual(login['token_type'], 'bearer')
                                check.assertTrue(login['access_token'])
                                # Never print tokens or include them in assertions.
                                accounts.append({'Authorization': 'Bearer ' + login['access_token']})

                            for headers in accounts:
                                check.assertEqual(await request('GET', '/portfolio', headers=headers), [])
                                check.assertEqual(await request('GET', '/trades?limit=10&page=1',
                                                                headers=headers),
                                                  {'totalPages': 0, 'trades': []})
                            await request('POST', '/BUY', headers=accounts[0],
                                          json={'symbol': 'AAPL', 'quantity': 2})
                            check.assertEqual(await request('GET', '/portfolio', headers=accounts[1]), [])
                            check.assertEqual(await request('GET', '/trades?limit=10&page=1',
                                                            headers=accounts[1]),
                                              {'totalPages': 0, 'trades': []})
                            await request('POST', '/BUY', headers=accounts[1],
                                          json={'symbol': 'AAPL', 'quantity': 3})

                            for headers, quantity in zip(accounts, (2, 3)):
                                portfolio = await request('GET', '/portfolio', headers=headers)
                                check.assertEqual(len(portfolio), 1)
                                check.assertEqual(portfolio[0]['symbol'], 'AAPL')
                                check.assertEqual(portfolio[0]['quantity'], quantity)
                                check.assertEqual(portfolio[0]['avg_price'], 100)
                                check.assertEqual(portfolio[0]['current_price'], 100)
                                history = await request('GET', '/trades?limit=10&page=1', headers=headers)
                                check.assertEqual(history['totalPages'], 1)
                                check.assertEqual(len(history['trades']), 1)
                                trade = history['trades'][0]
                                check.assertEqual((trade['symbol'], trade['quantity'], trade['price']),
                                                  ('AAPL', quantity, 100))

                            for path in ('/portfolio', '/trades?limit=10&page=1'):
                                response = await client.get(path)
                                check.assertEqual(response.status_code, 401, path)

                check.assertFalse(main.database.is_connected)

            async def run_and_disconnect_on_failure():
                try:
                    await exercise_api()
                finally:
                    # Main's lifespan lacks a finally block. Keep failure cleanup
                    # in this test; the success path still asserts its disconnect.
                    if main.database.is_connected:
                        await main.database.disconnect()

            asyncio.run(run_and_disconnect_on_failure())
            vendor.assert_not_called()
            # An independent synchronous connection proves requests committed.
            with main.engine.connect() as connection:
                rows = connection.exec_driver_sql("""
                    SELECT u.username, u.balance, p.symbol, p.quantity, p.avg_price,
                           p.current_price, t.symbol, t.quantity, t.price, t.trade_type
                    FROM users u JOIN portfolios p ON p.user_id=u.id
                    JOIN trades t ON t.user_id=u.id ORDER BY u.username
                """).all()
                check.assertEqual([tuple(row) for row in rows], [
                    ('synthetic-other', 99700, 'AAPL', 3, 100, 100, 'AAPL', 3, 100, 'LONG'),
                    ('synthetic-owner', 99800, 'AAPL', 2, 100, 100, 'AAPL', 2, 100, 'LONG'),
                ])
        finally:
            main.engine.dispose()


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--run-api-smoke':
        run_api_smoke(sys.argv[2])
    else:
        unittest.main()
