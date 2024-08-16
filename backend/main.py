import os
import json
import asyncio
from fastapi import FastAPI, WebSocket, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import websockets
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import timedelta
from databases import Database

from security import get_password_hash, verify_password, create_access_token, decode_access_token, Token, TokenData, ACCESS_TOKEN_EXPIRE_MINUTES
from models import User
from database import Base, engine, database, Base
import crud


load_dotenv("api.env")
API_KEY = os.getenv("API_KEY")
WEB_SOCKET_URL = f"wss://ws.twelvedata.com/v1/quotes/price?apikey={API_KEY}"

current_price = 0
instrument_list = ["AAPL","INFY", "QQQ","IXIC","TRP","EUR/USD","USD/JPY","ETH/BTC", "BTC/USD"]
current_instrument = 8
new_instrument = current_instrument
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

class UserCreate(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

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
                    "symbols": instrument_list[current_instrument]
                }
                
            }
            await ws.send(json.dumps(subscribe_message))
            
            while True:
                # Check if the instrument has changed
                if new_instrument != current_instrument:
                    unsubscribe_message = {
                        "action": "unsubscribe",
                        "params": {
                            "symbols": instrument_list[current_instrument]
                        }
                    }
                    await ws.send(json.dumps(unsubscribe_message))
                    current_instrument = new_instrument
                    subscribe_message = {
                        "action": "subscribe",
                        "params": {
                            "symbols": instrument_list[current_instrument]
                        }
                    }
                    await ws.send(json.dumps(subscribe_message))
                    current_instrument = new_instrument
                try:
                    try:
                        response =await asyncio.wait_for(ws.recv(), timeout=3.0)
                        data = json.loads(response)
                        current_price = data.get("price")
                        print(data)
                    except asyncio.TimeoutError:
                        print("Timeout")
                        continue
                    await broadcast_to_clients(data)
                    
                except Exception as e:
                    print(f"Error receiving data: {e}")
                    break
    except Exception as e:
        print(e)


async def broadcast_to_clients(data):
    if not connected_clients:
        print("No clients connected")
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

@app.get("/change_instrument/{instrument_id}")
async def change_instrument(instrument_id: int):
    global new_instrument
    new_instrument = instrument_id


#User API
@app.post("/register")
async def register(user: UserCreate, db: Database = Depends(get_db)):
    query = User.__table__.select().where(User.username == user.username)
    existing_user = await db.fetch_one(query)
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")

    hashed_password = get_password_hash(user.password)
    query = User.__table__.insert().values(username=user.username, hashed_password=hashed_password)
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

@app.get("/users/me", response_model=UserCreate)
async def read_users_me(token: TokenData = Depends(decode_access_token), db: Database = Depends(get_db)):
    query = User.__table__.select().where(User.username == token.username)
    user = await db.fetch_one(query)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserCreate(username=user["username"], password=user["hashed_password"])

@app.get("/trading_records/{username}")
async def trading_records(username: str):
    return {"username": username, "trading_records": []}