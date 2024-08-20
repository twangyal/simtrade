from databases import Database
from models import User, Trade, Portfolio
from datetime import datetime

async def get_user(db: Database, username: str):
    query = User.__table__.select().where(User.username == username)
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

async def update_balance(db: Database, user_id: int, new_balance: float):
    query = User.__table__.update().where(User.id == user_id).values(balance=new_balance)
    await db.execute(query)
    return new_balance

async def update_short_liability(db: Database, user_id: int, new_liability: float):
    query = User.__table__.update().where(User.id == user_id).values(short_liability=new_liability)
    await db.execute(query)
    return new_liability

async def create_trade(db: Database, user_id: int, symbol: str, quantity: float, price: float, trade_type: str):
    trade = Trade(
        user_id=user_id,
        symbol=symbol,
        quantity=quantity,
        price=price,
        trade_type=trade_type,
        timestamp=datetime.utcnow()
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
    query = Portfolio.__table__.select().where(Portfolio.user_id == user_id, Portfolio.symbol == symbol)
    existing_position = await db.fetch_one(query)
    if existing_position:
        new_quantity = existing_position.quantity + quantity
        if new_quantity == 0:
            query = Portfolio.__table__.delete().where(Portfolio.user_id == user_id, Portfolio.symbol == symbol)
        else:
            new_avg_price = (abs(existing_position.quantity) * existing_position.avg_price + abs(quantity) * price) / abs(new_quantity)
            query = Portfolio.__table__.update().where(Portfolio.user_id == user_id, Portfolio.symbol == symbol).values(
                quantity=new_quantity,
                avg_price=new_avg_price
            )
        await db.execute(query)
    else:
        query = Portfolio.__table__.insert().values(
            user_id=user_id,
            symbol=symbol,
            quantity=quantity,
            avg_price=price
        )
        await db.execute(query)
    return {"msg": "Position updated successfully"}

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