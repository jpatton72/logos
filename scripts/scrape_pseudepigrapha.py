#!/usr/bin/env python3
"""One-time scraper for public-domain pseudepigrapha sources.

Pulls three books from pseudepigrapha.com (R.H. Charles & W.R. Morfill
translations, all clearly PD in the US — pre-1929) and writes one JSON
file per book in the standard `{chapter: {verse: text}}` shape.

The output JSONs live under `data/pseudepigrapha/` and are committed to
the repo so the build pipeline doesn't depend on this site staying up.
Re-run this script only when the source changes or we want to add
another book; the regular `ingest_pseudepigrapha.py` flow reads the
committed JSONs directly.

Sources:
  - 1 Enoch:   pseudepigrapha.com/pseudepigrapha/enoch.htm   (Charles 1917)
  - Jubilees:  pseudepigrapha.com/jubilees/<N>.htm × 50      (Charles 1913)
  - 2 Enoch:   pseudepigrapha.com/pseudepigrapha/enochs2.htm (Morfill 1896)

Usage:
    python scripts/scrape_pseudepigrapha.py
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "pseudepigrapha"

USER_AGENT = "Aletheia/1.0 (+https://github.com/jpatton72/Aletheia)"

ENOCH_URL    = "https://www.pseudepigrapha.com/pseudepigrapha/enoch.htm"
ENOCH2_URL   = "https://www.pseudepigrapha.com/pseudepigrapha/enochs2.htm"
JUBILEES_URL = "https://www.pseudepigrapha.com/jubilees/{n}.htm"
JUBILEES_CHAPTERS = 50


def http_get(url: str) -> str:
    """Fetch a URL and return its text. Decode as Windows-1252 first
    (the source site is older HTML with curly quotes encoded that way),
    falling back to latin-1 for any byte that's left over.
    """
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
    # The server doesn't send a charset header consistently. Most pages
    # are CP-1252 (Windows-1252) — typesetters' favorite — so try that
    # first; latin-1 as a no-fail fallback.
    try:
        return raw.decode("cp1252")
    except UnicodeDecodeError:
        return raw.decode("latin-1")


# ---------------------------------------------------------------------------
# 1 Enoch + 2 Enoch — single-page HTML, FONT-tag verse markers.
# ---------------------------------------------------------------------------

# Verse-number markers wrap a number (with or without trailing period)
# in a small blue FONT tag. 1 Enoch uses "N.", 2 Enoch uses "N" — the
# regex accepts both.
VERSE_MARKER_RE = re.compile(
    r'<FONT\s+Color="#0000FF"\s+Size="-2"\s*>\s*(\d+)\.?\s*</FONT\s*>',
    re.IGNORECASE,
)
# Chapter headings: "Chapter N, ROMAN" (with optional "-a"/"-b" suffix
# on Charles's split chapters). We trust this visible number rather
# than the `<A Name="ChN">` attribute — the source has typos in
# several anchor names (ch.39 is anchored Ch38, ch.70 is anchored
# Ch79) but the visible text is always right. Some chapter headings
# are wrapped in <B>...</B> and some have only a closing </B> (the
# 2 Enoch page is missing opening <B> tags from chapter 2 onward) —
# so the regex doesn't require either tag.
CHAPTER_HEADING_RE = re.compile(
    r"\bChapter\s+(\d+)(?:-[ab])?\s*,\s*[IVXLCDM]+",
    re.IGNORECASE,
)


def strip_html_keep_text(s: str) -> str:
    """Convert <BR> to space, drop every other tag, keep the text content
    (including bracket markers like "(even)" or "[reconstructed]" that
    sit inside FONT-colored editorial spans).
    """
    s = re.sub(r"<\s*br\s*/?>", " ", s, flags=re.IGNORECASE)
    s = re.sub(r"<[^>]+>", "", s)
    return s


def normalize_whitespace(s: str) -> str:
    s = s.replace(" ", " ")  # non-breaking space → regular
    s = s.replace("\xa0", " ")
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def parse_pseudepigrapha_single_page(html: str) -> dict[str, dict[str, str]]:
    """Parse a single HTML page that contains an entire book, with
    visible chapter headings `<B>Chapter N, ROMAN</B>` and verse
    markers wrapped in colored FONT tags. Returns
    `{chapter_str: {verse_str: text}}` (string keys to match the JSON
    shape consumed by ingest_apocrypha.py).

    Split chapters (e.g. Charles's 91-a / 91-b) get merged under the
    base chapter number — callers always see consecutive chapters.
    """
    chapters: dict[str, dict[str, str]] = {}
    headings = list(CHAPTER_HEADING_RE.finditer(html))
    if not headings:
        raise SystemExit("No chapter headings found - page format may have changed.")

    for i, m in enumerate(headings):
        ch_num = int(m.group(1))
        body_start = m.end()
        if i + 1 < len(headings):
            body_end = headings[i + 1].start()
        else:
            # Last chapter: bound at the next end-of-content marker
            # (the source uses <HR> before the page footer, but fall
            # back to </TD> just in case). Without this, the trailing
            # translator credits + © notice leak into the final verse.
            tail = html[body_start:]
            stop = re.search(r"<HR\b|</TD\s*>", tail, re.IGNORECASE)
            body_end = body_start + stop.start() if stop else len(html)
        body = html[body_start:body_end]

        # If this chapter's bucket already exists (split chapter like
        # 91-a/91-b), merge into it; otherwise start fresh.
        verses = chapters.setdefault(str(ch_num), {})

        verse_markers = list(VERSE_MARKER_RE.finditer(body))
        for j, vm in enumerate(verse_markers):
            v_num = int(vm.group(1))
            text_start = vm.end()
            text_end = verse_markers[j + 1].start() if j + 1 < len(verse_markers) else len(body)
            text = strip_html_keep_text(body[text_start:text_end])
            text = normalize_whitespace(text)
            if text:
                # First writer wins on collisions. Charles's 91-a +
                # 91-b have disjoint verse numbers, so this only matters
                # if a future split chapter repeats one — preserves the
                # earlier half's reading rather than silently dropping it.
                verses.setdefault(str(v_num), text)
    return chapters


# ---------------------------------------------------------------------------
# Jubilees — 50 separate HTML pages, each chapter is an <ol> of <li> verses.
# ---------------------------------------------------------------------------


class JubileesChapterParser(HTMLParser):
    """Pulls every <li> inside the <ol> in a Jubilees chapter page.
    The source's HTML uses implicit-close <li> (no `</li>`), so a new
    `<li>` start tag also signals the end of the previous one. We
    finalize the running buffer on every <li> open, on </ol>, and on
    parser close (for the final verse).
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_ol = False
        self.in_li = False
        self.current: list[str] = []
        self.verses: list[str] = []

    def _finalize_current(self) -> None:
        if not self.in_li:
            return
        text = normalize_whitespace("".join(self.current))
        if text:
            self.verses.append(text)
        self.current = []
        self.in_li = False

    def handle_starttag(self, tag: str, attrs):
        t = tag.lower()
        if t == "ol":
            self.in_ol = True
        elif t == "li" and self.in_ol:
            # Implicit close on the running <li>, then start a fresh one.
            self._finalize_current()
            self.in_li = True
            self.current = []
        elif t == "br" and self.in_li:
            self.current.append(" ")

    def handle_endtag(self, tag: str):
        t = tag.lower()
        if t == "li":
            self._finalize_current()
        elif t == "ol":
            self._finalize_current()
            self.in_ol = False

    def close(self):
        super().close()
        self._finalize_current()

    def handle_data(self, data: str):
        if self.in_li:
            self.current.append(data)


def parse_jubilees_chapter(html: str) -> dict[str, str]:
    p = JubileesChapterParser()
    p.feed(html)
    p.close()
    return {str(i + 1): v for i, v in enumerate(p.verses)}


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------


def scrape_enoch() -> dict[str, dict[str, str]]:
    print("Fetching 1 Enoch (Charles 1917)…")
    html = http_get(ENOCH_URL)
    chapters = parse_pseudepigrapha_single_page(html)
    print(f"  {len(chapters)} chapters, "
          f"{sum(len(v) for v in chapters.values())} verses")
    return chapters


def scrape_2_enoch() -> dict[str, dict[str, str]]:
    print("Fetching 2 Enoch / Slavonic Enoch (Morfill 1896)…")
    html = http_get(ENOCH2_URL)
    chapters = parse_pseudepigrapha_single_page(html)
    print(f"  {len(chapters)} chapters, "
          f"{sum(len(v) for v in chapters.values())} verses")
    return chapters


def scrape_jubilees() -> dict[str, dict[str, str]]:
    print(f"Fetching Jubilees (Charles 1913) — {JUBILEES_CHAPTERS} pages…")
    out: dict[str, dict[str, str]] = {}
    for ch in range(1, JUBILEES_CHAPTERS + 1):
        url = JUBILEES_URL.format(n=ch)
        html = http_get(url)
        verses = parse_jubilees_chapter(html)
        if not verses:
            print(f"  WARN: chapter {ch} parsed 0 verses — page may have non-<ol> markup", file=sys.stderr)
        out[str(ch)] = verses
        # Be polite to the server. Total wait across 50 pages ≈ 5 s.
        time.sleep(0.1)
    print(f"  {len(out)} chapters, "
          f"{sum(len(v) for v in out.values())} verses")
    return out


def write_json(name: str, data: dict) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{name}.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  -> wrote {path.relative_to(ROOT)} ({path.stat().st_size:,} bytes)")
    return path


def main() -> int:
    enoch = scrape_enoch()
    write_json("1enoch_charles_1917", enoch)

    enoch2 = scrape_2_enoch()
    write_json("2enoch_morfill_1896", enoch2)

    jubilees = scrape_jubilees()
    write_json("jubilees_charles_1913", jubilees)

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
