#!/usr/bin/env python3
"""Populate word_mappings (Greek) from MorphGNT plain-text files.

Source format (one row per word):
    BBCCVV POS Parsing Word Norm LemmaNorm Lemma

Columns:
  1. BBCCVV  6-digit code: BB = MorphGNT book number (01=Mt, 02=Mk, ..., 27=Rev),
             CC = chapter, VV = verse.
  2. POS     2-char part-of-speech (e.g. "N-", "V-", "P-").
  3. Parsing 8-char parsing code: person|tense|voice|mood|case|number|gender|degree.
  4. Word    surface form, with punctuation and accents.
  5. Norm    surface form, normalized punctuation.
  6. LemmaN  lemma (normalized).
  7. Lemma   lemma (citation form, with diacritics).

This inserts one row per word into word_mappings with strongs_id='' (the
ingest_word_mappings.py script then resolves strongs_id via lemma lookup).
"""
from __future__ import annotations

import argparse
import os
import platform
import re
import sqlite3
import sys
from pathlib import Path

# MorphGNT BCV book number -> our DB book abbreviation (case-insensitive).
MORPHGNT_BOOKS: dict[str, str] = {
    "01": "Matt", "02": "Mark", "03": "Luke", "04": "John", "05": "Acts",
    "06": "Rom",  "07": "1Cor", "08": "2Cor", "09": "Gal",  "10": "Eph",
    "11": "Phil", "12": "Col",  "13": "1Thess","14": "2Thess",
    "15": "1Tim", "16": "2Tim", "17": "Titus","18": "Phlm",
    "19": "Heb",  "20": "Jas",  "21": "1Pet", "22": "2Pet",
    "23": "1John","24": "2John","25": "3John","26": "Jude",
    "27": "Rev",
}


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


def get_translation_id(conn: sqlite3.Connection, abbr: str) -> int:
    row = conn.execute(
        "SELECT id FROM translations WHERE abbreviation = ? COLLATE NOCASE", (abbr,)
    ).fetchone()
    if not row:
        raise SystemExit(
            f"Translation '{abbr}' not in DB. Run the main ingester first."
        )
    return int(row[0])


def get_book_id(conn: sqlite3.Connection, abbr: str) -> int | None:
    row = conn.execute(
        "SELECT id FROM books WHERE abbreviation = ? COLLATE NOCASE", (abbr,)
    ).fetchone()
    return int(row[0]) if row else None


def build_verse_index(
    conn: sqlite3.Connection, book_id: int, translation_id: int
) -> dict[tuple[int, int], int]:
    """(chapter, verse_num) -> verse_id for the given (book, translation)."""
    out: dict[tuple[int, int], int] = {}
    for ch, vn, vid in conn.execute(
        "SELECT chapter, verse_num, id FROM verses WHERE book_id = ? AND translation_id = ?",
        (book_id, translation_id),
    ):
        out[(int(ch), int(vn))] = int(vid)
    return out


LINE_RE = re.compile(r"^(\d{6})\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*$")


def ingest_file(
    conn: sqlite3.Connection,
    path: Path,
    sblgnt_id: int,
) -> tuple[int, list[str]]:
    """Ingest a single MorphGNT book file. Returns (rows_inserted, warnings)."""
    warnings: list[str] = []
    rows: list[tuple[int, int, str, str, str, str, str]] = []
    current_verse_id: int | None = None
    current_idx = 0
    cached_book_id: int | None = None
    verse_index: dict[tuple[int, int], int] = {}
    cached_book_code = ""

    with path.open("r", encoding="utf-8") as fp:
        for raw in fp:
            line = raw.strip()
            if not line:
                continue
            m = LINE_RE.match(line)
            if not m:
                warnings.append(f"unparsed line in {path.name}: {line[:60]}")
                continue
            bcv = m.group(1)
            pos = m.group(2)
            parsing = m.group(3)
            word = m.group(4)
            lemma = m.group(7)

            book_code = bcv[:2]
            chapter = int(bcv[2:4])
            verse_num = int(bcv[4:6])

            if book_code != cached_book_code:
                cached_book_code = book_code
                abbr = MORPHGNT_BOOKS.get(book_code)
                if not abbr:
                    warnings.append(f"unknown MorphGNT book code {book_code} in {path.name}")
                    cached_book_id = None
                    continue
                cached_book_id = get_book_id(conn, abbr)
                if cached_book_id is None:
                    warnings.append(f"book '{abbr}' not in DB (skipped {path.name})")
                    continue
                verse_index = build_verse_index(conn, cached_book_id, sblgnt_id)
                current_verse_id = None
                current_idx = 0

            if cached_book_id is None:
                continue

            verse_id = verse_index.get((chapter, verse_num))
            if verse_id is None:
                warnings.append(
                    f"no SBLGNT verse for {cached_book_code} {chapter}:{verse_num} in DB"
                )
                continue

            if verse_id != current_verse_id:
                current_verse_id = verse_id
                current_idx = 0
            else:
                current_idx += 1

            # Store morphology as POS prefix + parsing code so the existing UI
            # parser still picks up the part-of-speech, with the full code
            # available verbatim for power users.
            morphology = f"{pos[0]}{parsing}"
            rows.append((verse_id, current_idx, "", word, lemma, morphology, "greek"))

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
        default=str(Path(__file__).resolve().parent.parent / "public" / "morphgnt"),
        help="Directory containing MorphGNT *.txt files.",
    )
    parser.add_argument("--db-path", help="Path to logos.db (default: app data dir).")
    parser.add_argument(
        "--translation",
        default="sblgnt",
        help="Greek translation abbreviation in the DB (default: sblgnt).",
    )
    parser.add_argument(
        "--wipe",
        action="store_true",
        help="Delete every existing Greek word_mappings row before inserting.",
    )
    args = parser.parse_args()

    db_path = Path(args.db_path) if args.db_path else default_db_path()
    if not db_path.exists():
        raise SystemExit(f"DB not found at {db_path}")
    src = Path(args.src)
    if not src.exists():
        raise SystemExit(f"MorphGNT source dir not found: {src}")

    files = sorted(src.glob("*-morphgnt.txt"))
    if not files:
        raise SystemExit(f"No *-morphgnt.txt files in {src}")

    print(f"DB:  {db_path}")
    print(f"Src: {src} ({len(files)} files)")

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    sblgnt_id = get_translation_id(conn, args.translation)
    print(f"Translation: {args.translation} -> id={sblgnt_id}")

    if args.wipe:
        n = conn.execute("DELETE FROM word_mappings WHERE language = 'greek'").rowcount
        conn.commit()
        print(f"Wiped {n} pre-existing Greek word_mappings.")

    total_rows = 0
    total_warnings: list[str] = []
    for path in files:
        try:
            n, warnings = ingest_file(conn, path, sblgnt_id)
            conn.commit()
            print(f"  {path.name}: {n:,} words")
            total_warnings.extend(warnings)
            total_rows += n
        except Exception as e:
            conn.rollback()
            print(f"  {path.name}: ERROR {e}")

    if total_warnings:
        print(f"\n{len(total_warnings)} warning(s); first 5:")
        for w in total_warnings[:5]:
            print(f"  - {w}")

    print(f"\nDone: {total_rows:,} word_mappings rows inserted.")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
