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
    def __init__(self, *, fail_send=False, fail_close=False):
        self.fail_send = fail_send
        self.fail_close = fail_close
        self.accepted = False
        self.messages = []
        self.close_codes = []
        self.waiting = asyncio.Event()
        self.disconnect = asyncio.Event()

    async def accept(self):
        self.accepted = True

    async def send_json(self, data):
        if self.fail_send:
            raise RuntimeError("connection closed")
        self.messages.append(data)

    async def receive_text(self):
        self.waiting.set()
        await self.disconnect.wait()
        raise WebSocketDisconnect()

    async def close(self, code):
        self.close_codes.append(code)
        if self.fail_close:
            raise RuntimeError("connection already closed")


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
        failed.disconnect.set()
        await task
        self.assertEqual(self.clients, {healthy})


if __name__ == "__main__":
    unittest.main()
