from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

app = FastAPI()

root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

@app.get("/health")
async def health():
    return {"status": "ok", "message": "Minimal server is running!"}

@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(root_dir, "index.html"))

@app.get("/index.html")
async def serve_index_html():
    return FileResponse(os.path.join(root_dir, "index.html"))

app.mount("/static", StaticFiles(directory=root_dir), name="static")
