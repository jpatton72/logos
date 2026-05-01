#!/usr/bin/env python3
"""Quick sanity-check of the Aletheia SQLite DB.

Usage:
    python scripts/check_db.py
    python scripts/check_db.py --db-path /path/to/aletheia.db
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
        return Path(appdata) / "aletheia" / "Aletheia" / "data" / "aletheia.db"
    if system == "Darwin":
        return Path.home() / "Library" / "Application Support" / "aletheia" / "Aletheia" / "data" / "aletheia.db"
    return Path.home() / ".local" / "share" / "aletheia" / "Aletheia" / "data" / "aletheia.db"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db-path", help="Path to aletheia.db (default: app data dir).")
    args = parser.parse_args()

    db_path = Path(args.db_path) if args.db_path else default_db_path()
    if not db_path.exists():
        raise SystemExit(f"DB not found at {db_path}")

    conn = sqlite3.connect(db_path)
    try:
        for t in ("verses", "books", "translations", "word_mappings", "strongs_greek", "strongs_hebrew"):
            row = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()
            print(f"  {t}: {row[0]:,}")
        print()
        print("Verses by translation:")
        for row in conn.execute(
            """
            SELECT tr.abbreviation, tr.name, COUNT(v.id) AS verses
            FROM translations tr LEFT JOIN verses v ON v.translation_id = tr.id
            GROUP BY tr.id
            ORDER BY tr.id
            """
        ):
            print(f"    {row[0]} ({row[1]}): {row[2]:,} verses")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
