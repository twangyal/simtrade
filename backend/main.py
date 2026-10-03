"""Paper-trading API. Network market data is explicitly opt-in."""
import asyncio
from contextlib import asynccontextmanager, suppress
from datetime import timedelta
from decimal import Decimal, InvalidOperation, ROUND_CEILING, ROUND_FLOOR, localcontext
import math
import os

from databases import Database
from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from database import Base, database, engine
from demo import DemoFeed, demo_quotes
from market import MarketFeed, QuoteBook, SUPPORTED_SYMBOLS
from models import Portfolio, STARTING_BALANCE, User
from limits import MAX_CASH_BALANCE, MAX_ORDER_VALUE, MAX_QUANTITY
from schema import TradeCreate, TradePagination, UserCreate, UserInfo, UserLogin
from security import (
    ACCESS_TOKEN_EXPIRE_MINUTES, Token, TokenData, create_access_token,
    decode_access_token, get_password_hash, verify_password,
)
import crud

quote_book = QuoteBook()
connected_clients: set[WebSocket] = set()


async def broadcast_to_clients(data):
    """A disconnected or slow browser must not interrupt the market feed."""
    async def send(client):
        try:
            await asyncio.wait_for(client.send_json(data), timeout=2)
        except Exception:
            connected_clients.discard(client)
    await asyncio.gather(*(send(client) for client in tuple(connected_clients)))


def resolve_market_mode():
    mode = os.getenv('MARKET_DATA_MODE')
    if mode is None:
        mode = 'live' if os.getenv('MARKET_DATA_ENABLED', 'false').lower() == 'true' else 'disabled'
    mode = mode.strip().lower()
    if mode not in {'disabled', 'demo', 'live'}:
        raise RuntimeError('MARKET_DATA_MODE must be disabled, demo, or live')
    return mode


@asynccontextmanager
async def lifespan(app: FastAPI):
    global quote_book
    feed_task = None
    mode = resolve_market_mode()
    api_key = os.getenv('API_KEY')
    if mode == 'live' and not api_key:
        raise RuntimeError('API_KEY is required for live market data')
    quote_book = QuoteBook()
    app.state.market_mode = mode
    # Schema initialization happens at startup, never merely by importing the API.
    await asyncio.to_thread(Base.metadata.create_all, bind=engine)
    await database.connect()
    try:
        if mode == 'live':
            feed = MarketFeed(quote_book, broadcast_to_clients, api_key)
            feed_task = asyncio.create_task(feed.run())
        elif mode == 'demo':
            # Seed before accepting requests so demo orders work immediately.
            for quote in demo_quotes(0):
                quote_book.update(quote)
            feed = DemoFeed(quote_book, broadcast_to_clients)
            feed_task = asyncio.create_task(feed.run())
        yield
    finally:
        try:
            if feed_task is not None:
                feed_task.cancel()
                with suppress(asyncio.CancelledError):
                    await feed_task
        finally:
            for client in tuple(connected_clients):
                with suppress(Exception):
                    await client.close(code=1001)
            connected_clients.clear()
            await database.disconnect()
            app.state.market_mode = 'disabled'


app = FastAPI(title='SimTrade API', lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv(
        'CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173'
    ).split(',') if origin.strip()],
    allow_credentials=False,
    allow_methods=['GET', 'POST'],
    allow_headers=['Authorization', 'Content-Type'],
)


async def get_db():
    async with database.transaction():
        yield database


@app.websocket('/ws')
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.add(websocket)
    try:
        for symbol in SUPPORTED_SYMBOLS:
            quote = quote_book.get(symbol, require_fresh=True)
            if quote:
                if getattr(app.state, 'market_mode', 'disabled') == 'demo':
                    quote['source'] = 'demo'
                await websocket.send_json(quote)
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        connected_clients.discard(websocket)


@app.get('/market_status')
async def market_status():
    return {
        'mode': getattr(app.state, 'market_mode', 'disabled'),
        'supported_symbols': list(SUPPORTED_SYMBOLS),
        'ready_symbols': [symbol for symbol in SUPPORTED_SYMBOLS if quote_book.get(symbol, require_fresh=True)],
        'quote_max_age_seconds': quote_book.max_age,
    }


@app.post('/register')
async def register(user: UserCreate, db: Database = Depends(get_db)):
    if await crud.get_user(db, user.username):
        raise HTTPException(status_code=400, detail='Username already registered')
    hashed_password = await asyncio.to_thread(get_password_hash, user.password)
    # A nested transaction also leaves the outer transaction usable on a duplicate race.
    try:
        async with db.transaction():
            await db.execute(User.__table__.insert().values(
                username=user.username, hashed_password=hashed_password,
                balance=STARTING_BALANCE, short_liability=0, networth=STARTING_BALANCE,
            ))
    except Exception as exc:
        # Drivers expose different exception types; only handle the unique-username race.
        if await crud.get_user(db, user.username):
            raise HTTPException(status_code=400, detail='Username already registered') from exc
        raise
    return {'msg': 'User created successfully'}


@app.post('/login', response_model=Token)
async def login(user: UserLogin, db: Database = Depends(get_db)):
    db_user = await crud.get_user(db, user.username)
    if not db_user or not await asyncio.to_thread(verify_password, user.password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail='Invalid credentials', headers={'WWW-Authenticate': 'Bearer'})
    token = create_access_token(
        data={'sub': user.username}, expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {'access_token': token, 'token_type': 'bearer'}


async def require_user(db, username, *, for_update=False):
    record = await crud.get_user(db, username, for_update=for_update)
    if record is None:
        raise HTTPException(status_code=404, detail='User not found')
    return record


async def marked_portfolio(db, user_id):
    """Use the latest known quote; preserve persisted marks when the feed is offline."""
    holdings = []
    for record in await crud.get_portfolio(db, user_id):
        holding = dict(record)
        quote = quote_book.get(record.symbol)
        price = quote['price'] if quote else record.current_price
        if price is None or not math.isfinite(price) or price <= 0:
            price = record.avg_price
        holding['current_price'] = price
        if price != record.current_price:
            await db.execute(Portfolio.__table__.update().where(
                Portfolio.id == record.id
            ).values(current_price=price))
        holdings.append(holding)
    return holdings


@app.get('/user_data', response_model=UserInfo)
async def read_user_data(user: TokenData = Depends(decode_access_token), db: Database = Depends(get_db)):
    record = await require_user(db, user.username, for_update=True)
    holdings = await marked_portfolio(db, record.id)
    values = [Decimal(str(item['quantity'])) * Decimal(str(item['current_price'])) for item in holdings]
    liability = float(sum((value for value in values if value < 0), Decimal(0)).quantize(Decimal('0.01')))
    networth = float((Decimal(str(record.balance)) + sum(values, Decimal(0))).quantize(Decimal('0.01')))
    liability = await crud.update_short_liability(db, record.id, liability)
    networth = await crud.update_networth(db, record.id, networth)
    return UserInfo(id=record.id, username=record.username, balance=record.balance,
                    short_liability=liability, networth=networth)


@app.get('/portfolio')
async def read_portfolio(user: TokenData = Depends(decode_access_token), db: Database = Depends(get_db)):
    record = await require_user(db, user.username, for_update=True)
    return await marked_portfolio(db, record.id)


@app.get('/trades', response_model=TradePagination)
async def read_trades(
    limit: int = Query(10, ge=1, le=100), page: int = Query(1, ge=1),
    user: TokenData = Depends(decode_access_token), db: Database = Depends(get_db),
):
    record = await require_user(db, user.username)
    count = await crud.get_trade_count(db, record.id)
    trades = await crud.get_trades(db, record.id, limit=limit, offset=limit * (page - 1))
    return {'totalPages': math.ceil(count / limit), 'trades': [dict(trade) for trade in trades]}


async def execute_order(trade, user, db, side):
    # PostgreSQL holds this account lock until get_db commits every order write.
    record = await require_user(db, user.username, for_update=True)
    try:
        price = quote_book.execution_price(trade.symbol, side)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='Unsupported symbol') from exc
    except LookupError as exc:
        raise HTTPException(status_code=503, detail='A fresh market quote is unavailable. Try again later.') from exc
    quantity = Decimal(str(trade.quantity))
    with localcontext() as context:
        context.prec = 40
        notional = quantity * Decimal(str(price))
    if notional > MAX_ORDER_VALUE:
        raise HTTPException(status_code=400, detail='Order value exceeds the simulation limit')
    held = Decimal(str(await crud.get_total_quantity_by_symbol(db, record.id, trade.symbol)))
    signed_quantity = quantity if side == 'BUY' else -quantity
    reducing_position = held * signed_quantity < 0 and quantity <= abs(held)
    if notional < Decimal('0.01') and not reducing_position:
        raise HTTPException(status_code=400, detail='Order value must be at least $0.01')
    new_quantity = held + signed_quantity
    if abs(new_quantity) > MAX_QUANTITY:
        raise HTTPException(status_code=400, detail='Position quantity exceeds the simulation limit')
    # Conservative cent settlement cannot manufacture cash by splitting fills.
    try:
        total = notional.quantize(Decimal('0.01'), rounding=ROUND_CEILING if side == 'BUY' else ROUND_FLOOR)
    except InvalidOperation as exc:
        raise HTTPException(status_code=400, detail='Order value is too large') from exc
    balance = Decimal(str(record.balance))
    if side == 'BUY' and balance < total:
        raise HTTPException(status_code=400, detail='Insufficient balance')
    balance += -total if side == 'BUY' else total
    if not math.isfinite(float(balance)) or abs(balance) > MAX_CASH_BALANCE:
        raise HTTPException(status_code=400, detail='Order value is too large')
    await crud.update_balance(db, record.id, float(balance))
    await crud.create_trade(db, record.id, trade.symbol,
                            trade.quantity if side == 'BUY' else -trade.quantity,
                            price, 'LONG' if side == 'BUY' else 'SHORT')
    return {'msg': 'Trade created successfully'}


@app.post('/BUY')
async def buy_shares(trade: TradeCreate, user: TokenData = Depends(decode_access_token), db: Database = Depends(get_db)):
    return await execute_order(trade, user, db, 'BUY')


@app.post('/SELL')
async def sell_shares(trade: TradeCreate, user: TokenData = Depends(decode_access_token), db: Database = Depends(get_db)):
    return await execute_order(trade, user, db, 'SELL')
