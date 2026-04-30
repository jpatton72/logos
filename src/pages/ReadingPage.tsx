import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ChapterView } from '../components/ChapterView';
import { useNavigate } from 'react-router-dom';
import { getReadingProgress, updateReadingProgress, getBookIndex } from '../api';
import type { Book } from '../api';

interface ReadingPageProps {
  onOpenAi?: () => void;
}

export function ReadingPage({ onOpenAi }: ReadingPageProps) {
  const { currentBook, currentChapter, setChapter, setBook, darkMode } = useAppStore();
  const navigate = useNavigate();
  const hasRestoredRef = useRef(false);
  const [books, setBooks] = useState<Book[]>([]);

  useEffect(() => {
    getBookIndex().then(setBooks).catch(() => setBooks([]));
  }, []);

  // Restore last reading position on mount
  useEffect(() => {
    (async () => {
      try {
        const progress = await getReadingProgress();
        if (progress.length > 0) {
          hasRestoredRef.current = true;
          // Use the most recently read entry
          const last = progress.sort((a, b) => new Date(b.last_read_at).getTime() - new Date(a.last_read_at).getTime())[0];
          const books = await getBookIndex();
          const book = books.find((b) => b.id === last.book_id);
          if (book) {
            setBook(book.abbreviation);
            setChapter(last.chapter);
          }
        }
      } catch (e) {
        console.error('Failed to restore reading progress:', e);
      }
    })();
  }, []);

  // Save reading progress on chapter change (skip initial restore)
  useEffect(() => {
    if (!hasRestoredRef.current) return;
    (async () => {
      try {
        const books = await getBookIndex();
        const book = books.find((b) => b.abbreviation === currentBook);
        if (book) {
          await updateReadingProgress(book.id, currentChapter);
        }
      } catch (e) {
        console.error('Failed to save reading progress:', e);
      }
    })();
  }, [currentBook, currentChapter]);

  const CHAPTER_COUNTS: Record<string, number> = { gen: 50, exod: 40, lev: 27, num: 36, deut: 34, josh: 24, judg: 21, ruth: 4, '1sam': 31, '2sam': 24, '1kgs': 22, '2kgs': 25, '1chr': 29, '2chr': 36, ezra: 10, neh: 13, est: 10, job: 42, ps: 150, prov: 31, eccl: 12, song: 8, isa: 66, jer: 52, lam: 5, ezek: 48, dan: 12, hosea: 14, joel: 3, amos: 9, obad: 1, jonah: 4, mic: 7, nah: 3, hab: 3, zeph: 3, hag: 2, zech: 14, mal: 4, matt: 28, mark: 16, luke: 24, john: 21, acts: 28, rom: 16, '1cor': 16, '2cor': 13, gal: 6, eph: 6, phil: 4, col: 4, '1thess': 5, '2thess': 3, '1tim': 6, '2tim': 4, titus: 3, phlm: 1, heb: 13, jas: 5, '1pet': 5, '2pet': 3, '1john': 5, '2john': 1, '3john': 1, jude: 1, rev: 22, '1esd': 9, '2esd': 16, tob: 14, jdt: 16, esthg: 10, wis: 19, sir: 51, bar: 5, epjer: 1, prazar: 1, sus: 1, bel: 1, prman: 1, '1macc': 16, '2macc': 15 };
  const BOOK_ORDER = ['gen', 'exod', 'lev', 'num', 'deut', 'josh', 'judg', 'ruth', '1sam', '2sam', '1kgs', '2kgs', '1chr', '2chr', 'ezra', 'neh', 'est', 'job', 'ps', 'prov', 'eccl', 'song', 'isa', 'jer', 'lam', 'ezek', 'dan', 'hosea', 'joel', 'amos', 'obad', 'jonah', 'mic', 'nah', 'hab', 'zeph', 'hag', 'zech', 'mal', 'matt', 'mark', 'luke', 'john', 'acts', 'rom', '1cor', '2cor', 'gal', 'eph', 'phil', 'col', '1thess', '2thess', '1tim', '2tim', 'titus', 'phlm', 'heb', 'jas', '1pet', '2pet', '1john', '2john', '3john', 'jude', 'rev', '1esd', '2esd', 'tob', 'jdt', 'esthg', 'wis', 'sir', 'bar', 'epjer', 'prazar', 'sus', 'bel', 'prman', '1macc', '2macc'];

  const handlePrev = () => {
    const key = currentBook.toLowerCase();
    if (key === 'gen' && currentChapter === 1) return;
    if (currentChapter > 1) {
      setChapter(currentChapter - 1);
    } else {
      const idx = BOOK_ORDER.indexOf(key);
      if (idx > 0) {
        const prevBook = BOOK_ORDER[idx - 1];
        setBook(prevBook);
        setChapter(CHAPTER_COUNTS[prevBook] || 1);
      }
    }
  };

  const handleNext = () => {
    const key = currentBook.toLowerCase();
    const count = CHAPTER_COUNTS[key] || 1;
    if (currentChapter < count) {
      setChapter(currentChapter + 1);
    } else {
      const idx = BOOK_ORDER.indexOf(key);
      if (idx >= 0 && idx < BOOK_ORDER.length - 1) {
        setBook(BOOK_ORDER[idx + 1]);
        setChapter(1);
      }
    }
  };

  // Resolve the chapter dropdown range against the live book index when
  // possible so apocrypha + future-added books work without extending the
  // hard-coded CHAPTER_COUNTS map.
  const currentBookKey = currentBook.toLowerCase();
  const matchedBook = books.find((b) => b.abbreviation.toLowerCase() === currentBookKey);
  const chapterCount =
    CHAPTER_COUNTS[currentBookKey] ??
    (matchedBook?.full_name ? 1 : 1); // fallback if book unknown
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
