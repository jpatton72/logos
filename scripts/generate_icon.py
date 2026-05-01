#!/usr/bin/env python3
"""Generate the Aletheia source icon (a stylized Greek alpha "α" mark).

Run once to produce src-tauri/icons/source.png — a 1024x1024 master that
`npm run tauri icon` then fans out to every platform-specific size and
format. Re-running is fine; it's idempotent and only writes the source.

The mark is intentionally simple: a warm-amber rounded square (matching
the app's accent color #92400e) with a centered Lora-italic alpha. No
crosses, no books, no scrolls — those are crowded space full of
trademarks. Plain typography on a plain background is unique enough.
"""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


SIZE = 1024
RADIUS = 192   # ~18.75% — slight rounding, still distinctly square-ish
BG = (146, 64, 14, 255)         # #92400e — same warm amber the app's
                                 # CTAs use
FG = (254, 252, 232, 255)       # #fefce8 — the cream the app's reading
                                 # surface uses


def find_font(candidates: list[str]) -> ImageFont.ImageFont:
    """Return the first font that loads. Falls back to PIL default."""
    for c in candidates:
        try:
            return ImageFont.truetype(c, size=int(SIZE * 0.78))
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    out_dir = repo_root / "src-tauri" / "icons"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "source.png"

    # RGBA so the rounded corners can be transparent.
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(
        [(0, 0), (SIZE - 1, SIZE - 1)],
        radius=RADIUS,
        fill=BG,
    )

    # The italic Lora that ships with @fontsource is buried under
    # node_modules; rather than reach in there, prefer system serif
    # italics that virtually every dev box has.
    font = find_font(
        [
            # Windows
            r"C:\\Windows\\Fonts\\georgiai.ttf",     # Georgia Italic
            r"C:\\Windows\\Fonts\\timesi.ttf",       # Times New Roman Italic
            r"C:\\Windows\\Fonts\\georgia.ttf",
            # macOS
            "/Library/Fonts/Georgia Italic.ttf",
            "/System/Library/Fonts/Supplemental/Times New Roman Italic.ttf",
            # Linux (Liberation/DejaVu most common)
            "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf",
        ]
    )

    glyph = "α"
    bbox = draw.textbbox((0, 0), glyph, font=font)
    glyph_w = bbox[2] - bbox[0]
    glyph_h = bbox[3] - bbox[1]
    # textbbox includes top-side bearing. Subtract bbox[0]/[1] so the
    # glyph lands centered visually rather than centered on its bounding
    # box (which would float a bit high for italics).
    x = (SIZE - glyph_w) // 2 - bbox[0]
    y = (SIZE - glyph_h) // 2 - bbox[1]
    draw.text((x, y), glyph, font=font, fill=FG)

    canvas.save(out_path, "PNG", optimize=True)
    print(f"Wrote {out_path}")
    print("Next: npm run tauri icon src-tauri/icons/source.png")


if __name__ == "__main__":
    main()
