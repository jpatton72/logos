#!/usr/bin/env python3
"""
Logos Bible Data Ingestion Script

Downloads and ingests Bible text data into the Logos SQLite database.
Run with: python3 scripts/ingest.py [--db-path PATH] [--sample] [--kjv-only] [--skip-greek] [--skip-hebrew]

Default database paths:
  - Linux:   ~/.local/share/logos/logos.db
  - macOS:   ~/Library/Application Support/Logos/logos.db
  - Windows: %LOCALAPPDATA%/Logos Bible/logos.db
"""

import sqlite3
import urllib.request
import urllib.error
import json
import re
import argparse
import os
import sys
import platform
from pathlib import Path

# --- KJV: farskipper/kjv JSON ---
KJV_JSON_URL = "https://raw.githubusercontent.com/farskipper/kjv/master/json/verses-1769.json"

# --- SBLGNT Greek: LogosBible/SBLGNT ---
# Book abbreviations -> GitHub filenames
SBLGNT_BOOKS = [
    ("Matt",  "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/Matt.txt"),
    ("Mark",  "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/Mark.txt"),
    ("Luke",  "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/Luke.txt"),
    ("John",  "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/John.txt"),
    ("Acts",  "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/Acts.txt"),
    ("Rom",   "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/Rom.txt"),
    ("1Cor",  "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/1Cor.txt"),
    ("2Cor",  "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/2Cor.txt"),
    ("Gal",   "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/Gal.txt"),
    ("Eph",   "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/Eph.txt"),
    ("Phil",  "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/Phil.txt"),
    ("Col",   "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/Col.txt"),
    ("1Thess","https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/1Thess.txt"),
    ("2Thess","https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/2Thess.txt"),
    ("1Tim",  "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/1Tim.txt"),
    ("2Tim",  "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/2Tim.txt"),
    ("Titus", "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/Titus.txt"),
    ("Phlm",  "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/Phlm.txt"),
    ("Heb",   "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/Heb.txt"),
    ("Jas",   "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/Jas.txt"),
    ("1Pet",  "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/1Pet.txt"),
    ("2Pet",  "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/2Pet.txt"),
    ("1John", "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/1John.txt"),
    ("2John", "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/2John.txt"),
    ("3John", "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/3John.txt"),
    ("Jude",  "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/Jude.txt"),
    ("Rev",   "https://raw.githubusercontent.com/LogosBible/SBLGNT/master/data/sblgnt/text/Rev.txt"),
]

# Full 66-book Protestant canon
BOOKS = [
    # Old Testament (39)
    ("Gen",  "Genesis",           "ot", "Law",        1),
    ("Exod", "Exodus",            "ot", "Law",        2),
    ("Lev",  "Leviticus",         "ot", "Law",        3),
    ("Num",  "Numbers",            "ot", "Law",        4),
    ("Deut", "Deuteronomy",       "ot", "Law",        5),
    ("Josh", "Joshua",            "ot", "Historical", 6),
    ("Judg", "Judges",           "ot", "Historical", 7),
    ("Ruth", "Ruth",             "ot", "Historical", 8),
    ("1Sam", "1 Samuel",         "ot", "Historical", 9),
    ("2Sam", "2 Samuel",         "ot", "Historical",10),
    ("1Kgs", "1 Kings",          "ot", "Historical",11),
    ("2Kgs", "2 Kings",          "ot", "Historical",12),
    ("1Chr", "1 Chronicles",     "ot", "Historical",13),
    ("2Chr", "2 Chronicles",     "ot", "Historical",14),
    ("Ezra", "Ezra",             "ot", "Historical",15),
    ("Neh",  "Nehemiah",         "ot", "Historical",16),
    ("Esth", "Esther",           "ot", "Historical",17),
    ("Job",  "Job",              "ot", "Wisdom",     18),
    ("Ps",   "Psalms",           "ot", "Wisdom",     19),
    ("Prov", "Proverbs",         "ot", "Wisdom",     20),
    ("Eccl", "Ecclesiastes",     "ot", "Wisdom",     21),
    ("Song", "Song of Solomon",  "ot", "Wisdom",     22),
    ("Isa",  "Isaiah",           "ot", "Prophets",   23),
    ("Jer",  "Jeremiah",         "ot", "Prophets",   24),
    ("Lam",  "Lamentations",     "ot", "Prophets",   25),
    ("Ezek", "Ezekiel",          "ot", "Prophets",   26),
    ("Dan",  "Daniel",           "ot", "Prophets",   27),
    ("Hos",  "Hosea",            "ot", "Prophets",   28),
    ("Joel", "Joel",             "ot", "Prophets",   29),
    ("Amos", "Amos",             "ot", "Prophets",   30),
    ("Obad","Obadiah",           "ot", "Prophets",   31),
    ("Jonah","Jonah",            "ot", "Prophets",   32),
    ("Mic",  "Micah",            "ot", "Prophets",   33),
    ("Nah",  "Nahum",            "ot", "Prophets",   34),
    ("Hab",  "Habakkuk",         "ot", "Prophets",   35),
    ("Zeph", "Zephaniah",        "ot", "Prophets",   36),
    ("Hag",  "Haggai",           "ot", "Prophets",   37),
    ("Zech", "Zechariah",        "ot", "Prophets",   38),
    ("Mal",  "Malachi",          "ot", "Prophets",   39),
    # New Testament (27)
    ("Matt", "Matthew",          "nt", "Gospels",   40),
    ("Mark", "Mark",             "nt", "Gospels",   41),
    ("Luke", "Luke",             "nt", "Gospels",   42),
    ("John", "John",             "nt", "Gospels",   43),
    ("Acts", "Acts",             "nt", "History",    44),
    ("Rom",  "Romans",           "nt", "Letters",    45),
    ("1Cor", "1 Corinthians",    "nt", "Letters",    46),
    ("2Cor", "2 Corinthians",    "nt", "Letters",    47),
    ("Gal",  "Galatians",         "nt", "Letters",    48),
    ("Eph",  "Ephesians",         "nt", "Letters",    49),
    ("Phil", "Philippians",       "nt", "Letters",    50),
    ("Col",  "Colossians",        "nt", "Letters",    51),
    ("1Thess","1 Thessalonians", "nt", "Letters",    52),
    ("2Thess","2 Thessalonians", "nt", "Letters",    53),
    ("1Tim", "1 Timothy",         "nt", "Letters",    54),
    ("2Tim", "2 Timothy",         "nt", "Letters",    55),
    ("Titus","Titus",            "nt", "Letters",    56),
    ("Phlm", "Philemon",         "nt", "Letters",    57),
    ("Heb",  "Hebrews",           "nt", "Letters",    58),
    ("Jas",  "James",             "nt", "Letters",    59),
    ("1Pet", "1 Peter",          "nt", "Letters",    60),
    ("2Pet", "2 Peter",          "nt", "Letters",    61),
    ("1John","1 John",           "nt", "Letters",    62),
    ("2John","2 John",           "nt", "Letters",    63),
    ("3John","3 John",           "nt", "Letters",    64),
    ("Jude", "Jude",             "nt", "Letters",    65),
    ("Rev",  "Revelation",       "nt", "Apocalypse",66),
]

TRANSLATIONS = [
    ("kjv",   "King James Version",         "english", "https://github.com/farskipper/kjv",            "Public Domain"),
    ("sblgnt","SBL Greek New Testament",    "greek",   "https://github.com/LogosBible/SBLGNT",         "SBL Font License"),
    ("wlc",   "Westminster Leningrad Codex", "hebrew",  "https://www.sefaria.org",                       "Public Domain (Masoretic Text)"),
]

# Sefaria book identifiers for Hebrew OT (books with spaces use underscores)
# Maps our abbreviation -> Sefaria API identifier
SEFARIA_BOOK_MAP = {
    "Gen": "Genesis", "Exod": "Exodus", "Lev": "Leviticus", "Num": "Numbers", "Deut": "Deuteronomy",
    "Josh": "Joshua", "Judg": "Judges", "Ruth": "Ruth",
    "1Sam": "1_Samuel", "2Sam": "2_Samuel",
    "1Kgs": "1_Kings", "2Kgs": "2_Kings",
    "1Chr": "1_Chronicles", "2Chr": "2_Chronicles",
    "Ezra": "Ezra", "Neh": "Nehemiah", "Esth": "Esther",
    "Job": "Job", "Ps": "Psalms", "Prov": "Proverbs", "Eccl": "Ecclesiastes", "Song": "Song_of_Songs",
    "Isa": "Isaiah", "Jer": "Jeremiah", "Lam": "Lamentations", "Ezek": "Ezekiel", "Dan": "Daniel",
    "Hos": "Hosea", "Joel": "Joel", "Amos": "Amos", "Obad": "Obadiah", "Jonah": "Jonah",
    "Mic": "Micah", "Nah": "Nahum", "Hab": "Habakkuk", "Zeph": "Zephaniah", "Hag": "Haggai",
    "Zech": "Zechariah", "Mal": "Malachi",
}


def get_default_db_path() -> Path:
    system = platform.system()
    if system == "Windows":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        return base / "Logos Bible" / "logos.db"
    elif system == "Darwin":
        return Path.home() / "Library" / "Application Support" / "Logos" / "logos.db"
    else:
        return Path.home() / ".local" / "share" / "logos" / "logos.db"


def fetch_url(url: str, timeout: int = 30) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "LogosBibleApp/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
        print(f"    WARNING: Failed to fetch {url}: {e}")
        return None


def ensure_db_tables(conn: sqlite3.Connection) -> None:
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")

    conn.execute("""
        CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY,
            abbreviation TEXT UNIQUE NOT NULL,
            full_name TEXT NOT NULL,
            testament TEXT NOT NULL CHECK (testament IN ('ot', 'nt')),
            genre TEXT NOT NULL,
            order_index INTEGER NOT NULL
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS translations (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            abbreviation TEXT UNIQUE NOT NULL,
            language TEXT NOT NULL CHECK (language IN ('hebrew', 'greek', 'english')),
            source_url TEXT,
            notes TEXT
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS verses (
            id INTEGER PRIMARY KEY,
            book_id INTEGER NOT NULL REFERENCES books(id),
            chapter INTEGER NOT NULL,
            verse_num INTEGER NOT NULL,
            translation_id INTEGER NOT NULL REFERENCES translations(id),
            text TEXT NOT NULL,
            UNIQUE(book_id, chapter, verse_num, translation_id)
        )
    """)

    try:
        conn.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS verses_fts USING fts5(
                verse_id UNINDEXED,
                book_id,
                chapter,
                verse_num,
                text,
                translation_id,
                tokenize='remov...tics 1'
            )
        """)
    except sqlite3.OperationalError:
        pass  # Already exists

    # ketiv_qere table: populated by ingest_wlc from Sefaria Masorah markup
    conn.execute("""
        CREATE TABLE IF NOT EXISTS ketiv_qere (
            id INTEGER PRIMARY KEY,
            book_id INTEGER NOT NULL REFERENCES books(id),
            chapter INTEGER NOT NULL,
            verse_num INTEGER NOT NULL,
            ketiv TEXT NOT NULL,
            qere TEXT NOT NULL,
            UNIQUE(book_id, chapter, verse_num, ketiv)
        )
    """)
    try:
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_ketiv_qere_ref
            ON ketiv_qere(book_id, chapter, verse_num)
        """)
    except sqlite3.OperationalError:
        pass

    # word_mappings: populated by ingest_word_mappings.py from MorphGNT + Strong's
    conn.execute("""
        CREATE TABLE IF NOT EXISTS word_mappings (
            id INTEGER PRIMARY KEY,
            verse_id INTEGER NOT NULL REFERENCES verses(id),
            word_index INTEGER NOT NULL,
            strongs_id TEXT NOT NULL,
            original_word TEXT NOT NULL,
            lemma TEXT,
            morphology TEXT,
            language TEXT NOT NULL CHECK (language IN ('hebrew', 'greek')),
            UNIQUE(verse_id, word_index)
        )
    """)
    try:
        conn.execute("CREATE INDEX IF NOT EXISTS idx_word_mappings_verse ON word_mappings(verse_id)")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("CREATE INDEX IF NOT EXISTS idx_word_mappings_strongs ON word_mappings(strongs_id)")
    except sqlite3.OperationalError:
        pass

    # terms_fts: populated by ingest_word_mappings.py from Greek/Hebrew verse text
    try:
        conn.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS terms_fts USING fts5(
                term,
                verse_count,
                translation_id
            )
        """)
    except sqlite3.OperationalError:
        pass

    conn.commit()
    print("Database tables verified.")


def insert_books(conn: sqlite3.Connection) -> dict[str, int]:
    book_ids = {}
    for abbrev, full_name, testament, genre, order in BOOKS:
        try:
            conn.execute(
                "INSERT OR IGNORE INTO books (abbreviation, full_name, testament, genre, order_index) VALUES (?, ?, ?, ?, ?)",
                (abbrev, full_name, testament, genre, order),
            )
        except sqlite3.IntegrityError:
            pass
    conn.commit()
    cursor = conn.execute("SELECT id, abbreviation FROM books")
    book_ids = {row[1]: row[0] for row in cursor.fetchall()}
    print(f"  Books: {len(book_ids)} inserted/verified")
    return book_ids


def insert_translations(conn: sqlite3.Connection) -> dict[str, int]:
    trans_ids = {}
    for abbrev, name, lang, url, notes in TRANSLATIONS:
        try:
            conn.execute(
                "INSERT OR IGNORE INTO translations (name, abbreviation, language, source_url, notes) VALUES (?, ?, ?, ?, ?)",
                (name, abbrev, lang, url, notes),
            )
        except sqlite3.IntegrityError:
            pass
    conn.commit()
    cursor = conn.execute("SELECT id, abbreviation FROM translations")
    trans_ids = {row[1]: row[0] for row in cursor.fetchall()}
    print(f"  Translations: {len(trans_ids)} inserted/verified")
    return trans_ids


def ingest_kjv(conn: sqlite3.Connection, book_ids: dict[str, int], trans_id: int) -> int:
    """Download and ingest KJV from farskipper JSON."""
    print("Fetching KJV (farskipper/kjv JSON)...")
    data = fetch_url(KJV_JSON_URL, timeout=60)
    if data is None:
        print("  KJV download failed. Skipping.")
        return 0

    try:
        verses_dict = json.loads(data.decode("utf-8", errors="replace"))
    except json.JSONDecodeError as e:
        print(f"  Failed to parse KJV JSON: {e}. Skipping.")
        return 0

    print(f"  Downloaded {len(verses_dict)} verse entries. Parsing...")

    # Map KJV book names (used in the JSON keys) to abbreviations
    # Keys are like "Genesis 1:1", "Matthew 1:1", etc.
    kjv_name_to_abbrev = {
        "Genesis": "Gen", "Exodus": "Exod", "Leviticus": "Lev", "Numbers": "Num",
        "Deuteronomy": "Deut", "Joshua": "Josh", "Judges": "Judg", "Ruth": "Ruth",
        "1 Samuel": "1Sam", "2 Samuel": "2Sam", "1 Kings": "1Kgs", "2 Kings": "2Kgs",
        "1 Chronicles": "1Chr", "2 Chronicles": "2Chr", "Ezra": "Ezra",
        "Nehemiah": "Neh", "Esther": "Esth", "Job": "Job", "Psalms": "Ps",
        "Proverbs": "Prov", "Ecclesiastes": "Eccl", "Song of Solomon": "Song",
        "Isaiah": "Isa", "Jeremiah": "Jer", "Lamentations": "Lam", "Ezekiel": "Ezek",
        "Daniel": "Dan", "Hosea": "Hos", "Joel": "Joel", "Amos": "Amos",
        "Obadiah": "Obad", "Jonah": "Jonah", "Micah": "Mic", "Nahum": "Nah",
        "Habakkuk": "Hab", "Zephaniah": "Zeph", "Haggai": "Hag", "Zechariah": "Zech",
        "Malachi": "Mal", "Matthew": "Matt", "Mark": "Mark", "Luke": "Luke",
        "John": "John", "Acts": "Acts", "Romans": "Rom", "1 Corinthians": "1Cor",
        "2 Corinthians": "2Cor", "Galatians": "Gal", "Ephesians": "Eph",
        "Philippians": "Phil", "Colossians": "Col", "1 Thessalonians": "1Thess",
        "2 Thessalonians": "2Thess", "1 Timothy": "1Tim", "2 Timothy": "2Tim",
        "Titus": "Titus", "Philemon": "Phlm", "Hebrews": "Heb", "James": "Jas",
        "1 Peter": "1Pet", "2 Peter": "2Pet", "1 John": "1John", "2 John": "2John",
        "3 John": "3John", "Jude": "Jude", "Revelation": "Rev",
    }

    count = 0
    batch = []
    for key, text in verses_dict.items():
        # Parse "Genesis 1:1" -> abbrev, chapter, verse
        try:
            # Split off the chapter:verse part
            space_idx = key.rfind(" ")
            book_name_full = key[:space_idx]
            chapter_verse = key[space_idx+1:]
            colon_idx = chapter_verse.find(":")
            chapter = int(chapter_verse[:colon_idx])
            verse_num = int(chapter_verse[colon_idx+1:])
        except (ValueError, IndexError):
            continue

        abbrev = kjv_name_to_abbrev.get(book_name_full)
        if abbrev is None:
            continue
        book_id = book_ids.get(abbrev)
        if book_id is None:
            continue

        batch.append((book_id, chapter, verse_num, trans_id, text))
        count += 1

        if len(batch) >= 1000:
            conn.executemany(
                "INSERT OR IGNORE INTO verses (book_id, chapter, verse_num, translation_id, text) VALUES (?, ?, ?, ?, ?)",
                batch,
            )
            batch = []

    if batch:
        conn.executemany(
            "INSERT OR IGNORE INTO verses (book_id, chapter, verse_num, translation_id, text) VALUES (?, ?, ?, ?, ?)",
            batch,
        )

    conn.commit()
    print(f"  KJV: {count} verses inserted")
    return count


def ingest_sblgnt(conn: sqlite3.Connection, book_ids: dict[str, int], trans_id: int) -> int:
    """Download and ingest SBLGNT Greek New Testament."""
    print("Fetching SBLGNT Greek (LogosBible/SBLGNT)...")
    total_count = 0

    for abbrev, url in SBLGNT_BOOKS:
        data = fetch_url(url, timeout=30)
        if data is None:
            print(f"    {abbrev}: download failed, skipping")
            continue

        text = data.decode("utf-8", errors="replace")
        book_id = book_ids.get(abbrev)
        if book_id is None:
            print(f"    {abbrev}: not in books table, skipping")
            continue

        # File format: first line is "ΚΑΤΑ ΙΩΑΝΝΗΝ" (book title in Greek)
        # Then verses: "John 1:1\tἘν ἀρχῇ..."
        lines = text.split("\n")
        batch = []
        book_count = 0

        for line in lines:
            line = line.strip()
            if not line or "\t" not in line:
                # Skip book title lines (no tab, all Greek)
                continue
            parts = line.split("\t", 1)
            if len(parts) < 2:
                continue
            ref = parts[0].strip()
            verse_text = parts[1].strip()
            if not verse_text:
                continue

            # Parse "John 1:1" -> chapter, verse
            try:
                colon_idx = ref.rfind(":")
                chapter = int(ref[colon_idx+1:].strip())
                verse_num = int(ref[colon_idx+1:].split()[0])  # already done
                # Redo:
                cv = ref[ref.rfind(" ")+1:]
                colon_idx = cv.find(":")
                chapter = int(cv[:colon_idx])
                verse_num = int(cv[colon_idx+1:])
            except (ValueError, IndexError):
                continue

            batch.append((book_id, chapter, verse_num, trans_id, verse_text))
            book_count += 1

            if len(batch) >= 500:
                conn.executemany(
                    "INSERT OR IGNORE INTO verses (book_id, chapter, verse_num, translation_id, text) VALUES (?, ?, ?, ?, ?)",
                    batch,
                )
                batch = []

        if batch:
            conn.executemany(
                "INSERT OR IGNORE INTO verses (book_id, chapter, verse_num, translation_id, text) VALUES (?, ?, ?, ?, ?)",
                batch,
            )

        print(f"    {abbrev}: {book_count} verses")
        total_count += book_count

    conn.commit()
    print(f"  SBLGNT: {total_count} verses inserted")
    return total_count


# Regex to extract ketiv/qere pairs from Sefaria Hebrew markup.
# Matches: <span class="mam-kq"> <span class="mam-kq-k">(ketiv)</span> <span class="mam-kq-q">[qere]</span> </span>
KQ_RE = re.compile(
    r'<span class="mam-kq">'
    r'<span class="mam-kq-k">\(([^<]+)\)</span>'
    r'\s*'
    r'<span class="mam-kq-q">\[([^\]]+)\]</span>'
    r'\s*</span>'
)

def _extract_ketiv_qere(verse_html: str) -> list[tuple[str, str]]:
    """Extract all ketiv/qere pairs from a verse's HTML. Returns list of (ketiv, qere)."""
    return KQ_RE.findall(verse_html)


def _fetch_sefaria_chapter(book: str, chapter: int) -> list[tuple[str, list[tuple[str, str]]]]:
    """Fetch one chapter from Sefaria, return list of (verse_text, ketiv_qere_list) tuples.

    verse_text is the raw HTML (with kq spans stripped) so the text is visually accurate.
    ketiv_qere_list is extracted before stripping so we preserve the original markup.
    """
    try:
        url = f"https://www.sefaria.org/api/texts/{book}.{chapter}"
        req = urllib.request.Request(url, headers={"User-Agent": "LogosBibleApp/1.0"})
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read())
            he = data.get('he') or data.get('text')
            if isinstance(he, list):
                result = []
                for v in he:
                    if not v.strip():
                        continue
                    kq = _extract_ketiv_qere(v)
                    # Strip all HTML but keep the text — the mam-kq spans ARE the text (ketiv is shown)
                    clean = re.sub(r'<[^>]+>', '', v).strip()
                    result.append((clean, kq))
                return result
    except Exception:
        pass
    return []


def ingest_wlc(conn: sqlite3.Connection, book_ids: dict[str, int], trans_id: int) -> tuple[int, int]:
    """Download and ingest Hebrew Masoretic text from Sefaria API.

    Returns (verse_count, kq_count).
    """
    import concurrent.futures

    print("Fetching Hebrew Masoretic text (Sefaria API)...")
    total_count = 0
    kq_count = 0

    for abbrev, sefaria_name in SEFARIA_BOOK_MAP.items():
        book_id = book_ids.get(abbrev)
        if book_id is None:
            print(f"    {abbrev}: not in books table, skipping")
            continue

        # Probe chapter count by fetching chapters concurrently (up to 160)
        def fetch_ch(ch: int) -> tuple:
            return (ch, _fetch_sefaria_chapter(sefaria_name, ch))

        chapters = {}
        max_probe = 160

        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(fetch_ch, ch) for ch in range(1, max_probe + 1)]
            for future in concurrent.futures.as_completed(futures):
                ch, result = future.result()
                if result:
                    chapters[ch] = result

        if not chapters:
            print(f"    {abbrev}: no data fetched")
            continue

        max_ch = max(chapters.keys())
        print(f"    {abbrev}: {max_ch} chapters")

        # Batch insert verses + K/Q
        verse_batch = []
        kq_batch = []

        for ch in sorted(chapters.keys()):
            for vn, (verse_text, kq_pairs) in enumerate(chapters[ch], start=1):
                if verse_text:
                    verse_batch.append((book_id, ch, vn, trans_id, verse_text))
                    total_count += 1

                    for ketiv, qere in kq_pairs:
                        kq_batch.append((book_id, ch, vn, ketiv, qere))
                        kq_count += 1

                    if len(verse_batch) >= 1000:
                        conn.executemany(
                            "INSERT OR IGNORE INTO verses (book_id, chapter, verse_num, translation_id, text) VALUES (?, ?, ?, ?, ?)",
                            verse_batch,
                        )
                        verse_batch = []

                    if len(kq_batch) >= 500:
                        conn.executemany(
                            "INSERT OR IGNORE INTO ketiv_qere (book_id, chapter, verse_num, ketiv, qere) VALUES (?, ?, ?, ?, ?)",
                            kq_batch,
                        )
                        kq_batch = []

        if verse_batch:
            conn.executemany(
                "INSERT OR IGNORE INTO verses (book_id, chapter, verse_num, translation_id, text) VALUES (?, ?, ?, ?, ?)",
                verse_batch,
            )
        if kq_batch:
            conn.executemany(
                "INSERT OR IGNORE INTO ketiv_qere (book_id, chapter, verse_num, ketiv, qere) VALUES (?, ?, ?, ?, ?)",
                kq_batch,
            )

    conn.commit()
    print(f"  Hebrew (WLC): {total_count} verses, {kq_count} K/Q entries")
    return total_count, kq_count


def ingest_sample(conn: sqlite3.Connection, book_ids: dict[str, int]) -> None:
    """Insert just Genesis 1 for testing."""
    print("Inserting sample data (Genesis 1)...")
    gen_id = book_ids.get("Gen")
    if gen_id is None:
        print("  Genesis not found in books table!")
        return

    sample_verses = [
        (gen_id, 1, 1, 1, "In the beginning God created the heaven and the earth."),
        (gen_id, 1, 2, 1, "And the earth was without form, and void; and darkness was upon the face of the deep. And the Spirit of God moved upon the face of the waters."),
        (gen_id, 1, 3, 1, "And God said, Let there be light: and there was light."),
        (gen_id, 1, 4, 1, "And God saw the light, that it was good: and God divided the light from the darkness."),
        (gen_id, 1, 5, 1, "And God called the light Day, and the darkness he called Night. And the evening and the morning were the first day."),
    ]

    trans_id = 1  # KJV
    conn.executemany(
        "INSERT OR IGNORE INTO verses (book_id, chapter, verse_num, translation_id, text) VALUES (?, ?, ?, ?, ?)",
        sample_verses,
    )
    conn.commit()
    print(f"  Sample: {len(sample_verses)} verses inserted")


def rebuild_fts(conn: sqlite3.Connection) -> None:
    print("Rebuilding FTS5 index...")
    try:
        conn.execute("INSERT INTO verses_fts(verses_fts) VALUES('rebuild')")
        conn.commit()
        print("  FTS5 index rebuilt.")
    except sqlite3.OperationalError as e:
        print(f"  FTS rebuild skipped: {e}")


def main():
    parser = argparse.ArgumentParser(description="Logos Bible Data Ingestion")
    parser.add_argument("--db-path", type=Path, default=None,
                        help="Path to logos.db (default: ~/.local/share/logos/logos.db)")
    parser.add_argument("--sample", action="store_true",
                        help="Insert sample Genesis 1 data only (for testing)")
    parser.add_argument("--kjv-only", action="store_true",
                        help="Only ingest KJV")
    parser.add_argument("--skip-greek", action="store_true",
                        help="Skip Greek New Testament ingestion")
    parser.add_argument("--skip-hebrew", action="store_true",
                        help="Skip Hebrew Old Testament ingestion (default)")
    args = parser.parse_args()

    db_path = args.db_path or get_default_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Connecting to {db_path}...")
    conn = sqlite3.connect(str(db_path))
    ensure_db_tables(conn)

    print("\n--- Inserting books ---")
    book_ids = insert_books(conn)

    print("\n--- Inserting translations ---")
    trans_ids = insert_translations(conn)

    if args.sample:
        ingest_sample(conn, book_ids)
    else:
        kjv_id = trans_ids.get("kjv", 1)
        greek_id = trans_ids.get("sblgnt", 2)

        print("\n--- Ingesting KJV ---")
        ingest_kjv(conn, book_ids, kjv_id)

        if not args.kjv_only and not args.skip_greek:
            print("\n--- Ingesting SBLGNT Greek ---")
            ingest_sblgnt(conn, book_ids, greek_id)
        else:
            print("\n--- Skipping Greek (--kjv-only or --skip-greek) ---")

        # Hebrew: no working source yet
        if not args.skip_hebrew:
            wlc_id = trans_ids.get("wlc", 3)
            print("\n--- Ingesting Hebrew (WLC via Sefaria) ---")
            ingest_wlc(conn, book_ids, wlc_id)
        else:
            print("\n--- Skipping Hebrew ---")

        print("\n--- Rebuilding FTS index ---")
        rebuild_fts(conn)

    # Stats
    cursor = conn.execute("SELECT COUNT(*) FROM verses")
    verse_count = cursor.fetchone()[0]
    cursor = conn.execute("SELECT COUNT(*) FROM books")
    book_count = cursor.fetchone()[0]
    cursor = conn.execute("SELECT COUNT(*) FROM ketiv_qere")
    kq_total = cursor.fetchone()[0]

    print(f"\n=== Summary ===")
    print(f"  Books: {book_count}")
    print(f"  Verses total: {verse_count}")
    for row in conn.execute("""
        SELECT tr.abbreviation, tr.name, COUNT(v.id) as verses
        FROM translations tr LEFT JOIN verses v ON v.translation_id = tr.id
        GROUP BY tr.id
    """):
        print(f"    {row[0]} ({row[1]}): {row[2]} verses")
    if kq_total > 0:
        cursor = conn.execute("""
            SELECT b.abbreviation, COUNT(k.id)
            FROM ketiv_qere k JOIN books b ON k.book_id = b.id
            GROUP BY k.book_id ORDER BY COUNT(k.id) DESC LIMIT 10
        """)
        kq_rows = cursor.fetchall()
        print(f"  Ketiv/Qere entries: {kq_total} total")
        for abbr, cnt in kq_rows:
            print(f"    {abbr}: {cnt}")
    print(f"  Database: {db_path}")

    conn.close()
    print("Done!")


if __name__ == "__main__":
    main()
