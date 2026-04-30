import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getChapter, getChapterOriginals } from '../lib/tauri';
import type { VerseGroup, VerseWithWords } from '../lib/tauri';
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
  const { activeTranslations, darkMode, books, ensureBooks } = useAppStore();
  const [verses, setVerses] = useState<VerseGroup[]>([]);
  const [originalVerses, setOriginalVerses] = useState<VerseWithWords[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (books.length === 0) ensureBooks().catch(() => {});
  }, [books.length, ensureBooks]);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const [chapterData, originals] = await Promise.all([
        getChapter(book, chapter, activeTranslations),
        getChapterOriginals(book, chapter),
      ]);
      setVerses(chapterData);
      setOriginalVerses(originals as VerseWithWords[]);
      setLoading(false);
    })();
  }, [book, chapter, activeTranslations.join(',')]);

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {verses.map((group) => (
            <VerseDisplay
              key={group.verse_num}
              group={group}
              originalVerses={originalVerses.filter(v => v.verse_num === group.verse_num)}
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