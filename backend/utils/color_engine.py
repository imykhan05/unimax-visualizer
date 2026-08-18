"""LAB-space paint blending.

The idea: a wall photo carries its texture, shadows and highlights almost
entirely in the L (lightness) channel. Swapping only A and B keeps every bit
of that detail while changing the actual colour, which is what makes the
preview look like paint instead of a flat sticker.
"""

import cv2
import numpy as np


def hex_to_bgr(hex_color: str) -> tuple:
    """'#E85D20' -> (32, 93, 232) in BGR order."""
    h = hex_color.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) != 6:
        raise ValueError(f"Invalid hex colour: {hex_color}")
    r = int(h[0:2], 16)
    g = int(h[2:4], 16)
    b = int(h[4:6], 16)
    return (b, g, r)


def hex_to_rgb(hex_color: str) -> tuple:
    b, g, r = hex_to_bgr(hex_color)
    return (r, g, b)


def hex_to_lab(hex_color: str) -> np.ndarray:
    """LAB triplet (uint8 OpenCV scale) for a single hex colour."""
    bgr = np.uint8([[list(hex_to_bgr(hex_color))]])
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    return lab[0, 0].astype(np.int16)


def apply_paint_color(
    image_np: np.ndarray,
    mask: np.ndarray,
    hex_color: str,
    opacity: float = 0.95,
    lightness_shift: float = 1.0,
) -> np.ndarray:
    """Paint `hex_color` onto the masked region of a BGR image.

    `mask` is any 2-D array where non-zero marks the pixels to paint.
    `lightness_shift` moves the region's average lightness toward the paint's
    own lightness; each pixel keeps its deviation from that mean, which is what
    preserves the texture. Because the texture is carried that way, the blend
    does not need to be weak to look real — a partial shift plus a heavy blend
    with the original just washes the shade out (at 0.72/0.35 the Black shade
    renders as mid grey). Both values remain tunable per call.
    """
    if image_np.ndim != 3 or image_np.shape[2] != 3:
        raise ValueError("Expected a 3-channel BGR image")

    bool_mask = mask.astype(bool)
    if not bool_mask.any():
        return image_np.copy()

    lab = cv2.cvtColor(image_np, cv2.COLOR_BGR2LAB).astype(np.int16)
    paint_lab = hex_to_lab(hex_color)

    result = lab.copy()

    # 1. Chroma: replace A and B outright inside the mask.
    result[bool_mask, 1] = paint_lab[1]
    result[bool_mask, 2] = paint_lab[2]

    # 2. Lightness: shift the whole region so its mean moves toward the paint,
    #    keeping each pixel's deviation from that mean (= the texture).
    region_l = lab[bool_mask, 0].astype(np.float32)
    mean_l = float(region_l.mean())
    delta = (float(paint_lab[0]) - mean_l) * float(lightness_shift)
    result[bool_mask, 0] = np.clip(region_l + delta, 0, 255).astype(np.int16)

    result_bgr = cv2.cvtColor(result.astype(np.uint8), cv2.COLOR_LAB2BGR)

    # 3. Opacity blend, applied only inside the mask so untouched pixels stay
    #    bit-for-bit identical to the source.
    blended = cv2.addWeighted(result_bgr, opacity, image_np, 1.0 - opacity, 0)

    final = image_np.copy()
    final[bool_mask] = blended[bool_mask]
    return final
