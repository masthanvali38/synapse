import asyncio
import websockets
import json

async def test_chat():
    uri = "ws://localhost:8000/ws/chat/test_session"
    async with websockets.connect(uri) as websocket:
        # Send a prompt
        prompt = "Hello, confirm you are working."
        await websocket.send(json.dumps({"prompt": prompt}))
        print(f"Sent: {prompt}")
        
        # Receive response
        response = await websocket.recv()
        data = json.loads(response)
        if "response" in data:
            print(f"Received AI Response: {data['response']}")
        elif "error" in data:
            print(f"Received Error: {data['error']}")
        else:
            print(f"Received Unknown Data: {data}")

if __name__ == "__main__":
    asyncio.run(test_chat())
