from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime, timezone

STARTING_BALANCE = 100000.0


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    balance = Column(Float, default=STARTING_BALANCE)
    short_liability = Column(Float, default=0.0)
    networth = Column(Float, default=STARTING_BALANCE)
    hashed_password = Column(String)
    trades = relationship("Trade", back_populates="user", cascade="all, delete-orphan")
    portfolio = relationship("Portfolio", back_populates="user", cascade="all, delete-orphan")



class Trade(Base):
    __tablename__ = 'trades'

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'))
    symbol = Column(String)
    quantity = Column(Float)  # Negative for sell/short trades
    price = Column(Float)
    trade_type = Column(String)  # "BUY", "SELL", "SELL (SHORT)", "COVER"
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    user = relationship("User", back_populates="trades")

class Portfolio(Base):
    __tablename__ = 'portfolios'

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'))
    symbol = Column(String)
    quantity = Column(Float)  # Positive for long positions, negative for short positions
    avg_price = Column(Float)  # Average price paid for the current position
    current_price = Column(Float)  # Current price of the stock

    user = relationship("User", back_populates="portfolio")



