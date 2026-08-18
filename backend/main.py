"""Unimax Paint Visualizer — FastAPI backend."""

import os
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Allow `python main.py` from inside backend/ as the README documents.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from routers import image, pdf  # noqa: E402

VERSION = "1.0.0"

app = FastAPI(
    title="Unimax Paint Visualizer API",
    version=VERSION,
    description="Wall colour preview engine for Unimax Paints shade cards.",
)

# The frontend is served from a different origin (Vite dev server, or a
# Cloudflare tunnel hostname that changes every run), so keep CORS open —
# the API holds no user data and runs on the shop's own machine.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(image.router)
app.include_router(pdf.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": VERSION}


@app.get("/")
async def root():
    return {"service": "Unimax Paint Visualizer API", "version": VERSION, "docs": "/docs"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "8000")),
        reload=bool(os.environ.get("RELOAD")),
    )
