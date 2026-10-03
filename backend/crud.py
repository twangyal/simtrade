from databases import Database
from models import User, Trade, Portfolio
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import func, select

async def get_user(db: Database, username: str, *, for_update: bool = False):
    query = User.__table__.select().where(User.username == username)
    if for_update:
        query = query.with_for_update()
    existing_user = await db.fetch_one(query)
    return existing_user

async def get_balance(db: Database, username: str):
    user = await get_user(db, username=username)
    if user:
        return user.balance
    return None

async def get_short_liability(db: Database, username: str):
    user = await get_user(db, username=username)
    if user:
        return user.short_liability
    return None

async def get_portfolio(db: Database, user_id: int):
    query = Portfolio.__table__.select().where(Portfolio.user_id == user_id)
    portfolio = await db.fetch_all(query)
    return portfolio

async def get_total_quantity_by_symbol(db: Database, user_id: int, symbol: str):
    query = Portfolio.__table__.select().where(Portfolio.user_id == user_id, Portfolio.symbol == symbol)
    position = await db.fetch_one(query)
    if position:
        return position.quantity
    return 0

async def get_trades(db: Database, user_id: int, *, limit: int | None = None, offset: int = 0):
    query = (
        Trade.__table__.select()
        .where(Trade.user_id == user_id)
        .order_by(Trade.timestamp.desc(), Trade.id.desc())
        .offset(offset)
    )
    if limit is not None:
        query = query.limit(limit)
    trades = await db.fetch_all(query)
    return trades

async def get_trade_count(db: Database, user_id: int):
    query = select(func.count()).select_from(Trade.__table__).where(Trade.user_id == user_id)
    return await db.fetch_val(query)

async def update_balance(db: Database, user_id: int, new_balance: float):
    new_balance = round(new_balance, 2)
    query = User.__table__.update().where(User.id == user_id).values(balance=new_balance)
    await db.execute(query)
    return new_balance

async def update_short_liability(db: Database, user_id: int, new_liability: float):
    new_liability = round(new_liability, 2)
    query = User.__table__.update().where(User.id == user_id).values(short_liability=new_liability)
    await db.execute(query)
    return new_liability

async def update_networth(db: Database, user_id: int, new_networth: float):
    new_networth = round(new_networth, 2)
    query = User.__table__.update().where(User.id == user_id).values(networth=new_networth)
    await db.execute(query)
    return new_networth

async def create_trade(db: Database, user_id: int, symbol: str, quantity: float, price: float, trade_type: str):
    trade = Trade(
        user_id=user_id,
        symbol=symbol,
        quantity=quantity,
        price=price,
        trade_type=trade_type,
        timestamp=datetime.now(timezone.utc).replace(tzinfo=None)
    )
    query = Trade.__table__.insert().values(
        user_id=trade.user_id,
        symbol=trade.symbol,
        quantity=trade.quantity,
        price=trade.price,
        trade_type=trade.trade_type,
        timestamp=trade.timestamp
    )
    await add_to_portfolio(db, user_id, symbol, quantity, price)
    await db.execute(query)
    return trade

async def add_to_portfolio(db: Database, user_id: int, symbol: str, quantity: float, price: float):
    """Apply a signed fill inside the caller's transaction and user row lock."""
    query = Portfolio.__table__.select().where(Portfolio.user_id == user_id, Portfolio.symbol == symbol)
    existing_position = await db.fetch_one(query)
    if existing_position:
        old_quantity = existing_position.quantity
        # Add the API's decimal quantities before converting to Float storage.
        # This closes 0.1 + 0.2 - 0.3 without using a tolerance that could erase
        # a real remaining holding when large positions nearly offset.
        new_quantity = float(Decimal(str(old_quantity)) + Decimal(str(quantity)))
        opposing_fill = (old_quantity > 0 > quantity) or (old_quantity < 0 < quantity)
        if new_quantity == 0:
            query = Portfolio.__table__.delete().where(Portfolio.user_id == user_id, Portfolio.symbol == symbol)
        else:
            if old_quantity == 0 or (new_quantity > 0) != (old_quantity > 0):
                # The old holding is fully closed; the remainder opens at this fill.
                new_avg_price = price
            elif opposing_fill:
                # Selling part of a long or covering part of a short keeps its basis.
                new_avg_price = existing_position.avg_price
            else:
                new_avg_price = float(
                    (
                        Decimal(str(abs(old_quantity))) * Decimal(str(existing_position.avg_price))
                        + Decimal(str(abs(quantity))) * Decimal(str(price))
                    ) / Decimal(str(abs(new_quantity)))
                )
            query = Portfolio.__table__.update().where(Portfolio.user_id == user_id, Portfolio.symbol == symbol).values(
                quantity=new_quantity,
                avg_price=new_avg_price,
                current_price=price,
            )
        await db.execute(query)
    else:
        query = Portfolio.__table__.insert().values(
            user_id=user_id,
            symbol=symbol,
            quantity=quantity,
            avg_price=price,
            current_price=price,
        )
        await db.execute(query)
    return {"msg": "Position updated successfully"}

async def update_prices(db: Database, symbol: str, new_price: float):
    query = Portfolio.__table__.update().where(Portfolio.symbol == symbol).values(current_price=new_price)
    await db.execute(query)
    return {"msg": "Price updated successfully"}
