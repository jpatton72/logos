import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getChapter, getChapterOriginals, getChapterEnglishAlignment } from '../lib/tauri';
import type { VerseGroup, VerseWithWords, EnglishToken } from '../lib/tauri';
import { TranslationSelector } from './TranslationSelector';
import { VerseDisplay } from './VerseDisplay';

interface ChapterViewProps {
  book: string;
  chapter: number;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  onOpenAi?: () => void;
}

// VerseWithWords lives in src/lib/tauri.ts; imported above.

export function ChapterView({
  book,
  chapter,
  onPrevChapter,
  onNextChapter,
  onOpenAi,
}: ChapterViewProps) {
  const { activeTranslations, darkMode, books, ensureBooks, pendingScrollVerse, setPendingScrollVerse, hoveredStrongsId } = useAppStore();
  const [verses, setVerses] = useState<VerseGroup[]>([]);
  const [originalVerses, setOriginalVerses] = useState<VerseWithWords[]>([]);
  const [englishAlignment, setEnglishAlignment] = useState<Record<number, EnglishToken[]>>({});
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (books.length === 0) ensureBooks().catch(() => {});
  }, [books.length, ensureBooks]);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const [chapterData, originals, alignment] = await Promise.all([
        getChapter(book, chapter, activeTranslations),
        getChapterOriginals(book, chapter),
        // Alignment lookup is cheap (one indexed query) and most chapters
        // have it; bundling it with the other two avoids a second
        // round-trip after render.
        getChapterEnglishAlignment(book, chapter).catch(() => ({})),
      ]);
      setVerses(chapterData);
      setOriginalVerses(originals as VerseWithWords[]);
      setEnglishAlignment(alignment);
      setLoading(false);
    })();
  }, [book, chapter, activeTranslations.join(',')]);

  // Hover-to-highlight: when an original-language word in this chapter
  // is hovered (in the parallel-translation row, or the StrongsSidebar,
  // etc.), the store's `hoveredStrongsId` updates. Walk every English
  // token span in this chapter's container and toggle the highlight
  // class on those whose `data-strongs` attribute lists the hovered ID.
  // Doing this with a single querySelectorAll is far cheaper than
  // re-rendering every verse on hover.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    // Clear any leftover highlights first.
    root.querySelectorAll('.eng-token--highlight').forEach((el) => {
      el.classList.remove('eng-token--highlight');
    });
    if (!hoveredStrongsId) return;
    // Attribute-includes selector matches any token whose strongs list
    // contains the ID as a whole space-separated entry.
    const selector = `[data-strongs~="${cssEscapeAttr(hoveredStrongsId)}"]`;
    root.querySelectorAll(selector).forEach((el) => {
      el.classList.add('eng-token--highlight');
    });
  }, [hoveredStrongsId, verses, englishAlignment]);

  // Consume any queued scroll-to-verse target. Fires once the verses
  // for the requested chapter are actually rendered (so getElementById
  // can find the row). Tries a couple of staggered timeouts because
  // VerseDisplay's portal-based tooltip + browser layout can take a
  // tick after `verses` updates before the new IDs are in the DOM.
  useEffect(() => {
    if (!pendingScrollVerse) return;
    if (loading || verses.length === 0) return;
    if (pendingScrollVerse.book.toLowerCase() !== book.toLowerCase()) return;
    if (pendingScrollVerse.chapter !== chapter) return;

    const target = pendingScrollVerse;
    const tries = [50, 200, 500];
    let landed = false;
    const timeouts = tries.map((delay) =>
      setTimeout(() => {
        if (landed) return;
        const el = document.getElementById(`verse-${target.book}-${target.chapter}-${target.verseNum}`);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('verse-flash-highlight');
        setTimeout(() => el.classList.remove('verse-flash-highlight'), 2200);
        setPendingScrollVerse(null);
        landed = true;
      }, delay),
    );
    return () => { timeouts.forEach(clearTimeout); };
  }, [pendingScrollVerse, loading, verses, book, chapter, setPendingScrollVerse]);

  const matchedBook = books.find((b) => b.abbreviation.toLowerCase() === book.toLowerCase());
  const bookName = matchedBook?.full_name ?? (book.charAt(0).toUpperCase() + book.slice(1));

  return (
    <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '1.5rem' }}>
      {/* Chapter header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '1.25rem',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: darkMode ? '#f5f5f4' : '#292524',
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            {bookName} {chapter}
          </h1>
          <p style={{ fontSize: '0.8rem', color: darkMode ? '#a8a29e' : '#78716c', margin: '0.25rem 0 0' }}>
            {activeTranslations.length} translation{activeTranslations.length !== 1 ? 's' : ''} selected
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={onPrevChapter}
            disabled={book === 'gen' && chapter === 1}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
              backgroundColor: darkMode ? '#252519' : '#ffffff',
              color: darkMode ? '#a8a29e' : '#78716c',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.8rem',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Prev
          </button>
          <button
            onClick={onNextChapter}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
              backgroundColor: darkMode ? '#252519' : '#ffffff',
              color: darkMode ? '#a8a29e' : '#78716c',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.8rem',
            }}
          >
            Next
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          {onOpenAi && (
            <button
              onClick={onOpenAi}
              title="Open AI assistant"
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#92400e',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2" />
                <path d="M12 8v4l3 3" />
              </svg>
              Ask AI
            </button>
          )}
        </div>
      </div>

      {/* Translation selector */}
      <div style={{ marginBottom: '1.5rem' }}>
        <TranslationSelector />
      </div>

      {/* Verses */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: darkMode ? '#a8a29e' : '#78716c' }}>
          Loading...
        </div>
      ) : (
        <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {verses.map((group) => (
            <VerseDisplay
              key={group.verse_num}
              group={group}
              originalVerses={originalVerses.filter(v => v.verse_num === group.verse_num)}
              englishAlignment={englishAlignment}
            />
          ))}
        </div>
      )}

      {/* Chapter nav footer */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>
        <button onClick={onPrevChapter} style={{ padding: '0.5rem 1.5rem', borderRadius: '8px', border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`, backgroundColor: darkMode ? '#252519' : '#ffffff', color: darkMode ? '#f5f5f4' : '#292524', cursor: 'pointer', fontSize: '0.875rem' }}>
          Previous Chapter
        </button>
        <button onClick={onNextChapter} style={{ padding: '0.5rem 1.5rem', borderRadius: '8px', border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`, backgroundColor: darkMode ? '#252519' : '#ffffff', color: darkMode ? '#f5f5f4' : '#292524', cursor: 'pointer', fontSize: '0.875rem' }}>
          Next Chapter
        </button>
      </div>
    </div>
  );
}

/** Escape a string for use inside a CSS attribute selector value. We
 *  trust our own Strong's IDs (always `[GH]\d+` format) but use the
 *  same wrapper as a defense-in-depth in case the data ever drifts. */
function cssEscapeAttr(s: string): string {
  return s.replace(/["\\]/g, '\\$&');
}