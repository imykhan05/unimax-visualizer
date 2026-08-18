"""Upload / paint endpoints."""

import base64
import io
import uuid
from typing import Dict

import cv2
import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image
from pydantic import BaseModel, Field

from utils.color_engine import apply_paint_color
from utils.segmenter import flood_fill_mask, mask_pixel_count

router = APIRouter(prefix="/api", tags=["image"])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_W, MAX_H = 900, 640
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}

# image_id -> {"original": BGR ndarray, "current": BGR ndarray}
# In-memory on purpose: the app runs on the shopkeeper's own machine and
# nothing here is worth persisting between restarts.
STORE: Dict[str, Dict[str, np.ndarray]] = {}
MAX_STORED_IMAGES = 40


class ApplyColorRequest(BaseModel):
    image_id: str
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    shade_hex: str
    tolerance: int = Field(default=40, ge=1, le=255)
    opacity: float = Field(default=0.95, gt=0.0, le=1.0)
    from_original: bool = False


def _resize_within(img: np.ndarray) -> np.ndarray:
    h, w = img.shape[:2]
    scale = min(MAX_W / w, MAX_H / h, 1.0)
    if scale == 1.0:
        return img
    return cv2.resize(
        img, (max(1, int(round(w * scale))), max(1, int(round(h * scale)))),
        interpolation=cv2.INTER_AREA,
    )


def _to_base64_png(img: np.ndarray) -> str:
    ok, buf = cv2.imencode(".png", img)
    if not ok:
        raise HTTPException(500, "Could not encode result image")
    return "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode("ascii")


def _evict_if_needed() -> None:
    while len(STORE) > MAX_STORED_IMAGES:
        STORE.pop(next(iter(STORE)))


@router.post("/upload")
async def upload_image(image: UploadFile = File(...)):
    raw = await image.read()
    if not raw:
        raise HTTPException(400, "Empty file")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Image is larger than 10MB")

    try:
        pil = Image.open(io.BytesIO(raw))
        fmt = (pil.format or "").upper()
        if fmt not in ALLOWED_FORMATS:
            raise HTTPException(415, f"Unsupported format {fmt or 'unknown'} — use JPG, PNG or WEBP")
        pil = pil.convert("RGB")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "File is not a readable image")

    bgr = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    bgr = _resize_within(bgr)

    image_id = uuid.uuid4().hex
    STORE[image_id] = {"original": bgr, "current": bgr.copy()}
    _evict_if_needed()

    h, w = bgr.shape[:2]
    return {
        "image_id": image_id,
        "width": w,
        "height": h,
        "filename": image.filename,
        "url": _to_base64_png(bgr),
    }


@router.post("/apply-color")
async def apply_color(req: ApplyColorRequest):
    entry = STORE.get(req.image_id)
    if entry is None:
        raise HTTPException(404, "Unknown image_id — please upload the image again")

    base = entry["original"] if req.from_original else entry["current"]
    h, w = base.shape[:2]
    if not (0 <= req.x < w and 0 <= req.y < h):
        raise HTTPException(400, f"Point ({req.x}, {req.y}) is outside the {w}x{h} image")

    try:
        mask = flood_fill_mask(base, req.x, req.y, req.tolerance)
        painted = apply_paint_color(base, mask, req.shade_hex, opacity=req.opacity)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    entry["current"] = painted
    return {
        "result_image_base64": _to_base64_png(painted),
        "pixels_filled": mask_pixel_count(mask),
    }


@router.post("/reset/{image_id}")
async def reset_image(image_id: str):
    entry = STORE.get(image_id)
    if entry is None:
        raise HTTPException(404, "Unknown image_id")
    entry["current"] = entry["original"].copy()
    return {"result_image_base64": _to_base64_png(entry["current"])}
