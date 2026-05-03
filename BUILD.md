# Build & Deploy

## Cutting a release (CI)

Releases are produced by [`.github/workflows/release.yml`](.github/workflows/release.yml)
on every `git push --tags` for any tag matching `v*`. The workflow
runs on a Windows + Linux matrix, builds installers in parallel, and
uploads everything to a GitHub release named after the tag.

```sh
# 1. Bump version in package.json + src-tauri/tauri.conf.json +
#    src-tauri/Cargo.toml (all three must match).
# 2. (Optional) write release notes at docs/release-notes/X.Y.Z.md —
#    if present, the workflow uses that file as the release body.
# 3. Push the version-bump commit + the tag.
git push origin main
git tag -a vX.Y.Z -m "Aletheia X.Y.Z"
git push origin vX.Y.Z
```

The workflow takes ~12-15 minutes on a cold cache, ~5-7 minutes once
`data/` and the cargo registry are warm. Output (X.Y.Z = the tag's
version):

| File | Where |
|---|---|
| `Aletheia_X.Y.Z_x64-setup.exe` (NSIS) | Windows |
| `Aletheia_X.Y.Z_x64_en-US.msi` | Windows (group-policy / silent) |
| `Aletheia_X.Y.Z_amd64.deb` | Linux (system-wide) |
| `Aletheia_X.Y.Z_amd64.AppImage` | Linux (single-file portable) |
| `Aletheia_x64-setup.exe` | Windows always-latest alias |
| `Aletheia_x64.AppImage` | Linux always-latest alias |
| `Aletheia_amd64.deb` | Linux always-latest alias |

Each NSIS / .deb / .AppImage / .msi is the canonical single-artifact
deploy: running it installs Aletheia and the fully populated
`aletheia.db` (KJV, NKJV, ESV, SBLGNT, WLC, KJV Apocrypha, plus all
444k Hebrew + Greek word mappings, Strong's IDs, KJV-token alignment).
Users do not need Python, Rust, or any ingest scripts to use the app.

The version-stripped aliases sit next to the canonical artifacts on
every release. They power the always-latest download URLs:

```
https://github.com/jpatton72/Aletheia/releases/latest/download/Aletheia_x64-setup.exe
https://github.com/jpatton72/Aletheia/releases/latest/download/Aletheia_x64.AppImage
https://github.com/jpatton72/Aletheia/releases/latest/download/Aletheia_amd64.deb
```

External "download Aletheia" links should point at those instead of
versioned URLs so they don't go stale.

## Cutting a release manually (fallback)

When CI is unavailable, `scripts/cut_release.sh` runs the same flow
locally for Windows only (no Linux artifacts):

```sh
python scripts/rebuild_database.py
npm run tauri build
scripts/cut_release.sh vX.Y.Z "Aletheia X.Y.Z" docs/release-notes/X.Y.Z.md
```

Prerequisites: Rust + Cargo (stable), Node 18+, Python 3.10+, the
Tauri Windows toolchain (WiX, NSIS — auto-downloaded on first build),
and `gh` (GitHub CLI) authenticated.

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
| [`scripts/ingest_kjv_strongs.py`](scripts/ingest_kjv_strongs.py) | English→Strong's index for Lexicon English-lookup | ebible.org/Scriptures/eng-kjv2006_usfm.zip |
| [`scripts/rebuild_database.py`](scripts/rebuild_database.py) | Run all of the above in the correct order | — |

## Files NOT committed to git

These are generated/downloaded; the repo expects them to be re-derivable:

- `src-tauri/target/`, `dist/`, `node_modules/` — build outputs
- `src-tauri/aletheia.db` — re-created by `scripts/rebuild_database.py`
- `data/*.json`, `data/oshb/` — auto-downloaded by the ingest scripts
- `*.msi`, `*-setup.exe` — distribute via GitHub Releases instead of git
