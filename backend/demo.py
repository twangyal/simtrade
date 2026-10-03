"""Offline, deterministic example quotes for paper-trading demonstrations.

Every seed below is invented for interface testing. These values and their
subsequent oscillations are neither observed market prices nor forecasts.
The feed uses no network connection, random generator, or API credential.
"""

import asyncio
from collections.abc import Awaitable, Callable
import math
from types import MappingProxyType

from market import QuoteBook, SUPPORTED_SYMBOLS


# Invented example starting prices, in the same units as each trading symbol.
DEMO_SEEDS = MappingProxyType({
    "AAPL": 100.0,
    "INFY": 25.0,
    "QQQ": 400.0,
    "IXIC": 15000.0,
    "TRP": 50.0,
    "EUR/USD": 1.10,
    "USD/JPY": 150.0,
    "BTC/USD": 60000.0,
})
_CURRENCY_PAIRS = {"EUR/USD", "USD/JPY"}


def demo_quotes(tick: int) -> list[dict]:
    """Return fresh demo payloads, varying at most 0.5% around invented seeds.

Each instrument follows a different repeating 120–260 tick cycle. Tick zero
starts at the seed, and results depend only on the tick, never on wall time.
"""
    if isinstance(tick, bool) or not isinstance(tick, int) or tick < 0:
        raise ValueError("Demo tick must be a nonnegative integer")
    quotes = []
    for index, symbol in enumerate(SUPPORTED_SYMBOLS):
        period = 120 + 20 * index
        variation = 0.005 * math.sin(math.tau * (tick % period) / period)
        precision = 5 if symbol in _CURRENCY_PAIRS else 2
        price = round(DEMO_SEEDS[symbol] * (1 + variation), precision)
        quote = {"symbol": symbol, "price": price, "source": "demo"}
        if symbol in _CURRENCY_PAIRS:
            quote.update(
                bid=round(price * 0.9999, precision),
                ask=round(price * 1.0001, precision),
            )
        quotes.append(quote)
    return quotes


class DemoFeed:
    """Seed every symbol immediately, then refresh until the caller cancels.

QuoteBook intentionally strips provenance metadata. Broadcasts retain
``source='demo'``; clients serving cached snapshots should add that same
provenance according to their configured market mode.
"""

    def __init__(
        self,
        quote_book: QuoteBook,
        broadcast: Callable[[dict], Awaitable[None]],
        *,
        interval=1.0,
        sleep=asyncio.sleep,
    ):
        if isinstance(interval, bool) or not isinstance(interval, (int, float)):
            raise ValueError("Demo interval must be positive and finite")
        try:
            interval = float(interval)
        except OverflowError:
            raise ValueError("Demo interval must be positive and finite") from None
        if not math.isfinite(interval) or interval <= 0:
            raise ValueError("Demo interval must be positive and finite")
        self.quote_book = quote_book
        self._broadcast = broadcast
        self._interval = interval
        self._sleep = sleep

    async def run(self):
        tick = 0
        while True:
            # Fill the entire cache before awaiting browsers or the first sleep.
            quotes = [quote for quote in demo_quotes(tick) if self.quote_book.update(quote)]
            for quote in quotes:
                await self._broadcast(quote)
            await self._sleep(self._interval)
            tick += 1
