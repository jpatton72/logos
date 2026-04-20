import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Book } from '../lib/tauri';

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
  currentVerse: number | null;
  activeTranslations: string[];
  sidebarOpen: boolean;
  darkMode: boolean;
  bookmarks: Bookmark[];
  notes: Note[];
  fontSize: number;
  // Actions
  setBook: (book: string) => void;
  setChapter: (chapter: number) => void;
  setVerse: (verse: number | null) => void;
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

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentBook: 'gen',
      currentChapter: 1,
      currentVerse: null,
      activeTranslations: ['KJV'],
      sidebarOpen: true,
      darkMode: false,
      bookmarks: [],
      notes: [],
      fontSize: 18,

      setBook: (book: string | Book) => set({ currentBook: typeof book === 'string' ? book : book.abbreviation, currentVerse: null }),
      setChapter: (chapter) => set({ currentChapter: chapter, currentVerse: null }),
      setVerse: (verse) => set({ currentVerse: verse }),
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
