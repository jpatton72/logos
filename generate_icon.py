#!/usr/bin/env python3
"""
Generate the Aletheia icon set using ImageMagick (no Pillow required).
Design: Deep navy background with gold cross, open book, and Greek lambda (ΛΟΓΟΣ).
"""

import os
import subprocess
import tempfile
from pathlib import Path

ICONS_DIR = Path(__file__).parent / "src-tauri" / "icons"
ICONS_DIR.mkdir(parents=True, exist_ok=True)

# Color palette
BG = "#0f172a"       # Deep navy
GOLD = "#d9a520"     # Gold accent
LTAN = "#cba25e"     # Warm leather/book
LPAGE = "#232e50"    # Left page (darker)
RPAGE = "#2d3c5f"   # Right page (lighter)
SPINE = "#d9a520"    # Gold spine

def run(cmd: list[str], check=True) -> str:
    result = subprocess.run(cmd, capture_output=True, text=True)
    if check and result.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\n{result.stderr}")
    return result.stdout + result.stderr

def svg_to_png(svg_path: str, size: int, out_path: str):
    """Render an SVG to PNG using ImageMagick."""
    run([
        "convert", "-background", "none",
        "-size", f"{size}x{size}",
        svg_path,
        "-resize", f"{size}x{size}",
        "-quality", "95",
        out_path,
    ])

def make_icon_svg(size: int) -> str:
    """Generate an SVG string for the icon at the given size."""
    s = size
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{s}" height="{s}" viewBox="0 0 {s} {s}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a2744"/>
      <stop offset="100%" style="stop-color:#0a1020"/>
    </linearGradient>
    <linearGradient id="crossGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#f0c040"/>
      <stop offset="100%" style="stop-color:#c89010"/>
    </linearGradient>
    <linearGradient id="bookGradL" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#1a2438"/>
      <stop offset="100%" style="stop-color:#253555"/>
    </linearGradient>
    <linearGradient id="bookGradR" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#2a3d60"/>
      <stop offset="100%" style="stop-color:#1e2e50"/>
    </linearGradient>
  </defs>

  <!-- Rounded background square -->
  <rect width="{s}" height="{s}" rx="{int(s*0.18)}" fill="url(#bgGrad)"/>

  <!-- Gold border ring -->
  <rect x="{int(s*0.04)}" y="{int(s*0.04)}" width="{int(s*0.92)}" height="{int(s*0.92)}"
        rx="{int(s*0.16)}" fill="none" stroke="#d9a520" stroke-width="{max(2, int(s*0.006))}"/>

  <!-- Cross (upper center) -->
  <rect x="{int(s*0.47)}" y="{int(s*0.07)}" width="{max(2, int(s*0.06))}" height="{int(s*0.17)}"
        fill="url(#crossGrad)" rx="{max(1, int(s*0.01))}"/>
  <rect x="{int(s*0.39)}" y="{int(s*0.135)}" width="{int(s*0.22)}" height="{max(2, int(s*0.05))}"
        fill="url(#crossGrad)" rx="{max(1, int(s*0.01))}"/>

  <!-- Open Book -->
  <!-- Left page -->
  <rect x="{int(s*0.12)}" y="{int(s*0.28)}" width="{int(s*0.38)}" height="{int(s*0.44)}"
        fill="url(#bookGradL)" rx="{max(2, int(s*0.015))}"/>
  <!-- Right page -->
  <rect x="{int(s*0.50)}" y="{int(s*0.28)}" width="{int(s*0.38)}" height="{int(s*0.44)}"
        fill="url(#bookGradR)" rx="{max(2, int(s*0.015))}"/>
  <!-- Spine/center crease -->
  <rect x="{int(s*0.49)}" y="{int(s*0.28)}" width="{max(2, int(s*0.02))}" height="{int(s*0.44)}"
        fill="#d9a520"/>
  <!-- Page lines - left -->
  <line x1="{int(s*0.17)}" y1="{int(s*0.35)}" x2="{int(s*0.46)}" y2="{int(s*0.35)}" stroke="#4a6090" stroke-width="{max(1, int(s*0.008))}"/>
  <line x1="{int(s*0.17)}" y1="{int(s*0.40)}" x2="{int(s*0.46)}" y2="{int(s*0.40)}" stroke="#4a6090" stroke-width="{max(1, int(s*0.008))}"/>
  <line x1="{int(s*0.17)}" y1="{int(s*0.45)}" x2="{int(s*0.46)}" y2="{int(s*0.45)}" stroke="#4a6090" stroke-width="{max(1, int(s*0.008))}"/>
  <line x1="{int(s*0.17)}" y1="{int(s*0.50)}" x2="{int(s*0.46)}" y2="{int(s*0.50)}" stroke="#4a6090" stroke-width="{max(1, int(s*0.008))}"/>
  <line x1="{int(s*0.17)}" y1="{int(s*0.55)}" x2="{int(s*0.46)}" y2="{int(s*0.55)}" stroke="#4a6090" stroke-width="{max(1, int(s*0.008))}"/>
  <line x1="{int(s*0.17)}" y1="{int(s*0.60)}" x2="{int(s*0.46)}" y2="{int(s*0.60)}" stroke="#4a6090" stroke-width="{max(1, int(s*0.008))}"/>
  <line x1="{int(s*0.17)}" y1="{int(s*0.65)}" x2="{int(s*0.46)}" y2="{int(s*0.65)}" stroke="#4a6090" stroke-width="{max(1, int(s*0.008))}"/>
  <!-- Page lines - right -->
  <line x1="{int(s*0.54)}" y1="{int(s*0.35)}" x2="{int(s*0.83)}" y2="{int(s*0.35)}" stroke="#4a6090" stroke-width="{max(1, int(s*0.008))}"/>
  <line x1="{int(s*0.54)}" y1="{int(s*0.40)}" x2="{int(s*0.83)}" y2="{int(s*0.40)}" stroke="#4a6090" stroke-width="{max(1, int(s*0.008))}"/>
  <line x1="{int(s*0.54)}" y1="{int(s*0.45)}" x2="{int(s*0.83)}" y2="{int(s*0.45)}" stroke="#4a6090" stroke-width="{max(1, int(s*0.008))}"/>
  <line x1="{int(s*0.54)}" y1="{int(s*0.50)}" x2="{int(s*0.83)}" y2="{int(s*0.50)}" stroke="#4a6090" stroke-width="{max(1, int(s*0.008))}"/>
  <line x1="{int(s*0.54)}" y1="{int(s*0.55)}" x2="{int(s*0.83)}" y2="{int(s*0.55)}" stroke="#4a6090" stroke-width="{max(1, int(s*0.008))}"/>
  <line x1="{int(s*0.54)}" y1="{int(s*0.60)}" x2="{int(s*0.83)}" y2="{int(s*0.60)}" stroke="#4a6090" stroke-width="{max(1, int(s*0.008))}"/>
  <line x1="{int(s*0.54)}" y1="{int(s*0.65)}" x2="{int(s*0.83)}" y2="{int(s*0.65)}" stroke="#4a6090" stroke-width="{max(1, int(s*0.008))}"/>

  <!-- Greek Lambda (Λ) below book - stylized -->
  <line x1="{int(s*0.44)}" y1="{int(s*0.76)}" x2="{int(s*0.50)}" y2="{int(s*0.72)}" stroke="#d9a520" stroke-width="{max(2, int(s*0.015))}" stroke-linecap="round"/>
  <line x1="{int(s*0.56)}" y1="{int(s*0.76)}" x2="{int(s*0.50)}" y2="{int(s*0.72)}" stroke="#d9a520" stroke-width="{max(2, int(s*0.015))}" stroke-linecap="round"/>
  <line x1="{int(s*0.46)}" y1="{int(s*0.75)}" x2="{int(s*0.54)}" y2="{int(s*0.75)}" stroke="#d9a520" stroke-width="{max(2, int(s*0.015))}" stroke-linecap="round"/>

  <!-- "BIBLE" text at bottom -->
  <text x="{int(s*0.50)}" y="{int(s*0.87)}"
        font-family="serif" font-size="{int(s*0.055)}" font-weight="bold"
        fill="#d9a520" text-anchor="middle" letter-spacing="{int(s*0.015)}">BIBLE</text>
</svg>'''
    return svg


def main():
    print("Generating Aletheia icon set with ImageMagick...")

    # Create base 1024 icon as SVG
    svg_1024 = make_icon_svg(1024)

    with tempfile.NamedTemporaryFile(suffix=".svg", delete=False) as f:
        f.write(svg_1024.encode())
        svg_path = f.name

    try:
        # Generate required Tauri PNG sizes
        sizes = {
            "32x32.png": 32,
            "128x128.png": 128,
            "128x128@2x.png": 256,
            "icon.png": 512,
            "Square107x107Logo.png": 107,
            "Square142x142Logo.png": 142,
            "Square150x150Logo.png": 150,
            "Square284x284Logo.png": 284,
            "Square30x30Logo.png": 30,
            "Square310x310Logo.png": 310,
            "Square44x44Logo.png": 44,
            "Square71x71Logo.png": 71,
            "Square89x89Logo.png": 89,
            "StoreLogo.png": 50,
        }

        for name, size in sizes.items():
            out = ICONS_DIR / name
            run([
                "convert", "-background", "#0f172a",
                "-size", f"{size}x{size}",
                svg_path,
                "-resize", f"{size}x{size}",
                "-quality", "95",
                str(out),
            ])
            print(f"  Wrote {name} ({size}x{size})")

        # Create ICO for Windows
        ico_path = ICONS_DIR / "icon.ico"
        run([
            "convert",
            "-background", "#0f172a",
            svg_path,
            "-resize", "256x256",
            "-define", "icon:size=16,32,48,256",
            "-alpha", "on",
            str(ico_path),
        ])
        print(f"  Wrote icon.ico")

        # For icns, just save a PNG (macOS iconutil needed on Mac)
        # Use the already-generated icon.png as the icns placeholder
        import shutil
        shutil.copy(str(ICONS_DIR / "icon.png"), str(ICONS_DIR / "icon.icns"))
        print(f"  Wrote icon.icns (PNG fallback)")

        print(f"\nAll icons written to {ICONS_DIR}")
        print("NOTE: Run `iconutil --convert icns` on macOS to generate proper .icns")

    finally:
        os.unlink(svg_path)

if __name__ == "__main__":
    main()
