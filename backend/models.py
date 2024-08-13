from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    balance = Column(Float, default=10000.0)
    hashed_password = Column(String)
    trading_records = relationship("TradingRecord", back_populates="owner")
    def __repr__(self):
        return f"<User(id={self.id}, name='{self.username}', age={self.balance})>"

class TradingRecord(Base):
    __tablename__ = "trading_records"
    id = Column(Integer, primary_key=True, index=True)
    action = Column(String)
    number_of_shares = Column(Integer)
    price = Column(Float)
    user_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="trading_records")