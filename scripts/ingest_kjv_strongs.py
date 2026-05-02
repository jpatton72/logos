#!/usr/bin/env python3
"""Build the english_strongs_index table from eBible.org's KJV2006 USFM.

For every Strong's-tagged English word in the KJV, we record (english_word,
strongs_id) pairs along with their frequency and one example reference. The
Lexicon page's English-lookup feature uses this to rank Strong's candidates
for a given English word.

Source: https://ebible.org/Scriptures/eng-kjv2006_usfm.zip
License: Public Domain (KJV text + Strong's tags both PD; eBible adds no
         restrictions beyond UK Crown Letters Patent which only apply
         inside the UK).

Default database paths (mirrors src-tauri/src/lib.rs::get_app_data_dir):
  - Linux:   ~/.local/share/aletheia/Aletheia/data/aletheia.db
  - macOS:   ~/Library/Application Support/aletheia/Aletheia/data/aletheia.db
  - Windows: %APPDATA%/aletheia/Aletheia/data/aletheia.db
"""
from __future__ import annotations

import argparse
import io
import os
import platform
import re
import sqlite3
import sys
import urllib.request
import zipfile
from collections import Counter
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _user_check import add_allow_root_flag, assert_not_root


KJV_USFM_URL = "https://ebible.org/Scriptures/eng-kjv2006_usfm.zip"
MAX_BYTES = 16 * 1024 * 1024  # ~6.5x the real ~2.4MB; trips on hostile URLs.

# eBible USFM 3-letter book codes -> the abbreviation column we use in the
# `books` table. We only ingest the 66 protocanonical books; eBible's
# eng-kjv2006 doesn't include the Apocrypha at all.
USFM_TO_DB = {
    "GEN": "Gen", "EXO": "Exod", "LEV": "Lev", "NUM": "Num", "DEU": "Deut",
    "JOS": "Josh", "JDG": "Judg", "RUT": "Ruth",
    "1SA": "1Sam", "2SA": "2Sam", "1KI": "1Kgs", "2KI": "2Kgs",
    "1CH": "1Chr", "2CH": "2Chr",
    "EZR": "Ezra", "NEH": "Neh", "EST": "Esth",
    "JOB": "Job", "PSA": "Ps", "PRO": "Prov", "ECC": "Eccl", "SNG": "Song",
    "ISA": "Isa", "JER": "Jer", "LAM": "Lam", "EZK": "Ezek", "DAN": "Dan",
    "HOS": "Hos", "JOL": "Joel", "AMO": "Amos", "OBA": "Obad", "JON": "Jonah",
    "MIC": "Mic", "NAM": "Nah", "HAB": "Hab", "ZEP": "Zeph", "HAG": "Hag",
    "ZEC": "Zech", "MAL": "Mal",
    "MAT": "Matt", "MRK": "Mark", "LUK": "Luke", "JHN": "John", "ACT": "Acts",
    "ROM": "Rom", "1CO": "1Cor", "2CO": "2Cor", "GAL": "Gal", "EPH": "Eph",
    "PHP": "Phil", "COL": "Col", "1TH": "1Thess", "2TH": "2Thess",
    "1TI": "1Tim", "2TI": "2Tim", "TIT": "Titus", "PHM": "Phlm",
    "HEB": "Heb", "JAS": "Jas", "1PE": "1Pet", "2PE": "2Pet",
    "1JN": "1John", "2JN": "2John", "3JN": "3John", "JUD": "Jude", "REV": "Rev",
}

# The agent confirmed both `\w word|strong="H0430"\w*` and the nested
# red-letter `\+w word|strong="G2316"\+w*` form appear; this single
# pattern catches both. Word may contain punctuation/spaces internally
# (e.g. "the world") so we accept everything up to the next pipe.
WORD_PATTERN = re.compile(
    r'\\\+?w\s+([^|\\]+?)\|strong="([HG]\d{4})"\\\+?w\*'
)
FOOTNOTE_PATTERN = re.compile(r"\\f .*?\\f\*", re.DOTALL)
ADD_PATTERN = re.compile(r"\\add\s+(.+?)\\add\*", re.DOTALL)


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


def normalize_strongs(raw: str) -> str:
    """eBible writes G0025/H0430; the lexicon stores G25/H430. Strip
    leading zeros so JOINs to strongs_greek/strongs_hebrew succeed."""
    if len(raw) < 2:
        return raw
    prefix, digits = raw[0], raw[1:].lstrip("0") or "0"
    return f"{prefix}{digits}"


def normalize_word(raw: str) -> str:
    """Lowercase and strip non-letter trim. Internal hyphens / apostrophes
    stay (lovingkindness, doest, knowest). Multi-word phrases like "the
    world" stay as one entry — they're rare but real in the source and
    we'd rather over-index than throw them away."""
    w = raw.strip().lower()
    # Remove leading/trailing punctuation (commas, semicolons, periods,
    # colons, brackets) but keep word-internal apostrophes and hyphens.
    return re.sub(r"^[^\w]+|[^\w]+$", "", w)


def fetch_usfm_zip(cache_path: Path) -> bytes:
    if cache_path.exists():
        data = cache_path.read_bytes()
        if 0 < len(data) <= MAX_BYTES:
            return data
        cache_path.unlink(missing_ok=True)
    print(f"Downloading {KJV_USFM_URL} ...")
    req = urllib.request.Request(KJV_USFM_URL, headers={"User-Agent": "Aletheia-ingest/1"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        content_length = resp.headers.get("Content-Length")
        if content_length and int(content_length) > MAX_BYTES:
            raise SystemExit(f"Refusing to download: Content-Length {content_length} exceeds {MAX_BYTES} cap.")
        payload = resp.read(MAX_BYTES + 1)
        if len(payload) > MAX_BYTES:
            raise SystemExit(f"Refusing to ingest: response exceeds {MAX_BYTES}-byte cap.")
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_bytes(payload)
    return payload


def parse_usfm_member(text: str, db_book_id: int, language: str):
    """Yield (book_id, chapter, verse, word_lower, strongs_normalized)
    for every Strong's-tagged word in this book's USFM file. `language`
    is decided by testament (OT books -> hebrew, NT books -> greek);
    we don't try to detect from the Strong's prefix because the file
    itself is canonical."""
    text = FOOTNOTE_PATTERN.sub(" ", text)
    text = ADD_PATTERN.sub(r"\1", text)

    chapter = 0
    verse = 0
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("\\c "):
            try:
                chapter = int(line.split()[1])
            except (IndexError, ValueError):
                pass
            verse = 0
            continue
        if line.startswith("\\v "):
            # \v 1 In the \w beginning|strong="H7225"\w* ...
            parts = line.split(None, 2)
            try:
                verse = int(parts[1])
            except (IndexError, ValueError):
                continue
            payload = parts[2] if len(parts) > 2 else ""
        else:
            # Continuation of the current verse on a new line.
            payload = line

        if chapter == 0 or verse == 0:
            continue

        for word_raw, strongs_raw in WORD_PATTERN.findall(payload):
            word = normalize_word(word_raw)
            if not word:
                continue
            yield (db_book_id, chapter, verse, word, normalize_strongs(strongs_raw))


def language_for_book(db_book_id: int) -> str:
    return "hebrew" if db_book_id <= 39 else "greek"


def ensure_schema(conn: sqlite3.Connection) -> None:
    """Creates english_strongs_index if missing. The Rust app's startup
    migrations also create this table, but rebuild_database.py runs the
    Python pipeline before any user has launched the Tauri app, so we
    can't rely on that having happened. Mirrors the DDL in
    src-tauri/src/database/migrations.rs."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS english_strongs_index (
            id INTEGER PRIMARY KEY,
            english_word TEXT NOT NULL,
            strongs_id TEXT NOT NULL,
            language TEXT NOT NULL CHECK (language IN ('hebrew', 'greek')),
            frequency INTEGER NOT NULL,
            sample_book_id INTEGER REFERENCES books(id),
            sample_chapter INTEGER,
            sample_verse INTEGER,
            UNIQUE(english_word, strongs_id)
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_english_strongs_word ON english_strongs_index(english_word)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_english_strongs_strongs ON english_strongs_index(strongs_id)"
    )


def aggregate_index(db_path: Path, payload: bytes, conn: sqlite3.Connection) -> tuple[int, int]:
    """Returns (rows_inserted, words_seen)."""
    ensure_schema(conn)
    book_id_by_abbrev = {a: bid for bid, a in conn.execute("SELECT id, abbreviation FROM books")}

    # (word, strongs) -> Counter of frequencies + first-seen reference
    freq: Counter = Counter()
    first_seen: dict[tuple[str, str], tuple[int, int, int]] = {}
    words_seen = 0

    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        for member in zf.infolist():
            name = member.filename
            if not name.lower().endswith(".usfm"):
                continue
            # Filename format: 02-GENeng-kjv2006.usfm. The 3-letter book
            # code is buried after the leading sort-prefix and dash.
            base = Path(name).stem  # 02-GENeng-kjv2006
            m = re.search(r"-([A-Z0-9]{3})eng-kjv2006", base)
            if not m:
                continue
            usfm_code = m.group(1)
            db_abbrev = USFM_TO_DB.get(usfm_code)
            if not db_abbrev:
                # eBible's eng-kjv2006 includes a couple of front-matter
                # files (FRT, GLO) without scripture content; skip
                # silently.
                continue
            db_book_id = book_id_by_abbrev.get(db_abbrev)
            if not db_book_id:
                print(f"  WARNING: USFM {usfm_code} maps to {db_abbrev} but books table has no such row.")
                continue

            with zf.open(member) as fp:
                text = fp.read().decode("utf-8-sig", errors="replace")
            language = language_for_book(db_book_id)

            for book_id, chapter, verse, word, strongs_id in parse_usfm_member(text, db_book_id, language):
                key = (word, strongs_id)
                freq[key] += 1
                first_seen.setdefault(key, (book_id, chapter, verse))
                words_seen += 1

    print(f"  Tagged words seen: {words_seen:,}")
    print(f"  Unique (word, strongs) pairs: {len(freq):,}")

    conn.execute("DELETE FROM english_strongs_index")
    rows = []
    for (word, strongs_id), count in freq.items():
        book_id, chapter, verse = first_seen[(word, strongs_id)]
        language = "hebrew" if strongs_id.startswith("H") else "greek"
        rows.append((word, strongs_id, language, count, book_id, chapter, verse))

    conn.executemany(
        "INSERT INTO english_strongs_index "
        "(english_word, strongs_id, language, frequency, sample_book_id, sample_chapter, sample_verse) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        rows,
    )
    conn.commit()
    return len(rows), words_seen


def main() -> None:
    parser = argparse.ArgumentParser(description="Build english_strongs_index from eBible KJV2006 USFM.")
    parser.add_argument("--db-path", help="Path to aletheia.db (default: app data dir).")
    parser.add_argument("--cache-dir", default="data", help="Where to cache the downloaded zip.")
    add_allow_root_flag(parser)
    args = parser.parse_args()
    assert_not_root("ingest_kjv_strongs.py", args.allow_root)

    db_path = Path(args.db_path) if args.db_path else default_db_path()
    if not db_path.exists():
        raise SystemExit(f"DB not found at {db_path}; run the app once to seed it, or pass --db-path.")
    print(f"DB:  {db_path}")

    cache_path = Path(args.cache_dir) / "eng-kjv2006_usfm.zip"
    payload = fetch_usfm_zip(cache_path)

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        rows, total = aggregate_index(db_path, payload, conn)
        print(f"Done: {rows:,} rows in english_strongs_index ({total:,} tagged words processed).")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
