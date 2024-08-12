import os
import json
import asyncio
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import websockets
import requests
from contextlib import asynccontextmanager

load_dotenv("api.env")
API_KEY = os.getenv("API_KEY")
WEB_SOCKET_URL = f"wss://ws.twelvedata.com/v1/quotes/price?apikey={API_KEY}"

current_price = 0
instrument_list = ["AAPL","INFY", "QQQ","IXIC","TRP","EUR/USD","USD/JPY","ETH/BTC", "BTC/USD"]
current_instrument = 8
new_instrument = current_instrument
connected_clients = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(receive_data_from_api())
    yield
    print("Shutting down")


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)


async def receive_data_from_api():
    global current_instrument
    try:
        # Connect to the WebSocket API
        async with websockets.connect(WEB_SOCKET_URL) as ws:
            # Send subscription message
            subscribe_message = {
                "action": "subscribe",
                "params": {
                    "symbols": instrument_list[current_instrument]
                }
                
            }
            await ws.send(json.dumps(subscribe_message))
            
            while True:
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