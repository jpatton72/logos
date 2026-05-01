# Build & Deploy

Single-command production build. The output is one Windows installer that
deploys the entire app — no scripts, no manual ingestion, no Python on the
target machine.

## Producing a release installer

Prerequisites (developer machine):

- Rust + Cargo (stable)
- Node.js 18+
- Python 3.10+
- The standard Tauri Windows toolchain (WiX, NSIS) — Tauri downloads these
  on first build into `target/release/build/`.

Run, in order:

```sh
# 1. Pull the latest source data and rebuild the bundled database.
#    Auto-downloads every translation/MorphGNT/OSHB asset that's missing.
#    Writes the result to `%APPDATA%/aletheia/Aletheia/data/aletheia.db` AND copies
#    it to `src-tauri/aletheia.db` (the path Tauri bundles).
python scripts/rebuild_database.py

# 2. Build the installer. Output goes to:
#      src-tauri/target/release/bundle/nsis/Aletheia_0.1.0_x64-setup.exe
#      src-tauri/target/release/bundle/msi/Aletheia_0.1.0_x64_en-US.msi
npm run tauri build
```

The NSIS `*-setup.exe` is the canonical single-executable deploy artifact:
running it installs the Aletheia app, the bundled icon, and the fully populated
`aletheia.db` (KJV, NKJV, ESV, SBLGNT, WLC, KJV Apocrypha, plus all 444k Hebrew
+ Greek word mappings with Strong's IDs). Users do not need Python or any of
the ingest scripts to use the app.

## Upgrading an existing install

If the user already has the app installed from a prior version, their
`%APPDATA%/aletheia/Aletheia/data/aletheia.db` won't be overwritten by the new
installer (the seeding code only runs when the file is missing or empty).

Until automatic schema-version upgrades land, the recommended upgrade
procedure is:

1. Quit the app.
2. Move `%APPDATA%\aletheia\Aletheia\data\aletheia.db` aside (e.g. rename to
   `aletheia.db.bak`) — this preserves any notes or bookmarks the user wants to
   migrate manually.
3. Run the new installer.
4. (Optional) Use a SQLite tool to copy `notes`, `bookmarks`,
   `user_preferences`, and `reading_progress` from the backup into the new
   DB.

## Re-running individual ingest scripts

Every ingester is independent and idempotent. Pass `--db-path` to point at a
non-default DB location. All ingesters auto-download their source data if
the file/dir argument is missing.

| Script | Purpose | Source |
|---|---|---|
| [`scripts/ingest.py`](scripts/ingest.py) | Base text: KJV, SBLGNT, WLC | bundled / Crosswire |
| [`scripts/ingest_strongs.py`](scripts/ingest_strongs.py) | Strong's Greek + Hebrew dictionaries | bundled |
| [`scripts/ingest_json_translation.py`](scripts/ingest_json_translation.py) | Any JSON translation | github.com/Amosamevor/Bible-json |
| [`scripts/ingest_apocrypha.py`](scripts/ingest_apocrypha.py) | KJV Apocrypha | github.com/Amosamevor/Bible-json |
| [`scripts/ingest_morphgnt.py`](scripts/ingest_morphgnt.py) | Greek NT word_mappings | github.com/morphgnt/sblgnt |
| [`scripts/ingest_oshb.py`](scripts/ingest_oshb.py) | Hebrew OT word_mappings | github.com/openscriptures/morphhb |
| [`scripts/ingest_word_mappings.py`](scripts/ingest_word_mappings.py) | Resolve lemma → Strong's IDs, build terms_fts | (post-processing) |
| [`scripts/rebuild_database.py`](scripts/rebuild_database.py) | Run all of the above in the correct order | — |

## Files NOT committed to git

These are generated/downloaded; the repo expects them to be re-derivable:

- `src-tauri/target/`, `dist/`, `node_modules/` — build outputs
- `src-tauri/aletheia.db` — re-created by `scripts/rebuild_database.py`
- `data/*.json`, `data/oshb/` — auto-downloaded by the ingest scripts
- `*.msi`, `*-setup.exe` — distribute via GitHub Releases instead of git
