import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import type { SearchResult, TermResult } from '../api';

interface SearchResultsProps {
  verseResults: SearchResult[];
  termResults: TermResult[];
  query: string;
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ backgroundColor: '#fef08a', borderRadius: '2px', padding: '0 2px', color: 'inherit' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function SearchResults({ verseResults, termResults, query }: SearchResultsProps) {
  const { darkMode, setBook, setChapter } = useAppStore();
  const navigate = useNavigate();
  const [scrollToVerse, setScrollToVerse] = useState<{ book: string; chapter: number; verse: number } | null>(null);

  useEffect(() => {
    if (!scrollToVerse) return;
    // Wait for reading page to mount and render, then scroll
    const timer = setTimeout(() => {
      const el = document.getElementById(`verse-${scrollToVerse.book}-${scrollToVerse.chapter}-${scrollToVerse.verse}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.outline = '2px solid #d97706';
        setTimeout(() => { el.style.outline = ''; }, 2000);
      }
      setScrollToVerse(null);
    }, 150);
    return () => clearTimeout(timer);
  }, [scrollToVerse]);

  const handleVerseClick = (result: SearchResult) => {
    setBook(result.book_abbreviation);
    setChapter(result.chapter);
    if (location.pathname !== '/') {
      navigate('/');
    } else {
      setScrollToVerse({ book: result.book_abbreviation, chapter: result.chapter, verse: result.verse_num });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {verseResults.length === 0 && termResults.length === 0 && query && (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: darkMode ? '#a8a29e' : '#78716c' }}>
          No results for "{query}"
        </div>
      )}

      {/* Verse results */}
      {verseResults.map((result, i) => (
        <div
          key={`v-${result.verse_id}-${i}`}
          onClick={() => handleVerseClick(result)}
          style={{
            padding: '0.875rem 1rem',
            borderRadius: '8px',
            backgroundColor: darkMode ? '#252519' : '#ffffff',
            border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
            cursor: 'pointer',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = darkMode ? '#78350f' : '#f59e0b';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = darkMode ? '#3c3a36' : '#e7e5e4';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
            <span className="verse-ref">
              {result.book_abbreviation.toUpperCase()} {result.chapter}:{result.verse_num}
            </span>
            <span
              style={{
                fontSize: '0.65rem',
                padding: '0.125rem 0.5rem',
                borderRadius: '9999px',
                backgroundColor: darkMode ? '#2d2d24' : '#f5f5f4',
                color: darkMode ? '#a8a29e' : '#78716c',
                fontWeight: 600,
              }}
            >
              {result.translation_abbreviation}
            </span>
          </div>
          <p
            style={{
              margin: 0,
              fontFamily: "'Lora', Georgia, serif",
              fontSize: '0.95rem',
              lineHeight: 1.6,
              color: darkMode ? '#f5f5f4' : '#292524',
            }}
          >
            {highlightText(result.text, query)}
          </p>
        </div>
      ))}

      {/* Term results */}
      {termResults.map((tr) => (
        <div
          key={tr.term}
          style={{
            padding: '0.875rem 1rem',
            borderRadius: '8px',
            backgroundColor: darkMode ? '#252519' : '#ffffff',
            border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <span style={{ fontWeight: 600, color: darkMode ? '#f5f5f4' : '#292524' }}>
              {highlightText(tr.term, query)}
            </span>
            <span style={{ marginLeft: '0.75rem', fontSize: '0.8rem', color: darkMode ? '#a8a29e' : '#78716c' }}>
              {tr.verse_count.toLocaleString()} occurrences
            </span>
          </div>
          <button
            style={{
              padding: '0.375rem 0.875rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 600,
              border: `1px solid ${darkMode ? '#78350f' : '#f59e0b'}`,
              backgroundColor: darkMode ? '#78350f' : '#fef3c7',
              color: darkMode ? '#f5f5f4' : '#92400e',
              cursor: 'pointer',
            }}
          >
            View all
          </button>
        </div>
      ))}
    </div>
  );
}
