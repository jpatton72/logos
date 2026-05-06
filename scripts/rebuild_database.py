#!/usr/bin/env python3
"""Rebuild the Aletheia bundled database from scratch.

Runs every ingester in the correct order and copies the result to
src-tauri/aletheia.db so the next `npm run tauri build` ships a fully populated
database. End users never need to run this — they just install the app — but
developers preparing a release should run this whenever upstream data sources
change.

Usage:
    python scripts/rebuild_database.py
    python scripts/rebuild_database.py --db-path /path/to/aletheia.db

Steps performed:
    1. Ingest KJV / SBLGNT / WLC base text (existing scripts/ingest.py).
    2. Ingest Strong's Greek + Hebrew dictionaries (ingest_strongs.py).
    3. Ingest NKJV + ESV from Bible-json (auto-download).
    4. Ingest KJV apocrypha from Bible-json (auto-download).
    5. Ingest pseudepigrapha (1 Enoch, Jubilees, 2 Enoch) from committed JSONs.
    6. Ingest MorphGNT Greek word_mappings (auto-download from morphgnt/sblgnt).
    7. Ingest OSHB Hebrew word_mappings (auto-download from openscriptures/morphhb).
    8. Resolve lemma -> Strong's IDs and populate terms_fts (ingest_word_mappings.py).
    9. Build english_strongs_index from eBible KJV2006 USFM (ingest_kjv_strongs.py).
    10. Copy the populated DB to src-tauri/aletheia.db.

Step 1 + 2 are skipped if the DB already has populated `verses` and Strong's
tables (so reruns don't duplicate work).
"""
from __future__ import annotations

import argparse
import os
import platform
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path

from _user_check import add_allow_root_flag, assert_not_root

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
SCRIPTS = ROOT / "scripts"
BUNDLED_DB = ROOT / "src-tauri" / "aletheia.db"

NKJV_URL = "https://raw.githubusercontent.com/Amosamevor/Bible-json/main/versions/en/NEW%20KING%20JAMES%20VERSION.json"
ESV_URL = "https://raw.githubusercontent.com/Amosamevor/Bible-json/main/versions/en/ENGLISH%20STANDARD%20VERSION.json"
KJV_APOCRYPHA_URL = "https://raw.githubusercontent.com/Amosamevor/Bible-json/main/apocrypha-versions/KJV.json"


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


def run(*cmd: str) -> None:
    print(f"\n>>> {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=ROOT)
    if result.returncode != 0:
        raise SystemExit(f"Command failed with exit code {result.returncode}: {' '.join(cmd)}")


def has_base_text(db_path: Path) -> bool:
    """True if the DB looks like it already has the bulk imports done.

    Tolerates missing tables (returns False) so this function can be called
    against a freshly schema-created DB or one that was prepared by an
    older script version.
    """
    conn = sqlite3.connect(db_path)
    try:
        try:
            n_verses = conn.execute("SELECT COUNT(*) FROM verses").fetchone()[0]
            n_books = conn.execute("SELECT COUNT(*) FROM books").fetchone()[0]
            n_strongs = conn.execute(
                "SELECT (SELECT COUNT(*) FROM strongs_greek) + (SELECT COUNT(*) FROM strongs_hebrew)"
            ).fetchone()[0]
        except sqlite3.OperationalError:
            return False
    finally:
        conn.close()
    return n_verses > 50_000 and n_books >= 66 and n_strongs > 10_000


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db-path", help="Path to aletheia.db (default: app data dir).")
    parser.add_argument("--skip-base", action="store_true", help="Skip ingest.py + ingest_strongs.py.")
    parser.add_argument("--skip-copy", action="store_true", help="Don't copy the result to src-tauri/aletheia.db.")
    add_allow_root_flag(parser)
    args = parser.parse_args()
    assert_not_root(args.allow_root, script_name="rebuild_database.py")

    db_path = Path(args.db_path) if args.db_path else default_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Target DB: {db_path}")
    py = sys.executable
    # Forward the user's privilege override into every subprocess so they
    # don't all blow up independently if the orchestrator was allowed.
    root_args = ["--allow-root"] if args.allow_root else []

    # Step 0: ensure the schema exists / is up to date. Idempotent and cheap;
    # also repairs DBs created by older versions of the scripts that didn't
    # successfully create every required table (e.g. verses_fts).
    run(py, str(SCRIPTS / "ingest.py"), "--db-path", str(db_path), "--schema-only", *root_args)

    # Step 1+2: base text + Strong's. Skip if DB looks already populated.
    if args.skip_base:
        print("\nSkipping base text + Strong's (--skip-base).")
    elif db_path.exists() and has_base_text(db_path):
        print("\nBase text + Strong's already present; skipping ingest.py / ingest_strongs.py.")
    else:
        run(py, str(SCRIPTS / "ingest.py"), "--db-path", str(db_path), *root_args)
        run(py, str(SCRIPTS / "ingest_strongs.py"), "--db-path", str(db_path), *root_args)

    # Step 3: NKJV + ESV
    run(
        py, str(SCRIPTS / "ingest_json_translation.py"),
        "--json", str(DATA_DIR / "NKJV.json"),
        "--name", "New King James Version",
        "--abbr", "NKJV",
        "--db-path", str(db_path),
        "--download-url", NKJV_URL,
        *root_args,
    )
    run(
        py, str(SCRIPTS / "ingest_json_translation.py"),
        "--json", str(DATA_DIR / "ESV.json"),
        "--name", "English Standard Version",
        "--abbr", "ESV",
        "--db-path", str(db_path),
        "--download-url", ESV_URL,
        "--optimize",
        *root_args,
    )

    # Step 4: KJV apocrypha
    run(
        py, str(SCRIPTS / "ingest_apocrypha.py"),
        "--json", str(DATA_DIR / "KJV_Apocrypha.json"),
        "--translation", "KJV",
        "--db-path", str(db_path),
        "--download-url", KJV_APOCRYPHA_URL,
        *root_args,
    )

    # Step 5: Pseudepigrapha (1 Enoch / Jubilees / 2 Enoch). Reads
    # the JSONs committed under data/pseudepigrapha/, produced by
    # scripts/scrape_pseudepigrapha.py — no network access needed.
    run(
        py, str(SCRIPTS / "ingest_pseudepigrapha.py"),
        "--db-path", str(db_path),
        *root_args,
    )

    # Step 6: MorphGNT Greek word_mappings
    run(py, str(SCRIPTS / "ingest_morphgnt.py"), "--db-path", str(db_path), "--wipe", *root_args)

    # Step 6: OSHB Hebrew word_mappings
    run(py, str(SCRIPTS / "ingest_oshb.py"), "--db-path", str(db_path), "--wipe", *root_args)

    # Step 7: lemma -> Strong's match + terms_fts
    run(py, str(SCRIPTS / "ingest_word_mappings.py"), "--db-path", str(db_path), *root_args)

    # Step 8: KJV English -> Strong's index for the Lexicon's English-lookup.
    run(py, str(SCRIPTS / "ingest_kjv_strongs.py"), "--db-path", str(db_path), *root_args)

    # Step 9: copy to src-tauri/ so the next `tauri build` ships it.
    if not args.skip_copy:
        shutil.copy2(db_path, BUNDLED_DB)
        size_mb = BUNDLED_DB.stat().st_size / (1024 * 1024)
        print(f"\nCopied populated DB to {BUNDLED_DB} ({size_mb:.1f} MB).")

    print("\nDatabase rebuild complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
