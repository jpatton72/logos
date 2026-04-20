#!/usr/bin/env python3
"""Generate the Logos Bible app icon set from a base SVG design."""

import os
import sys
import subprocess
import base64
from pathlib import Path

# Ensure Pillow is available
try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    subprocess.run([sys.executable, "-m", "pip", "install", "pillow", "-q"])
    from PIL import Image, ImageDraw, ImageFont


ICONS_DIR = Path(__file__).parent / "src-tauri" / "icons"
ICONS_DIR.mkdir(parents=True, exist_ok=True)

# Color palette — deep navy with gold accents (scholarly/biblical aesthetic)
BG_COLOR = (15, 23, 42)         # Deep navy
ACCENT_COLOR = (217, 165, 32)    # Gold
TEXT_COLOR = (248, 250, 252)     # Near white
BOOK_COLOR = (203, 162, 94)      # Warm tan/leather

def draw_icon(size: int) -> Image.Image:
    """Draw a 1024x1024 icon scaled to `size`."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Scale factor for everything
    s = size / 1024

    # --- Background: rounded square with gradient-like layers ---
    margin = int(40 * s)
    r = int(180 * s)
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=r,
        fill=BG_COLOR,
    )

    # Subtle outer ring (gold border)
    outer_r = int(175 * s)
    draw.rounded_rectangle(
        [margin + int(5*s), margin + int(5*s),
         size - margin - int(5*s), size - margin - int(5*s)],
        radius=outer_r,
        outline=ACCENT_COLOR,
        width=max(1, int(6*s)),
    )

    cx, cy = size // 2, size // 2

    # --- Open book ---
    book_top = int(280 * s)
    book_bot = int(720 * s)
    book_h = book_bot - book_top
    book_w = int(700 * s)
    book_l = cx - book_w // 2
    book_r = cx + book_w // 2

    # Left page
    draw.rectangle(
        [cx - book_w//2, book_top, cx, book_bot],
        fill=(35, 50, 80),
    )
    # Right page
    draw.rectangle(
        [cx, book_top, cx + book_w//2, book_bot],
        fill=(45, 60, 95),
    )
    # Center crease
    draw.line([cx, book_top, cx, book_bot], fill=ACCENT_COLOR, width=max(1, int(3*s)))

    # Page lines (subtle ruled lines)
    line_color = (80, 110, 160)
    line_spacing = int(38 * s)
    for i in range(1, 10):
        y = book_top + i * line_spacing
        if y < book_bot - int(20*s):
            # Left page lines
            draw.line([book_l + int(40*s), y, cx - int(20*s), y], fill=line_color, width=max(1, int(2*s)))
            # Right page lines
            draw.line([cx + int(20*s), y, book_r - int(40*s), y], fill=line_color, width=max(1, int(2*s)))

    # Book spine top
    draw.arc([cx - book_w//2, book_top - int(10*s), cx + book_w//2, book_top + int(50*s)],
             start=0, end=180, fill=ACCENT_COLOR, width=max(1, int(6*s)))

    # --- Cross above the book ---
    cross_x = cx
    cross_y_top = int(120 * s)
    cross_h = int(140 * s)
    arm_w = int(80 * s)
    thick = max(1, int(14*s))

    # Vertical beam
    draw.rectangle(
        [cross_x - thick//2, cross_y_top, cross_x + thick//2, cross_y_top + cross_h],
        fill=ACCENT_COLOR,
    )
    # Horizontal beam
    draw.rectangle(
        [cross_x - arm_w, cross_y_top + int(30*s), cross_x + arm_w, cross_y_top + int(30*s + thick)],
        fill=ACCENT_COLOR,
    )

    # Cross glow (subtle gold ring behind)
    for radius in range(int(90*s), int(120*s), int(8*s)):
        alpha = max(0, 40 - (radius - int(90*s)) * 2)
        draw.ellipse(
            [cross_x - radius, cross_y_top + cross_h//2 - radius,
             cross_x + radius, cross_y_top + cross_h//2 + radius],
            outline=(217, 165, 32, alpha),
        )

    # --- Lambda/Greek λ symbol below the book (Logos = Word) ---
    lambda_y = int(760 * s)
    lambda_scale = int(50 * s)

    # Draw a stylized λ
    lambda_color = ACCENT_COLOR
    lw = max(1, int(6*s))
    # Right diagonal stroke
    draw.line([cx - lambda_scale, lambda_y + lambda_scale, cx, lambda_y], fill=lambda_color, width=lw)
    # Left diagonal stroke
    draw.line([cx + lambda_scale, lambda_y + lambda_scale, cx, lambda_y], fill=lambda_color, width=lw)
    # Center tick
    draw.line([cx - int(8*s), lambda_y + int(20*s), cx + int(8*s), lambda_y + int(20*s)], fill=lambda_color, width=lw)

    # Small "WORD" text at bottom
    try:
        font_size = int(36 * s)
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
        except OSError:
            font = ImageFont.load_default()
    except Exception:
        font = None

    label = "BIBLE"
    bbox = draw.textbbox((0, 0), label, font=font)
    text_w = bbox[2] - bbox[0]
    text_x = cx - text_w // 2
    text_y = int(820 * s)
    draw.text((text_x, text_y), label, fill=(217, 165, 32, 180), font=font)

    return img


def resize_and_save(img: Image.Image, path: Path, size: int):
    """Resize to exact pixel dimensions and save (with sRGB conversion)."""
    out = img.resize((size, size), Image.LANCZOS)
    if out.mode in ("RGBA", "LA", "P"):
        if out.mode == "RGBA":
            # Fill transparent with BG_COLOR for ICO/PNG compatibility
            bg = Image.new("RGBA", (size, size), (255, 255, 255, 255))
            bg.paste(out, mask=out.split()[3])
            out = bg.convert("RGB")
        elif out.mode == "LA":
            out = out.convert("RGBA")
    else:
        out = out.convert("RGB")
    out.save(path, "PNG", optimize=True)
    print(f"  Wrote {path.name} ({size}x{size})")


def make_ico(png_path: Path, ico_path: Path):
    """Convert PNG to ICO (Windows) using Pillow."""
    sizes = [16, 32, 48, 256]
    imgs = []
    base = Image.open(png_path).convert("RGBA")
    for sz in sizes:
        imgs.append(base.resize((sz, sz), Image.LANCZOS))

    # Save as ICO
    imgs[0].save(ico_path, format="ICO",
                  append_images=imgs[1:],
                  sizes=[(s, s) for s in sizes])
    print(f"  Wrote icon.ico (multi-size)")


def main():
    print("Generating Logos Bible icon set...")

    base = draw_icon(1024)

    # Generate PNG sizes required by Tauri
    sizes = {
        "32x32.png":    32,
        "128x128.png":  128,
        "128x128@2x.png": 256,
        "icon.png":     512,
    }

    for name, size in sizes.items():
        resize_and_save(base, ICONS_DIR / name, size)

    # ico for Windows
    make_ico(ICONS_DIR / "icon.png", ICONS_DIR / "icon.ico")

    # Square icons for Windows (also used by .ico generation)
    for name, size in [
        ("Square284x284Logo.png",  284),
        ("Square142x142Logo.png",  142),
        ("Square310x310Logo.png",  310),
        ("Square107x107Logo.png",  107),
        ("Square89x89Logo.png",    89),
        ("Square71x71Logo.png",    71),
        ("Square44x44Logo.png",    44),
        ("Square30x30Logo.png",    30),
        ("Square150x150Logo.png",  150),
        ("StoreLogo.png",          50),
    ]:
        resize_and_save(base, ICONS_DIR / name, size)

    # icns for macOS — just copy PNG as placeholder (macOS build on non-mac is fine)
    # Real icns would need iconutil; skip for Linux dev environment
    base512 = base.resize((512, 512), Image.LANCZOS)
    base512.save(ICONS_DIR / "icon.icns", "PNG")
    print(f"  Wrote icon.icns (PNG fallback, iconutil needed on macOS)")

    print(f"\nAll icons written to {ICONS_DIR}")
    print("NOTE: Run `iconutil --convert icns` on macOS to generate a proper .icns")


if __name__ == "__main__":
    main()
