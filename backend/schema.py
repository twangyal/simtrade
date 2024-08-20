from pydantic import BaseModel

class UserCreate(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str


class BalanceResponse(BaseModel):
    current_balance: float

class Trade(BaseModel):
    symbol: str
    quantity: float