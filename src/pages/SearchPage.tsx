import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { searchVerses, searchTerms } from '../api';
import { SearchBar } from '../components/SearchBar';
import { SearchResults } from '../components/SearchResults';
import type { SearchResult, TermResult } from '../api';

const TRANSLATIONS = [
  { value: '', label: 'All Translations' },
  { value: 'kjv', label: 'KJV' },
  { value: 'sblgnt', label: 'SBLGNT' },
  { value: 'wlc', label: 'WLC' },
];

const TESTAMENTS = [
  { value: '', label: 'Both' },
  { value: 'old', label: 'Old Testament' },
  { value: 'new', label: 'New Testament' },
];

const GENRES = [
  { value: '', label: 'All Genres' },
  { value: 'Law', label: 'Law' },
  { value: 'History', label: 'History' },
  { value: 'Wisdom', label: 'Wisdom' },
  { value: 'Prophets', label: 'Prophets' },
  { value: 'Gospels', label: 'Gospels' },
  { value: 'Epistles', label: 'Epistles' },
  { value: 'Apocalyptic', label: 'Apocalyptic' },
];

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'book_order', label: 'Book Order' },
];

type SelectProps = {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  darkMode: boolean;
  style?: React.CSSProperties;
};

function Select({ value, onChange, options, darkMode, style }: SelectProps) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        background: darkMode ? '#1c1917' : '#ffffff',
        color: darkMode ? '#d6d3d1' : '#1c1917',
        border: `1px solid ${darkMode ? '#44403c' : '#d6d3d1'}`,
        borderRadius: '0.375rem',
        padding: '0.25rem 0.5rem',
        fontSize: '0.75rem',
        cursor: 'pointer',
        outline: 'none',
        ...style,
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

type FilterBarProps = {
  translation: string;
  testament: string;
  genre: string;
  sort: string;
  onTranslationChange: (v: string) => void;
  onTestamentChange: (v: string) => void;
  onGenreChange: (v: string) => void;
  onSortChange: (v: string) => void;
  darkMode: boolean;
};

function FilterBar({
  translation,
  testament,
  genre,
  sort,
  onTranslationChange,
  onTestamentChange,
  onGenreChange,
  onSortChange,
  darkMode,
}: FilterBarProps) {
  const btnBase: React.CSSProperties = {
    padding: '0.25rem 0.5rem',
    fontSize: '0.75rem',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    border: '1px solid',
    transition: 'background 0.15s',
    fontFamily: 'inherit',
  };
  const activeStyle: React.CSSProperties = {
    ...btnBase,
    background: darkMode ? '#44403c' : '#e7e5e4',
    color: darkMode ? '#fafaf9' : '#1c1917',
    borderColor: darkMode ? '#57534e' : '#d6d3d1',
  };
  const inactiveStyle: React.CSSProperties = {
    ...btnBase,
    background: 'transparent',
    color: darkMode ? '#a8a29e' : '#78716c',
    borderColor: 'transparent',
  };

  const borderColor = darkMode ? '#292524' : '#e7e5e4';

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem',
        alignItems: 'center',
        padding: '0.75rem',
        marginBottom: '0.75rem',
        borderRadius: '0.5rem',
        background: darkMode ? '#1c1917' : '#fafaf9',
        border: `1px solid ${borderColor}`,
      }}
    >
      {/* Translation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <span style={{ fontSize: '0.7rem', color: darkMode ? '#78716c' : '#a8a29e', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Trans
        </span>
        <Select
          value={translation}
          onChange={onTranslationChange}
          options={TRANSLATIONS}
          darkMode={darkMode}
        />
      </div>

      {/* Divider */}
      <div style={{ width: '1px', height: '1.25rem', background: borderColor }} />

      {/* Testament toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <span style={{ fontSize: '0.7rem', color: darkMode ? '#78716c' : '#a8a29e', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Test
        </span>
        {TESTAMENTS.map(t => (
          <button
            key={t.value}
            onClick={() => onTestamentChange(t.value)}
            style={testament === t.value ? activeStyle : inactiveStyle}
          >
            {t.label === 'Both' ? 'All' : t.label === 'Old Testament' ? 'OT' : 'NT'}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div style={{ width: '1px', height: '1.25rem', background: borderColor }} />

      {/* Genre */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <span style={{ fontSize: '0.7rem', color: darkMode ? '#78716c' : '#a8a29e', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Genre
        </span>
        <Select
          value={genre}
          onChange={onGenreChange}
          options={GENRES}
          darkMode={darkMode}
        />
      </div>

      {/* Divider */}
      <div style={{ width: '1px', height: '1.25rem', background: borderColor }} />

      {/* Sort */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: 'auto' }}>
        <span style={{ fontSize: '0.7rem', color: darkMode ? '#78716c' : '#a8a29e', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Sort
        </span>
        <Select
          value={sort}
          onChange={onSortChange}
          options={SORT_OPTIONS}
          darkMode={darkMode}
        />
      </div>
    </div>
  );
}

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const { darkMode } = useAppStore();
  const query = searchParams.get('q') || '';

  const [translation, setTranslation] = useState('');
  const [testament, setTestament] = useState('');
  const [genre, setGenre] = useState('');
  const [sort, setSort] = useState('relevance');

  const [verseResults, setVerseResults] = useState<SearchResult[]>([]);
  const [termResults, setTermResults] = useState<TermResult[]>([]);
  const [loading, setLoading] = useState(false);

  const doSearch = useCallback(() => {
    if (!query.trim()) {
      setVerseResults([]);
      setTermResults([]);
      return;
    }
    setLoading(true);
    Promise.all([
      searchVerses(query, translation || undefined, 30, testament || undefined, genre || undefined, sort === 'relevance' ? undefined : sort),
      searchTerms(query, 1),
    ]).then(([v, t]) => {
      setVerseResults(v);
      setTermResults(t);
      setLoading(false);
    });
  }, [query, testament, genre, sort]);

  // Re-run when query or filters change
  useEffect(() => {
    doSearch();
  }, [doSearch]);

  return (
    <div style={{ maxWidth: '48rem', margin: '0 auto', padding: '1.5rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <SearchBar initialQuery={query} embedded />
      </div>
      {loading ? (
        <p style={{ textAlign: 'center', padding: '3rem', color: darkMode ? '#a8a29e' : '#78716c' }}>Searching...</p>
      ) : query ? (
        <>
          {verseResults.length > 0 || termResults.length > 0 ? (
            <>
              <FilterBar
                translation={translation}
                testament={testament}
                genre={genre}
                sort={sort}
                onTranslationChange={setTranslation}
                onTestamentChange={setTestament}
                onGenreChange={setGenre}
                onSortChange={setSort}
                darkMode={darkMode}
              />
              <p style={{ fontSize: '0.8rem', color: darkMode ? '#a8a29e' : '#78716c', marginBottom: '1rem' }}>
                {verseResults.length} verse results, {termResults.length} term results for &ldquo;{query}&rdquo;
              </p>
            </>
          ) : null}
          <SearchResults verseResults={verseResults} termResults={termResults} query={query} />
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: darkMode ? '#a8a29e' : '#78716c' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 1rem', opacity: 0.4 }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <p style={{ fontSize: '1rem', fontWeight: 500 }}>Search the Bible</p>
          <p style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>Enter a word, phrase, or Strong's number to search</p>
        </div>
      )}
    </div>
  );
}
