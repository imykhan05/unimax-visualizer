"""Region selection for the visualizer.

Flood fill from the clicked pixel, with a bilateral pre-filter so JPEG noise and
wall grain don't stop the fill a few pixels in.

The fill runs in *floating range* mode — each candidate pixel is compared with
the neighbour it spread from, not with the clicked pixel. Every real wall photo
has a lighting ramp across it, often 100 luminance levels end to end, and a
seed-relative comparison stops halfway across the wall with a ragged frontier.
Comparing neighbours follows that ramp while a skirting board or window frame,
which is a hard step rather than a ramp, still blocks the fill. This mirrors
frontend/src/utils/floodFill.js so both paths select the same region.
"""

import cv2
import numpy as np


def flood_fill_mask(
    image_np: np.ndarray,
    x: int,
    y: int,
    tolerance: int = 40,
    feather: int = 2,
) -> np.ndarray:
    """Return a uint8 mask (0/255) of the region connected to (x, y).

    `tolerance` is the per-channel distance that still counts as "same colour",
    matching the 20-80 range the UI slider exposes.
    """
    h, w = image_np.shape[:2]
    if not (0 <= x < w and 0 <= y < h):
        raise ValueError(f"Point ({x}, {y}) is outside the {w}x{h} image")

    # Edge-preserving smoothing: kills sensor noise, keeps wall/trim boundaries.
    smoothed = cv2.bilateralFilter(image_np, d=7, sigmaColor=45, sigmaSpace=45)

    flood_flags = 4 | cv2.FLOODFILL_MASK_ONLY | (255 << 8)
    ff_mask = np.zeros((h + 2, w + 2), np.uint8)

    # Per-step allowance between neighbouring pixels. A lighting ramp moves a
    # fraction of a level per pixel and passes; an edge is a hard jump and stops.
    step = max(4, int(round(tolerance * 0.42)))
    lo = up = (step,) * 3

    cv2.floodFill(smoothed.copy(), ff_mask, (int(x), int(y)), 0, lo, up, flood_flags)

    mask = ff_mask[1:-1, 1:-1]

    # Close pinholes left by specular highlights and sockets.
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    # Grow slightly: flood fill stops where anti-aliased edge pixels begin, which
    # would otherwise leave a one-pixel halo of the old colour around the region.
    if feather > 0:
        mask = cv2.dilate(mask, kernel, iterations=1)
        k = feather * 2 + 1
        mask = cv2.GaussianBlur(mask, (k, k), 0)
        mask = np.where(mask > 127, 255, 0).astype(np.uint8)

    return mask


def mask_pixel_count(mask: np.ndarray) -> int:
    return int(np.count_nonzero(mask))
