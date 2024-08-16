# database.py
from sqlalchemy import create_engine, MetaData
from sqlalchemy.ext.declarative import declarative_base
from databases import Database
import os
from dotenv import load_dotenv

load_dotenv("api.env")  # Load environment variables from .env file

DATABASE_URL = os.getenv("SQLALCHEMY_DATABASE_URI")

# Create the Database instance for async operations
database = Database(DATABASE_URL)

# Create SQLAlchemy engine and metadata
engine = create_engine(DATABASE_URL)
metadata = MetaData()
Base = declarative_base(metadata=metadata)

