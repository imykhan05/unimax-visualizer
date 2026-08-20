"""A stand-in for the AUTOMATIC1111 API, for testing the bridge without a GPU.

It answers the two endpoints the bridge uses, checks that the request carries
what a real server needs, and returns the init image with the masked area
filled flat — enough to prove the round trip end to end.
"""

import base64
import io

import numpy as np
from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel

app = FastAPI()
REQUIRED = ("init_images", "mask", "prompt", "denoising_strength", "steps")


class Img2Img(BaseModel):
    model_config = {"extra": "allow"}


@app.get("/sdapi/v1/options")
async def options():
    return {"sd_model_checkpoint": "mock-inpainting-v1.safetensors"}


@app.post("/sdapi/v1/img2img")
async def img2img(body: Img2Img):
    data = body.model_dump()
    missing = [k for k in REQUIRED if k not in data or data[k] in (None, "", [])]
    if missing:
        raise HTTPException(422, f"missing fields: {missing}")

    if not (0.0 <= float(data["denoising_strength"]) <= 1.0):
        raise HTTPException(422, "denoising_strength out of range")

    try:
        init = Image.open(io.BytesIO(base64.b64decode(data["init_images"][0]))).convert("RGB")
        mask = Image.open(io.BytesIO(base64.b64decode(data["mask"]))).convert("L")
    except Exception as exc:
        raise HTTPException(422, f"undecodable image or mask: {exc}")

    if mask.size != init.size:
        raise HTTPException(422, f"mask {mask.size} does not match image {init.size}")

    arr = np.array(init)
    m = np.array(mask) > 127
    arr[m] = (200, 210, 225)  # flat fill marks what a real model would regenerate
    out = Image.fromarray(arr)

    buf = io.BytesIO()
    out.save(buf, format="PNG")
    return {
        "images": [base64.b64encode(buf.getvalue()).decode()],
        "parameters": {},
        "info": "{\"mock\": true}",
    }
