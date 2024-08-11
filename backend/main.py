import os
import json
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
import websockets
from contextlib import asynccontextmanager

load_dotenv("api.env")
app = FastAPI()
API_KEY = os.getenv("API_KEY")
WEB_SOCKET_URL = f"wss://ws.twelvedata.com/v1/quotes/price?apikey={API_KEY}"

current_price = 0
current_instrument = ""
connected_clients = []


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(receive_data_from_api())


async def receive_data_from_api():
    try:
        # Connect to the WebSocket API
        async with websockets.connect(WEB_SOCKET_URL) as ws:
            # Send subscription message
            subscribe_message = {
                "action": "subscribe",
                "params": {
                    "symbols": "BTC/USD"
                }
            }
            await ws.send(json.dumps(subscribe_message))
            
            while True:
                try:
                    response = await ws.recv()
                    data = json.loads(response)
                    print(data)
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