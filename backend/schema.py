from datetime import datetime, timezone
from decimal import Decimal
from limits import MAX_QUANTITY, QUANTITY_DECIMAL_PLACES
from pydantic import BaseModel, Field, field_validator


class UserLogin(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=72)

    @field_validator('username')
    @classmethod
    def username_not_blank(cls, value):
        if not value.strip():
            raise ValueError('Username must not be blank')
        return value

    @field_validator('password')
    @classmethod
    def password_within_bcrypt_limit(cls, value):
        if len(value.encode('utf-8')) > 72:
            raise ValueError('Password must be at most 72 UTF-8 bytes')
        return value


class UserCreate(UserLogin):
    pass


class UserInfo(BaseModel):
    id: int
    username: str
    balance: float
    short_liability: float
    networth: float
    valuation_estimated: bool = False


class TradeCreate(BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    quantity: float = Field(gt=0, le=MAX_QUANTITY, allow_inf_nan=False)

    @field_validator('quantity')
    @classmethod
    def supported_quantity_precision(cls, value):
        if Decimal(str(value)).normalize().as_tuple().exponent < -QUANTITY_DECIMAL_PLACES:
            raise ValueError(f'Quantity supports at most {QUANTITY_DECIMAL_PLACES} decimal places')
        return value


class Trade(BaseModel):
    id: int
    symbol: str
    quantity: float
    price: float
    trade_type: str
    timestamp: datetime

    @field_validator('timestamp')
    @classmethod
    def normalize_timestamp_utc(cls, value):
        # Existing database rows store naive UTC, regardless of server timezone.
        if value.utcoffset() is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class TradePagination(BaseModel):
    totalPages: int
    trades: list[Trade]
