import asyncio
import websockets
import json

async def test_multi_chat():
    uri = "ws://127.0.0.1:8000/ws/chat/test_session_multi?user_id=testuser"
    print(f"Connecting to {uri}...")
    async with websockets.connect(uri) as ws:
        print("Connected successfully!")
        
        prompts = [
            "Count from 1 to 5.",
            "What is 15 + 27?",
            "Say Goodbye!"
        ]

        for i, prompt in enumerate(prompts, 1):
            print(f"\n--- Request {i}: '{prompt}' ---")
            await ws.send(json.dumps({"type": "ping"}))
            ping_res = await ws.recv()
            print("Heartbeat:", ping_res)

            await ws.send(json.dumps({"prompt": prompt}))

            full_reply = ""
            while True:
                msg = await ws.recv()
                data = json.loads(msg)
                if "chunk" in data:
                    print(data["chunk"], end="", flush=True)
                    full_reply += data["chunk"]
                elif "end" in data:
                    print("\n[Stream completed]")
                    break
                elif "error" in data:
                    print("\n[Error]:", data["error"])
                    break
        
        print("\nAll multi-turn requests completed on single connection without dropping!")

if __name__ == "__main__":
    asyncio.run(test_multi_chat())
