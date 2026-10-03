"""Exercise the real market transport through an entirely local CONNECT proxy."""

import asyncio
from contextlib import suppress
import json
import logging
import os
import unittest
from unittest.mock import patch

import websockets

from market import MarketFeed, QuoteBook, SUPPORTED_SYMBOLS


class ProxyTransportTests(unittest.IsolatedAsyncioTestCase):
    async def assert_feed_uses_proxy(self, proxy_variable):
        requests = []
        subscriptions = []
        quotes = []
        received_quote = asyncio.Event()
        proxy_tasks = set()

        async def market_socket(socket):
            subscriptions.append(json.loads(await socket.recv()))
            await socket.send(json.dumps({"symbol": "AAPL", "price": 123.45}))
            await socket.wait_closed()

        async def broadcast(quote):
            quotes.append(quote)
            received_quote.set()

        async def relay(source, destination):
            while chunk := await source.read(65536):
                destination.write(chunk)
                await destination.drain()
            destination.close()

        async def proxy_socket(reader, writer):
            task = asyncio.current_task()
            proxy_tasks.add(task)
            upstream_writer = None
            relays = []
            try:
                request = await reader.readuntil(b"\r\n\r\n")
                request_line = request.split(b"\r\n", 1)[0].decode("ascii")
                requests.append(request_line)
                # The proxy can connect only to this test's loopback server.
                if request_line != f"CONNECT 127.0.0.1:{market_port} HTTP/1.1":
                    writer.write(b"HTTP/1.1 502 Bad Gateway\r\n\r\n")
                    await writer.drain()
                    return
                upstream_reader, upstream_writer = await asyncio.open_connection(
                    "127.0.0.1", market_port
                )
                writer.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                await writer.drain()
                relays = [
                    asyncio.create_task(relay(reader, upstream_writer)),
                    asyncio.create_task(relay(upstream_reader, writer)),
                ]
                await asyncio.gather(*relays)
            except (asyncio.IncompleteReadError, ConnectionError):
                pass
            finally:
                for relay_task in relays:
                    relay_task.cancel()
                if relays:
                    await asyncio.gather(*relays, return_exceptions=True)
                writer.close()
                if upstream_writer is not None:
                    upstream_writer.close()
                    with suppress(ConnectionError):
                        await upstream_writer.wait_closed()
                with suppress(ConnectionError):
                    await writer.wait_closed()
                proxy_tasks.discard(task)

        test_logger = logging.Logger("test.proxy.websocket-server")
        test_logger.disabled = True
        async with websockets.serve(market_socket, "127.0.0.1", 0, logger=test_logger) as server:
            market_port = server.sockets[0].getsockname()[1]
            async with await asyncio.start_server(proxy_socket, "127.0.0.1", 0) as proxy:
                proxy_port = proxy.sockets[0].getsockname()[1]
                # Replace only this process's proxy variables during the test.
                # No machine or runtime network-policy settings are changed.
                environment = {
                    key: ""
                    for variable in (
                        "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "SOCKS_PROXY",
                        "WS_PROXY", "WSS_PROXY", "NO_PROXY",
                    )
                    for key in (variable, variable.lower())
                }
                environment[proxy_variable] = f"http://127.0.0.1:{proxy_port}"
                environment[proxy_variable.lower()] = environment[proxy_variable]
                with patch.dict(os.environ, environment):
                    feed = MarketFeed(QuoteBook(), broadcast, "synthetic-local-test-key")
                    feed._url = f"ws://127.0.0.1:{market_port}/quotes"
                    task = asyncio.create_task(feed.run())
                    try:
                        await asyncio.wait_for(received_quote.wait(), timeout=3)
                    finally:
                        task.cancel()
                        with suppress(asyncio.CancelledError):
                            await task
                        if proxy_tasks:
                            await asyncio.wait_for(
                                asyncio.gather(*tuple(proxy_tasks)), timeout=3
                            )

        self.assertEqual(requests, [f"CONNECT 127.0.0.1:{market_port} HTTP/1.1"])
        self.assertEqual(subscriptions, [{
            "action": "subscribe", "params": {"symbols": ",".join(SUPPORTED_SYMBOLS)}
        }])
        self.assertEqual(quotes, [{"symbol": "AAPL", "price": 123.45}])

    async def test_http_proxy_carries_subscription_and_quote(self):
        await self.assert_feed_uses_proxy("HTTP_PROXY")

    async def test_https_proxy_carries_subscription_and_quote(self):
        await self.assert_feed_uses_proxy("HTTPS_PROXY")


if __name__ == "__main__":
    unittest.main()
