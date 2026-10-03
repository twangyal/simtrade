"""Exercise an entire disposable demo API without a vendor key or network feed."""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from databases import Database
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

with patch.dict(os.environ, {
    'SQLALCHEMY_DATABASE_URI': 'sqlite://',
    'SECRET_KEY': 'market-modes-tests-only-signing-key-at-least-32-bytes',
}), patch('dotenv.load_dotenv', return_value=False):
    import main


class MarketModeConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch.dict(os.environ))
        os.environ.pop('MARKET_DATA_MODE', None)
        os.environ.pop('MARKET_DATA_ENABLED', None)

    def test_disabled_is_default_and_old_live_flag_is_compatible(self):
        self.assertEqual(main.resolve_market_mode(), 'disabled')
        os.environ['MARKET_DATA_ENABLED'] = 'true'
        self.assertEqual(main.resolve_market_mode(), 'live')

    def test_explicit_mode_takes_precedence_over_legacy_flag(self):
        os.environ['MARKET_DATA_ENABLED'] = 'true'
        for mode in ('disabled', 'demo', 'live'):
            os.environ['MARKET_DATA_MODE'] = mode
            self.assertEqual(main.resolve_market_mode(), mode)

    def test_unknown_mode_fails_closed(self):
        os.environ['MARKET_DATA_MODE'] = 'typo'
        with self.assertRaisesRegex(RuntimeError, 'MARKET_DATA_MODE'):
            main.resolve_market_mode()


class DemoApiTests(unittest.TestCase):
    def setUp(self):
        temp = self.enterContext(tempfile.TemporaryDirectory())
        self.engine = create_engine(f'sqlite:///{Path(temp) / "demo.sqlite"}')
        self.addCleanup(self.engine.dispose)
        self.enterContext(patch.object(main, 'engine', self.engine))
        self.enterContext(patch.object(main, 'database', Database(str(self.engine.url))))
        self.enterContext(patch.dict(os.environ, {'MARKET_DATA_MODE': 'demo', 'API_KEY': ''}))
        self.network_feed = self.enterContext(patch.object(main, 'MarketFeed'))
        self.client = self.enterContext(TestClient(main.app))

    def test_demo_startup_reports_mode_and_never_creates_vendor_feed(self):
        response = self.client.get('/market_status')
        self.assertEqual(response.status_code, 200)
        status = response.json()
        self.assertEqual(status['mode'], 'demo')
        self.assertEqual(len(status['ready_symbols']), 8)
        self.assertEqual(status['quote_max_age_seconds'], 60)
        self.network_feed.assert_not_called()

    def test_new_socket_gets_explicitly_labelled_demo_snapshot(self):
        status = self.client.get('/market_status')
        self.assertEqual(status.status_code, 200)
        self.assertTrue(status.json()['ready_symbols'])
        with self.client.websocket_connect('/ws') as socket:
            quote = socket.receive_json()
        self.assertEqual(quote['source'], 'demo')
        self.assertGreater(quote['price'], 0)

    def test_registration_buy_sell_history_and_close_work_without_vendor(self):
        credentials = {'username': 'demo-trader', 'password': 'demo-test-password'}
        self.assertEqual(self.client.post('/register', json=credentials).status_code, 200)
        login = self.client.post('/login', json=credentials)
        self.assertEqual(login.status_code, 200)
        headers = {'Authorization': f'Bearer {login.json()["access_token"]}'}
        order = {'symbol': 'AAPL', 'quantity': 0.5}
        for side in ('BUY', 'SELL'):
            response = self.client.post(f'/{side}', headers=headers, json=order)
            self.assertEqual(response.status_code, 200, response.text)
        account = self.client.get('/user_data', headers=headers)
        self.assertEqual(account.status_code, 200)
        self.assertEqual(account.json()['short_liability'], 0)
        self.assertEqual(self.client.get('/portfolio', headers=headers).json(), [])
        history = self.client.get('/trades', headers=headers).json()['trades']
        self.assertEqual([trade['quantity'] for trade in history], [-0.5, 0.5])
        self.assertTrue(all(trade['price'] > 0 for trade in history))
        self.network_feed.assert_not_called()


if __name__ == '__main__':
    unittest.main()
