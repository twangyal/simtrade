"""Validated market quotes and a cancellable, reconnecting Twelve Data feed."""

import asyncio
import json
import logging
import math
import time
from collections.abc import Awaitable, Callable
from functools import partial
from urllib.parse import urlencode

import websockets


logger = logging.getLogger(__name__)
# Websockets logs the credential-bearing handshake URL at DEBUG. Keep this
# private logger outside the logging registry so root logging cannot enable it.
_transport_logger = logging.Logger("market.transport")
_transport_logger.disabled = True
SUPPORTED_SYMBOLS = (
    "AAPL", "INFY", "QQQ", "IXIC", "TRP", "EUR/USD", "USD/JPY", "BTC/USD",
)


def _positive_number(value):
    """Accept JSON numbers, excluding booleans, containers and numeric strings."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    try:
        number = float(value)
    except (ValueError, OverflowError):
        return None
    return number if math.isfinite(number) and number > 0 else None


class QuoteBook:
    """Store validated quotes; freshness is measured from local monotonic receipt."""

    def __init__(self, *, max_age=60.0, clock=time.monotonic, wall_clock=time.time):
        self.max_age = max_age
        self._clock = clock
        self._wall_clock = wall_clock
        self._quotes = {}
        self._source_timestamps = {}

    def update(self, payload) -> bool:
        if not isinstance(payload, dict):
            return False
        symbol = payload.get("symbol")
        if symbol not in SUPPORTED_SYMBOLS:
            return False
        price = _positive_number(payload.get("price"))
        if price is None:
            return False
        quote = {"symbol": symbol, "price": price}
        if "ask" in payload or "bid" in payload:
            ask = _positive_number(payload.get("ask"))
            bid = _positive_number(payload.get("bid"))
            if ask is None or bid is None or bid > ask:
                return False
            quote.update(ask=ask, bid=bid)
        received_at = self._clock()
        if "timestamp" in payload:
            timestamp = _positive_number(payload["timestamp"])
            if timestamp is None:
                return False
            age = self._wall_clock() - timestamp
            if age > self.max_age or age < -5:
                return False
            if timestamp < self._source_timestamps.get(symbol, timestamp):
                return False
            # A delayed tick gets only its remaining lifetime. Future reads use
            # monotonic time, so system wall-clock changes cannot revive it.
            received_at -= max(age, 0)
            self._source_timestamps[symbol] = timestamp
        self._quotes[symbol] = (quote, received_at)
        return True

    def get(self, symbol, *, require_fresh=False) -> dict | None:
        if symbol not in SUPPORTED_SYMBOLS:
            return None
        stored = self._quotes.get(symbol)
        if stored is None:
            return None
        quote, received_at = stored
        if require_fresh and self._clock() - received_at > self.max_age:
            return None
        return quote.copy()

    def execution_price(self, symbol, side) -> float:
        if symbol not in SUPPORTED_SYMBOLS:
            raise ValueError("Unsupported symbol")
        if not isinstance(side, str) or side.upper() not in {"BUY", "SELL", "SHORT", "COVER"}:
            raise ValueError("Unsupported trade side")
        quote = self.get(symbol, require_fresh=True)
        if quote is None:
            raise LookupError("No fresh market quote is available for this symbol")
        field = "ask" if side.upper() in {"BUY", "COVER"} else "bid"
        return quote.get(field, quote["price"])


class MarketFeed:
    """Stream accepted quotes and retry interruptions with capped exponential delay.

    The caller owns the run task and cancels it during application shutdown.
    No connection is opened until run is awaited.
    """

    def __init__(
        self,
        quote_book: QuoteBook,
        broadcast: Callable[[dict], Awaitable[None]],
        api_key: str,
        *,
        connect=None,
        sleep=asyncio.sleep,
        min_backoff=1.0,
        max_backoff=30.0,
    ):
        self.quote_book = quote_book
        self._broadcast = broadcast
        self._url = "wss://ws.twelvedata.com/v1/quotes/price?" + urlencode({"apikey": api_key})
        self._connect = partial(websockets.connect, logger=_transport_logger) if connect is None else connect
        self._sleep = sleep
        self._min_backoff = min_backoff
        self._max_backoff = max_backoff

    async def run(self):
        delay = self._min_backoff
        while True:
            try:
                async with self._connect(self._url) as socket:
                    await socket.send(json.dumps({
                        "action": "subscribe",
                        "params": {"symbols": ",".join(SUPPORTED_SYMBOLS)},
                    }))
                    async for message in socket:
                        try:
                            payload = json.loads(message)
                        except (ValueError, TypeError, UnicodeError):
                            continue
                        if self.quote_book.update(payload):
                            delay = self._min_backoff
                            await self._broadcast(self.quote_book.get(payload["symbol"]))
            except asyncio.CancelledError:
                raise
            except Exception:
                # Connection exceptions may contain the credential-bearing URL.
                # Never log their text or traceback.
                pass
            logger.warning("Market feed disconnected; retrying in %.1f seconds", delay)
            await self._sleep(delay)
            delay = min(delay * 2, self._max_backoff)
