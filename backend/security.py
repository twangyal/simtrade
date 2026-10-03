from datetime import datetime, timedelta, timezone
import math
import os
from pathlib import Path
import re
from typing import Optional

import bcrypt
from dotenv import load_dotenv
from fastapi import HTTPException, Header
import jwt
from pydantic import BaseModel

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
BCRYPT_HASH = re.compile(r"\$2[aby]\$(?:0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}")

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: str


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not isinstance(plain_password, str) or not isinstance(hashed_password, str):
        return False
    if BCRYPT_HASH.fullmatch(hashed_password) is None:
        return False
    try:
        password = plain_password.encode("utf-8")
        if len(password) > 72:
            return False
        return bcrypt.checkpw(password, hashed_password.encode("ascii"))
    except (ValueError, TypeError, UnicodeError):
        return False

def get_password_hash(password: str) -> str:
    encoded = password.encode("utf-8")
    if len(encoded) > 72:
        raise ValueError("Password must be at most 72 UTF-8 bytes")
    return bcrypt.hashpw(encoded, bcrypt.gensalt(rounds=12)).decode("ascii")


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
