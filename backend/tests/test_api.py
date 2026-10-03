"""API regressions against an isolated, disposable database; no live feed."""
import asyncio
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

os.environ['SQLALCHEMY_DATABASE_URI'] = 'sqlite://'
os.environ['SECRET_KEY'] = 'test-only-signing-key-with-more-than-32-bytes'
os.environ['MARKET_DATA_ENABLED'] = 'false'

from databases import Database
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

import main
from database import Base
from models import User, Portfolio, Trade
from security import create_access_token


class AccountApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.url = f'sqlite:///{Path(self.temp.name) / "test.sqlite"}'
        self.engine = create_engine(self.url)
        Base.metadata.create_all(self.engine)
        self.db = Database(self.url)

        async def isolated_db():
            async with self.db:
                async with self.db.transaction():
                    yield self.db

        main.app.dependency_overrides[main.get_db] = isolated_db
        self.client = TestClient(main.app)
        if hasattr(main, 'quote_book'):
            from market import QuoteBook
            self.quotes = patch.object(main, 'quote_book', QuoteBook())
            self.quotes.start()
        else:
            for symbol in main.instrument_list:
                main.instrument_list[symbol] = [0]
        with self.engine.begin() as connection:
            connection.execute(User.__table__.insert().values(
                username='trader', hashed_password='unused', balance=100000,
                short_liability=0, networth=100000))
        self.headers = {'Authorization': f'Bearer {create_access_token({"sub": "trader"})}'}

    def tearDown(self):
        self.client.close()
        main.app.dependency_overrides.clear()
        if hasattr(self, 'quotes'):
            self.quotes.stop()
        self.engine.dispose()
        self.temp.cleanup()

    def quote(self, symbol='AAPL', price=100, **extra):
        if hasattr(main, 'quote_book'):
            self.assertTrue(main.quote_book.update({'symbol': symbol, 'price': price, **extra}))
        else:
            main.instrument_list[symbol] = [price, extra['ask'], extra['bid']] if extra else [price]

    def order(self, side='BUY', symbol='AAPL', quantity=1):
        return self.client.post(f'/{side}', headers=self.headers,
                                json={'symbol': symbol, 'quantity': quantity})

    def account(self):
        response = self.client.get('/user_data', headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_new_account_has_matching_cash_and_networth(self):
        response = self.client.post('/register', json={'username': 'newbie', 'password': 'a-valid-test-password'})
        self.assertEqual(response.status_code, 200, response.text)
        headers = {'Authorization': f'Bearer {create_access_token({"sub": "newbie"})}'}
        response = self.client.get('/user_data', headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['balance'], 100000)
        self.assertEqual(response.json()['networth'], 100000)

    def test_unknown_user_returns_404(self):
        response = self.client.get('/user_data', headers={'Authorization': f'Bearer {create_access_token({"sub": "missing"})}'})
        self.assertEqual(response.status_code, 404)

    def test_zero_values_are_valid(self):
        with self.engine.begin() as connection:
            connection.execute(User.__table__.update().values(balance=0, networth=0))
        self.assertEqual(self.account()['networth'], 0)

    def test_buy_updates_cash_and_marks_portfolio_value(self):
        self.quote(price=100)
        self.assertEqual(self.order(quantity=10).status_code, 200)
        self.quote(price=120)
        account = self.account()
        self.assertEqual(account['balance'], 99000)
        self.assertEqual(account['networth'], 100200)
        response = self.client.get('/portfolio', headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()[0]['current_price'], 120)

    def test_short_sale_and_cover_value_liability_correctly(self):
        self.quote(price=100)
        self.assertEqual(self.order('SELL', quantity=10).status_code, 200)
        self.quote(price=90)
        account = self.account()
        self.assertEqual(account['balance'], 101000)
        self.assertEqual(account['short_liability'], -900)
        self.assertEqual(account['networth'], 100100)
        self.assertEqual(self.order(quantity=10).status_code, 200)
        self.assertEqual(self.account()['short_liability'], 0)
        self.assertEqual(self.client.get('/portfolio', headers=self.headers).json(), [])

    def test_bid_ask_execution(self):
        self.quote(symbol='EUR/USD', price=1.1, ask=1.2, bid=1.0)
        self.assertEqual(self.order(symbol='EUR/USD', quantity=10).status_code, 200)
        self.assertEqual(self.account()['balance'], 99988)
        self.assertEqual(self.order('SELL', symbol='EUR/USD', quantity=10).status_code, 200)
        self.assertEqual(self.account()['balance'], 99998)

    def test_no_quote_cannot_execute_free_trade(self):
        for side in ('BUY', 'SELL'):
            self.assertEqual(self.order(side).status_code, 503)
        self.assertEqual(self.account()['balance'], 100000)
        self.assertEqual(self.client.get('/trades?limit=10&page=1', headers=self.headers).json()['trades'], [])

    def test_unknown_symbol_is_client_error(self):
        self.assertEqual(self.order(symbol='UNKNOWN').status_code, 400)

    def test_nonpositive_and_nonfinite_quantities_rejected(self):
        self.quote()
        for quantity in [0, -1, 'NaN', 'Infinity', '-Infinity', 'bad']:
            with self.subTest(quantity=quantity):
                self.assertEqual(self.order(quantity=quantity).status_code, 422)
        self.assertEqual(self.account()['balance'], 100000)

    def test_overflowing_order_rejected(self):
        self.quote(price=1e300)
        self.assertEqual(self.order('SELL', quantity=1e300).status_code, 400)
        self.assertEqual(self.account()['balance'], 100000)

    def test_failed_order_leaves_account_unchanged(self):
        self.quote()
        self.assertEqual(self.order(quantity=1001).status_code, 400)
        self.assertEqual(self.account()['balance'], 100000)
        self.assertEqual(self.client.get('/portfolio', headers=self.headers).json(), [])

    def test_order_failure_rolls_back_cash_and_position(self):
        self.quote()
        original = main.crud.create_trade
        async def fail_after_write(*args, **kwargs):
            await original(*args, **kwargs)
            raise RuntimeError('simulated database failure')
        with patch.object(main.crud, 'create_trade', fail_after_write):
            with self.assertRaises(RuntimeError):
                self.order(quantity=10)
        self.assertEqual(self.account()['balance'], 100000)
        self.assertEqual(self.client.get('/portfolio', headers=self.headers).json(), [])
        self.assertEqual(self.client.get('/trades?limit=10&page=1', headers=self.headers).json()['trades'], [])

    def test_portfolio_valuation_keeps_last_known_price_without_feed(self):
        self.quote(price=100)
        self.assertEqual(self.order(quantity=10).status_code, 200)
        if hasattr(main, 'quote_book'):
            from market import QuoteBook
            main.quote_book = QuoteBook()
        else:
            main.instrument_list['AAPL'] = [0]
        self.assertEqual(self.account()['networth'], 100000)

    def test_history_uses_requested_page_size_and_stable_newest_order(self):
        self.quote()
        for _ in range(5):
            self.assertEqual(self.order().status_code, 200)
        response = self.client.get('/trades?limit=2&page=2', headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['totalPages'], 3)
        self.assertEqual([row['id'] for row in response.json()['trades']], [3, 2])

    def test_invalid_pagination_rejected(self):
        for query in ('limit=0&page=1', 'limit=-1&page=1', 'limit=101&page=1', 'limit=10&page=0'):
            with self.subTest(query=query):
                response = self.client.get(f'/trades?{query}', headers=self.headers)
                self.assertEqual(response.status_code, 422)

    def test_account_isolation(self):
        self.quote()
        self.assertEqual(self.order().status_code, 200)
        with self.engine.begin() as connection:
            connection.execute(User.__table__.insert().values(username='other', hashed_password='unused', balance=100000, short_liability=0, networth=100000))
        other = {'Authorization': f'Bearer {create_access_token({"sub": "other"})}'}
        self.assertEqual(self.client.get('/portfolio', headers=other).json(), [])
        self.assertEqual(self.client.get('/trades', headers=other).json(), {'totalPages': 0, 'trades': []})

    def test_registration_rejects_blank_credentials_and_bcrypt_truncation(self):
        for username, password in [('', 'safe-pass'), ('   ', 'safe-pass'), ('valid', ''), ('valid', 'é' * 37)]:
            with self.subTest(username=username):
                response = self.client.post('/register', json={'username': username, 'password': password})
                self.assertEqual(response.status_code, 422)

    def test_registration_login_roundtrip(self):
        credentials = {'username': 'roundtrip', 'password': 'unique-test-password'}
        self.assertEqual(self.client.post('/register', json=credentials).status_code, 200)
        response = self.client.post('/login', json=credentials)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['token_type'], 'bearer')
        headers = {'Authorization': f'Bearer {response.json()["access_token"]}'}
        self.assertEqual(self.client.get('/user_data', headers=headers).json()['username'], 'roundtrip')
        self.assertEqual(self.client.post('/login', json={**credentials, 'password': 'wrong'}).status_code, 401)
        self.assertEqual(self.client.post('/register', json=credentials).status_code, 400)


if __name__ == '__main__':
    unittest.main()
