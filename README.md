# Logos — Bible Study Application

A production-ready, local-first Bible study application built with Tauri. Deep linguistic analysis of the original Hebrew and Greek texts alongside multiple English translations, with optional AI-powered assistance.

## Features

- **Multiple Translations**: KJV, NKJV, ESV, and original Hebrew (OSHB) and Greek (SBLGNT)
- **Full-Text Search**: FTS5-powered search across all translations
- **Term Index**: Every term appearing 2+ times, sortable by frequency
- **Translation Comparison**: Side-by-side view of up to 4 translations
- **Greek & Hebrew**: Word-by-word breakdown with Strong's numbers and morphology
- **Notes & Bookmarks**: Annotate any verse with tags and cross-references
- **AI Assistant**: Optional AI integration for translation help and passage context (bring your own API key)

## Prerequisites

### Linux (Ubuntu/Debian)

```bash
# WebKit dependencies (required for Tauri)
sudo apt-get install -y \
  libjavascriptcoregtk-4.1-dev \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  pkg-config \
  build-essential

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Node.js (v18+)
```

### macOS

```bash
brew install node@20 rust
xcode-select --install
```

### Windows

Install [Rust](https://rustup.rs) and [Node.js](https://nodejs.org/).

## Build

```bash
# Clone / navigate to the project
cd logos

# Install frontend dependencies
npm install

# Build the application
npm run tauri build

# The executable will be in:
#   src-tauri/target/release/logos
```

To run in development mode:

```bash
npm run tauri dev
```

## Data Ingestion

Before using the app, you need to populate the database with Bible text:

```bash
# Full ingestion (downloads KJV + Greek NT)
python3 scripts/ingest.py

# Test with just Genesis 1
python3 scripts/ingest.py --sample

# Custom database path
python3 scripts/ingest.py --db-path /path/to/logos.db
```

The database is stored at `~/.local/share/Logos/logos.db` on Linux.

## Supported Data Sources

| Translation | Language | License |
|-------------|----------|---------|
| KJV | English | Public Domain |
| SBLGNT | Greek | SBL Font License |
| OSHB | Hebrew | Open Translation License 1.5 |

## Architecture

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Tauri 2 (Rust)
- **Database**: SQLite 3 + FTS5
- **Search**: Full-text search via FTS5

## Project Structure

```
logos/
├── src/                      # React frontend
│   ├── App.tsx               # Main app + routing
│   ├── pages/                # Page components
│   ├── lib/                  # Tauri bindings
│   └── styles/               # CSS
├── src-tauri/                # Rust backend
│   ├── src/
│   │   ├── commands/         # Tauri command handlers
│   │   ├── database/          # SQLite + FTS5
│   │   └── lib.rs            # App entry
│   └── tauri.conf.json
├── scripts/
│   └── ingest.py             # Bible data ingestion
└── SPEC.md                   # Technical specification
```

## License

Proprietary. All Bible translation data is used under their respective licenses.
