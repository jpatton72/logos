# Aletheia — Bible Study Application

*ἀλήθεια — Greek for "truth," literally "unconcealedness."*

A production-ready, local-first Bible study application built with Tauri.
Deep linguistic analysis of the original Hebrew and Greek texts alongside
public-domain English translations, with optional AI-powered assistance.

## Features

- **Five translations** out of the box: King James (KJV), New King James
  (NKJV), English Standard (ESV), the Westminster Leningrad Codex (WLC,
  Hebrew OT), and the SBL Greek New Testament (SBLGNT). Source-license
  details in [ATTRIBUTIONS.md](ATTRIBUTIONS.md); NKJV, ESV, and SBLGNT
  require commercial licenses from their rights holders before
  redistribution.
- **KJV Apocrypha** — 15 deuterocanonical books (Tobit, Judith, Wisdom,
  1–2 Maccabees, etc.) listed under a Non-Canonical section.
- **Original-language word study** — every Hebrew and Greek word in the
  text is tagged with Strong's number, lemma, and morphology (444,241
  word mappings: 306,687 Hebrew/Aramaic + 137,554 Greek). Click any word
  for an instant lexicon popup.
- **Strong's sidebar** — automatically appears when reading the WLC or
  SBLGNT, listing every word in the active verse with its Strong's entry.
- **Translation comparison** — line up the entire chapter across 2–5
  translations, aligned by verse number.
- **Search** — unified reference (`John 3:16`, `1 Cor 13:4-7`) and
  full-text search across every translation, no result limit.
- **Notes & bookmarks** — annotate any verse, tag your notes, export to
  JSON or CSV.
- **AI assistant** — bring-your-own-key integration for OpenAI, Anthropic,
  Google AI, Groq, and Ollama. Available from the Reader and Compare pages.
  API keys are stored in the OS credential vault (Windows Credential
  Manager, macOS Keychain, Linux Secret Service) — never in the database
  file or any plaintext config.
- **Keyboard shortcuts** — press `?` inside the app for the full list.
- **Local-first, offline-capable** — all data lives in a single SQLite
  file in your user data directory. No telemetry, no account required.

---

## Installation

### Windows (recommended — single installer)

1. Download the latest installer from
   <https://github.com/jpatton72/Aletheia/releases/latest/download/Aletheia_x64-setup.exe>
   (always points at the most recent stable release; per-version
   installers + SHA-256 checksums live on the
   [Releases page](https://github.com/jpatton72/Aletheia/releases)).
2. Double-click the installer. Windows SmartScreen may warn about an
   unrecognized publisher — click **More info → Run anyway**.
3. Follow the prompts; the default install location is fine.
4. Launch **Aletheia** from the Start menu. The fully populated
   database (≈99 MB, all five translations + apocrypha + word mappings)
   is unpacked into `%APPDATA%\aletheia\Aletheia\data\aletheia.db` on first launch.

**WebView2 runtime.** Aletheia uses Microsoft Edge WebView2 to render its UI.
Windows 11 and current Windows 10 ship with it preinstalled. If the app
fails to launch, install the runtime from
<https://developer.microsoft.com/microsoft-edge/webview2/>.

**Upgrading from a previous version.** First-launch seeding only runs
when no database exists yet. To pick up new translations or word
mappings from a newer release, exit the app, rename
`%APPDATA%\aletheia\Aletheia\data\aletheia.db` to `aletheia.db.bak`, then run the
new installer (or just relaunch the app — the bundled DB will reseed).
Your previous notes and bookmarks live in the backup file; copy them
over with any SQLite tool if needed.

**API key migration.** Builds before the credential-vault change kept
API keys in the `user_preferences` table in plaintext. The first launch
of the new build moves any existing `api_key_*` rows into the OS
credential vault and deletes the rows. The migration is idempotent and
silent; if the vault is unreachable (rare on Windows/macOS, possible on
a headless Linux box without a Secret Service daemon) the rows stay put
so you don't lose your keys. After upgrading you can verify the new
location with `cmdkey /list | findstr /i aletheia` on Windows. Pre-rename
keyring entries (under the old `com.logos.app` service) are also copied
over to the new `com.aletheia.app` service on first launch so you don't
have to re-paste keys after the rebrand.

### Linux (build from source)

There are no prebuilt Linux packages yet. Build the app from this
repository.

#### 1. Install build dependencies

**Ubuntu / Debian / Mint:**

```bash
sudo apt-get update
sudo apt-get install -y \
    build-essential \
    curl \
    git \
    pkg-config \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libwebkit2gtk-4.1-dev \
    libjavascriptcoregtk-4.1-dev \
    python3 python3-pip
```

**Fedora / RHEL:**

```bash
sudo dnf install -y \
    @development-tools \
    curl git \
    openssl-devel \
    gtk3-devel \
    libappindicator-gtk3-devel \
    librsvg2-devel \
    webkit2gtk4.1-devel \
    javascriptcoregtk4.1-devel \
    python3 python3-pip
```

**Arch / Manjaro:**

```bash
sudo pacman -S --needed \
    base-devel git curl \
    gtk3 libayatana-appindicator librsvg \
    webkit2gtk-4.1 python
```

#### 2. Install Rust and Node.js

```bash
# Rust (stable toolchain)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Node.js 18 or newer — pick whichever method you prefer.
# Example using nvm:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
exec $SHELL
nvm install 20 && nvm use 20
```

#### 3. Clone and build

```bash
git clone https://github.com/jpatton72/Aletheia.git
cd Aletheia
npm install

# Populate the database (downloads ≈40 MB of source data the first time;
# ~2 minutes). Re-runs are idempotent.
python3 scripts/rebuild_database.py

# Production build. The runnable binary is dropped at:
#     src-tauri/target/release/aletheia
npm run tauri build
```

The runnable binary lives at `src-tauri/target/release/aletheia`. Tauri also
writes a `.deb` (and an `.AppImage` if you have `linuxdeploy` installed)
to `src-tauri/target/release/bundle/`.

#### 4. (Optional) Install system-wide

```bash
# .deb
sudo dpkg -i src-tauri/target/release/bundle/deb/aletheia_0.1.0_amd64.deb

# Or just copy the binary somewhere on PATH:
sudo install -Dm755 src-tauri/target/release/aletheia /usr/local/bin/aletheia
```

The database is created at `~/.local/share/aletheia/Aletheia/data/aletheia.db` on
first launch.

**Secret Service daemon.** To use the AI assistant, Linux needs a
running Secret Service provider for the OS credential vault. GNOME and
KDE ship one by default (`gnome-keyring-daemon` / `kwalletmanager`).
Minimal/tiling-WM setups may need to install one — KeePassXC with
"Enable Secret Service integration" checked in its settings is the
lightest option. Without a provider running, key saves will silently
fail and the app will report "No API key found for provider …" when you
try to use AI.

### macOS (build from source)

```bash
# Toolchain
xcode-select --install
brew install rust node@20 python@3.12

# Clone + build
git clone https://github.com/jpatton72/Aletheia.git
cd Aletheia
npm install
python3 scripts/rebuild_database.py
npm run tauri build
```

The `.app` bundle and `.dmg` end up in `src-tauri/target/release/bundle/`.
The database lives at `~/Library/Application Support/aletheia/Aletheia/data/aletheia.db`.

---

## Development workflow

```bash
# Hot-reload dev server (frontend + Rust). Opens a Tauri window.
npm run tauri dev

# Type-check + production frontend bundle only.
npm run build

# Production build (frontend + Rust release + installer).
npm run tauri build
```

Useful environment notes:

- The bundled `src-tauri/aletheia.db` is **not** committed to git.
  Re-create it with `python3 scripts/rebuild_database.py` whenever you
  want a fresh release build.
- `data/` and `data/oshb/` are gitignored — the ingest scripts download
  their source assets there on demand.
- See [BUILD.md](BUILD.md) for the full release-engineering recipe.

## Re-running individual ingest scripts

| Script | Purpose |
|---|---|
| [`scripts/ingest.py`](scripts/ingest.py) | KJV / SBLGNT / WLC base text |
| [`scripts/ingest_strongs.py`](scripts/ingest_strongs.py) | Strong's Greek + Hebrew lexicons |
| [`scripts/ingest_json_translation.py`](scripts/ingest_json_translation.py) | Any Bible-json translation |
| [`scripts/ingest_apocrypha.py`](scripts/ingest_apocrypha.py) | KJV Apocrypha (15 books) |
| [`scripts/ingest_morphgnt.py`](scripts/ingest_morphgnt.py) | Greek NT word_mappings |
| [`scripts/ingest_oshb.py`](scripts/ingest_oshb.py) | Hebrew OT word_mappings |
| [`scripts/ingest_word_mappings.py`](scripts/ingest_word_mappings.py) | Resolve lemma → Strong's IDs, build terms_fts |
| [`scripts/rebuild_database.py`](scripts/rebuild_database.py) | Run all of the above end-to-end |

All scripts accept `--db-path /path/to/aletheia.db` and auto-download their
source data when missing.

## Architecture

- **Frontend:** React 18 + TypeScript + Vite + Zustand + React Router
- **Backend:** Tauri 2 (Rust)
- **Database:** SQLite 3 + FTS5
- **Search:** Full-text search via FTS5 with a regex-based reference
  parser layered on top
- **AI:** Pluggable provider trait (OpenAI, Anthropic, Google, Groq,
  Ollama) over `reqwest` with `rustls-tls`

```
aletheia/
├── src/                      # React frontend
│   ├── App.tsx               # Routing + global panels (Strong's sidebar, Ask AI)
│   ├── pages/                # Reader, Search, Compare, Lexicon, Notes, Settings
│   ├── components/           # Header, Sidebar, ChapterView, VerseDisplay, AiPanel,
│   │                         #   StrongsSidebar, NoteForm, SearchBar/Results
│   ├── lib/tauri.ts          # Tauri invoke wrappers
│   ├── lib/ai.ts             # AI provider client
│   └── store/useAppStore.ts  # Zustand global state
├── src-tauri/                # Rust backend
│   └── src/
│       ├── lib.rs            # App entry, DB seeding, command registry
│       ├── commands/         # Tauri command handlers
│       ├── database/         # connection + migrations + queries
│       └── ai/               # Provider trait + OpenAI/Anthropic/Google/Groq/Ollama
├── scripts/                  # Python ingest pipeline (see table above)
├── public/morphgnt/          # MorphGNT plain-text source data (committed)
├── BUILD.md                  # Release-engineering instructions
└── SPEC.md                   # Technical specification
```

## Data sources & licenses

See [ATTRIBUTIONS.md](ATTRIBUTIONS.md) for the full list with upstream
links and license texts. Summary:

| Source | Used for | License |
|---|---|---|
| KJV | Base English text + Apocrypha | Public Domain |
| [Westminster Leningrad Codex](https://tanach.us/) | Hebrew OT base text | Open Translation License 1.5 |
| [OpenScriptures Hebrew Bible](https://github.com/openscriptures/morphhb) | Hebrew OT word_mappings | CC-BY 4.0 |
| [MorphGNT](https://github.com/morphgnt/sblgnt) | Greek NT word_mappings | CC-BY-SA 3.0 |
| Strong's Greek + Hebrew | Lexicon entries | Public Domain |

NKJV, ESV, and SBLGNT are **not** bundled with the default installer —
each requires a paid commercial license from its rights holder. Build
from source with the appropriate translation data if you have a
license.

## Fonts

Inter, Lora, Noto Serif, and Noto Serif Hebrew, all under the
[SIL Open Font License 1.1](https://opensource.org/licenses/OFL-1.1).
Vendored locally via `@fontsource` — no font CDN calls at runtime.

## License

The application code is proprietary. All third-party data is used under
the licenses listed in [ATTRIBUTIONS.md](ATTRIBUTIONS.md);
redistribution must respect the upstream terms.

Aletheia is **not** affiliated with, endorsed by, or sponsored by
Faithlife Corporation's Logos Bible Software product line.
