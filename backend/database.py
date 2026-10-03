"""Database configuration shared by the API and SQLAlchemy models."""
import os
from pathlib import Path

from databases import Database
from dotenv import load_dotenv
from sqlalchemy import MetaData, create_engine
from sqlalchemy.orm import declarative_base

load_dotenv(Path(__file__).with_name('api.env'), override=False)
DATABASE_URL = os.getenv('SQLALCHEMY_DATABASE_URI')
if not DATABASE_URL:
    raise RuntimeError('SQLALCHEMY_DATABASE_URI must be configured')

database = Database(DATABASE_URL)
engine = create_engine(DATABASE_URL)
metadata = MetaData()
Base = declarative_base(metadata=metadata)
