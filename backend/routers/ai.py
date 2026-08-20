"""Bridge to a local Stable Diffusion server for the edits recolouring cannot do.

Recolouring can change a surface's colour while keeping its texture. It cannot
remove the tree standing in front of a wall, because that means inventing the
wall behind it. A diffusion model can, so this forwards the work to one running
on the user's own machine — free, no API key, and the photo never leaves their
computer.

Targets the AUTOMATIC1111 / Forge REST API (`/sdapi/v1/img2img`), which ComfyUI
users can also expose. The server is expected at 127.0.0.1:7860 by default.
"""

import base64
import time
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/ai", tags=["ai"])

DEFAULT_SD_URL = "http://127.0.0.1:7860"
TIMEOUT = httpx.Timeout(connect=5.0, read=600.0, write=60.0, pool=5.0)

# Prompts are kept here rather than in the UI so the shop gets consistent
# results without anyone having to learn prompt wording.
PRESETS = {
    "remove_clutter": {
        "prompt": (
            "clean plain exterior wall of the same house, smooth painted plaster, "
            "clear sky, tidy modern facade, no trees, no wires, no clutter, "
            "photorealistic architectural photograph, sharp, natural daylight"
        ),
        "negative": (
            "tree, branches, leaves, foliage, power lines, cables, fence, mesh, "
            "people, text, watermark, blurry, distorted, warped walls"
        ),
        "denoising_strength": 0.92,
    },
    "tidy_surroundings": {
        "prompt": (
            "same house, clean paved driveway, neat planter with small plants, "
            "clear sky, tidy surroundings, photorealistic architectural photograph"
        ),
        "negative": (
            "clutter, rubble, wires, chain link fence, litter, people, text, "
            "watermark, blurry, distorted"
        ),
        "denoising_strength": 0.85,
    },
}


def _strip_data_url(value: str) -> str:
    return value.split(",", 1)[-1] if value.startswith("data:") else value


class EditRequest(BaseModel):
    image_base64: str
    mask_base64: str = Field(
        description="White marks the area to regenerate; black is kept."
    )
    preset: Optional[str] = "remove_clutter"
    prompt: Optional[str] = None
    negative_prompt: Optional[str] = None
    denoising_strength: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    steps: int = Field(default=28, ge=1, le=150)
    cfg_scale: float = Field(default=7.0, ge=1.0, le=30.0)
    mask_blur: int = Field(default=8, ge=0, le=64)
    seed: int = -1
    sd_url: Optional[str] = None


@router.get("/status")
async def status(sd_url: Optional[str] = None):
    """Is a Stable Diffusion server actually running? Reported plainly."""
    base = (sd_url or DEFAULT_SD_URL).rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
            r = await client.get(f"{base}/sdapi/v1/options")
            r.raise_for_status()
            opts = r.json()
        return {
            "available": True,
            "url": base,
            "model": opts.get("sd_model_checkpoint"),
            "presets": list(PRESETS),
        }
    except httpx.ConnectError:
        return {
            "available": False,
            "url": base,
            "reason": "connect_failed",
            "hint": (
                "Stable Diffusion server nahi chal raha. WebUI ko "
                "--api ke saath start karo (webui-user.bat mein "
                "COMMANDLINE_ARGS=--api)."
            ),
        }
    except Exception as exc:  # noqa: BLE001 - surfaced verbatim to the caller
        return {"available": False, "url": base, "reason": type(exc).__name__, "detail": str(exc)}


@router.get("/presets")
async def presets():
    return {
        name: {"prompt": p["prompt"], "negative_prompt": p["negative"],
               "denoising_strength": p["denoising_strength"]}
        for name, p in PRESETS.items()
    }


@router.post("/edit")
async def edit(req: EditRequest):
    """Regenerate the masked area with the local diffusion model."""
    base = (req.sd_url or DEFAULT_SD_URL).rstrip("/")
    preset = PRESETS.get(req.preset or "remove_clutter")
    if preset is None:
        raise HTTPException(400, f"Unknown preset: {req.preset}")

    image_b64 = _strip_data_url(req.image_base64)
    mask_b64 = _strip_data_url(req.mask_base64)
    for name, blob in (("image", image_b64), ("mask", mask_b64)):
        try:
            base64.b64decode(blob, validate=True)
        except Exception:
            raise HTTPException(400, f"{name}_base64 is not valid base64")

    payload = {
        "init_images": [image_b64],
        "mask": mask_b64,
        "prompt": req.prompt or preset["prompt"],
        "negative_prompt": req.negative_prompt or preset["negative"],
        "denoising_strength": (
            req.denoising_strength
            if req.denoising_strength is not None
            else preset["denoising_strength"]
        ),
        "steps": req.steps,
        "cfg_scale": req.cfg_scale,
        "seed": req.seed,
        "mask_blur": req.mask_blur,
        "inpainting_fill": 1,          # original — gives the model context to match
        "inpaint_full_res": False,     # whole frame, so lighting stays consistent
        "inpainting_mask_invert": 0,   # white = repaint
        "sampler_name": "DPM++ 2M",
    }

    started = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.post(f"{base}/sdapi/v1/img2img", json=payload)
    except httpx.ConnectError:
        raise HTTPException(
            503,
            "Stable Diffusion server se connect nahi ho saka. WebUI --api ke saath chala hua hai?",
        )
    except httpx.ReadTimeout:
        raise HTTPException(504, "Stable Diffusion ne waqt par jawab nahi diya (image bari ya GPU slow).")

    if r.status_code >= 400:
        raise HTTPException(502, f"Stable Diffusion error {r.status_code}: {r.text[:300]}")

    data = r.json()
    images = data.get("images") or []
    if not images:
        raise HTTPException(502, "Stable Diffusion ne koi image wapas nahi ki.")

    return {
        "image_base64": "data:image/png;base64," + images[0],
        "took_ms": int((time.monotonic() - started) * 1000),
    }
