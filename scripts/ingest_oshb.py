#!/usr/bin/env python3
"""Populate word_mappings (Hebrew / Aramaic) from OpenScriptures Hebrew Bible
(OSHB) OSIS XML files.

Source: https://github.com/openscriptures/morphhb/tree/master/wlc

Each book file contains <verse osisID="Gen.1.1"> elements with one <w> per
word/morpheme cluster. The lemma attribute carries Strong's numbers (often
prefixed with particle letters and joined by slashes, e.g. "b/7225",
"c/d/776"). The morph attribute starts with H (Hebrew) or A (Aramaic).

We insert one word_mappings row per <w> element. The Strong's ID is taken
from the LAST numeric token in the lemma (which in OSHB convention is the
main content lemma; preceding tokens are particles/prefixes).
"""
from __future__ import annotations

import argparse
import os
import platform
import re
import sqlite3
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

OSHB_BOOKS = [
    "Gen", "Exod", "Lev", "Num", "Deut", "Josh", "Judg", "Ruth",
    "1Sam", "2Sam", "1Kgs", "2Kgs", "1Chr", "2Chr", "Ezra", "Neh",
    "Esth", "Job", "Ps", "Prov", "Eccl", "Song", "Isa", "Jer",
    "Lam", "Ezek", "Dan", "Hos", "Joel", "Amos", "Obad", "Jonah",
    "Mic", "Nah", "Hab", "Zeph", "Hag", "Zech", "Mal",
]

OSIS_NS = "{http://www.bibletechnologies.net/2003/OSIS/namespace}"
NUMBER_RE = re.compile(r"\d+")


def default_db_path() -> Path:
    system = platform.system()
    if system == "Windows":
        appdata = os.environ.get("APPDATA")
        if not appdata:
            raise SystemExit("APPDATA is not set; pass --db-path explicitly.")
        return Path(appdata) / "logos" / "Logos" / "data" / "logos.db"
    if system == "Darwin":
        return Path.home() / "Library" / "Application Support" / "logos" / "Logos" / "data" / "logos.db"
    return Path.home() / ".local" / "share" / "logos" / "Logos" / "data" / "logos.db"


def download_book(book: str, dest: Path) -> None:
    url = f"https://raw.githubusercontent.com/openscriptures/morphhb/master/wlc/{book}.xml"
    print(f"  fetching {url}")
    with urllib.request.urlopen(url) as resp:
        dest.write_bytes(resp.read())


def extract_strongs_id(lemma: str) -> str:
    """Return 'H<digits>' from an OSHB lemma like 'b/7225' or '1254 a'."""
    nums = NUMBER_RE.findall(lemma or "")
    if not nums:
        return ""
    return f"H{nums[-1]}"


def get_translation_id(conn: sqlite3.Connection, abbr: str) -> int:
    row = conn.execute(
        "SELECT id FROM translations WHERE abbreviation = ? COLLATE NOCASE", (abbr,)
    ).fetchone()
    if not row:
        raise SystemExit(f"Translation '{abbr}' not in DB. Run ingest.py first.")
    return int(row[0])


def get_book_id(conn: sqlite3.Connection, abbr: str) -> int | None:
    row = conn.execute(
        "SELECT id FROM books WHERE abbreviation = ? COLLATE NOCASE", (abbr,)
    ).fetchone()
    return int(row[0]) if row else None


def build_verse_index(
    conn: sqlite3.Connection, book_id: int, translation_id: int
) -> dict[tuple[int, int], int]:
    out: dict[tuple[int, int], int] = {}
    for ch, vn, vid in conn.execute(
        "SELECT chapter, verse_num, id FROM verses WHERE book_id = ? AND translation_id = ?",
        (book_id, translation_id),
    ):
        out[(int(ch), int(vn))] = int(vid)
    return out


def w_text(elem: ET.Element) -> str:
    """Concatenate text nodes inside <w>, skipping nested <seg>/<note>/etc."""
    parts: list[str] = []
    if elem.text:
        parts.append(elem.text)
    for child in elem:
        if child.tail:
            parts.append(child.tail)
    return "".join(parts).strip()


def ingest_book(
    conn: sqlite3.Connection,
    book_abbr: str,
    xml_path: Path,
    wlc_id: int,
) -> tuple[int, list[str]]:
    warnings: list[str] = []
    book_id = get_book_id(conn, book_abbr)
    if book_id is None:
        return 0, [f"book '{book_abbr}' not in DB"]

    verse_index = build_verse_index(conn, book_id, wlc_id)
    if not verse_index:
        return 0, [f"no WLC verses found for {book_abbr} in DB"]

    tree = ET.parse(xml_path)
    root = tree.getroot()

    rows: list[tuple[int, int, str, str, str, str, str]] = []
    for verse in root.iter(f"{OSIS_NS}verse"):
        osis_id = verse.attrib.get("osisID", "")
        # Skip <verse eID="..."/> end markers — they only have eID, not osisID.
        if not osis_id:
            continue
        try:
            _, ch_str, vn_str = osis_id.split(".")
            chapter = int(ch_str)
            verse_num = int(vn_str)
        except ValueError:
            warnings.append(f"unparsed osisID {osis_id!r}")
            continue
        verse_id = verse_index.get((chapter, verse_num))
        if verse_id is None:
            warnings.append(f"no DB verse for {osis_id}")
            continue

        idx = 0
        for w in verse.iter(f"{OSIS_NS}w"):
            text = w_text(w)
            if not text:
                continue
            lemma = w.attrib.get("lemma", "")
            morph = w.attrib.get("morph", "")
            strongs_id = extract_strongs_id(lemma)
            rows.append((verse_id, idx, strongs_id, text, lemma, morph, "hebrew"))
            idx += 1

    if rows:
        conn.executemany(
            """
            INSERT OR REPLACE INTO word_mappings
              (verse_id, word_index, strongs_id, original_word, lemma, morphology, language)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )
    return len(rows), warnings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--src",
        default=str(Path(__file__).resolve().parent.parent / "data" / "oshb"),
        help="Directory holding OSHB XML files (downloaded if missing).",
    )
    parser.add_argument("--db-path", help="Path to logos.db (default: app data dir).")
    parser.add_argument("--translation", default="wlc", help="Hebrew translation abbr (default: wlc).")
    parser.add_argument("--wipe", action="store_true", help="Delete existing Hebrew word_mappings first.")
    parser.add_argument("--no-download", action="store_true", help="Skip download even if files are missing.")
    args = parser.parse_args()

    db_path = Path(args.db_path) if args.db_path else default_db_path()
    if not db_path.exists():
        raise SystemExit(f"DB not found at {db_path}")
    src = Path(args.src)
    src.mkdir(parents=True, exist_ok=True)

    print(f"DB:  {db_path}")
    print(f"Src: {src}")

    # Download missing books.
    missing = [b for b in OSHB_BOOKS if not (src / f"{b}.xml").exists()]
    if missing:
        if args.no_download:
            print(f"Missing {len(missing)} files but --no-download set; skipping.")
        else:
            print(f"Downloading {len(missing)} OSHB book file(s)...")
            for book in missing:
                try:
                    download_book(book, src / f"{book}.xml")
                except Exception as e:
                    print(f"  WARN: {book} failed to download: {e}")

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    wlc_id = get_translation_id(conn, args.translation)
    print(f"Translation: {args.translation} -> id={wlc_id}")

    if args.wipe:
        n = conn.execute("DELETE FROM word_mappings WHERE language = 'hebrew'").rowcount
        conn.commit()
        print(f"Wiped {n} pre-existing Hebrew word_mappings.")

    total_rows = 0
    total_warnings: list[str] = []
    for book in OSHB_BOOKS:
        path = src / f"{book}.xml"
        if not path.exists():
            print(f"  {book}: file missing, skipping")
            continue
        try:
            n, warns = ingest_book(conn, book, path, wlc_id)
            conn.commit()
            print(f"  {book}: {n:,} words")
            total_warnings.extend(warns)
            total_rows += n
        except Exception as e:
            conn.rollback()
            print(f"  {book}: ERROR {e}")

    if total_warnings:
        print(f"\n{len(total_warnings)} warning(s); first 5:")
        for w in total_warnings[:5]:
            print(f"  - {w}")

    print(f"\nDone: {total_rows:,} Hebrew word_mappings rows inserted.")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
