#!/usr/bin/env python3
"""Build KJV<->Strong's data from eBible.org's KJV2006 USFM.

Two outputs:

1. `english_strongs_index` — aggregate (english_word, strongs_id) ->
   frequency map used by the Lexicon's English-lookup feature.
2. `english_word_alignment` — per-verse JSON token list used by the
   reader's hover-to-highlight feature. Rows are
   (verse_id, tokens_json) where tokens is an ordered array of
   `{w: string, s?: string[]}` covering every word and punctuation
   mark in the verse so the renderer can reconstruct the line.

Source: https://ebible.org/Scriptures/eng-kjv2006_usfm.zip
License: Public Domain (KJV text + Strong's tags both PD; eBible adds
         no restrictions beyond UK Crown Letters Patent which only
         apply inside the UK).

Default database paths (mirror src-tauri/src/lib.rs::get_app_data_dir):
  - Linux:   ~/.local/share/aletheia/Aletheia/data/aletheia.db
  - macOS:   ~/Library/Application Support/aletheia/Aletheia/data/aletheia.db
  - Windows: %APPDATA%/aletheia/Aletheia/data/aletheia.db
"""
from __future__ import annotations

import argparse
import io
import json
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

# Master tokenizer: a single alternation that walks each verse's content
# and yields tagged words, USFM markers (skipped), and plain text. The
# greedy plain-text branch only matches non-backslash runs so it can't
# swallow USFM markers; ordering matters — the tagged-word branch must
# precede the generic-marker branch.
COMBINED_TOKEN_RE = re.compile(
    r'\\\+?w\s+([^|\\]+?)\|strong="([HG]\d{4})"\\\+?w\*'   # 1=word 2=strongs
    r'|\\[a-zA-Z]+\d*\*?'                                    # USFM marker (skip)
    r'|[^\\]+'                                                # plain text
)
# Words = ASCII letter run optionally followed by letters/digits/apostrophes/hyphens.
# Punctuation = any single non-space, non-letter, non-digit char (commas,
# colons, em-dashes, quote marks). We deliberately don't merge runs of
# punctuation: it's rare and the renderer joins adjacent tokens cleanly.
PLAIN_WORD_RE = re.compile(r"[A-Za-z][A-Za-z0-9’‘'-]*")
PUNCT_RE = re.compile(r"[\.\,\:\;\?\!—–\(\)\[\]\"“”\-]")
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


def tokenize_verse_payload(payload: str) -> list[dict]:
    """Returns an ordered list of {w: str, s?: list[str]} dicts covering
    the whole verse line — tagged words come from `\\w...\\w*` markers,
    everything else is plain words and punctuation. The renderer joins
    adjacent tokens with spaces (skipping leading spaces before
    punctuation) to reconstruct the verse text."""
    tokens: list[dict] = []
    for m in COMBINED_TOKEN_RE.finditer(payload):
        if m.group(1) is not None:
            word = m.group(1).strip()
            if word:
                tokens.append({"w": word, "s": [normalize_strongs(m.group(2))]})
            continue
        chunk = m.group(0)
        if chunk.startswith("\\"):
            continue  # USFM marker we don't render — \nd, \wj, \q, \p, etc.
        # Plain text run: extract words and single-char punctuation.
        i = 0
        n = len(chunk)
        while i < n:
            c = chunk[i]
            if c.isspace():
                i += 1
                continue
            wm = PLAIN_WORD_RE.match(chunk, i)
            if wm:
                tokens.append({"w": wm.group(0)})
                i = wm.end()
                continue
            pm = PUNCT_RE.match(chunk, i)
            if pm:
                tokens.append({"w": pm.group(0)})
                i = pm.end()
                continue
            # Unknown character — skip silently.
            i += 1
    return tokens


def parse_usfm_book(text: str):
    """Yield (chapter, verse, tokens) for every verse in a book file."""
    text = FOOTNOTE_PATTERN.sub(" ", text)
    text = ADD_PATTERN.sub(r"\1", text)

    chapter = 0
    current_verse: int | None = None
    current_payload: list[str] = []

    def flush():
        if current_verse is not None and chapter > 0:
            payload = " ".join(current_payload)
            yield (chapter, current_verse, tokenize_verse_payload(payload))

    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("\\c "):
            # Flush previous verse, advance chapter.
            yield from flush()
            current_verse = None
            current_payload = []
            try:
                chapter = int(line.split()[1])
            except (IndexError, ValueError):
                pass
            continue
        if line.startswith("\\v "):
            yield from flush()
            current_verse = None
            current_payload = []
            parts = line.split(None, 2)
            try:
                current_verse = int(parts[1])
            except (IndexError, ValueError):
                continue
            if len(parts) > 2:
                current_payload.append(parts[2])
            continue
        # Continuation line of the current verse.
        current_payload.append(line)

    # Flush the trailing verse.
    yield from flush()


def ensure_schema(conn: sqlite3.Connection) -> None:
    """Creates the index + alignment tables if missing. Mirrors the DDL
    in src-tauri/src/database/migrations.rs so the Python pipeline
    works against a fresh DB before the Tauri app has ever launched."""
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
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS english_word_alignment (
            verse_id INTEGER PRIMARY KEY REFERENCES verses(id),
            tokens TEXT NOT NULL
        )
        """
    )


def ingest(conn: sqlite3.Connection, payload: bytes) -> tuple[int, int, int]:
    """Returns (alignment_rows, index_rows, total_tagged_words)."""
    ensure_schema(conn)

    book_id_by_abbrev = {a: bid for bid, a in conn.execute("SELECT id, abbreviation FROM books")}

    # Find KJV translation id. Fall back to whichever translation has the
    # 'KJV' abbreviation — the rebuild script seeds it as id=1 but we
    # don't want to depend on that.
    kjv_row = conn.execute(
        "SELECT id FROM translations WHERE LOWER(abbreviation) = 'kjv' LIMIT 1"
    ).fetchone()
    if kjv_row is None:
        raise SystemExit("KJV translation not found in `translations` table; run scripts/ingest.py first.")
    kjv_translation_id = kjv_row[0]

    # Aggregate index state
    freq: Counter = Counter()
    first_seen: dict[tuple[str, str], tuple[int, int, int]] = {}
    total_tagged = 0

    # Alignment state
    alignment_rows: list[tuple[int, str]] = []
    missing_verses = 0

    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        for member in zf.infolist():
            name = member.filename
            if not name.lower().endswith(".usfm"):
                continue
            base = Path(name).stem  # 02-GENeng-kjv2006
            m = re.search(r"-([A-Z0-9]{3})eng-kjv2006", base)
            if not m:
                continue
            usfm_code = m.group(1)
            db_abbrev = USFM_TO_DB.get(usfm_code)
            if not db_abbrev:
                continue  # FRT/GLO/etc. front-matter
            db_book_id = book_id_by_abbrev.get(db_abbrev)
            if not db_book_id:
                print(f"  WARNING: USFM {usfm_code} -> {db_abbrev} not in books table.")
                continue

            with zf.open(member) as fp:
                text = fp.read().decode("utf-8-sig", errors="replace")

            for chapter, verse_num, tokens in parse_usfm_book(text):
                # Resolve verse_id for the alignment row.
                row = conn.execute(
                    "SELECT id FROM verses WHERE book_id = ? AND chapter = ? AND verse_num = ? AND translation_id = ? LIMIT 1",
                    (db_book_id, chapter, verse_num, kjv_translation_id),
                ).fetchone()
                if row is None:
                    missing_verses += 1
                    continue
                verse_id = row[0]
                alignment_rows.append((verse_id, json.dumps(tokens, ensure_ascii=False, separators=(",", ":"))))

                # Aggregate index from the tagged tokens.
                for tok in tokens:
                    s = tok.get("s")
                    if not s:
                        continue
                    word_lower = tok["w"].lower().strip("'’.,;:!?-—()[]\"")
                    if not word_lower:
                        continue
                    for sid in s:
                        key = (word_lower, sid)
                        freq[key] += 1
                        first_seen.setdefault(key, (db_book_id, chapter, verse_num))
                        total_tagged += 1

    if missing_verses:
        print(f"  WARNING: {missing_verses} verse(s) had no matching row in `verses`; alignment skipped for those.")
    print(f"  Tagged words seen: {total_tagged:,}")
    print(f"  Unique (word, strongs) pairs: {len(freq):,}")
    print(f"  Verse alignment rows: {len(alignment_rows):,}")

    # Replace both tables atomically.
    conn.execute("DELETE FROM english_strongs_index")
    conn.execute("DELETE FROM english_word_alignment")

    index_rows = []
    for (word, sid), count in freq.items():
        book_id, chapter, verse = first_seen[(word, sid)]
        language = "hebrew" if sid.startswith("H") else "greek"
        index_rows.append((word, sid, language, count, book_id, chapter, verse))

    conn.executemany(
        "INSERT INTO english_strongs_index "
        "(english_word, strongs_id, language, frequency, sample_book_id, sample_chapter, sample_verse) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        index_rows,
    )
    conn.executemany(
        "INSERT INTO english_word_alignment (verse_id, tokens) VALUES (?, ?)",
        alignment_rows,
    )
    conn.commit()
    return len(alignment_rows), len(index_rows), total_tagged


def main() -> None:
    parser = argparse.ArgumentParser(description="Build KJV<->Strong's data from eBible KJV2006 USFM.")
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
        alignment_rows, index_rows, total = ingest(conn, payload)
        print(
            f"Done: {index_rows:,} index rows + {alignment_rows:,} alignment rows "
            f"({total:,} tagged words processed)."
        )
    finally:
        conn.close()


if __name__ == "__main__":
    main()
