import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Book } from '../lib/tauri';
import { getBookIndex, getChapterCounts } from '../lib/tauri';

// A canonical reference to a single verse. `book` is the lower-cased
// abbreviation (e.g. "gen", "matt") to match the way `currentBook` is stored.
export interface VerseRef {
  book: string;
  chapter: number;
  verseNum: number;
}

function sameRef(a: VerseRef, b: VerseRef): boolean {
  return a.book === b.book && a.chapter === b.chapter && a.verseNum === b.verseNum;
}

export interface Bookmark {
  id: number;
  verse_id: number;
  label: string | null;
  created_at: string;
  // Nested verse fields (flattened from BookmarkWithVerse.verse)
  book_abbreviation: string;
  chapter: number;
  verse_num: number;
  text: string;
  translation_abbreviation: string;
}

export interface Note {
  id: number;
  verse_id: number | null;
  title: string | null;
  content: string;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

interface AppState {
  currentBook: string;
  currentChapter: number;
  // The user's verse selection. Persists across book/chapter navigation so
  // the user can build a multi-passage AI prompt (e.g. Gen 1:1 + Exod 3:14).
  // Order = selection order. Cleared by `clearVerseSelection()` or the
  // AiPanel right after a question is sent.
  selectedVerses: VerseRef[];
  activeTranslations: string[];
  sidebarOpen: boolean;
  darkMode: boolean;
  bookmarks: Bookmark[];
  notes: Note[];
  fontSize: number;
  // Cached book index — populated once via ensureBooks(). Components can
  // read `books` directly; if it's empty they should call ensureBooks().
  // Doesn't need to be persisted: the data is static and ships with the
  // bundled DB, so a single Tauri IPC call per app session is enough.
  books: Book[];
  // Cached chapter-count map (`abbreviation` -> max chapter), populated
  // once via ensureChapterCounts(). Same lifetime semantics as `books`.
  chapterCounts: Record<string, number>;
  // Actions
  setBook: (book: string) => void;
  setChapter: (chapter: number) => void;
  toggleVerseSelection: (ref: VerseRef) => void;
  extendVerseSelection: (ref: VerseRef) => void;
  clearVerseSelection: () => void;
  ensureBooks: () => Promise<Book[]>;
  ensureChapterCounts: () => Promise<Record<string, number>>;
  addTranslation: (trans: string) => void;
  removeTranslation: (trans: string) => void;
  setActiveTranslations: (translations: string[]) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleDarkMode: () => void;
  addBookmark: (bookmark: Bookmark) => void;
  removeBookmark: (id: number) => void;
  addNote: (note: Note) => void;
  updateNote: (id: number, updates: Partial<Note>) => void;
  removeNote: (id: number) => void;
  setFontSize: (size: number) => void;
}

// Module-level singleton for an in-flight ensureBooks() call. Lives outside
// the store so it doesn't get serialized/persisted.
let _booksPromise: Promise<Book[]> | null = null;
let _chapterCountsPromise: Promise<Record<string, number>> | null = null;

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentBook: 'gen',
      currentChapter: 1,
      selectedVerses: [],
      activeTranslations: ['KJV'],
      sidebarOpen: true,
      darkMode: false,
      bookmarks: [],
      notes: [],
      fontSize: 18,
      books: [],
      chapterCounts: {},

      // Navigation does NOT clear the verse selection — the whole point of
      // the persistent selection is to let the user gather verses from
      // multiple chapters/books before asking the AI about them.
      setBook: (book: string | Book) =>
        set({
          currentBook: (typeof book === 'string' ? book : book.abbreviation).toLowerCase(),
        }),
      setChapter: (chapter) => set({ currentChapter: chapter }),

      // Plain-click + Ctrl/Cmd-click both route here: toggle the ref in the
      // selection list (add if absent, remove if present).
      toggleVerseSelection: (ref) =>
        set((s) => {
          const has = s.selectedVerses.some((v) => sameRef(v, ref));
          return {
            selectedVerses: has
              ? s.selectedVerses.filter((v) => !sameRef(v, ref))
              : [...s.selectedVerses, ref],
          };
        }),

      // Shift-click: select an inclusive range within the same book+chapter
      // as the new ref, anchored at the most recent already-selected verse
      // in that book+chapter. Verses already in the selection stay; new
      // verses in the range are appended. If there is no anchor in this
      // book+chapter, behaves like a plain add.
      extendVerseSelection: (ref) =>
        set((s) => {
          const sameChapter = s.selectedVerses.filter(
            (v) => v.book === ref.book && v.chapter === ref.chapter,
          );
          const anchor = sameChapter[sameChapter.length - 1]?.verseNum;
          if (anchor == null) {
            const exists = s.selectedVerses.some((v) => sameRef(v, ref));
            return exists
              ? s
              : { selectedVerses: [...s.selectedVerses, ref] };
          }
          const lo = Math.min(anchor, ref.verseNum);
          const hi = Math.max(anchor, ref.verseNum);
          const additions: VerseRef[] = [];
          for (let v = lo; v <= hi; v++) {
            const r = { book: ref.book, chapter: ref.chapter, verseNum: v };
            if (!s.selectedVerses.some((x) => sameRef(x, r))) {
              additions.push(r);
            }
          }
          return { selectedVerses: [...s.selectedVerses, ...additions] };
        }),

      clearVerseSelection: () => set({ selectedVerses: [] }),

      // Returns the cached list if we already have it; otherwise fetches
      // once and caches. Multiple concurrent callers share the same
      // in-flight Promise via _booksPromise below so we don't fan out
      // duplicate IPC calls during initial mount.
      ensureBooks: async (): Promise<Book[]> => {
        const cached = get().books;
        if (cached.length > 0) return cached;
        if (_booksPromise) return _booksPromise;
        _booksPromise = (async () => {
          try {
            const books = await getBookIndex();
            set({ books });
            return books;
          } finally {
            _booksPromise = null;
          }
        })();
        return _booksPromise;
      },
      ensureChapterCounts: async (): Promise<Record<string, number>> => {
        const cached = get().chapterCounts;
        if (Object.keys(cached).length > 0) return cached;
        if (_chapterCountsPromise) return _chapterCountsPromise;
        _chapterCountsPromise = (async () => {
          try {
            const counts = await getChapterCounts();
            set({ chapterCounts: counts });
            return counts;
          } finally {
            _chapterCountsPromise = null;
          }
        })();
        return _chapterCountsPromise;
      },
      addTranslation: (trans) =>
        set((s) =>
          s.activeTranslations.includes(trans) || s.activeTranslations.length >= 3
            ? s
            : { activeTranslations: [...s.activeTranslations, trans] }
        ),
      removeTranslation: (trans) =>
        set((s) => ({
          activeTranslations: s.activeTranslations.filter((t) => t !== trans),
        })),
      setActiveTranslations: (translations) =>
        set({ activeTranslations: translations.slice(0, 3) }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleDarkMode: () =>
        set((s) => {
          const next = !s.darkMode;
          if (next) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
          return { darkMode: next };
        }),
      addBookmark: (bookmark) =>
        set((s) => ({ bookmarks: [bookmark, ...s.bookmarks] })),
      removeBookmark: (id) =>
        set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) })),
      addNote: (note) => set((s) => ({ notes: [note, ...s.notes] })),
      updateNote: (id, updates) =>
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === id ? { ...n, ...updates, updated_at: new Date().toISOString() } : n
          ),
        })),
      removeNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
      setFontSize: (size) => set({ fontSize: size }),
    }),
    {
      name: 'logos-app-state',
      partialize: (s) => ({
        currentBook: s.currentBook,
        currentChapter: s.currentChapter,
        activeTranslations: s.activeTranslations,
        darkMode: s.darkMode,
        bookmarks: s.bookmarks,
        notes: s.notes,
        fontSize: s.fontSize,
      }),
    }
  )
);
