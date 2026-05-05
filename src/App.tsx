import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from './store/useAppStore';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ReadingPage } from './pages/ReadingPage';
import { SearchPage } from './pages/SearchPage';
import Settings from './pages/Settings';
import Compare from './pages/Compare';
import Lexicon from './pages/Lexicon';
import { getBookmarks, deleteBookmark, getStrongsHebrew, getStrongsGreek, createBookmark, getVerse, getChapter } from './api';
import { AiPanel, type WordContext } from './components/AiPanel';
import { StrongsSidebar } from './components/StrongsSidebar';
import { NotesSidebar } from './components/NotesSidebar';
import type { BookmarkWithVerse } from './lib/tauri';
import { audioStatus } from './lib/tauri';
import { useFocusTrap } from './lib/useFocusTrap';
import { stopAudio } from './lib/audioPlayback';
import { SelectionActionBar } from './components/SelectionActionBar';
import { AUDIO_STATUS_EVENT } from './components/VerseDisplay';

const ORIGINAL_LANG_CODES = new Set(['wlc', 'sblgnt', 'oshb']);

function AppInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { darkMode, setSidebarOpen, currentBook, currentChapter, selectedVerses, bookmarks, activeTranslations, chapterCounts, ensureChapterCounts, ensureBooks } = useAppStore();

  useEffect(() => {
    ensureChapterCounts().catch((e) => console.error('Failed to load chapter counts:', e));
    ensureBooks().catch((e) => console.error('Failed to load book index:', e));
  }, [ensureChapterCounts, ensureBooks]);
  const [showSettings, setShowSettings] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showStrongsPopup, setShowStrongsPopup] = useState<{ word: string; strongsId: string; language: string } | null>(null);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiWordContext, setAiWordContext] = useState<WordContext | undefined>(undefined);
  const [aiVerses, setAiVerses] = useState<{ book_abbreviation: string; chapter: number; verse_num: number; text: string }[]>([]);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [strongsClosed, setStrongsClosed] = useState(false);
  // Whether the optional Piper voice is installed. Drives the
  // SelectionActionBar's visibility (no point offering a play button
  // when nothing can synthesize). Re-probes on AUDIO_STATUS_EVENT so
  // installing/uninstalling from Settings updates immediately.
  const [audioReady, setAudioReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const probe = () => {
      audioStatus()
        .then((s) => { if (!cancelled) setAudioReady(s.installed); })
        .catch(() => { if (!cancelled) setAudioReady(false); });
    };
    probe();
    window.addEventListener(AUDIO_STATUS_EVENT, probe);
    return () => {
      cancelled = true;
      window.removeEventListener(AUDIO_STATUS_EVENT, probe);
    };
  }, []);

  // Auto-reopen the Strong's sidebar whenever the active translations change
  // — a user toggling to/from an original language should see the panel again.
  const activeKey = activeTranslations.join('|');
  useEffect(() => { setStrongsClosed(false); }, [activeKey]);

  const hasOriginalLang = activeTranslations.some((t) =>
    ORIGINAL_LANG_CODES.has(t.toLowerCase()),
  );
  const showStrongsSidebar = location.pathname === '/' && hasOriginalLang && !strongsClosed;

  // Fetch the text of every selected verse — even ones from other books or
  // chapters than the one the user is currently reading — so the AI panel
  // can present them all as context. Re-runs whenever the selection changes
  // or the active translation changes (book/chapter no longer reset
  // selection, so they don't trigger a refetch).
  const selectedKey = selectedVerses.map((v) => `${v.book}:${v.chapter}:${v.verseNum}`).join(',');
  useEffect(() => {
    if (selectedVerses.length === 0) {
      setAiVerses([]);
      return;
    }
    let cancelled = false;
    const translation = activeTranslations[0] ?? 'KJV';
    Promise.all(
      selectedVerses.map((ref) =>
        getVerse(ref.book, ref.chapter, ref.verseNum, translation).catch(() => null),
      ),
    )
      .then((results) => {
        if (cancelled) return;
        const verses = results
          .filter((v): v is NonNullable<typeof v> => v != null)
          .map((v) => ({
            book_abbreviation: v.book_abbreviation,
            chapter: v.chapter,
            verse_num: v.verse_num,
            text: v.text,
          }));
        setAiVerses(verses);
      })
      .catch(() => {
        if (!cancelled) setAiVerses([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedKey covers selectedVerses
  }, [selectedKey, activeTranslations.join('|')]);

  // The in-chapter focus drives the Strong's sidebar. It's the most recently
  // selected verse that happens to be in the chapter the user is currently
  // viewing — null if no selection lives in this chapter.
  const inChapterFocus = (() => {
    for (let i = selectedVerses.length - 1; i >= 0; i--) {
      const v = selectedVerses[i];
      if (v.book === currentBook.toLowerCase() && v.chapter === currentChapter) {
        return v.verseNum;
      }
    }
    return null;
  })();

  // Book-order list comes from the cached book index — falls back to the
  // current book if the index hasn't loaded yet, so chapter-arrow nav
  // simply no-ops at chapter boundaries during the brief startup window.
  const orderedBookKeys = (): string[] => {
    const books = useAppStore.getState().books;
    if (books.length > 0) return books.map((b) => b.abbreviation.toLowerCase());
    return [currentBook.toLowerCase()];
  };

  const handleNextChapter = () => {
    const key = currentBook.toLowerCase();
    const count = chapterCounts[key] || 1;
    if (currentChapter < count) {
      useAppStore.getState().setChapter(currentChapter + 1);
    } else {
      const books = orderedBookKeys();
      const idx = books.indexOf(key);
      if (idx >= 0 && idx < books.length - 1) {
        useAppStore.getState().setBook(books[idx + 1]);
        useAppStore.getState().setChapter(1);
      }
    }
  };

  const handlePrevChapter = () => {
    const key = currentBook.toLowerCase();
    if (key === 'gen' && currentChapter === 1) return;
    if (currentChapter > 1) {
      useAppStore.getState().setChapter(currentChapter - 1);
    } else {
      const books = orderedBookKeys();
      const idx = books.indexOf(key);
      if (idx > 0) {
        const prevBook = books[idx - 1];
        useAppStore.getState().setBook(prevBook);
        useAppStore.getState().setChapter(chapterCounts[prevBook] || 1);
      }
    }
  };

  const toggleCurrentBookmark = async () => {
    try {
      // Get current verse (first verse of chapter for simplicity)
      const chapterData = await getChapter(currentBook, currentChapter, ['KJV']);
      if (chapterData && chapterData.length > 0 && chapterData[0].verses && chapterData[0].verses.length > 0) {
        const firstVerse = chapterData[0].verses[0];
        const isBookmarked = bookmarks.some(b => b.verse_id === firstVerse.id);
        if (isBookmarked) {
          const bm = bookmarks.find(b => b.verse_id === firstVerse.id);
          if (bm) {
            await deleteBookmark(bm.id);
            useAppStore.getState().removeBookmark(bm.id);
          }
        } else {
          const newBm = await createBookmark(firstVerse.id);
          useAppStore.getState().addBookmark({
            ...newBm,
            book_abbreviation: firstVerse.book_abbreviation,
            chapter: firstVerse.chapter,
            verse_num: firstVerse.verse_num,
            text: firstVerse.text,
            translation_abbreviation: firstVerse.translation_abbreviation || 'KJV',
          });
        }
      }
    } catch (e) {
      console.error('Failed to toggle bookmark:', e);
    }
  };

  // Keyboard shortcuts handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs/textareas
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        if (e.key === 'Escape') {
          // Allow Escape to close modals even in inputs
        } else {
          return;
        }
      }

      switch (e.key) {
        case 'j':
        case 'ArrowRight':
          e.preventDefault();
          handleNextChapter();
          break;
        case 'k':
        case 'ArrowLeft':
          e.preventDefault();
          handlePrevChapter();
          break;
        case 'b':
          e.preventDefault();
          toggleCurrentBookmark();
          break;
        case '/':
          e.preventDefault();
          navigate('/search');
          // Focus search input after navigation
          setTimeout(() => {
            const input = document.querySelector('input[type="search"], input[placeholder*="Search"]') as HTMLInputElement;
            if (input) input.focus();
          }, 100);
          break;
        case 'Escape':
          e.preventDefault();
          // Stop any verse narration in flight regardless of which
          // overlay is open — Esc is the universal "make audio stop" key.
          stopAudio();
          if (showKeyboardHelp) {
            setShowKeyboardHelp(false);
          } else if (showStrongsPopup) {
            setShowStrongsPopup(null);
          } else if (showAiPanel) {
            setShowAiPanel(false);
          } else if (showNotes) {
            setShowNotes(false);
          } else if (showBookmarks) {
            setShowBookmarks(false);
          } else if (showSettings) {
            setShowSettings(false);
          }
          break;
        case 'n':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setShowNotes(prev => !prev);
          }
          break;
        case '?':
          e.preventDefault();
          setShowKeyboardHelp(prev => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentBook, currentChapter, navigate, showSettings, showBookmarks, showNotes, showStrongsPopup, showAiPanel, showKeyboardHelp, bookmarks]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: darkMode ? '#1a1a14' : '#fefce8',
        color: darkMode ? '#f5f5f4' : '#292524',
      }}
    >
      <Header
        onOpenSettings={() => setShowSettings(true)}
        onOpenBookmarks={() => setShowBookmarks(true)}
        onOpenNotes={() => setShowNotes(true)}
        onOpenCompare={() => navigate('/compare')}
        onOpenLexicon={() => navigate('/lexicon')}
        onOpenSearch={() => navigate('/search')}
        onGoHome={() => {
          // Close any open transient UI but leave the user's reading
          // position, active translations, and verse selection alone —
          // "home" means "back to the reader," not "reset everything to
          // Genesis 1 KJV." The persisted store + reading_progress
          // table already remember where the user was.
          setShowSettings(false);
          setShowBookmarks(false);
          setShowNotes(false);
          setShowStrongsPopup(null);
          setShowAiPanel(false);
          setAiWordContext(undefined);
          setShowKeyboardHelp(false);
          navigate('/');
        }}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar
          onSelectBook={(book) => {
            useAppStore.getState().setBook(book);
            setSidebarOpen(false);
          }}
          onSelectChapter={(chapter) => {
            useAppStore.getState().setChapter(chapter);
          }}
        />

        <main style={{ flex: 1, overflowY: 'auto', display: 'flex' }}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <Routes>
              <Route
                path="/"
                element={
                  <ReadingPage onOpenAi={() => setShowAiPanel(true)} />
                }
              />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/lexicon" element={<Lexicon />} />
              <Route path="/compare" element={<Compare />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </div>
          {showStrongsSidebar && (
            <StrongsSidebar
              book={currentBook}
              chapter={currentChapter}
              verseNum={inChapterFocus}
              onClose={() => setStrongsClosed(true)}
            />
          )}
          {showAiPanel && (
            <div style={{ width: '380px', flexShrink: 0, borderLeft: darkMode ? '1px solid #3c3a36' : '1px solid #e7e5e4', display: 'flex', flexDirection: 'column' }}>
              <AiPanel
                verses={aiVerses}
                wordContext={aiWordContext}
                onClose={() => { setShowAiPanel(false); setAiWordContext(undefined); }}
              />
            </div>
          )}
          {showNotes && (
            <div style={{ width: '360px', flexShrink: 0, borderLeft: darkMode ? '1px solid #3c3a36' : '1px solid #e7e5e4', display: 'flex', flexDirection: 'column' }}>
              <NotesSidebar darkMode={darkMode} onClose={() => setShowNotes(false)} />
            </div>
          )}
        </main>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal darkMode={darkMode} onClose={() => setShowSettings(false)} />
      )}

      {/* Bookmarks Panel */}
      {showBookmarks && (
        <BookmarkPanelModal darkMode={darkMode} onClose={() => setShowBookmarks(false)} />
      )}

      {/* Strongs Popup */}
      {showStrongsPopup && (
        <StrongsPopupModal data={showStrongsPopup} darkMode={darkMode} onClose={() => setShowStrongsPopup(null)} onOpenAi={(wordContext) => { setShowStrongsPopup(null); setAiWordContext(wordContext); setShowAiPanel(true); }} />
      )}

        {/* Keyboard Shortcuts Help Modal */}
        {showKeyboardHelp && (
          <KeyboardHelpModal darkMode={darkMode} onClose={() => setShowKeyboardHelp(false)} />
        )}

      {/* Floating audio action bar — surfaces the Play-selected button
          when verses are selected, and the queue Stop button while a
          multi-verse playback is in flight. Hidden whenever neither
          condition holds. */}
      <SelectionActionBar
        selectedWithText={aiVerses}
        audioReady={audioReady}
        darkMode={darkMode}
      />
    </div>
  );
}

function KeyboardHelpModal({ darkMode, onClose }: { darkMode: boolean; onClose: () => void }) {
  const trapRef = useFocusTrap<HTMLDivElement>();
  return (
          <div
            className="modal-backdrop"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-keyboard-help-title"
          >
            <div ref={trapRef} className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '24rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 id="modal-keyboard-help-title" style={{ margin: 0, fontWeight: 700 }}>Keyboard Shortcuts</h2>
                <button onClick={onClose} aria-label="Close keyboard shortcuts help" style={{ background: 'none', border: 'none', cursor: 'pointer', color: darkMode ? '#a8a29e' : '#78716c' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>
                  <span>Next chapter</span>
                  <kbd style={{ padding: '0.125rem 0.5rem', borderRadius: '4px', backgroundColor: darkMode ? '#252519' : '#f5f5f4', border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>j</kbd>
                  <kbd style={{ padding: '0.125rem 0.5rem', borderRadius: '4px', backgroundColor: darkMode ? '#252519' : '#f5f5f4', border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>→</kbd>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>
                  <span>Previous chapter</span>
                  <kbd style={{ padding: '0.125rem 0.5rem', borderRadius: '4px', backgroundColor: darkMode ? '#252519' : '#f5f5f4', border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>k</kbd>
                  <kbd style={{ padding: '0.125rem 0.5rem', borderRadius: '4px', backgroundColor: darkMode ? '#252519' : '#f5f5f4', border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>←</kbd>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>
                  <span>Toggle bookmark</span>
                  <kbd style={{ padding: '0.125rem 0.5rem', borderRadius: '4px', backgroundColor: darkMode ? '#252519' : '#f5f5f4', border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>b</kbd>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>
                  <span>Search</span>
                  <kbd style={{ padding: '0.125rem 0.5rem', borderRadius: '4px', backgroundColor: darkMode ? '#252519' : '#f5f5f4', border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>/</kbd>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>
                  <span>Toggle notes panel</span>
                  <kbd style={{ padding: '0.125rem 0.5rem', borderRadius: '4px', backgroundColor: darkMode ? '#252519' : '#f5f5f4', border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>n</kbd>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>
                  <span>Close modal/panel · stop audio</span>
                  <kbd style={{ padding: '0.125rem 0.5rem', borderRadius: '4px', backgroundColor: darkMode ? '#252519' : '#f5f5f4', border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>Esc</kbd>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>
                  <span>Listen continuously from a verse</span>
                  <span style={{ display: 'flex', gap: '0.25rem' }}>
                    <kbd style={{ padding: '0.125rem 0.5rem', borderRadius: '4px', backgroundColor: darkMode ? '#252519' : '#f5f5f4', border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>Shift</kbd>
                    <kbd style={{ padding: '0.125rem 0.5rem', borderRadius: '4px', backgroundColor: darkMode ? '#252519' : '#f5f5f4', border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>Click 🔊</kbd>
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0' }}>
                  <span>Show this help</span>
                  <kbd style={{ padding: '0.125rem 0.5rem', borderRadius: '4px', backgroundColor: darkMode ? '#252519' : '#f5f5f4', border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>?</kbd>
                </div>
              </div>
            </div>
          </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}

// Inline modals to avoid separate file overhead
function SettingsModal({ darkMode, onClose }: { darkMode: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { fontSize, setFontSize, toggleDarkMode } = useAppStore();
  const trapRef = useFocusTrap<HTMLDivElement>();
  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-settings-title"
    >
      <div ref={trapRef} className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '28rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h2 id="modal-settings-title" style={{ margin: 0, fontWeight: 700 }}>Settings</h2>
          <button onClick={onClose} aria-label="Close settings" style={{ background: 'none', border: 'none', cursor: 'pointer', color: darkMode ? '#a8a29e' : '#78716c' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', fontWeight: 600 }}>Appearance</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.875rem' }}>Dark mode</span>
              <button onClick={toggleDarkMode} style={{ padding: '0.375rem 1rem', borderRadius: '9999px', border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`, backgroundColor: darkMode ? '#252519' : '#fff', color: darkMode ? '#f5f5f4' : '#292524', cursor: 'pointer', fontSize: '0.875rem' }}>
                {darkMode ? 'On' : 'Off'}
              </button>
            </div>
            <div style={{ marginTop: '0.75rem' }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                Font size: <span style={{ fontWeight: 600 }}>{fontSize}px</span>
              </label>
              <input type="range" min={14} max={28} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} style={{ width: '100%', marginTop: '0.5rem' }} />
            </div>
          </div>

          <div>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', fontWeight: 600 }}>AI Provider</h3>
            <p style={{ fontSize: '0.75rem', color: darkMode ? '#a8a29e' : '#78716c', margin: '0 0 0.75rem' }}>AI settings are managed on the full Settings page.</p>
            <button
              onClick={() => { onClose(); navigate('/settings'); }}
              style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none', backgroundColor: '#92400e', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}
            >
              Open Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const BOOKMARKS_PAGE = 100;

function BookmarkPanelModal({ darkMode, onClose }: { darkMode: boolean; onClose: () => void }) {
  const [bookmarks, setBookmarks] = useState<BookmarkWithVerse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trapRef = useFocusTrap<HTMLDivElement>();

  const fetchPage = async (offset: number, replace: boolean) => {
    try {
      if (replace) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      const data = await getBookmarks(BOOKMARKS_PAGE, offset);
      setTotal(data.total);
      setBookmarks((prev) => (replace ? data.items : [...prev, ...data.items]));
    } catch (e) {
      setError('Failed to load bookmarks.');
      console.error(e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => { fetchPage(0, true); }, []);

  const handleDelete = async (id: number) => {
    try {
      await deleteBookmark(id);
      useAppStore.getState().removeBookmark(id);
      // Optimistic local removal — saves a round-trip and avoids
      // resetting the user's scroll position back to the top.
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    } catch (e) {
      console.error('Failed to delete bookmark:', e);
    }
  };

  const hasMore = bookmarks.length < total;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-bookmarks-title"
    >
      <div ref={trapRef} className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '28rem', maxHeight: '80vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 id="modal-bookmarks-title" style={{ margin: 0, fontWeight: 700 }}>
            Bookmarks ({bookmarks.length}{hasMore ? ` of ${total}` : ''})
          </h2>
          <button onClick={onClose} aria-label="Close bookmarks" style={{ background: 'none', border: 'none', cursor: 'pointer', color: darkMode ? '#a8a29e' : '#78716c' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        {loading ? (
          <p style={{ textAlign: 'center', padding: '2rem', color: darkMode ? '#a8a29e' : '#78716c' }}>Loading…</p>
        ) : error ? (
          <p style={{ textAlign: 'center', padding: '2rem', color: '#dc2626' }}>{error}</p>
        ) : bookmarks.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '2rem', color: darkMode ? '#a8a29e' : '#78716c' }}>No bookmarks yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '60vh', overflowY: 'auto' }}>
            {bookmarks.map((bm) => (
              <div key={bm.id} style={{ padding: '0.75rem', borderRadius: '8px', backgroundColor: darkMode ? '#1a1a14' : '#fefce8', border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="verse-ref">{bm.verse.book_abbreviation.toUpperCase()} {bm.verse.chapter}:{bm.verse.verse_num}</span>
                  <button onClick={() => handleDelete(bm.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: darkMode ? '#a8a29e' : '#78716c' }}>Delete</button>
                </div>
                {bm.label && <p style={{ margin: '0.25rem 0 0', fontWeight: 600, fontSize: '0.85rem' }}>{bm.label}</p>}
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: darkMode ? '#a8a29e' : '#78716c', fontFamily: "'Lora', serif" }}>{bm.verse.text.slice(0, 100)}</p>
              </div>
            ))}
            {hasMore && (
              <button
                onClick={() => fetchPage(bookmarks.length, false)}
                disabled={loadingMore}
                style={{
                  marginTop: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
                  backgroundColor: 'transparent',
                  color: darkMode ? '#a8a29e' : '#78716c',
                  cursor: loadingMore ? 'wait' : 'pointer',
                  fontSize: '0.8rem',
                }}
              >
                {loadingMore ? 'Loading…' : `Load more (${total - bookmarks.length} remaining)`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


function StrongsPopupModal({ data, darkMode, onClose, onOpenAi }: { data: { word: string; strongsId: string; language: string }; darkMode: boolean; onClose: () => void; onOpenAi: (wordContext: WordContext) => void }) {
  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState<import('./lib/tauri').StrongsHebrew | import('./lib/tauri').StrongsGreek | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const trapRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        setLoading(true);
        setFetchError(null);
        const result = data.language === 'hebrew'
          ? await getStrongsHebrew(data.strongsId)
          : await getStrongsGreek(data.strongsId);
        if (!cancelled) setEntry(result);
      } catch (e) {
        if (!cancelled) setFetchError('Failed to load lexicon entry.');
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetch();
    return () => { cancelled = true; };
  }, [data.strongsId, data.language]);
  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-strongs-title"
    >
      <div ref={trapRef} className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '28rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <h2 id="modal-strongs-title" style={{ margin: 0, fontWeight: 700, fontFamily: data.language === 'hebrew' ? "'Noto Serif Hebrew', serif" : "'Noto Serif', serif", fontSize: '1.5rem', color: data.language === 'hebrew' ? '#15803d' : '#1d4ed8' }}>
            {loading ? '…' : entry ? entry.word : data.word}
          </h2>
          <button onClick={onClose} aria-label="Close Strong's lookup" style={{ background: 'none', border: 'none', cursor: 'pointer', color: darkMode ? '#a8a29e' : '#78716c' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <svg style={{ animation: 'spin 1s linear infinite', color: data.language === 'hebrew' ? '#15803d' : '#1d4ed8' }} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
            <p style={{ marginTop: '0.5rem', color: darkMode ? '#a8a29e' : '#78716c', fontSize: '0.875rem' }}>Loading entry…</p>
          </div>
        ) : fetchError ? (
          <p style={{ color: '#dc2626' }}>{fetchError}</p>
        ) : entry ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <span style={{ fontSize: '0.8rem', padding: '0.25rem 0.625rem', borderRadius: '9999px', backgroundColor: darkMode ? '#2d2d24' : '#f5f5f4', color: darkMode ? '#a8a29e' : '#78716c', fontWeight: 600 }}>
                {data.strongsId}
              </span>
              {entry.transliteration && (
                <span style={{ fontSize: '0.8rem', color: darkMode ? '#a8a29e' : '#78716c', fontStyle: 'italic' }}>
                  {entry.transliteration}
                </span>
              )}
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: darkMode ? '#a8a29e' : '#78716c', fontWeight: 600, marginBottom: '0.25rem' }}>Definition</p>
              <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>{entry.definition}</p>
            </div>
            {entry.pronunciation && (
              <div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: darkMode ? '#a8a29e' : '#78716c', fontWeight: 600, marginBottom: '0.25rem' }}>Pronunciation</p>
                <p style={{ margin: 0, fontSize: '0.9rem', fontStyle: 'italic' }}>{entry.pronunciation}</p>
              </div>
            )}
            <button
              onClick={() => onOpenAi({
                word: data.word,
                strongsId: data.strongsId,
                language: data.language as 'hebrew' | 'greek',
                transliteration: entry?.transliteration,
                definition: entry?.definition,
              })}
              style={{ marginTop: '0.5rem', padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', backgroundColor: '#92400e', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}
            >
              Ask AI About This Word
            </button>
          </div>
        ) : (
          <p style={{ color: darkMode ? '#a8a29e' : '#78716c' }}>Lexicon entry not found for {data.strongsId}</p>
        )}
      </div>
    </div>
  );
}
