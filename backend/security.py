from datetime import datetime, timedelta, timezone
import math
import os
from pathlib import Path
import re
from typing import Optional

from dotenv import load_dotenv
from fastapi import HTTPException, Header
import jwt
from pydantic import BaseModel
from passlib.context import CryptContext

load_dotenv(Path(__file__).with_name("api.env"), override=False)
SECRET_KEY = os.getenv("SECRET_KEY")
if SECRET_KEY is None or len(SECRET_KEY.strip().encode("utf-8")) < 32:
    raise RuntimeError("SECRET_KEY must be explicitly configured with at least 32 bytes of random data")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
BEARER_HEADER = re.compile(
    r"Bearer +([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)",
    flags=re.IGNORECASE | re.ASCII,
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: str


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta is None:
        expires_delta = timedelta(minutes=15)
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(authorization: Optional[str] = Header(None)) -> TokenData:
    credentials_error = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    match = BEARER_HEADER.fullmatch(authorization) if isinstance(authorization, str) else None
    if match is None:
        raise credentials_error

    try:
        payload = jwt.decode(
            match.group(1),
            SECRET_KEY,
            algorithms=[ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
        username = payload["sub"]
        expiration = payload["exp"]
        if not isinstance(username, str) or not username.strip():
            raise jwt.InvalidTokenError("Invalid subject")
        if (
            isinstance(expiration, bool)
            or not isinstance(expiration, (int, float))
            or not math.isfinite(expiration)
        ):
            raise jwt.InvalidTokenError("Invalid expiration")
        return TokenData(username=username)
    except (jwt.InvalidTokenError, TypeError, ValueError, OverflowError, RecursionError):
        # Invalid dates and excessive JSON nesting also raise built-in exceptions.
        raise credentials_error from None
