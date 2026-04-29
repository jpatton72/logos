#!/usr/bin/env python3
"""Ingest apocryphal / non-canonical books from a Bible-JSON file into the
Logos SQLite DB. Adds new rows to `books` (testament='apoc') and inserts the
verses under the chosen translation.

Source format (Amosamevor/Bible-json):
    { "1 Esdras": { "1": { "1": "And Josias..." }, ... }, ... }
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import sqlite3
import sys
import urllib.request
from pathlib import Path


STRICT_TESTAMENT_CHECK = "testament IN ('ot', 'nt')"

# Order_index values start AFTER the 66 canonical books. Genre is loosely
# categorized; the UI doesn't currently filter on it for apocrypha.
APOCRYPHA_BOOKS = [
    # (json_name, abbreviation, full_name, genre)
    ("1 Esdras", "1Esd", "1 Esdras", "Apocrypha"),
    ("2 Esdras", "2Esd", "2 Esdras", "Apocrypha"),
    ("Tobit", "Tob", "Tobit", "Apocrypha"),
    ("Judith", "Jdt", "Judith", "Apocrypha"),
    ("Esther (Greek)", "EsthG", "Esther (Greek)", "Apocrypha"),
    ("Wisdom of Solomon", "Wis", "Wisdom of Solomon", "Apocrypha"),
    ("Ecclesiasticus (Sira)", "Sir", "Ecclesiasticus (Sirach)", "Apocrypha"),
    ("Baruch", "Bar", "Baruch", "Apocrypha"),
    ("Epistle of Jeremiah", "EpJer", "Epistle of Jeremiah", "Apocrypha"),
    ("Prayer of Azariah", "PrAzar", "Prayer of Azariah", "Apocrypha"),
    ("Susanna", "Sus", "Susanna", "Apocrypha"),
    ("Bel and the Dragon", "Bel", "Bel and the Dragon", "Apocrypha"),
    ("Prayer of Manasseh", "PrMan", "Prayer of Manasseh", "Apocrypha"),
    ("1 Maccabees", "1Macc", "1 Maccabees", "Apocrypha"),
    ("2 Maccabees", "2Macc", "2 Maccabees", "Apocrypha"),
]


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


def needs_books_migration(conn: sqlite3.Connection) -> bool:
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='books'"
    ).fetchone()
    return bool(row) and STRICT_TESTAMENT_CHECK in row[0]


def migrate_books_table(conn: sqlite3.Connection) -> None:
    """Rebuild `books` so the testament CHECK accepts 'apoc'.

    Steps:
      1. CREATE books_new with relaxed CHECK.
      2. Copy all rows from books -> books_new.
      3. DROP books, RENAME books_new -> books.
    Foreign keys from `verses(book_id)` reference `books(id)`. We disable
    foreign_keys for the duration of the rebuild so the rename doesn't trip
    referential checks; values are preserved exactly.
    """
    print("Migrating `books` table to allow testament='apoc'...")
    conn.execute("PRAGMA foreign_keys = OFF")
    try:
        conn.executescript(
            """
            CREATE TABLE books_new (
                id INTEGER PRIMARY KEY,
                abbreviation TEXT UNIQUE NOT NULL,
                full_name TEXT NOT NULL,
                testament TEXT NOT NULL CHECK (testament IN ('ot', 'nt', 'apoc')),
                genre TEXT NOT NULL,
                order_index INTEGER NOT NULL
            );
            INSERT INTO books_new (id, abbreviation, full_name, testament, genre, order_index)
              SELECT id, abbreviation, full_name, testament, genre, order_index FROM books;
            DROP TABLE books;
            ALTER TABLE books_new RENAME TO books;
            """
        )
    finally:
        conn.execute("PRAGMA foreign_keys = ON")
    print("Migration complete.")


def upsert_apocrypha_books(conn: sqlite3.Connection) -> dict[str, int]:
    """Insert any missing apocrypha books. Returns json_name -> book_id."""
    next_order = (
        conn.execute("SELECT COALESCE(MAX(order_index), 0) FROM books").fetchone()[0] + 1
    )
    out: dict[str, int] = {}
    for json_name, abbrev, full_name, genre in APOCRYPHA_BOOKS:
        row = conn.execute(
            "SELECT id FROM books WHERE abbreviation = ? COLLATE NOCASE", (abbrev,)
        ).fetchone()
        if row:
            out[json_name] = int(row[0])
            continue
        conn.execute(
            "INSERT INTO books (abbreviation, full_name, testament, genre, order_index) "
            "VALUES (?, ?, 'apoc', ?, ?)",
            (abbrev, full_name, genre, next_order),
        )
        out[json_name] = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
        next_order += 1
    return out


def get_translation_id(conn: sqlite3.Connection, abbr: str) -> int:
    row = conn.execute(
        "SELECT id FROM translations WHERE abbreviation = ? COLLATE NOCASE", (abbr,)
    ).fetchone()
    if not row:
        raise SystemExit(
            f"Translation '{abbr}' is not in the database. Run the regular ingester first."
        )
    return int(row[0])


def ingest(
    db_path: Path,
    json_path: Path,
    translation_abbr: str,
    download_url: str | None = None,
) -> None:
    if not db_path.exists():
        raise SystemExit(f"DB not found at {db_path}; run the app once to seed it, or pass --db-path.")
    if not json_path.exists():
        if download_url:
            print(f"JSON file not found locally; downloading from {download_url}")
            json_path.parent.mkdir(parents=True, exist_ok=True)
            with urllib.request.urlopen(download_url) as resp:
                json_path.write_bytes(resp.read())
        else:
            raise SystemExit(f"JSON file not found: {json_path}")

    print(f"DB:  {db_path}")
    print(f"In:  {json_path}")
    print(f"Translation: {translation_abbr}")

    with json_path.open("r", encoding="utf-8") as fp:
        data = json.load(fp)
    if not isinstance(data, dict):
        raise SystemExit("Unexpected JSON shape; expected an object keyed by book name.")

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA foreign_keys = ON")

    try:
        if needs_books_migration(conn):
            migrate_books_table(conn)
        else:
            print("`books` table already accepts testament='apoc'.")

        translation_id = get_translation_id(conn, translation_abbr)
        book_ids = upsert_apocrypha_books(conn)

        # Wipe any prior apocrypha verses for this translation so reruns are idempotent.
        conn.execute(
            "DELETE FROM verses_fts WHERE translation_id = ? AND book_id IN ("
            "  SELECT id FROM books WHERE testament = 'apoc'"
            ")",
            (translation_id,),
        )
        conn.execute(
            "DELETE FROM verses WHERE translation_id = ? AND book_id IN ("
            "  SELECT id FROM books WHERE testament = 'apoc'"
            ")",
            (translation_id,),
        )

        rows: list[tuple[int, int, int, int, str]] = []
        unknown: list[str] = []
        for book_name, chapters in data.items():
            book_id = book_ids.get(book_name)
            if book_id is None:
                unknown.append(book_name)
                continue
            for chap_str, verses in chapters.items():
                try:
                    chapter = int(chap_str)
                except ValueError:
                    continue
                for verse_str, text in verses.items():
                    try:
                        verse_num = int(verse_str)
                    except ValueError:
                        continue
                    if not isinstance(text, str):
                        continue
                    rows.append((book_id, chapter, verse_num, translation_id, text.strip()))

        if unknown:
            print(f"WARNING: {len(unknown)} book(s) in JSON not in our apocrypha map: {unknown[:5]}")

        print(f"Inserting {len(rows):,} verses...")
        conn.executemany(
            "INSERT INTO verses (book_id, chapter, verse_num, translation_id, text) VALUES (?, ?, ?, ?, ?)",
            rows,
        )

        print("Populating verses_fts...")
        conn.execute(
            """
            INSERT INTO verses_fts (verse_id, book_id, chapter, verse_num, text, translation_id)
            SELECT v.id, v.book_id, v.chapter, v.verse_num, v.text, v.translation_id
            FROM verses v
            JOIN books b ON v.book_id = b.id
            WHERE v.translation_id = ? AND b.testament = 'apoc'
            """,
            (translation_id,),
        )

        conn.commit()

        n = conn.execute(
            "SELECT COUNT(*) FROM verses v JOIN books b ON v.book_id=b.id "
            "WHERE v.translation_id = ? AND b.testament = 'apoc'",
            (translation_id,),
        ).fetchone()[0]
        print(f"Done: {n:,} apocryphal verses for {translation_abbr}.")
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", required=True, help="Path to a Bible-json apocrypha file.")
    parser.add_argument(
        "--translation",
        default="KJV",
        help="Translation abbreviation to attach these verses to (default: KJV).",
    )
    parser.add_argument("--db-path", help="Path to logos.db (default: app data dir).")
    parser.add_argument(
        "--download-url",
        help="If --json doesn't exist locally, download it from this URL.",
    )
    args = parser.parse_args()
    db_path = Path(args.db_path) if args.db_path else default_db_path()
    ingest(db_path, Path(args.json), args.translation, args.download_url)
    return 0


if __name__ == "__main__":
    sys.exit(main())
