import asyncio
import json
import logging
import unittest
from unittest.mock import patch

from market import MarketFeed, QuoteBook, SUPPORTED_SYMBOLS


class QuoteBookTests(unittest.TestCase):
    def setUp(self):
        self.now = 100.0
        self.book = QuoteBook(clock=lambda: self.now)

    def test_supported_symbols_start_without_quotes(self):
        self.assertEqual(
            set(SUPPORTED_SYMBOLS),
            {"AAPL", "INFY", "QQQ", "IXIC", "TRP", "EUR/USD", "USD/JPY", "BTC/USD"},
        )
        for symbol in SUPPORTED_SYMBOLS:
            self.assertIsNone(self.book.get(symbol))
            with self.assertRaises(LookupError):
                self.book.execution_price(symbol, "BUY")
        with self.assertRaises(ValueError):
            self.book.execution_price("UNKNOWN", "BUY")

    def test_valid_quote_is_normalized_and_copied(self):
        payload = {"symbol": "AAPL", "price": 120, "event": "price", "secret": "discard"}
        self.assertTrue(self.book.update(payload))
        quote = self.book.get("AAPL")
        self.assertEqual(quote, {"symbol": "AAPL", "price": 120.0})
        self.assertIsInstance(quote["price"], float)
        payload["price"] = 0
        quote["price"] = 0
        self.assertEqual(self.book.get("AAPL")["price"], 120.0)

    def test_invalid_prices_do_not_replace_quote_or_refresh_its_age(self):
        self.book.update({"symbol": "AAPL", "price": 120})
        self.now += 30
        invalid_prices = [None, True, False, 0, -1, "120", [], [120], {}, float("nan"), float("inf"), -float("inf"), 10**400]
        for price in invalid_prices:
            with self.subTest(price=price):
                self.assertFalse(self.book.update({"symbol": "AAPL", "price": price}))
        for payload in [None, [], "bad", {}, {"symbol": []}, {"symbol": "UNKNOWN", "price": 10}]:
            with self.subTest(payload=payload):
                self.assertFalse(self.book.update(payload))
        self.assertEqual(self.book.get("AAPL")["price"], 120.0)
        self.now = 160.001
        self.assertIsNone(self.book.get("AAPL", require_fresh=True))

    def test_spread_must_be_complete_valid_and_not_crossed(self):
        for spread in [
            {"bid": 99}, {"ask": 101}, {"bid": None, "ask": 101},
            {"bid": 99, "ask": "101"}, {"bid": 99, "ask": False},
            {"bid": 0, "ask": 101}, {"bid": 99, "ask": float("inf")},
            {"bid": 102, "ask": 101},
        ]:
            with self.subTest(spread=spread):
                self.assertFalse(self.book.update({"symbol": "AAPL", "price": 100, **spread}))
        self.assertTrue(self.book.update({"symbol": "AAPL", "price": 100, "bid": 99, "ask": 101}))
        self.assertEqual(self.book.execution_price("AAPL", "BUY"), 101)
        self.assertEqual(self.book.execution_price("AAPL", "COVER"), 101)
        self.assertEqual(self.book.execution_price("AAPL", "SELL"), 99)
        self.assertEqual(self.book.execution_price("AAPL", "SHORT"), 99)
        self.assertTrue(self.book.update({"symbol": "AAPL", "price": 100, "bid": 100, "ask": 100}))

    def test_extreme_prices_and_spreads_are_rejected(self):
        for payload in (
            {"symbol": "AAPL", "price": 1e308},
            {"symbol": "AAPL", "price": 100, "bid": 99, "ask": 1e308},
        ):
            with self.subTest(payload=payload):
                self.assertFalse(self.book.update(payload))

    def test_modern_unix_timestamp_is_not_limited_as_a_price(self):
        book = QuoteBook(clock=lambda: self.now, wall_clock=lambda: 1_800_000_000)
        self.assertTrue(book.update({"symbol": "AAPL", "price": 100, "timestamp": 1_800_000_000}))

    def test_last_price_fallback_and_side_validation(self):
        self.book.update({"symbol": "AAPL", "price": 120})
        for side in ["BUY", "SELL", "SHORT", "COVER", "buy"]:
            self.assertEqual(self.book.execution_price("AAPL", side), 120)
        for side in ["BID", "", None]:
            with self.assertRaises(ValueError):
                self.book.execution_price("AAPL", side)

    def test_freshness_uses_monotonic_receipt_time(self):
        self.book.update({"symbol": "AAPL", "price": 120})
        self.now = 160.0
        self.assertEqual(self.book.execution_price("AAPL", "BUY"), 120)
        self.now = 160.001
        self.assertIsNone(self.book.get("AAPL", require_fresh=True))
        self.assertEqual(self.book.get("AAPL")["price"], 120)
        with self.assertRaises(LookupError):
            self.book.execution_price("AAPL", "BUY")
        self.book.update({"symbol": "AAPL", "price": 121})
        self.assertEqual(self.book.execution_price("AAPL", "BUY"), 121)

    def test_vendor_timestamp_rejects_stale_invalid_and_future_ticks(self):
        book = QuoteBook(clock=lambda: self.now, wall_clock=lambda: 1000)
        for timestamp in [939, 1006, "1000", None, True, -1, float("nan"), float("inf")]:
            with self.subTest(timestamp=timestamp):
                self.assertFalse(book.update({"symbol": "AAPL", "price": 120, "timestamp": timestamp}))
        self.assertIsNone(book.get("AAPL"))
        self.assertTrue(book.update({"symbol": "AAPL", "price": 120, "timestamp": 1005}))

    def test_delayed_quote_expires_from_vendor_event_age_using_monotonic_clock(self):
        wall_time = [1000]
        book = QuoteBook(clock=lambda: self.now, wall_clock=lambda: wall_time[0])
        self.assertTrue(book.update({"symbol": "AAPL", "price": 120, "timestamp": 950}))
        self.assertEqual(book.execution_price("AAPL", "BUY"), 120)
        self.now += 10.001
        wall_time[0] = 800  # System wall-clock adjustment must not extend validity.
        with self.assertRaises(LookupError):
            book.execution_price("AAPL", "BUY")

    def test_out_of_order_vendor_tick_cannot_replace_a_newer_quote(self):
        book = QuoteBook(clock=lambda: self.now, wall_clock=lambda: 1000)
        self.assertTrue(book.update({"symbol": "AAPL", "price": 120, "timestamp": 999}))
        self.assertFalse(book.update({"symbol": "AAPL", "price": 90, "timestamp": 998}))
        self.assertEqual(book.execution_price("AAPL", "BUY"), 120)
        # Vendor timestamps have second resolution; multiple prices per second are valid.
        self.assertTrue(book.update({"symbol": "AAPL", "price": 121, "timestamp": 999}))
        self.assertEqual(book.execution_price("AAPL", "BUY"), 121)

    def test_new_last_price_drops_old_spread_and_partial_spread_cannot_mix(self):
        self.book.update({"symbol": "AAPL", "price": 100, "bid": 99, "ask": 101})
        self.assertTrue(self.book.update({"symbol": "AAPL", "price": 120}))
        self.assertEqual(self.book.execution_price("AAPL", "BUY"), 120)
        self.assertEqual(self.book.execution_price("AAPL", "SELL"), 120)
        self.assertFalse(self.book.update({"symbol": "AAPL", "price": 130, "ask": 131}))
        self.assertEqual(self.book.execution_price("AAPL", "BUY"), 120)


class FakeSocket:
    def __init__(self, messages=(), *, block=False):
        self.messages = iter(messages)
        self.sent = []
        self.closed = False
        self.block = block
        self.waiting = asyncio.Event()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        self.closed = True

    async def send(self, message):
        self.sent.append(json.loads(message))

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            message = next(self.messages)
        except StopIteration:
            if self.block:
                self.waiting.set()
                await asyncio.Future()
            raise StopAsyncIteration
        if isinstance(message, Exception):
            raise message
        return message


class MarketFeedTests(unittest.IsolatedAsyncioTestCase):
    async def test_default_transport_does_not_log_api_key_at_debug_level(self):
        def connect(url, **kwargs):
            transport_logger = kwargs.get("logger", logging.getLogger("websockets.client"))
            transport_logger.debug("> GET %s HTTP/1.1", url)
            return FakeSocket()

        async def stop_after_disconnect(delay):
            raise asyncio.CancelledError

        with patch("market.websockets.connect", side_effect=connect):
            feed = MarketFeed(QuoteBook(), lambda quote: None, "secret-debug-key", sleep=stop_after_disconnect)
            with self.assertLogs(level="DEBUG") as logs:
                with self.assertRaises(asyncio.CancelledError):
                    await feed.run()
        self.assertNotIn("secret-debug-key", "\n".join(logs.output))

    async def test_subscribes_and_broadcasts_only_normalized_quotes(self):
        socket = FakeSocket([
            "not-json", b"\xff", "null", "[]", '{"event":"subscribe-status"}',
            '{"symbol":"AAPL","price":[1]}', '{"symbol":"UNKNOWN","price":10}',
            '{"symbol":"AAPL","price":123,"event":"price","ask":124,"bid":122}',
            '{"symbol":"QQQ","price":450}',
        ], block=True)
        broadcasts = []

        async def broadcast(quote):
            broadcasts.append(quote)

        feed = MarketFeed(QuoteBook(), broadcast, "test-key", connect=lambda url: socket)
        task = asyncio.create_task(feed.run())
        await asyncio.wait_for(socket.waiting.wait(), timeout=1)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertTrue(socket.closed)
        self.assertEqual(socket.sent, [{"action": "subscribe", "params": {"symbols": ",".join(SUPPORTED_SYMBOLS)}}])
        self.assertEqual(broadcasts, [
            {"symbol": "AAPL", "price": 123.0, "ask": 124.0, "bid": 122.0},
            {"symbol": "QQQ", "price": 450.0},
        ])

    async def test_reconnect_backoff_is_bounded_and_secrets_are_not_logged(self):
        delays = []

        def connect(url):
            raise OSError("Cannot connect to secret-key URL: " + url)

        async def sleep(delay):
            delays.append(delay)
            if len(delays) == 5:
                raise asyncio.CancelledError

        feed = MarketFeed(QuoteBook(), lambda quote: None, "secret-key", connect=connect, sleep=sleep, max_backoff=4)
        with self.assertLogs("market", level="WARNING") as logs:
            with self.assertRaises(asyncio.CancelledError):
                await feed.run()
        self.assertEqual(delays, [1, 2, 4, 4, 4])
        self.assertNotIn("secret-key", "\n".join(logs.output))

    async def test_reconnect_resubscribes_and_resets_backoff_after_valid_quote(self):
        first = FakeSocket([OSError("connection interrupted")])
        second = FakeSocket(['{"symbol":"INFY","price":20}'])
        sockets = iter([first, second])
        delays = []
        broadcasts = []

        async def sleep(delay):
            delays.append(delay)
            if len(delays) == 2:
                raise asyncio.CancelledError

        async def broadcast(quote):
            broadcasts.append(quote)

        feed = MarketFeed(QuoteBook(), broadcast, "test", connect=lambda url: next(sockets), sleep=sleep)
        with self.assertLogs("market", level="WARNING"):
            with self.assertRaises(asyncio.CancelledError):
                await feed.run()
        self.assertEqual(delays, [1, 1])
        self.assertTrue(first.closed)
        self.assertTrue(second.closed)
        self.assertEqual(first.sent, second.sent)
        self.assertEqual(broadcasts, [{"symbol": "INFY", "price": 20.0}])


if __name__ == "__main__":
    unittest.main()
