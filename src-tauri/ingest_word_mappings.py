#!/usr/bin/env python3
"""
ingest_word_mappings.py
Fixes Greek word_mappings ingestion for the Logos Bible app.

MorphGNT file format (per line, 7 space-separated fields):
    SSSCCCvv P- MMMMMM word surface parsing lemma

- The reference field is 6 characters: 2-digit book + 2-digit chapter + 2-digit verse
  e.g. "010101" = internal book 01 (Matthew), chapter 01, verse 01
  e.g. "020101" = internal book 02 (Mark), chapter 01, verse 01
- P- = POS code (2 chars)
- MMMMMM = morphology code (8 chars, padded with dashes)
- word = Greek surface text
- surface = surface form (same as word)
- parsing = parsing code
- lemma = dictionary form

Files are named: 61-Mt-morphgnt.txt, 62-Mk-morphgnt.txt, etc.
The file order (1-27) maps to internal book numbers used in the reference field.

Target DB schema (current):
    word_mappings(id, verse_id, word_index, strongs_id, original_word, lemma, morphology, language)
"""

import sqlite3, os, re
from pathlib import Path

HERMES_HOME = os.environ.get('HERMES_HOME', '/home/jean-galt/.local/share/logos')
DB_PATH = Path(HERMES_HOME) / 'logos.db'
DATA_DIR = Path('/home/jean-galt/logos/public/morphgnt')


def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA synchronous=NORMAL')
    return conn


def build_file_idx_to_app_id(conn):
    """Build mapping from sorted file position (1-27) to app book_id.
    
    Files are named 61-Mt-morphgnt.txt through 87-Rev-morphgnt.txt.
    Sorted alphabetically gives the correct order: Mt, Mk, Lk, Jn, Acts, Rom, etc.
    We map to app book_id by matching against DB's sblgnt translation verses.
    """
    files = sorted([f for f in DATA_DIR.glob("*-morphgnt.txt")])
    if not files:
        raise RuntimeError(f"No morphgnt files found in {DATA_DIR}")

    # Get SBL number from filename prefix
    def sbl_num(fname):
        return int(fname.name.split('-')[0])

    # Build list: (sbl_num, app_book_id) in file order
    sbl_to_app = {}
    cur = conn.execute("""
        SELECT b.id, b.abbreviation, b.order_index
        FROM books b
        WHERE EXISTS (SELECT 1 FROM verses v WHERE v.book_id=b.id AND v.translation_id=2)
        ORDER BY b.order_index
    """)
    rows = cur.fetchall()
    # The rows come in app order_index order
    # For NT, order_index 40-66 corresponds to SBL numbers 61-87
    for app_id, abbr, order_idx in rows:
        sbl_num = order_idx + 21  # 40+21=61, etc.
        sbl_to_app[sbl_num] = (app_id, abbr)

    # Now build file position (1-27) → app_book_id
    idx_to_app_id = {}
    for file_pos, fpath in enumerate(files, start=1):
        sbl_number = int(fpath.name.split('-')[0])
        if sbl_number in sbl_to_app:
            idx_to_app_id[file_pos] = sbl_to_app[sbl_number][0]
        else:
            print(f"  WARNING: SBL {sbl_number} ({fpath.name}) not in DB")

    print(f"Built file-pos → app book_id map with {len(idx_to_app_id)} entries")
    return idx_to_app_id


def parse_morphgnt_line(line: str):
    """Parse a MorphGNT line. Returns (internal_book, chapter, verse_num, word, lemma, pos, morph).
    Reference is 6 chars: 2-digit book + 2-digit chapter + 2-digit verse."""
    parts = line.strip().split()
    if len(parts) < 7:
        return None
    ref = parts[0]
    if len(ref) != 6:
        return None

    # CORRECTED: 6-char ref is 2+2+2, NOT 3+3+2
    try:
        internal_book = int(ref[:2])    # e.g. "01" -> 1
        chapter = int(ref[2:4])        # e.g. "01" -> 1
        verse_num = int(ref[4:6])      # e.g. "01" -> 1
    except ValueError:
        return None

    pos = parts[1].rstrip('-')
    morph = parts[2]
    word = parts[3]
    lemma = parts[6] if len(parts) > 6 else ''

    # Skip punctuation entries
    if pos == 'PUNCT':
        return None

    return (internal_book, chapter, verse_num, word, lemma, pos, morph)


def main():
    print("=== MorphGNT Word Mapping Ingest ===\n")
    conn = get_db()

    try:
        idx_to_app_id = build_file_idx_to_app_id(conn)

        # Build verse_id lookup: (app_book_id, chapter, verse_num) → verse_id
        print("Building verse lookup...")
        verse_lookup = {}
        cur = conn.execute("""
            SELECT book_id, chapter, verse_num, id
            FROM verses WHERE translation_id=2
        """)
        for book_id, chapter, verse_num, verse_id in cur:
            verse_lookup[(book_id, chapter, verse_num)] = verse_id
        print(f"  {len(verse_lookup)} verses in sblgnt translation")

        files = sorted([f for f in DATA_DIR.glob("*-morphgnt.txt")])
        total_inserted = 0
        skipped = 0

        conn.execute("DELETE FROM word_mappings WHERE language='greek'")

        for file_pos, fpath in enumerate(files, start=1):
            app_book_id = idx_to_app_id.get(file_pos)
            if app_book_id is None:
                print(f"SKIP {fpath.name}: no app book_id for position {file_pos}")
                continue

            print(f"Processing {fpath.name} (file_pos={file_pos}, app_book_id={app_book_id})")
            rows_to_insert = []
            word_index = 0
            current_verse = None

            with open(fpath, encoding='utf-8') as f:
                for raw_line in f:
                    line = raw_line.strip()
                    if not line:
                        continue

                    parsed = parse_morphgnt_line(line)
                    if parsed is None:
                        continue

                    internal_book, chapter, verse_num, word, lemma, pos, morph = parsed

                    # Map internal_book (1-27) to app_book_id using file position
                    # internal_book should match file_pos
                    key = (app_book_id, chapter, verse_num)
                    verse_id = verse_lookup.get(key)

                    if verse_id is None:
                        skipped += 1
                        continue

                    if key != current_verse:
                        current_verse = key
                        word_index = 0
                    else:
                        word_index += 1

                    rows_to_insert.append((verse_id, word_index, '', word, lemma, morph))

            if rows_to_insert:
                conn.executemany("""
                    INSERT INTO word_mappings (verse_id, word_index, strongs_id, original_word, lemma, morphology, language)
                    VALUES (?, ?, ?, ?, ?, ?, 'greek')
                """, rows_to_insert)
                conn.commit()
                total_inserted += len(rows_to_insert)
                print(f"  Inserted {len(rows_to_insert)} words")

        count = conn.execute("SELECT COUNT(*) FROM word_mappings WHERE language='greek'").fetchone()[0]
        print(f"\nword_mappings rows: {count} (inserted={total_inserted}, skipped={skipped})")

        # Sanity check
        print("\nSample entries:")
        for row in conn.execute("""
            SELECT wm.id, wm.verse_id, wm.word_index, wm.original_word, wm.lemma, v.text
            FROM word_mappings wm
            JOIN verses v ON v.id = wm.verse_id
            WHERE wm.language='greek'
            LIMIT 5
        """):
            print(f"  id={row[0]} v_id={row[1]} idx={row[2]} word='{row[3]}' lemma={row[4]}")
            print(f"    verse: {row[5][:60]}...")

    finally:
        conn.close()


if __name__ == '__main__':
    main()