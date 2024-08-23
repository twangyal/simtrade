from pydantic import BaseModel
from typing import List
from datetime import datetime

class UserCreate(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class UserInfo(BaseModel):
    id: int
    username: str
    balance: float
    short_liability: float
    networth: float

class BalanceResponse(BaseModel):
    current_balance: float

class TradeCreate(BaseModel):
    symbol: str
    quantity: float

class Trade(BaseModel):
    id: int
    symbol: str
    quantity: float
    price: float
    trade_type: str
    timestamp: datetime

class TradePagination(BaseModel):
    totalPages: int
    trades: List[Trade]