"""Offline lifecycle and websocket regressions; all external resources are fakes."""

import asyncio
import os
import unittest
from unittest.mock import patch

from fastapi import WebSocketDisconnect

# Importing configuration must neither load local credentials nor touch a real DB.
with patch.dict(os.environ, {
    "SQLALCHEMY_DATABASE_URI": "sqlite://",
    "SECRET_KEY": "test-only-signing-key-with-more-than-32-bytes",
    "MARKET_DATA_ENABLED": "false",
}), patch("dotenv.load_dotenv", return_value=False):
    import main

from market import QuoteBook


class FakeClient:
    def __init__(self, *, fail_send=False, fail_close=False, slow_send=False, slow_close=False):
        self.fail_send = fail_send
        self.fail_close = fail_close
        self.slow_send = slow_send
        self.slow_close = slow_close
        self.accepted = False
        self.messages = []
        self.close_codes = []
        self.waiting = asyncio.Event()
        self.disconnect = asyncio.Event()
        self.message_received = asyncio.Event()
        self.send_cancelled = asyncio.Event()
        self.close_cancelled = asyncio.Event()

    async def accept(self):
        self.accepted = True

    async def send_json(self, data):
        if self.fail_send:
            raise RuntimeError("connection closed")
        if self.slow_send:
            try:
                await asyncio.Future()
            finally:
                self.send_cancelled.set()
        self.messages.append(data)
        self.message_received.set()

    async def receive_text(self):
        self.waiting.set()
        await self.disconnect.wait()
        raise WebSocketDisconnect()

    async def close(self, code):
        self.close_codes.append(code)
        if self.fail_close:
            raise RuntimeError("connection already closed")
        if self.slow_close:
            try:
                await asyncio.Future()
            finally:
                self.close_cancelled.set()
        self.disconnect.set()


class FakeDatabase:
    def __init__(self, events):
        self.events = events

    async def connect(self):
        self.events.append("database connected")

    async def disconnect(self):
        self.events.append("database disconnected")


class FakeFeed:
    def __init__(self, events):
        self.events = events
        self.started = asyncio.Event()

    async def run(self):
        self.events.append("feed started")
        self.started.set()
        try:
            await asyncio.Future()
        finally:
            self.events.append("feed stopped")


class LifecycleTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.events = []
        self.feeds = []
        self.clients = set()
        self.enterContext(patch.dict(os.environ, {
            "MARKET_DATA_ENABLED": "false", "API_KEY": "offline-test-key",
        }))
        self.enterContext(patch.object(main, "database", FakeDatabase(self.events)))
        self.enterContext(patch.object(main, "connected_clients", self.clients))
        self.enterContext(patch.object(main, "quote_book", QuoteBook()))
        self.enterContext(patch.object(main.Base.metadata, "create_all", side_effect=lambda **kwargs: self.events.append("schema ready")))
        self.enterContext(patch.object(main, "MarketFeed", side_effect=self.make_feed))

    def make_feed(self, *args):
        feed = FakeFeed(self.events)
        self.feeds.append(feed)
        return feed

    async def test_default_startup_never_starts_market_network(self):
        del os.environ["MARKET_DATA_ENABLED"]
        async with main.lifespan(main.app):
            self.assertEqual(self.feeds, [])
            self.assertEqual(self.events, ["schema ready", "database connected"])
        self.assertEqual(self.events[-1], "database disconnected")

    async def test_enabled_feed_requires_key_before_starting_resources(self):
        os.environ["MARKET_DATA_ENABLED"] = "true"
        os.environ.pop("API_KEY", None)
        with self.assertRaisesRegex(RuntimeError, "API_KEY"):
            async with main.lifespan(main.app):
                self.fail("Startup unexpectedly succeeded without a key")
        self.assertEqual(self.events, [])
        self.assertEqual(self.feeds, [])

    async def test_shutdown_awaits_feed_cancellation_and_closes_all_clients(self):
        os.environ["MARKET_DATA_ENABLED"] = "true"
        client = FakeClient()
        disconnected = FakeClient(fail_close=True)
        self.clients.update([client, disconnected])
        async with main.lifespan(main.app):
            await asyncio.wait_for(self.feeds[0].started.wait(), timeout=1)
        self.assertEqual(self.events, ["schema ready", "database connected", "feed started", "feed stopped", "database disconnected"])
        self.assertEqual(client.close_codes, [1001])
        self.assertEqual(disconnected.close_codes, [1001])
        self.assertEqual(self.clients, set())

    async def test_failed_background_feed_still_releases_resources(self):
        os.environ["MARKET_DATA_ENABLED"] = "true"
        client = FakeClient()
        self.clients.add(client)

        async def broken_run():
            raise RuntimeError("unexpected feed failure")

        feed = FakeFeed(self.events)
        feed.run = broken_run
        with patch.object(main, "MarketFeed", return_value=feed):
            with self.assertRaisesRegex(RuntimeError, "unexpected feed failure"):
                async with main.lifespan(main.app):
                    await asyncio.sleep(0)
        self.assertEqual(self.events[-1], "database disconnected")
        self.assertEqual(client.close_codes, [1001])
        self.assertEqual(self.clients, set())

    async def test_shutdown_bounds_all_client_closes_and_disconnects_database(self):
        stalled = [FakeClient(slow_close=True), FakeClient(slow_close=True)]
        healthy = FakeClient()
        self.clients.update([*stalled, healthy])
        # Two independent stalled sockets must share one two-second timeout
        # window; serial close timeouts would exceed the outer deadline.
        async with asyncio.timeout(3.5):
            async with main.lifespan(main.app):
                pass
        self.assertEqual(self.events[-1], "database disconnected")
        self.assertEqual(healthy.close_codes, [1001])
        for client in stalled:
            self.assertEqual(client.close_codes, [1001])
            self.assertTrue(client.close_cancelled.is_set())
        self.assertEqual(self.clients, set())

    async def test_new_websocket_gets_only_fresh_known_quotes(self):
        now = [0]
        main.quote_book = QuoteBook(clock=lambda: now[0])
        main.quote_book.update({"symbol": "AAPL", "price": 100})
        now[0] = 61
        main.quote_book.update({"symbol": "QQQ", "price": 450})
        client = FakeClient()
        task = asyncio.create_task(main.websocket_endpoint(client))
        await asyncio.wait_for(client.waiting.wait(), timeout=1)
        client.disconnect.set()
        await task
        self.assertTrue(client.accepted)
        self.assertEqual(client.messages, [{"symbol": "QQQ", "price": 450.0}])
        self.assertEqual(self.clients, set())

    async def test_broadcast_failure_and_endpoint_disconnect_can_both_remove_client(self):
        failed = FakeClient(fail_send=True)
        healthy = FakeClient()
        self.clients.add(healthy)
        task = asyncio.create_task(main.websocket_endpoint(failed))
        await asyncio.wait_for(failed.waiting.wait(), timeout=1)
        quote = {"symbol": "AAPL", "price": 120.0}
        await main.broadcast_to_clients(quote)
        self.assertEqual(healthy.messages, [quote])
        self.assertEqual(self.clients, {healthy})
        self.assertEqual(failed.close_codes, [1011])
        # Closing the dropped socket releases receive_text without another
        # browser message, allowing the browser's reconnect path to run.
        await asyncio.wait_for(task, timeout=1)
        self.assertEqual(self.clients, {healthy})

    async def test_slow_send_closes_dropped_socket_and_keeps_healthy_updates(self):
        stalled = FakeClient(slow_send=True)
        healthy = FakeClient()
        self.clients.update([stalled, healthy])
        quote = {"symbol": "AAPL", "price": 120.0}
        task = asyncio.create_task(main.broadcast_to_clients(quote))
        await asyncio.wait_for(healthy.message_received.wait(), timeout=1)
        self.assertFalse(task.done())
        self.assertEqual(healthy.messages, [quote])
        await asyncio.wait_for(task, timeout=3.5)
        self.assertTrue(stalled.send_cancelled.is_set())
        self.assertEqual(stalled.close_codes, [1011])
        self.assertEqual(self.clients, {healthy})
        next_quote = {"symbol": "AAPL", "price": 121.0}
        await main.broadcast_to_clients(next_quote)
        self.assertEqual(healthy.messages, [quote, next_quote])

    async def test_unresponsive_close_is_bounded_without_blocking_healthy_delivery(self):
        stalled = FakeClient(fail_send=True, slow_close=True)
        healthy = FakeClient()
        self.clients.update([stalled, healthy])
        quote = {"symbol": "AAPL", "price": 120.0}
        task = asyncio.create_task(main.broadcast_to_clients(quote))
        await asyncio.wait_for(healthy.message_received.wait(), timeout=1)
        self.assertEqual(healthy.messages, [quote])
        await asyncio.wait_for(task, timeout=3.5)
        self.assertEqual(stalled.close_codes, [1011])
        self.assertTrue(stalled.close_cancelled.is_set())
        self.assertEqual(self.clients, {healthy})

    async def test_close_error_and_repeated_broadcast_cleanup_are_tolerated(self):
        closed = FakeClient(fail_send=True, fail_close=True)
        healthy = FakeClient()
        self.clients.update([closed, healthy])
        quotes = [{"symbol": "AAPL", "price": 120.0}, {"symbol": "AAPL", "price": 121.0}]
        for quote in quotes:
            await main.broadcast_to_clients(quote)
        self.assertEqual(closed.close_codes, [1011])
        self.assertEqual(self.clients, {healthy})
        self.assertEqual(healthy.messages, quotes)


if __name__ == "__main__":
    unittest.main()
