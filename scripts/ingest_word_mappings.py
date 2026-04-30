#!/usr/bin/env python3
"""
Ingest Greek word mappings (morphology + Strong's IDs) and build the terms FTS index.

Run AFTER ingest.py and ingest_strongs.py:
    python scripts/ingest_word_mappings.py

What it does:
  1. Populates word_mappings.strongs_id by matching Greek/Hebrew lemmas to strongs_greek/hebrews
     (the MorphGNT data provides original_word, lemma, morphology; this fills in the Strong's link)
  2. Populates terms_fts from Greek and Hebrew verse text for term-frequency browsing

Default database paths (mirrors src-tauri/src/lib.rs::get_app_data_dir):
  - Linux:   ~/.local/share/logos/Logos/data/logos.db
  - macOS:   ~/Library/Application Support/logos/Logos/data/logos.db
  - Windows: %APPDATA%/logos/Logos/data/logos.db
"""

import sqlite3
import re
import argparse
import os
import platform
from pathlib import Path


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


def tokenise(text: str) -> list[str]:
    """Split text into lowercase word tokens, stripping punctuation."""
    return re.findall(r"[\w\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]+", text, re.UNICODE)


def populate_strongs_ids(conn: sqlite3.Connection) -> tuple[int, int]:
    """Match word_mappings lemmas to strongs_greek/hebrew word field."""
    print("Populating Strong's IDs in word_mappings...")

    # Use COALESCE to provide a fallback so the NOT NULL constraint is never violated.
    # Unmatched lemmas get 'G0' / 'H0' as a sentinel.
    greek_updated = conn.execute("""
        UPDATE word_mappings
        SET strongs_id = COALESCE(
            (SELECT sg.id FROM strongs_greek sg
             WHERE sg.word = word_mappings.lemma
               AND word_mappings.lemma IS NOT NULL
               AND word_mappings.lemma != ''),
            'G0'
        )
        WHERE language = 'greek'
          AND lemma IS NOT NULL
          AND lemma != ''
          AND (strongs_id IS NULL OR strongs_id = '')
    """).rowcount

    hebrew_updated = conn.execute("""
        UPDATE word_mappings
        SET strongs_id = COALESCE(
            (SELECT sh.id FROM strongs_hebrew sh
             WHERE sh.word = word_mappings.lemma
               AND word_mappings.lemma IS NOT NULL
               AND word_mappings.lemma != ''),
            'H0'
        )
        WHERE language = 'hebrew'
          AND lemma IS NOT NULL
          AND lemma != ''
          AND (strongs_id IS NULL OR strongs_id = '')
    """).rowcount

    conn.commit()
    print(f"  Greek: {greek_updated} rows updated")
    print(f"  Hebrew: {hebrew_updated} rows updated")
    return greek_updated, hebrew_updated


def populate_terms_fts(conn: sqlite3.Connection) -> int:
    """
    Build terms_fts from Greek and Hebrew verse text.
    terms_fts schema: (term TEXT, verse_count INTEGER, translation_id INTEGER)
    Returns total number of terms inserted.
    """
    print("Populating terms_fts...")

    # Clear existing
    conn.execute("DELETE FROM terms_fts")
    conn.commit()

    translations = conn.execute("""
        SELECT id, language FROM translations WHERE language IN ('greek', 'hebrew')
    """).fetchall()

    total_terms = 0
    for trans_id, language in translations:
        # Collect all terms per verse (deduplicated within verse)
        conn.execute("CREATE TEMP TABLE IF NOT EXISTS _verse_terms (term TEXT, verse_id INTEGER)")
        conn.execute("DELETE FROM _verse_terms")

        verses = conn.execute("""
            SELECT v.id, v.text
            FROM verses v
            WHERE v.translation_id = ?
        """, (trans_id,)).fetchall()

        for verse_id, text in verses:
            if not text:
                continue
            terms_in_verse = set(tokenise(text.lower()))
            for term in terms_in_verse:
                conn.execute(
                    "INSERT OR IGNORE INTO _verse_terms (term, verse_id) VALUES (?, ?)",
                    (term, verse_id)
                )

        conn.commit()

        # Count verse occurrences per term
        term_counts = conn.execute("""
            SELECT term, COUNT(DISTINCT verse_id) as cnt
            FROM _verse_terms
            GROUP BY term
            HAVING cnt >= 2
        """).fetchall()

        conn.executemany(
            "INSERT INTO terms_fts (term, verse_count, translation_id) VALUES (?, ?, ?)",
            [(t, c, trans_id) for t, c in term_counts]
        )
        conn.commit()

        print(f"  {language}: {len(term_counts)} unique terms from {len(verses)} verses")
        total_terms += len(term_counts)

    conn.execute("DROP TABLE IF EXISTS _verse_terms")
    conn.commit()

    print(f"  Total terms inserted: {total_terms}")
    return total_terms


def main() -> None:
    parser = argparse.ArgumentParser(description="Populate word_mappings Strong's IDs and terms_fts")
    parser.add_argument("--db-path", type=Path, default=None,
                        help="Path to logos.db (default: platform-specific app data dir)")
    args = parser.parse_args()

    db_path = args.db_path or get_default_db_path()
    if not db_path.exists():
        print(f"ERROR: Database not found at {db_path}")
        print("  Run ingest.py and ingest_strongs.py first.")
        return

    print(f"Using database: {db_path}")
    conn = sqlite3.connect(db_path)

    # Check required tables exist
    tables = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()
    table_names = {t[0] for t in tables}
    required = {"word_mappings", "strongs_greek", "strongs_hebrew", "verses", "translations", "terms_fts"}
    missing = required - table_names
    if missing:
        print(f"ERROR: Missing tables: {', '.join(sorted(missing))}")
        print("  Run ingest.py and ingest_strongs.py first.")
        return

    # Sanity checks
    wm_count = conn.execute("SELECT COUNT(*) FROM word_mappings").fetchone()[0]
    sg_count = conn.execute("SELECT COUNT(*) FROM strongs_greek").fetchone()[0]
    sh_count = conn.execute("SELECT COUNT(*) FROM strongs_hebrew").fetchone()[0]
    print(f"word_mappings rows: {wm_count}")
    print(f"strongs_greek rows: {sg_count}")
    print(f"strongs_hebrew rows: {sh_count}")

    if wm_count == 0:
        print("\nWARNING: word_mappings is empty.")
        print("  This table should be populated by ingest.py's SBLGNT/Hebrew ingestion.")
        print("  Run ingest.py first, then re-ingest Greek/Hebrew if needed.")

    if sg_count == 0:
        print("\nWARNING: strongs_greek is empty.")
        print("  Run ingest_strongs.py first.")

    print()
    greek_updated, hebrew_updated = populate_strongs_ids(conn)
    fts_rows = populate_terms_fts(conn)

    # Final stats
    wm_with_strongs = conn.execute("""
        SELECT COUNT(*) FROM word_mappings
        WHERE strongs_id IS NOT NULL AND strongs_id != ''
    """).fetchone()[0]
    fts_rows = conn.execute("SELECT COUNT(*) FROM terms_fts").fetchone()[0]

    print(f"\n=== Summary ===")
    print(f"  word_mappings with Strong's ID: {wm_with_strongs}/{wm_count}")
    print(f"  terms_fts rows: {fts_rows}")
    print(f"  Database: {db_path}")
    print("Done!")

    conn.close()


if __name__ == "__main__":
    main()
