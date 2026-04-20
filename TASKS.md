# Logos — Coding Task Reference

> **IMPORTANT — Spec Discipline:** After completing any phase item or task, immediately update SPEC.md checkboxes. Every. Single. Time. The SPEC is the source of truth for what is done vs. not done. If you check a box, commit it. If you find something was already done, check the box. Never leave the SPEC stale.

Project: `/home/jean-galt/logos`
Rust backend: `src-tauri/src/`
React frontend: `src/`
DB: `~/.local/share/logos/logos.db` (SQLite + FTS5)

**Build commands:**
- Frontend: `cd /home/jean-galt/logos && npm run build`
- Backend: `cd /home/jean-galt/logos/src-tauri && cargo build --release`
- Both: `cd /home/jean-galt/logos/src-tauri && cargo build --release 2>&1 | grep -E "error" && cd .. && npm run build`

---

## Task 1: Phase 7 AI — Provider Abstraction + Real API Calls

**Goal:** Wire up real AI calls using the configured provider (OpenAI/Anthropic/Google/Groq/Ollama). Replace the stub responses in `AiPanel.tsx` with actual API calls.

### Backend (Rust)

**File:** `src-tauri/src/ai/mod.rs` (create) + `src-tauri/src/ai/providers.rs` (create)

1. Create `src-tauri/src/ai/mod.rs` — defines `AiProvider` enum, trait `Provider`, `AiRequest` / `AiResponse` types
2. Create `src-tauri/src/ai/providers.rs` — implements `Provider` for each: `OpenAiProvider`, `AnthropicProvider`, `GoogleProvider`, `GroqProvider`, `OllamaProvider`
3. Each provider has `chat(messages: Vec<ChatMessage>, model: &str) -> Result<String>`
4. Add a new Tauri command `ai_chat(messages_json: String, provider: String, model: String) -> Result<String, String>`
5. Register in `src-tauri/src/commands/mod.rs`
6. Register in `src-tauri/src/lib.rs`

**Key constraint:** API keys are stored via `getPreference` / `setPreference` — keys are `api_key_openai`, `api_key_anthropic`, etc. The Rust side needs to read these via the DB query.

### Frontend (React)

**Files:** `src/components/AiPanel.tsx`, `src/lib/ai.ts` (create)

1. Create `src/lib/ai.ts` — wraps `invoke('ai_chat', ...)` with proper types
2. In `AiPanel.tsx`:
   - Load provider + model + API key from preferences
   - Build messages: system prompt (context about the verses) + user question
   - Call `ai_chat(messages, provider, model)`
   - Display streamed or batch response in the chat
   - Handle loading state with spinner
3. Wire the "AI Explain" button in `StrongsPopupModal` (App.tsx) to open `AiPanel` with the current verse context

### System prompt guidance

The AI should receive context like:
```
You are a Bible study assistant. The user is reading: [book] [chapter]:[verse]
Selected verse text: "..."
Previous verses: "..."
Answer questions about the text, its Greek/Hebrew words, and related passages.
Keep answers concise and scholarly.
```

### Verification

- Build both frontend and backend with no errors
- The AI panel should show a real response when API key is configured (can test with a mock/print of the request payload if no key set)

---

## Task 2: Phase 3 Search — Filters + Sort Options

**Goal:** Improve the search UX by adding filter controls and sort options to `SearchPage.tsx`.

### Filter Controls

Add above the search results in `src/pages/SearchPage.tsx`:

1. **Translation filter** — Dropdown to limit results to a specific translation (kjv, sblgnt, wlc, or "All")
2. **Testament filter** — OT / NT / All buttons
3. **Genre filter** — Dropdown: All, Law, History, Wisdom, Prophets, Gospels, Epistles, Apocalyptic

These filters should narrow the FTS query. Since FTS5 doesn't support complex WHERE clauses on joined columns directly in the MATCH query, the approach is:

- Run the FTS search, get back verse_ids
- Filter the results in-memory by checking the verse's translation, book testament, and book genre
- Or: modify the SQL query to JOIN with books/translations and add WHERE clauses

**SQL approach (recommended):**
```sql
SELECT v.id, b.abbreviation, v.chapter, v.verse_num, v.text, t.abbreviation, verses_fts.rank
FROM verses_fts
JOIN verses v ON verses_fts.verse_id = v.id
JOIN books b ON v.book_id = b.id
JOIN translations t ON v.translation_id = t.id
WHERE verses_fts MATCH ? 
  AND (? IS NULL OR t.abbreviation = ?)
  AND (? IS NULL OR b.testament = ?)
  AND (? IS NULL OR b.genre = ?)
ORDER BY verses_fts.rank
LIMIT ?
```

Add `translation`, `testament`, `genre` parameters to the Rust `search_verses` function in `src-tauri/src/commands/search.rs`.

### Sort Options

Add a dropdown with sort choices:
- **Relevance** (default) — use `verses_fts.rank` ORDER BY
- **Book order** — ORDER BY b.order_index, v.chapter, v.verse_num
- **Most recent** — ORDER BY v.id DESC (assumes higher IDs are later in the text, so not useful for verse search; skip this for now)

### UI Layout

Filters should appear in a compact bar above results, collapsing into a "Filters" dropdown on mobile. Dark mode aware.

### Verification

- Type a query in search, apply filters, results narrow correctly
- Sort by book order shows books in canonical order (Gen → Rev)

---

## Task 3: Phase 8 Polish — Keyboard Shortcuts + Export

**Goal:** Add keyboard shortcuts and export functionality.

### Keyboard Shortcuts

Add a global keyboard handler in `src/App.tsx` (or a new `src/hooks/useKeyboardShortcuts.ts`):

| Shortcut | Action |
|---|---|
| `j` or `→` | Next verse |
| `k` or `←` | Previous verse |
| `b` | Toggle bookmark on current verse |
| `/` | Focus search input |
| `Esc` | Close any open modal/panel |
| `n` | Open notes panel |
| `?` | Show keyboard shortcuts help modal |

Implementation: `useEffect` with `window.addEventListener('keydown', handler)` in the App component. Check `e.key` and dispatch to store actions.

### Export Notes / Bookmarks

Add an "Export" button in the Notes panel (App.tsx) and a new `/export` route or modal.

**Format:** JSON or CSV

JSON format:
```json
{
  "exported_at": "2026-04-20T...",
  "notes": [
    {
      "title": "...",
      "content": "...",
      "tags": ["..."],
      "verse_ref": "Gen 1:1",
      "created_at": "..."
    }
  ],
  "bookmarks": [
    {
      "verse_ref": "John 3:16",
      "label": "...",
      "created_at": "..."
    }
  ]
}
```

**Rust side:** Add a new command `export_notes_and_bookmarks() -> ExportData` that queries notes + bookmarks + verse refs, returns JSON-serializable struct.

**Frontend:** Add "Export as JSON" and "Export as CSV" buttons. CSV should have columns: type, title/label, content, verse_ref, tags, created_at.

Use `URL.createObjectURL(new Blob([json], {type: 'application/json'}))` and trigger download via a hidden `<a>` element.

### Verification

- Keyboard shortcuts work from any page
- Export produces valid downloadable files with correct content

---

## Task 4: search_notes Rust Fix + Notes Search UI

**Goal:** Fix the `search_notes` backend and add a search input to the Notes panel.

### Backend Fix

**File:** `src-tauri/src/database/queries.rs`

The `search_notes` function needs to implement actual text search on notes. Check the current implementation:

```bash
grep -n "search_notes" /home/jean-galt/logos/src-tauri/src/database/queries.rs
```

If it's a stub or does full table scan, fix it to use FTS or LIKE with proper indexing:

```sql
SELECT id, verse_id, title, content, tags, created_at, updated_at
FROM notes
WHERE title LIKE ? OR content LIKE ? OR tags LIKE ?
ORDER BY updated_at DESC
LIMIT 50
```

Or if a notes_fts table exists, use FTS5.

### Frontend — Add Search Input

**File:** `src/App.tsx` (NotesPanelModal)

Add a search input at the top of the Notes panel above the note list. When the user types, filter the loaded notes client-side (no need for a new API call for simple text filtering). For longer lists (>100 notes), call `searchNotes(query)` instead.

### Verification

- Typing in the notes search filters the list in real-time
- Search matches against title, content, and tags
- Empty search shows all notes

---

## General Guidance

- **Rust errors:** Run `cargo build --release 2>&1 | grep "error"` to catch compile errors quickly
- **TypeScript errors:** Run `npm run build` (runs `tsc && vite build`) — watch for TS errors
- **DB inspection:** `python3 -c "import sqlite3; db=sqlite3.connect('/home/jean-galt/.local/share/logos/logos.db')"` to probe data
- **No panic rule:** All Tauri commands must return `Result<T, String>`, never panic
- **Dark mode:** All new UI elements must respect `darkMode` from `useAppStore`
- **Tauri IPC:** Frontend uses `invoke('command_name', {args})` from `src/lib/tauri.ts`
- **Don't break existing features:** Run the full build after each task