import os
import json
import asyncio
from fastapi import FastAPI, WebSocket, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import websockets
from contextlib import asynccontextmanager
import math
from typing import List

from datetime import timedelta
from databases import Database

from security import get_password_hash, verify_password, create_access_token, decode_access_token, Token, TokenData, ACCESS_TOKEN_EXPIRE_MINUTES
from models import User
from database import Base, engine, database, Base
from schema import UserCreate, UserLogin, BalanceResponse, TradeCreate, Trade, TradePagination, UserInfo
import crud


load_dotenv("api.env")
API_KEY = os.getenv("API_KEY")
WEB_SOCKET_URL = f"wss://ws.twelvedata.com/v1/quotes/price?apikey={API_KEY}"

instrument_list = {"AAPL":[0],"INFY":[0], "QQQ":[0],"IXIC":[0],"TRP":[0],"EUR/USD":[0],"USD/JPY":[0], "BTC/USD":[0]}
connected_clients = []


# On startup, connect to the WebSocket API
@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(receive_data_from_api())
    await database.connect()
    yield
    print("Shutting down")
    await database.disconnect()


# Create a FastAPI instance
app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)
Base.metadata.create_all(bind=engine)


# Dependency to get a database connection
async def get_db():
    async with database.transaction():
        yield database


# Method to receive data from the WebSocket API
async def receive_data_from_api():
    global current_instrument
    global current_price
    try:
        # Connect to the WebSocket API
        async with websockets.connect(WEB_SOCKET_URL) as ws:
            subscribe_message = {
                "action": "subscribe",
                "params": {
                    "symbols": "AAPL,INFY,TRP,QQQ,IXIC,EUR/USD,USD/JPY,BTC/USD"
                }           
            }
            await ws.send(json.dumps(subscribe_message))
            
            while True:
                try:
                    try:
                        response =await asyncio.wait_for(ws.recv(), timeout=0.2)
                        data = json.loads(response)
                        current_price = data.get("price")
                        for key in instrument_list:
                            if key == data.get("symbol"):
                                    if data.get("ask"):
                                        instrument_list[key] = [data.get("price"), data.get("ask"), data.get("bid")]
                                    else:
                                        instrument_list[key] = [current_price]
                        await broadcast_to_clients(data)
                    except asyncio.TimeoutError:
                        for key in instrument_list:
                            if len(instrument_list[key]) == 1:
                                await broadcast_to_clients({"symbol": key, "price": instrument_list[key]})
                            else:
                                await broadcast_to_clients({"symbol": key, "price": instrument_list[key][0], "ask": instrument_list[key][1], "bid": instrument_list[key][2]})
                        continue
                except Exception as e:
                    print(f"Error receiving data: {e}")
                    break
    except Exception as e:
        print(e)


async def broadcast_to_clients(data):
    if not connected_clients:
        return
    for client in connected_clients:
        try:
            await client.send_json(data)
        except Exception as e:
            print(f"Error sending data to client: {e}")
            connected_clients.remove(client)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.append(websocket)
    print("Client connected")
    print(connected_clients.__len__())
    try:
        while True:
            await websocket.receive_text()  # Keep the connection alive
    except Exception as e:
        print(f"Client disconnected: {e}")
    finally:
        connected_clients.remove(websocket)


#User API
@app.post("/register")
async def register(user: UserCreate, db: Database = Depends(get_db)):
    query = User.__table__.select().where(User.username == user.username)
    existing_user = await db.fetch_one(query)
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")

    hashed_password = get_password_hash(user.password)
    query = User.__table__.insert().values(username=user.username, hashed_password=hashed_password, balance=100000.0, short_liability=0.0)
    await db.execute(query)
    return {"msg": "User created successfully"}


@app.post("/login", response_model=Token)
async def login(user: UserLogin, db: Database = Depends(get_db)):
    query = User.__table__.select().where(User.username == user.username)
    db_user = await db.fetch_one(query)
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(data={"sub": user.username}, expires_delta=access_token_expires)
    return {"access_token": access_token, "token_type": "bearer"}


@app.get('/user_data', response_model=UserInfo)
async def read_user_data(user: TokenData = Depends(decode_access_token), db: Database = Depends(get_db)):
    await get_current_prices(db)
    user_record = await crud.get_user(db, user.username)
    await crud.update_short_liability(db, user_record.id, await get_new_short_liability(db, user_record.id))
    await crud.update_networth(db, user_record.id, await get_new_networth(db, user_record.username, user_record.id))
    if not user_record:
        raise HTTPException(status_code=404, detail="User not found")
    return UserInfo(**user_record)


async def get_new_short_liability(db: Database, id: int):
    new_short_liability = 0 
    for item in await crud.get_portfolio(db, id):
        if item.quantity < 0:
            price = instrument_list[item.symbol][0]
            new_short_liability += item.quantity*price
    return new_short_liability


async def get_new_networth(db: Database, username: str, id: int):
    balance = await crud.get_balance(db, username)
    short_liability = await crud.get_short_liability(db, username)
    for item in await crud.get_portfolio(db, id):
        if(item.quantity > 0):
            item.current_price = instrument_list[item.symbol][0]
            balance += item.quantity*item.current_price
            print(balance)
    return balance + short_liability


@app.get("/portfolio")
async def read_portfolio(user: TokenData = Depends(decode_access_token), db: Database = Depends(get_db)):
    await get_current_prices(db)
    user_record = await crud.get_user(db, user.username)
    if not user_record:
        raise HTTPException(status_code=404, detail="User not found")
    user_id = user_record.id
    portfolio = await crud.get_portfolio(db, user_id)
    return portfolio


async def get_current_prices(db: Database):
    for key in instrument_list:
        price = instrument_list[key][0]
        await crud.update_prices(db, key, price)
    


@app.get("/trades",response_model=TradePagination)
async def read_trades(limit: int, page: int, user: TokenData = Depends(decode_access_token), db: Database = Depends(get_db)):
    user_record = await crud.get_user(db, user.username)
    if not user_record:
        raise HTTPException(status_code=404, detail="User not found")
    user_id = user_record.id
    trades = await crud.get_trades(db, user_id)
    trades.reverse()
    return {
        "totalPages": math.ceil(len(trades)/10),
        "trades": trades[limit*(page-1):limit*page]
    }    


@app.post("/BUY")
async def buy_shares(trade: TradeCreate, user: TokenData = Depends(decode_access_token), db: Database = Depends(get_db)):
    user_record = await crud.get_user(db, user.username)
    if not user_record:
        raise HTTPException(status_code=404, detail="User not found")
    user_id = user_record.id
    if(trade.quantity <= 0):
        raise HTTPException(status_code=400, detail="Invalid quantity")
    
    if len(instrument_list[trade.symbol]) == 3:
        price = instrument_list[trade.symbol][1]
    else:
        price = instrument_list[trade.symbol][0]
    if(await crud.get_balance(db, user.username) < trade.quantity*price):
        raise HTTPException(status_code=400, detail="Insufficient balance")
    
    # Update the user's balance and create a trade record
    await crud.update_balance(db, user_id, await crud.get_balance(db, user.username) - trade.quantity*price)
    await crud.create_trade(db, user_id, trade.symbol, trade.quantity, price, "LONG")
    return {"msg": "Trade created successfully"}


@app.post("/SELL")
async def sell_shares(trade: TradeCreate, user: TokenData = Depends(decode_access_token), db: Database = Depends(get_db)):
    user_data = await crud.get_user(db, user.username)
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")
    user_id = user_data.id
    if trade.quantity <= 0:
        raise HTTPException(status_code=400, detail="Invalid quantity")
    
    if len(instrument_list[trade.symbol]) == 3:
        price = instrument_list[trade.symbol][2]
    else:
        price = instrument_list[trade.symbol][0]
        
    # Update the user's balance and create a trade record
    await crud.update_balance(db, user_id, await crud.get_balance(db, user.username) + trade.quantity * price)
    await crud.create_trade(db, user_id, trade.symbol, -trade.quantity, price, "SHORT")
    return {"msg": "Trade created successfully"}