from databases import Database
from models import User, Trade
from database import Base, engine, database, Base

async def get_user(db: Database, username: str):
    query = User.__table__.select().where(User.username == username)
    existing_user = await db.fetch_one(query)
    return existing_user

async def get_balance(db: Database, username: str):
    user = await get_user(db, username=username)
    if user:
        return user.balance
    return None