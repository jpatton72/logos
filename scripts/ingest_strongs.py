#!/usr/bin/env python3
"""
Ingest Strong's Hebrew and Greek lexicons from openscriptures/strongs into logos.db.

Data source: https://github.com/openscriptures/strongs
- hebrew/strongs-hebrew-dictionary.js  (~2MB, CC-BY-SA)
- greek/strongs-greek-dictionary.js    (~1.2MB, CC-BY-SA)

Strong's Hebrew table schema (from migrations.rs):
  strongs_hebrew(id TEXT PK, word TEXT, ketiv_qere TEXT,
                 transliteration TEXT, definition TEXT, pronunciation TEXT)

Strong's Greek table schema:
  strongs_greek(id TEXT PK, word TEXT, transliteration TEXT,
                definition TEXT, pronunciation TEXT)
"""

import sqlite3, re, urllib.request, json, sys, os, platform, argparse
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _user_check import add_allow_root_flag, assert_not_root


def get_default_db_path() -> Path:
    """Mirror src-tauri/src/lib.rs::get_app_data_dir()."""
    system = platform.system()
    if system == "Windows":
        appdata = os.environ.get("APPDATA")
        if not appdata:
            raise SystemExit("APPDATA is not set; pass --db-path explicitly.")
        return Path(appdata) / "logos" / "Logos" / "data" / "logos.db"
    if system == "Darwin":
        return Path.home() / "Library" / "Application Support" / "logos" / "Logos" / "data" / "logos.db"
    return Path.home() / ".local" / "share" / "logos" / "Logos" / "data" / "logos.db"


def ensure_parent_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
HEBREW_URL = "https://raw.githubusercontent.com/openscriptures/strongs/master/hebrew/strongs-hebrew-dictionary.js"
GREEK_URL  = "https://raw.githubusercontent.com/openscriptures/strongs/master/greek/strongs-greek-dictionary.js"


def fetch(url: str, timeout: int = 60) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "LogosBibleApp/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")


def parse_js_dict(text: str) -> dict:
    """Extract JSON object from 'var name = {...}' JS file."""
    # Find the opening brace of the object
    m = re.search(r"= \{", text)
    if not m:
        raise ValueError("Could not find JSON object start in JS file")
    start = m.start() + 2  # skip past "= {"
    depth, in_str, escaped = 0, False, False
    for i, ch in enumerate(text[start:]):
        if escaped:
            escaped = False
            continue
        if ch == "\\" and in_str:
            escaped = True
            continue
        if ch == '"' and not escaped:
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch in "{[":
            depth += 1
        elif ch in "}]":
            depth -= 1
            if depth == 0:
                json_str = text[start:start + i + 1]
                return json.loads(json_str)
    raise ValueError("Could not parse JS JSON object — unmatched braces")


def ensure_tables(conn: sqlite3.Connection) -> None:
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")

    conn.execute("""
        CREATE TABLE IF NOT EXISTS strongs_greek (
            id TEXT PRIMARY KEY,
            word TEXT NOT NULL,
            transliteration TEXT NOT NULL,
            definition TEXT NOT NULL,
            pronunciation TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS strongs_hebrew (
            id TEXT PRIMARY KEY,
            word TEXT NOT NULL,
            ketiv_qere TEXT,
            transliteration TEXT NOT NULL,
            definition TEXT NOT NULL,
            pronunciation TEXT
        )
    """)
    conn.commit()


def ingest_greek(conn: sqlite3.Connection) -> int:
    print("Fetching Strong's Greek...")
    text = fetch(GREEK_URL)
    data = parse_js_dict(text)
    print(f"  Parsed {len(data)} Greek entries")

    rows = []
    for strong_id, entry in data.items():
        if not strong_id.startswith("G"):
            continue
        rows.append((
            strong_id,
            entry.get("lemma", ""),
            entry.get("translit", ""),
            entry.get("strongs_def", ""),
            entry.get("kjv_def", ""),
        ))

    conn.executemany("""
        INSERT OR REPLACE INTO strongs_greek
            (id, word, transliteration, definition, pronunciation)
        VALUES (?, ?, ?, ?, ?)
    """, rows)
    conn.commit()
    print(f"  Greek: {len(rows)} entries inserted/replaced")
    return len(rows)


def ingest_hebrew(conn: sqlite3.Connection) -> int:
    print("Fetching Strong's Hebrew...")
    text = fetch(HEBREW_URL)
    data = parse_js_dict(text)
    print(f"  Parsed {len(data)} Hebrew entries")

    rows = []
    for strong_id, entry in data.items():
        if not strong_id.startswith("H"):
            continue
        rows.append((
            strong_id,
            entry.get("lemma", ""),
            entry.get("kjv_def", ""),   # no ketiv_qere field in openscriptures data
            entry.get("xlit", ""),
            entry.get("strongs_def", ""),
            entry.get("pron", ""),
        ))

    conn.executemany("""
        INSERT OR REPLACE INTO strongs_hebrew
            (id, word, ketiv_qere, transliteration, definition, pronunciation)
        VALUES (?, ?, ?, ?, ?, ?)
    """, rows)
    conn.commit()
    print(f"  Hebrew: {len(rows)} entries inserted/replaced")
    return len(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest Strong's Hebrew and Greek lexicons into logos.db")
    parser.add_argument("--db-path", type=Path, default=None,
                        help="Path to logos.db (default: platform-specific app data dir)")
    add_allow_root_flag(parser)
    args = parser.parse_args()
    assert_not_root(args.allow_root, script_name="ingest_strongs.py")

    db_path = args.db_path or get_default_db_path()
    ensure_parent_dir(db_path)
    print(f"Using database: {db_path}")

    conn = sqlite3.connect(db_path)
    ensure_tables(conn)

    greek_count = ingest_greek(conn)
    hebrew_count = ingest_hebrew(conn)

    # Quick sanity check
    cur = conn.execute("SELECT COUNT(*) FROM strongs_greek")
    print(f"  Verifying: {cur.fetchone()[0]} rows in strongs_greek")
    cur = conn.execute("SELECT COUNT(*) FROM strongs_hebrew")
    print(f"  Verifying: {cur.fetchone()[0]} rows in strongs_hebrew")

    print(f"\nDone. Greek: {greek_count}, Hebrew: {hebrew_count}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
