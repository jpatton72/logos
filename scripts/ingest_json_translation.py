#!/usr/bin/env python3
"""Ingest a Bible-JSON translation file into the Aletheia SQLite DB.

Source format (Amosamevor/Bible-json):
    { "Genesis": { "1": { "1": "In the beginning..." }, ... }, ... }

Target tables: translations, verses, verses_fts.
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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _user_check import add_allow_root_flag, assert_not_root


def default_db_path() -> Path:
    """Mirror src-tauri/src/lib.rs::get_app_data_dir()."""
    system = platform.system()
    if system == "Windows":
        appdata = os.environ.get("APPDATA")
        if not appdata:
            raise SystemExit("APPDATA is not set; pass --db-path explicitly.")
        return Path(appdata) / "aletheia" / "Aletheia" / "data" / "aletheia.db"
    if system == "Darwin":
        return Path.home() / "Library" / "Application Support" / "aletheia" / "Aletheia" / "data" / "aletheia.db"
    return Path.home() / ".local" / "share" / "aletheia" / "Aletheia" / "data" / "aletheia.db"


def upsert_translation(conn: sqlite3.Connection, name: str, abbrev: str, source_url: str) -> int:
    cur = conn.execute(
        "SELECT id FROM translations WHERE abbreviation = ? COLLATE NOCASE",
        (abbrev,),
    )
    row = cur.fetchone()
    if row is not None:
        conn.execute(
            "UPDATE translations SET name = ?, language = 'english', source_url = ? WHERE id = ?",
            (name, source_url, row[0]),
        )
        return int(row[0])
    cur = conn.execute(
        "INSERT INTO translations (name, abbreviation, language, source_url) VALUES (?, ?, 'english', ?)",
        (name, abbrev, source_url),
    )
    return int(cur.lastrowid)


def load_book_index(conn: sqlite3.Connection) -> dict[str, tuple[int, str]]:
    """Map normalized full_name -> (book_id, abbreviation)."""
    out: dict[str, tuple[int, str]] = {}
    for bid, abbrev, full in conn.execute("SELECT id, abbreviation, full_name FROM books"):
        out[full.strip().lower()] = (int(bid), abbrev)
    return out


# Bible-json sometimes uses slightly different book names. Aliases map JSON name → DB full_name.
BOOK_ALIASES = {
    "psalm": "psalms",
    "song of songs": "song of solomon",
    "canticles": "song of solomon",
}


def resolve_book(json_name: str, index: dict[str, tuple[int, str]]) -> tuple[int, str] | None:
    key = json_name.strip().lower()
    if key in index:
        return index[key]
    if key in BOOK_ALIASES:
        return index.get(BOOK_ALIASES[key])
    return None


def ingest(
    db_path: Path,
    json_path: Path,
    name: str,
    abbreviation: str,
    source_url: str,
    rebuild_fts: bool,
    download_url: str | None = None,
) -> None:
    if not db_path.exists():
        raise SystemExit(f"DB not found at {db_path}; run the app once to seed it, or pass --db-path.")
    # Cap JSON inputs at 256 MiB. Real Bible-translation JSON files top out
    # around 10 MiB; anything larger almost certainly indicates a bad URL,
    # a corrupt download, or a hostile payload, and json.load on a runaway
    # file will happily blow out memory before failing.
    max_bytes = 256 * 1024 * 1024
    if not json_path.exists():
        if download_url:
            print(f"JSON file not found locally; downloading from {download_url}")
            json_path.parent.mkdir(parents=True, exist_ok=True)
            with urllib.request.urlopen(download_url) as resp:
                content_length = resp.headers.get("Content-Length")
                if content_length and int(content_length) > max_bytes:
                    raise SystemExit(
                        f"Refusing to download {download_url}: "
                        f"Content-Length {content_length} exceeds {max_bytes}-byte cap."
                    )
                payload = resp.read(max_bytes + 1)
                if len(payload) > max_bytes:
                    raise SystemExit(
                        f"Refusing to download {download_url}: response exceeds {max_bytes}-byte cap."
                    )
                json_path.write_bytes(payload)
        else:
            raise SystemExit(f"JSON file not found: {json_path}")

    file_size = json_path.stat().st_size
    if file_size > max_bytes:
        raise SystemExit(
            f"Refusing to ingest {json_path}: file is {file_size} bytes (cap {max_bytes})."
        )

    print(f"DB:  {db_path}")
    print(f"In:  {json_path}")

    with json_path.open("r", encoding="utf-8") as fp:
        data = json.load(fp)
    if not isinstance(data, dict):
        raise SystemExit("Unexpected JSON shape; expected an object keyed by book name.")

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA foreign_keys = ON")

    try:
        translation_id = upsert_translation(conn, name, abbreviation, source_url)
        print(f"Translation: {name} ({abbreviation}) -> id={translation_id}")

        books = load_book_index(conn)

        # Wipe existing rows for this translation so reruns are idempotent.
        conn.execute("DELETE FROM verses_fts WHERE translation_id = ?", (translation_id,))
        conn.execute("DELETE FROM verses WHERE translation_id = ?", (translation_id,))

        rows: list[tuple[int, int, int, int, str]] = []
        unknown_books: list[str] = []
        for book_name, chapters in data.items():
            resolved = resolve_book(book_name, books)
            if resolved is None:
                unknown_books.append(book_name)
                continue
            book_id, _abbrev = resolved
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

        if unknown_books:
            print(f"WARNING: {len(unknown_books)} book(s) not matched: {unknown_books[:10]}")

        print(f"Inserting {len(rows):,} verses...")
        conn.executemany(
            "INSERT INTO verses (book_id, chapter, verse_num, translation_id, text) VALUES (?, ?, ?, ?, ?)",
            rows,
        )

        # Repopulate FTS for this translation only.
        print("Populating verses_fts...")
        conn.execute(
            """
            INSERT INTO verses_fts (verse_id, book_id, chapter, verse_num, text, translation_id)
            SELECT id, book_id, chapter, verse_num, text, translation_id
            FROM verses
            WHERE translation_id = ?
            """,
            (translation_id,),
        )

        if rebuild_fts:
            print("Optimizing verses_fts...")
            conn.execute("INSERT INTO verses_fts(verses_fts) VALUES('optimize')")

        conn.commit()

        verse_count = conn.execute(
            "SELECT COUNT(*) FROM verses WHERE translation_id = ?", (translation_id,)
        ).fetchone()[0]
        print(f"Done: {verse_count:,} verses in {abbreviation}.")
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", required=True, help="Path to a Bible-json translation file.")
    parser.add_argument("--name", required=True, help="Full translation name, e.g. 'New King James Version'.")
    parser.add_argument("--abbr", required=True, help="Translation abbreviation, e.g. 'NKJV'.")
    parser.add_argument("--source-url", default="https://github.com/Amosamevor/Bible-json")
    parser.add_argument(
        "--download-url",
        help="If --json doesn't exist locally, download it from this URL.",
    )
    parser.add_argument("--db-path", help="Path to aletheia.db (default: app data dir).")
    parser.add_argument("--optimize", action="store_true", help="Run FTS optimize at the end.")
    add_allow_root_flag(parser)
    args = parser.parse_args()
    assert_not_root(args.allow_root, script_name="ingest_json_translation.py")

    db_path = Path(args.db_path) if args.db_path else default_db_path()
    json_path = Path(args.json)
    ingest(db_path, json_path, args.name, args.abbr, args.source_url, args.optimize, args.download_url)
    return 0


if __name__ == "__main__":
    sys.exit(main())
