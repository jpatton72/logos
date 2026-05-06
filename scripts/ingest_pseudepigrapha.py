#!/usr/bin/env python3
"""Ingest the bundled pseudepigrapha JSONs into the Aletheia DB.

Reads the three pre-scraped JSON files committed under
`data/pseudepigrapha/` (1 Enoch / Jubilees / 2 Enoch) and inserts them
as three new books under a new translation row,
"Pseudepigrapha (Public Domain)".

The JSONs are produced by `scripts/scrape_pseudepigrapha.py`. We commit
them to the repo so the build pipeline doesn't depend on the upstream
site staying up — this ingester reads the committed copies, never the
network.

Each book is mapped to one row in `books` (testament='apoc') and one
translation in `translations`. All three books share the same
translation row even though they were rendered by different translators
(R.H. Charles for 1 Enoch + Jubilees, W.R. Morfill for 2 Enoch); the
per-book translator credit lives in `translations.notes`.
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _user_check import add_allow_root_flag, assert_not_root

ROOT = Path(__file__).resolve().parent.parent
JSON_DIR = ROOT / "data" / "pseudepigrapha"

# Schema version that allows testament='apoc' on the books CHECK
# constraint. Older DBs need ingest_apocrypha.py to migrate first;
# this script bails with a friendly error rather than re-running that
# logic itself.
APOC_SCHEMA_VERSION = 2

TRANSLATION_NAME = "Pseudepigrapha (Public Domain)"
TRANSLATION_ABBR = "PSEUDO"
TRANSLATION_SOURCE_URL = "https://www.pseudepigrapha.com/"
TRANSLATION_NOTES = (
    "1 Enoch translated by R.H. Charles (Oxford, 1917). "
    "Jubilees translated by R.H. Charles (Oxford, 1913). "
    "2 Enoch / Slavonic Enoch translated from the Slavonic by "
    "W.R. Morfill (Oxford, 1896). All sources public domain in the US "
    "(pre-1929). Texts retrieved from pseudepigrapha.com."
)

# (json_filename, abbreviation, full_name, genre)
PSEUDEPIGRAPHA_BOOKS = [
    ("1enoch_charles_1917.json", "1En", "1 Enoch", "Pseudepigrapha"),
    ("jubilees_charles_1913.json", "Jub", "Jubilees", "Pseudepigrapha"),
    ("2enoch_morfill_1896.json", "2En", "2 Enoch", "Pseudepigrapha"),
]


def default_db_path() -> Path:
    system = platform.system()
    if system == "Windows":
        appdata = os.environ.get("APPDATA")
        if not appdata:
            raise SystemExit("APPDATA is not set; pass --db-path explicitly.")
        return Path(appdata) / "aletheia" / "Aletheia" / "data" / "aletheia.db"
    if system == "Darwin":
        return Path.home() / "Library" / "Application Support" / "aletheia" / "Aletheia" / "data" / "aletheia.db"
    return Path.home() / ".local" / "share" / "aletheia" / "Aletheia" / "data" / "aletheia.db"


def get_schema_version(conn: sqlite3.Connection) -> int:
    try:
        row = conn.execute("SELECT version FROM schema_version WHERE id = 1").fetchone()
    except sqlite3.OperationalError:
        return 0
    return int(row[0]) if row else 0


def upsert_translation(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        "SELECT id FROM translations WHERE abbreviation = ? COLLATE NOCASE",
        (TRANSLATION_ABBR,),
    ).fetchone()
    if row is not None:
        conn.execute(
            "UPDATE translations SET name = ?, language = 'english', "
            "       source_url = ?, notes = ? WHERE id = ?",
            (TRANSLATION_NAME, TRANSLATION_SOURCE_URL, TRANSLATION_NOTES, row[0]),
        )
        return int(row[0])
    cur = conn.execute(
        "INSERT INTO translations (name, abbreviation, language, source_url, notes) "
        "VALUES (?, ?, 'english', ?, ?)",
        (TRANSLATION_NAME, TRANSLATION_ABBR, TRANSLATION_SOURCE_URL, TRANSLATION_NOTES),
    )
    return int(cur.lastrowid)


def upsert_books(conn: sqlite3.Connection) -> dict[str, int]:
    """Insert any missing pseudepigrapha books. Returns abbreviation -> book_id."""
    next_order = (
        conn.execute("SELECT COALESCE(MAX(order_index), 0) FROM books").fetchone()[0] + 1
    )
    out: dict[str, int] = {}
    for _json_name, abbrev, full_name, genre in PSEUDEPIGRAPHA_BOOKS:
        row = conn.execute(
            "SELECT id FROM books WHERE abbreviation = ? COLLATE NOCASE", (abbrev,)
        ).fetchone()
        if row:
            out[abbrev] = int(row[0])
            continue
        conn.execute(
            "INSERT INTO books (abbreviation, full_name, testament, genre, order_index) "
            "VALUES (?, ?, 'apoc', ?, ?)",
            (abbrev, full_name, genre, next_order),
        )
        out[abbrev] = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
        next_order += 1
    return out


def ingest_book(
    conn: sqlite3.Connection,
    book_id: int,
    translation_id: int,
    json_path: Path,
) -> int:
    """Insert verses for one book. Returns the count inserted. Idempotent:
    deletes any prior rows for (book, translation) before inserting so
    re-running the script doesn't duplicate verses."""
    if not json_path.is_file():
        raise SystemExit(f"Missing source JSON: {json_path}")
    with json_path.open("r", encoding="utf-8") as fp:
        data: dict[str, dict[str, str]] = json.load(fp)

    conn.execute(
        "DELETE FROM verses_fts WHERE book_id = ? AND translation_id = ?",
        (book_id, translation_id),
    )
    conn.execute(
        "DELETE FROM verses WHERE book_id = ? AND translation_id = ?",
        (book_id, translation_id),
    )

    rows: list[tuple[int, int, int, int, str]] = []
    for chap_str, verses in data.items():
        try:
            chapter = int(chap_str)
        except ValueError:
            continue
        for verse_str, text in verses.items():
            try:
                verse_num = int(verse_str)
            except ValueError:
                continue
            if not isinstance(text, str) or not text.strip():
                continue
            rows.append((book_id, chapter, verse_num, translation_id, text.strip()))

    conn.executemany(
        "INSERT INTO verses (book_id, chapter, verse_num, translation_id, text) "
        "VALUES (?, ?, ?, ?, ?)",
        rows,
    )
    conn.execute(
        "INSERT INTO verses_fts (verse_id, book_id, chapter, verse_num, text, translation_id) "
        "SELECT id, book_id, chapter, verse_num, text, translation_id "
        "FROM verses WHERE book_id = ? AND translation_id = ?",
        (book_id, translation_id),
    )
    return len(rows)


def ingest(db_path: Path) -> None:
    if not db_path.exists():
        raise SystemExit(
            f"DB not found at {db_path}; run the app once to seed it, or pass --db-path."
        )

    print(f"DB: {db_path}")
    print(f"Source dir: {JSON_DIR}")

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA foreign_keys = ON")

    try:
        if get_schema_version(conn) < APOC_SCHEMA_VERSION:
            raise SystemExit(
                "DB schema is older than v2 (needs the relaxed-testament migration). "
                "Run scripts/ingest_apocrypha.py first to migrate, or rebuild the DB."
            )

        translation_id = upsert_translation(conn)
        book_ids = upsert_books(conn)

        total = 0
        for json_name, abbrev, full_name, _genre in PSEUDEPIGRAPHA_BOOKS:
            json_path = JSON_DIR / json_name
            count = ingest_book(conn, book_ids[abbrev], translation_id, json_path)
            print(f"  {full_name}: inserted {count:,} verses")
            total += count

        conn.commit()
        print(f"Done: {total:,} pseudepigrapha verses across {len(PSEUDEPIGRAPHA_BOOKS)} books.")
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db-path", help="Path to aletheia.db (default: app data dir).")
    add_allow_root_flag(parser)
    args = parser.parse_args()
    assert_not_root(args.allow_root, script_name="ingest_pseudepigrapha.py")
    db_path = Path(args.db_path) if args.db_path else default_db_path()
    ingest(db_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
