#!/usr/bin/env python3
"""Quick spot-check that key verses are present in each language.

Usage:
    python scripts/spot_check.py
    python scripts/spot_check.py --db-path /path/to/logos.db
"""
from __future__ import annotations

import argparse
import os
import platform
import sqlite3
import sys
from pathlib import Path


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


HEBREW_CHECKS = [
    ("Gen", 1, 1, "wlc", "Hebrew Genesis 1:1"),
    ("Ps", 23, 1, "wlc", "Hebrew Psalms 23:1"),
    ("Isa", 40, 1, "wlc", "Hebrew Isaiah 40:1"),
]
GREEK_CHECKS = [
    ("John", 1, 1, "sblgnt", "Greek John 1:1"),
    ("Rev", 22, 21, "sblgnt", "Greek Revelation 22:21"),
]
ENGLISH_CHECKS = [
    ("Gen", 1, 1, "kjv", "KJV Genesis 1:1"),
    ("John", 3, 16, "kjv", "KJV John 3:16"),
    ("John", 3, 16, "nkjv", "NKJV John 3:16"),
    ("John", 3, 16, "esv", "ESV John 3:16"),
    ("Tob", 1, 1, "kjv", "KJV-Apocrypha Tobit 1:1"),
]


def lookup(conn: sqlite3.Connection, abbrev: str, ch: int, vn: int, trans: str, label: str) -> None:
    row = conn.execute(
        """
        SELECT v.text FROM verses v
        JOIN books b ON v.book_id = b.id
        JOIN translations t ON v.translation_id = t.id
        WHERE b.abbreviation = ? COLLATE NOCASE
          AND v.chapter = ? AND v.verse_num = ?
          AND t.abbreviation = ? COLLATE NOCASE
        """,
        (abbrev, ch, vn, trans),
    ).fetchone()
    if row:
        text = row[0].replace("\n", " ")
        print(f"  {label}: {text[:80]}{'…' if len(text) > 80 else ''}")
    else:
        print(f"  {label}: MISSING")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db-path", help="Path to logos.db (default: app data dir).")
    args = parser.parse_args()

    db_path = Path(args.db_path) if args.db_path else default_db_path()
    if not db_path.exists():
        raise SystemExit(f"DB not found at {db_path}")

    conn = sqlite3.connect(db_path)
    try:
        print("English / Apocrypha spot-check:")
        for c in ENGLISH_CHECKS:
            lookup(conn, *c)
        print("\nHebrew spot-check:")
        for c in HEBREW_CHECKS:
            lookup(conn, *c)
        print("\nGreek spot-check:")
        for c in GREEK_CHECKS:
            lookup(conn, *c)

        print("\nVerse counts:")
        for row in conn.execute(
            """
            SELECT tr.abbreviation, tr.name, tr.language,
                   COUNT(DISTINCT b.id) AS books,
                   COUNT(v.id) AS verses
            FROM translations tr
            LEFT JOIN verses v ON v.translation_id = tr.id
            JOIN books b ON v.book_id = b.id
            GROUP BY tr.id
            ORDER BY tr.id
            """
        ):
            print(f"  {row[0]} ({row[2]}): {row[3]} books, {row[4]:,} verses")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
