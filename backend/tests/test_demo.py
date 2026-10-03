"""Synthetic demo data tests: no credentials, wall-clock waits, or network."""

import asyncio
import math
import unittest
from unittest.mock import patch

from demo import DEMO_SEEDS, DemoFeed, demo_quotes
from limits import MAX_QUOTE_PRICE
from market import QuoteBook, SUPPORTED_SYMBOLS


class DemoQuoteTests(unittest.TestCase):
    def test_initial_tick_uses_documented_invented_seeds_for_every_symbol(self):
        self.assertEqual(set(DEMO_SEEDS), set(SUPPORTED_SYMBOLS))
        quotes = demo_quotes(0)
        self.assertEqual([quote["symbol"] for quote in quotes], list(SUPPORTED_SYMBOLS))
        for quote in quotes:
            self.assertEqual(quote["price"], DEMO_SEEDS[quote["symbol"]])
            self.assertEqual(quote["source"], "demo")

    def test_ticks_are_repeatable_and_do_not_share_mutable_payloads(self):
        expected = demo_quotes(17)
        observed = demo_quotes(17)
        self.assertEqual(observed, expected)
        self.assertNotEqual(observed, demo_quotes(18))
        observed[0]["price"] = 0
        self.assertEqual(demo_quotes(17), expected)

    def test_prices_and_spreads_stay_positive_bounded_and_executable(self):
        book = QuoteBook()
        for tick in range(0, 1000, 17):
            for quote in demo_quotes(tick):
                with self.subTest(tick=tick, symbol=quote["symbol"]):
                    symbol = quote["symbol"]
                    seed = DEMO_SEEDS[symbol]
                    self.assertTrue(math.isfinite(quote["price"]))
                    self.assertGreater(quote["price"], 0)
                    self.assertLessEqual(quote["price"], MAX_QUOTE_PRICE)
                    self.assertLess(abs(quote["price"] / seed - 1), 0.006)
                    self.assertTrue(book.update(quote))
                    self.assertIsNotNone(book.get(symbol, require_fresh=True))
                    if symbol in {"EUR/USD", "USD/JPY"}:
                        self.assertLess(quote["bid"], quote["price"])
                        self.assertGreater(quote["ask"], quote["price"])
                        self.assertEqual(book.execution_price(symbol, "BUY"), quote["ask"])
                        self.assertEqual(book.execution_price(symbol, "SELL"), quote["bid"])
                    else:
                        self.assertEqual(book.execution_price(symbol, "BUY"), quote["price"])
                        self.assertEqual(book.execution_price(symbol, "SELL"), quote["price"])

    def test_invalid_ticks_are_rejected(self):
        for tick in (-1, 0.5, True, None):
            with self.subTest(tick=tick), self.assertRaises(ValueError):
                demo_quotes(tick)


class DemoFeedTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.now = 100.0
        self.book = QuoteBook(clock=lambda: self.now)
        self.broadcasts = []

    async def broadcast(self, quote):
        self.broadcasts.append(quote)

    async def test_seeds_all_quotes_before_sleep_without_network_or_credentials(self):
        async def first_sleep(delay):
            self.assertEqual(delay, 1.0)
            self.assertEqual(len(self.broadcasts), len(SUPPORTED_SYMBOLS))
            for symbol in SUPPORTED_SYMBOLS:
                self.assertIsNotNone(self.book.get(symbol, require_fresh=True))
            raise asyncio.CancelledError

        feed = DemoFeed(self.book, self.broadcast, sleep=first_sleep)
        with patch("socket.socket.connect", side_effect=AssertionError("Demo must remain offline")), \
                patch("market.MarketFeed.run", side_effect=AssertionError("Demo must not run the vendor feed")), \
                self.assertRaises(asyncio.CancelledError):
            await feed.run()
        self.assertTrue(all(quote["source"] == "demo" for quote in self.broadcasts))
        self.assertNotIn("source", self.book.get("AAPL"))

    async def test_caches_entire_tick_before_the_first_broadcast(self):
        async def stop_at_broadcast(quote):
            for symbol in SUPPORTED_SYMBOLS:
                self.assertIsNotNone(self.book.get(symbol, require_fresh=True))
            raise asyncio.CancelledError

        with self.assertRaises(asyncio.CancelledError):
            await DemoFeed(self.book, stop_at_broadcast).run()

    async def test_each_tick_refreshes_quotes_and_uses_configured_interval(self):
        delays = []

        async def advance_clock(delay):
            delays.append(delay)
            if len(delays) == 3:
                raise asyncio.CancelledError
            self.now += delay

        with self.assertRaises(asyncio.CancelledError):
            await DemoFeed(self.book, self.broadcast, interval=2.5, sleep=advance_clock).run()
        self.assertEqual(delays, [2.5, 2.5, 2.5])
        self.assertEqual(self.broadcasts, demo_quotes(0) + demo_quotes(1) + demo_quotes(2))
        for quote in demo_quotes(2):
            self.assertEqual(self.book.get(quote["symbol"], require_fresh=True)["price"], quote["price"])

    async def test_cancellation_during_sleep_stops_without_more_broadcasts(self):
        sleeping = asyncio.Event()

        async def wait_forever(delay):
            sleeping.set()
            await asyncio.Future()

        task = asyncio.create_task(DemoFeed(self.book, self.broadcast, sleep=wait_forever).run())
        try:
            await asyncio.wait_for(sleeping.wait(), timeout=1)
        finally:
            task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertEqual(self.broadcasts, demo_quotes(0))

    async def test_interval_must_be_positive_and_finite(self):
        for interval in (0, -1, True, float("inf"), float("nan"), "1", None):
            with self.subTest(interval=interval), self.assertRaises(ValueError):
                DemoFeed(self.book, self.broadcast, interval=interval)


if __name__ == "__main__":
    unittest.main()
