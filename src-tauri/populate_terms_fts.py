#!/usr/bin/env python3
"""
populate_terms_fts.py
Populates the terms_fts FTS5 virtual table with term frequency data from all verses.

This replicates the logic from src/database/queries.rs:populate_terms_fts:
1. Count occurrences of each term (lowercased, alpha 2+) across all verse texts
2. Insert into terms_fts(term, verse_count, translation_id=0)
"""

import sqlite3, re, os, platform
from pathlib import Path

def get_default_db_path() -> Path:
    system = platform.system()
    if system == "Windows":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        return base / "Logos Bible" / "logos.db"
    elif system == "Darwin":
        return Path.home() / "Library" / "Application Support" / "Logos" / "logos.db"
    else:
        return Path.home() / ".local" / "share" / "logos" / "logos.db"

HERMES_HOME = os.environ.get('HERMES_HOME', str(get_default_db_path().parent))
DB_PATH = get_default_db_path()

WORD_RE = re.compile(r'[a-zA-Z]{2,}')


def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA synchronous=NORMAL')
    return conn


def main():
    print("=== Populating terms_fts ===\n")
    conn = get_db()

    # Check if already populated
    count = conn.execute("SELECT COUNT(*) FROM terms_fts").fetchone()[0]
    if count > 0:
        print(f"terms_fts already has {count} rows — skipping population.")
        return

    print("Reading all verses...")
    verses = conn.execute("SELECT id, text, translation_id FROM verses").fetchall()
    print(f"  {len(verses)} verses to process")

    # Count terms globally
    global_counts = {}
    for verse_id, text, translation_id in verses:
        for match in WORD_RE.finditer(text):
            term = match.group().lower()
            global_counts[term] = global_counts.get(term, 0) + 1

    print(f"  {len(global_counts)} unique terms found")

    # Clear and populate terms_fts
    conn.execute("DELETE FROM terms_fts")

    entries = list(global_counts.items())
    # Sort by count descending for nice ordering
    entries.sort(key=lambda x: -x[1])

    # Batch insert
    batch_size = 5000
    total_inserted = 0
    for i in range(0, len(entries), batch_size):
        batch = entries[i:i+batch_size]
        conn.executemany(
            "INSERT INTO terms_fts (term, verse_count, translation_id) VALUES (?, ?, 0)",
            batch
        )
        conn.commit()
        total_inserted += len(batch)
        print(f"  Inserted batch {i//batch_size + 1}: {len(batch)} terms (total: {total_inserted})")

    final_count = conn.execute("SELECT COUNT(*) FROM terms_fts").fetchone()[0]
    print(f"\nterms_fts populated: {final_count} unique terms")

    # Sample output
    print("\nTop 20 terms by frequency:")
    for row in conn.execute("""
        SELECT term, verse_count FROM terms_fts
        ORDER BY verse_count DESC LIMIT 20
    """):
        print(f"  {row[0]}: {row[1]} verses")

    conn.close()


if __name__ == '__main__':
    main()