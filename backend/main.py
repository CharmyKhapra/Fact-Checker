from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from . import config
from .routes.verify import router as verify_router
from .routes.video import router as video_router

BASE=Path(__file__).resolve().parent
FRONTEND=BASE.parent/"frontend"

app=FastAPI(title="FactLens AI",version="2.0.0")
app.add_middleware(CORSMiddleware,allow_origins=["*"],allow_credentials=True,
                   allow_methods=["*"],allow_headers=["*"])
app.include_router(verify_router)
app.include_router(video_router)

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "FactLens AI",
        "gemini_configured": bool(config.GEMINI_API_KEY),
        "gemini_model": config.GEMINI_MODEL,
        "whisper_model": config.WHISPER_MODEL,
    }

app.mount("/media", StaticFiles(directory=str(config.MEDIA_DIR)), name="media")
app.mount("/",StaticFiles(directory=str(FRONTEND),html=True),name="frontend")