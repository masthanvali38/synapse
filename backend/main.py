from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from google import genai
import os
import json
import traceback
import re
import io
import asyncio
import threading
import time
from PIL import Image
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

# Load API keys from environment variables (set these before running)
# e.g.  set GEMINI_API_KEY=your_key_here   (Windows)
#       export GEMINI_API_KEY=your_key_here (Linux/Mac)
API_KEY_REAL = os.environ.get("GEMINI_API_KEY", "")
API_KEY_ALT  = os.environ.get("GEMINI_API_KEY_ALT", "")

# Global Variables
client = None
USE_MOCK = False
MODEL_ID = "gemini-2.0-flash"
FALLBACK_MODELS = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.5-flash", "gemini-1.5-pro"]
active_chats = {}

class MockResponse:
    def __init__(self, text):
        self.text = text

class MockChat:
    def __init__(self, history=None):
        self.history = history or []
    def send_message(self, prompt):
        return MockResponse(f"MOCK MODE: I received your prompt: '{prompt}'. (Note: The real Gemini API is currently unreachable in this environment)")
    def get_history(self):
        return []

class MockClient:
    class MockChats:
        def create(self, model, history=None):
            return MockChat(history)
    def __init__(self):
        self.chats = self.MockChats()

def init_client_task():
    global client, USE_MOCK
    def try_init(api_key):
        try:
            print(f"Background: Initializing GenAI Client with key: {api_key[:10]}...")
            # We initialize but don't call anything to avoid startup hangs
            return genai.Client(api_key=api_key)
        except Exception as e:
            print(f"Background: Failed with key {api_key[:10]}: {e}")
            return None

    c = try_init(API_KEY_REAL)
    if not c:
        c = try_init(API_KEY_ALT)
    
    if c:
        client = c
        print("Background: GenAI Client initialized successfully.")
    else:
        print("Background: Falling back to MOCK MODE.")
        client = MockClient()
        USE_MOCK = True

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start AI initialization in background
    threading.Thread(target=init_client_task, daemon=True).start()
    yield

# Initialize FastAPI application
app = FastAPI(title="Synapse Backend", version="1.0.0", lifespan=lifespan)

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Persistence File
SESSIONS_FILE = "sessions_data.json"

def load_all_sessions():
    if os.path.exists(SESSIONS_FILE):
        try:
            with open(SESSIONS_FILE, "r") as f:
                data = json.load(f)
                if data and not isinstance(next(iter(data.values()), None), dict):
                    return {"guest": data}
                return data
        except Exception as e:
            print(f"Error loading sessions: {e}")
            return {}
    return {}

def save_session_data(user_id, session_id, history):
    all_data = load_all_sessions()
    if user_id not in all_data:
        all_data[user_id] = {}
    all_data[user_id][session_id] = history
    try:
        with open(SESSIONS_FILE, "w") as f:
            json.dump(all_data, f)
    except Exception as e:
        print(f"Error saving session data: {e}")

@app.post("/api/convert")
async def convert_file(file: UploadFile = File(...), target_format: str = Form(...)):
    try:
        content = await file.read()
        img = Image.open(io.BytesIO(content))
        output = io.BytesIO()
        target_format = target_format.lower()
        if target_format in ("jpg", "jpeg"):
            if img.mode in ("RGBA", "P"): img = img.convert("RGB")
            img.save(output, format="JPEG", quality=95)
            media_type = "image/jpeg"
        elif target_format == "png":
            img.save(output, format="PNG")
            media_type = "image/png"
        elif target_format == "webp":
            img.save(output, format="WEBP")
            media_type = "image/webp"
        elif target_format == "pdf":
            if img.mode in ("RGBA", "P"): img = img.convert("RGB")
            img.save(output, format="PDF")
            media_type = "application/pdf"
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported: {target_format}")
        output.seek(0)
        return StreamingResponse(output, media_type=media_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "ok", "mock_mode": USE_MOCK, "ai_ready": client is not None}

@app.post("/auth/login")
async def login(request: dict):
    email = request.get("email", "").lower().strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email")
    return {"user_id": email, "email": email, "name": email.split("@")[0].capitalize()}

@app.websocket("/ws/chat/{session_id}")
async def websocket_chat(websocket: WebSocket, session_id: str, user_id: str = "guest"):
    await websocket.accept()
    print(f"WebSocket connected: {session_id} for user {user_id}")
    
    # Wait until client is ready
    start_time = asyncio.get_event_loop().time()
    while client is None and asyncio.get_event_loop().time() - start_time < 45:
        await asyncio.sleep(0.5)

    if client is None:
        await websocket.send_json({"error": "AI service initialization timeout."})
        await websocket.close()
        return

    all_stored = load_all_sessions()
    history = all_stored.get(user_id, {}).get(session_id, [])

    if session_id not in active_chats:
        try:
            active_chats[session_id] = client.chats.create(model=MODEL_ID, history=history)
        except Exception as e:
            print(f"History load fallback for {session_id}: {e}")
            active_chats[session_id] = client.chats.create(model=MODEL_ID)
    
    chat = active_chats[session_id]
    loop = asyncio.get_running_loop()
    
    try:
        while True:
            data = await websocket.receive_text()
            try:
                parsed = json.loads(data)
                if parsed.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                    continue
                prompt = parsed.get("prompt", "")
            except Exception:
                prompt = data
            
            if not prompt:
                continue

            stream_queue = asyncio.Queue()

            def run_stream_in_thread(chat_obj, user_prompt):
                try:
                    if USE_MOCK:
                        res = chat_obj.send_message(user_prompt)
                        loop.call_soon_threadsafe(stream_queue.put_nowait, {"chunk": res.text})
                        loop.call_soon_threadsafe(stream_queue.put_nowait, {"end": True})
                        return

                    success = False
                    last_error = None

                    # Primary attempt: Stream using active chat session with retries for transient 503/429
                    for attempt in range(3):
                        try:
                            response = chat_obj.send_message_stream(user_prompt)
                            for chunk in response:
                                if chunk and getattr(chunk, "text", None):
                                    loop.call_soon_threadsafe(stream_queue.put_nowait, {"chunk": chunk.text})
                            success = True
                            break
                        except Exception as e:
                            err_str = str(e)
                            last_error = err_str
                            if any(k in err_str for k in ["503", "UNAVAILABLE", "429", "demand", "RESOURCE_EXHAUSTED"]):
                                print(f"Gemini API 503/429 demand spike (attempt {attempt+1}/3), retrying in 1.5s...")
                                time.sleep(1.5)
                            else:
                                print(f"Chat stream error: {e}")
                                break

                    # Secondary attempt: If primary model hit 503/UNAVAILABLE, generate content using fallback models
                    if not success and client is not None:
                        print("Primary model chat unavailable. Attempting fallback models...")
                        for fallback_model in FALLBACK_MODELS:
                            try:
                                print(f"Trying fallback model: {fallback_model}...")
                                response = client.models.generate_content_stream(model=fallback_model, contents=user_prompt)
                                for chunk in response:
                                    if chunk and getattr(chunk, "text", None):
                                        loop.call_soon_threadsafe(stream_queue.put_nowait, {"chunk": chunk.text})
                                success = True
                                print(f"Fallback model {fallback_model} succeeded!")
                                break
                            except Exception as fb_err:
                                print(f"Fallback model {fallback_model} failed: {fb_err}")
                                last_error = str(fb_err)
                                time.sleep(1)

                    if success:
                        loop.call_soon_threadsafe(stream_queue.put_nowait, {"end": True})
                    else:
                        clean_msg = "Google AI service is currently experiencing high demand. Please try sending your message again in a moment."
                        print(f"All models failed. Last error: {last_error}")
                        loop.call_soon_threadsafe(stream_queue.put_nowait, {"error": clean_msg})

                except Exception as ex:
                    print(f"Stream error: {ex}")
                    traceback.print_exc()
                    loop.call_soon_threadsafe(stream_queue.put_nowait, {"error": str(ex)})

            threading.Thread(target=run_stream_in_thread, args=(chat, prompt), daemon=True).start()

            while True:
                item = await stream_queue.get()
                await websocket.send_json(item)
                if "end" in item or "error" in item:
                    break

            if not USE_MOCK:
                try:
                    serializable_history = []
                    for entry in chat.get_history():
                        serializable_history.append({"role": entry.role, "parts": [{"text": p.text} for p in entry.parts]})
                    save_session_data(user_id, session_id, serializable_history)
                except Exception as hist_err:
                    print(f"Error saving history: {hist_err}")

    except WebSocketDisconnect:
        print(f"WebSocket disconnected gracefully: {session_id}")
    except Exception as e:
        print(f"WebSocket error in {session_id}: {e}")

# Static Files
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

@app.get("/")
@app.get("/index.html")
async def serve_index():
    return FileResponse(os.path.join(root_dir, "index.html"))

# Mount the root directory for relative resources (script.js, style.css)
# This should be LAST to avoid hijacking other routes
app.mount("/", StaticFiles(directory=root_dir), name="root_static")
