import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ChapterView } from '../components/ChapterView';
import { useNavigate } from 'react-router-dom';
import { getReadingProgress, updateReadingProgress } from '../api';

interface ReadingPageProps {
  onOpenAi?: () => void;
}

export function ReadingPage({ onOpenAi }: ReadingPageProps) {
  const { currentBook, currentChapter, setChapter, setBook, darkMode, books, ensureBooks, chapterCounts, ensureChapterCounts } = useAppStore();
  const navigate = useNavigate();
  const hasRestoredRef = useRef(false);

  useEffect(() => {
    if (books.length === 0) ensureBooks().catch(() => {});
    if (Object.keys(chapterCounts).length === 0) ensureChapterCounts().catch(() => {});
  }, [books.length, ensureBooks, chapterCounts, ensureChapterCounts]);

  // Restore last reading position on mount
  useEffect(() => {
    (async () => {
      try {
        const progress = await getReadingProgress();
        if (progress.length > 0) {
          hasRestoredRef.current = true;
          const last = progress.sort((a, b) => new Date(b.last_read_at).getTime() - new Date(a.last_read_at).getTime())[0];
          const allBooks = await ensureBooks();
          const book = allBooks.find((b) => b.id === last.book_id);
          if (book) {
            setBook(book.abbreviation);
            setChapter(last.chapter);
          }
        }
      } catch (e) {
        console.error('Failed to restore reading progress:', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only on mount
  }, []);

  // Save reading progress on chapter change (skip initial restore)
  useEffect(() => {
    if (!hasRestoredRef.current) return;
    (async () => {
      try {
        const allBooks = await ensureBooks();
        const book = allBooks.find((b) => b.abbreviation === currentBook);
        if (book) {
          await updateReadingProgress(book.id, currentChapter);
        }
      } catch (e) {
        console.error('Failed to save reading progress:', e);
      }
    })();
  }, [currentBook, currentChapter, ensureBooks]);

  // Book-order list comes from the cached book index; falls back to the
  // current book if the index hasn't loaded yet (the chapter-arrow then
  // simply no-ops at boundaries during the brief startup window).
  const bookOrder = books.length > 0
    ? books.map((b) => b.abbreviation.toLowerCase())
    : [currentBook.toLowerCase()];

  const handlePrev = () => {
    const key = currentBook.toLowerCase();
    if (key === 'gen' && currentChapter === 1) return;
    if (currentChapter > 1) {
      setChapter(currentChapter - 1);
    } else {
      const idx = bookOrder.indexOf(key);
      if (idx > 0) {
        const prevBook = bookOrder[idx - 1];
        setBook(prevBook);
        setChapter(chapterCounts[prevBook] || 1);
      }
    }
  };

  const handleNext = () => {
    const key = currentBook.toLowerCase();
    const count = chapterCounts[key] || 1;
    if (currentChapter < count) {
      setChapter(currentChapter + 1);
    } else {
      const idx = bookOrder.indexOf(key);
      if (idx >= 0 && idx < bookOrder.length - 1) {
        setBook(bookOrder[idx + 1]);
        setChapter(1);
      }
    }
  };

  // Chapter dropdown range comes from the DB-backed map.
  const currentBookKey = currentBook.toLowerCase();
  const chapterCount = chapterCounts[currentBookKey] || 1;
  const chapterOptions = Array.from({ length: chapterCount }, (_, i) => i + 1);

  const navInputStyle: React.CSSProperties = {
    padding: '0.35rem 0.625rem',
    borderRadius: '8px',
    border: `1px solid ${darkMode ? '#3c3a36' : '#d6d3d1'}`,
    backgroundColor: darkMode ? '#252519' : '#fff',
    color: darkMode ? '#f5f5f4' : '#292524',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    outline: 'none',
  };
  const navLabelStyle: React.CSSProperties = {
    fontSize: '0.7rem',
    fontWeight: 600,
    color: darkMode ? '#a8a29e' : '#78716c',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  return (
    <div>
      {/* Breadcrumb / search bar */}
      <div style={{ padding: '0.75rem 1.5rem', borderBottom: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`, display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/search')} style={{ flex: 1, maxWidth: '480px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '9999px', border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`, backgroundColor: darkMode ? '#252519' : '#f5f5f4', color: darkMode ? '#a8a29e' : '#78716c', fontSize: '0.875rem', cursor: 'text' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            Search the Bible...
          </div>
        </button>

        {/* Book + chapter selector — same idea as Compare's controls. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={navLabelStyle} htmlFor="reader-book-select">Book</label>
          <select
            id="reader-book-select"
            value={currentBookKey}
            onChange={(e) => {
              setBook(e.target.value);
              setChapter(1);
            }}
            style={{ ...navInputStyle, minWidth: '10rem' }}
          >
            {books.length === 0 ? (
              <option value={currentBookKey}>{currentBookKey.toUpperCase()}</option>
            ) : (
              books.map((b) => (
                <option key={b.abbreviation} value={b.abbreviation.toLowerCase()}>
                  {b.full_name}
                </option>
              ))
            )}
          </select>

          <label style={navLabelStyle} htmlFor="reader-chapter-select">Ch.</label>
          <select
            id="reader-chapter-select"
            value={currentChapter}
            onChange={(e) => setChapter(parseInt(e.target.value, 10) || 1)}
            style={{ ...navInputStyle, minWidth: '4.5rem' }}
          >
            {chapterOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
      <ChapterView
        book={currentBook}
        chapter={currentChapter}
        onPrevChapter={handlePrev}
        onNextChapter={handleNext}
        onOpenAi={onOpenAi}
      />
    </div>
  );
}
