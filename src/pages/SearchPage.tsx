import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { searchVerses, getChapter, getBookIndex } from '../api';
import { SearchBar } from '../components/SearchBar';
import { SearchResults } from '../components/SearchResults';
import type { SearchResult, Book } from '../api';

const TRANSLATIONS = [
  { value: '', label: 'All Translations' },
  { value: 'kjv', label: 'KJV' },
  { value: 'nkjv', label: 'NKJV' },
  { value: 'esv', label: 'ESV' },
  { value: 'sblgnt', label: 'SBLGNT' },
  { value: 'wlc', label: 'WLC' },
];

const TESTAMENTS = [
  { value: '', label: 'Both' },
  { value: 'ot', label: 'Old Testament' },
  { value: 'nt', label: 'New Testament' },
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

// ---------------------------------------------------------------------------
// Reference parsing
// ---------------------------------------------------------------------------

interface ParsedRef {
  bookQuery: string;       // user-typed book token (e.g. "John", "1 Cor")
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
}

// Matches: "<book> <ch>", "<book> <ch>:<vs>", "<book> <ch>:<vs>-<vs>"
// where <book> may include a leading numeral (1, 2, 3) and a space, e.g. "1 Cor".
const REFERENCE_RE = /^([1-3]\s*)?([A-Za-z]+\.?)\s+(\d+)(?::(\d+)(?:\s*-\s*(\d+))?)?$/;

function parseReference(raw: string): ParsedRef | null {
  const trimmed = raw.trim();
  const m = REFERENCE_RE.exec(trimmed);
  if (!m) return null;
  const numPrefix = m[1] ? m[1].trim() + ' ' : '';
  const bookQuery = (numPrefix + m[2].replace(/\.$/, '')).trim();
  const chapter = parseInt(m[3], 10);
  const verseStart = m[4] ? parseInt(m[4], 10) : undefined;
  const verseEnd = m[5] ? parseInt(m[5], 10) : verseStart;
  if (!chapter) return null;
  return { bookQuery, chapter, verseStart, verseEnd };
}

function findBook(books: Book[], query: string): Book | null {
  const norm = query.toLowerCase().replace(/\s+/g, ' ').trim();
  // Exact full_name or abbreviation
  let hit = books.find(
    (b) => b.full_name.toLowerCase() === norm || b.abbreviation.toLowerCase() === norm,
  );
  if (hit) return hit;
  // Common short abbreviations (1 Cor, 1cor, 1co, etc.)
  const compact = norm.replace(/\s+/g, '');
  hit = books.find((b) => b.abbreviation.toLowerCase() === compact);
  if (hit) return hit;
  // Prefix match on full_name (handles "Gen", "Matt", "1 Cor")
  hit = books.find((b) => b.full_name.toLowerCase().startsWith(norm));
  if (hit) return hit;
  // Prefix match on full_name with whitespace removed (handles "1cor")
  hit = books.find((b) => b.full_name.toLowerCase().replace(/\s+/g, '').startsWith(compact));
  return hit ?? null;
}

// FTS5 special chars/operators we don't want the user's free text to trigger.
function sanitizeFtsQuery(raw: string): string {
  // Strip everything but letters, numbers, and basic whitespace, then collapse spaces.
  const cleaned = raw.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  // Wrap each token in double quotes so FTS5 treats it as a literal phrase.
  return cleaned
    .split(' ')
    .map((token) => `"${token.replace(/"/g, '')}"`)
    .join(' ');
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <span style={{ fontSize: '0.7rem', color: darkMode ? '#78716c' : '#a8a29e', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Trans
        </span>
        <Select value={translation} onChange={onTranslationChange} options={TRANSLATIONS} darkMode={darkMode} />
      </div>

      <div style={{ width: '1px', height: '1.25rem', background: borderColor }} />

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
            {t.value === '' ? 'All' : t.value === 'ot' ? 'OT' : 'NT'}
          </button>
        ))}
      </div>

      <div style={{ width: '1px', height: '1.25rem', background: borderColor }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <span style={{ fontSize: '0.7rem', color: darkMode ? '#78716c' : '#a8a29e', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Genre
        </span>
        <Select value={genre} onChange={onGenreChange} options={GENRES} darkMode={darkMode} />
      </div>

      <div style={{ width: '1px', height: '1.25rem', background: borderColor }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: 'auto' }}>
        <span style={{ fontSize: '0.7rem', color: darkMode ? '#78716c' : '#a8a29e', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Sort
        </span>
        <Select value={sort} onChange={onSortChange} options={SORT_OPTIONS} darkMode={darkMode} />
      </div>
    </div>
  );
}

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const { darkMode, activeTranslations } = useAppStore();
  const query = searchParams.get('q') || '';

  const [translation, setTranslation] = useState('');
  const [testament, setTestament] = useState('');
  const [genre, setGenre] = useState('');
  const [sort, setSort] = useState('relevance');

  const [verseResults, setVerseResults] = useState<SearchResult[]>([]);
  const [referenceResults, setReferenceResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [books, setBooks] = useState<Book[]>([]);

  useEffect(() => {
    getBookIndex().then(setBooks).catch(() => setBooks([]));
  }, []);

  const doSearch = useCallback(async () => {
    if (!query.trim()) {
      setVerseResults([]);
      setReferenceResults([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);

    const tasks: Promise<unknown>[] = [];

    // 1. Reference lookup
    const ref = parseReference(query);
    if (ref && books.length > 0) {
      const book = findBook(books, ref.bookQuery);
      if (book) {
        const lookupTranslation = (translation || activeTranslations[0] || 'KJV');
        tasks.push(
          getChapter(book.abbreviation, ref.chapter, [lookupTranslation])
            .then((groups) => {
              const verses: SearchResult[] = [];
              for (const g of groups) {
                if (ref.verseStart !== undefined) {
                  const end = ref.verseEnd ?? ref.verseStart;
                  if (g.verse_num < ref.verseStart || g.verse_num > end) continue;
                }
                for (const v of g.verses) {
                  verses.push({
                    verse_id: v.id,
                    book_abbreviation: v.book_abbreviation,
                    book_name: book.full_name,
                    chapter: v.chapter,
                    verse_num: v.verse_num,
                    text: v.text,
                    translation_abbreviation: v.translation_abbreviation ?? lookupTranslation,
                  });
                }
              }
              setReferenceResults(verses);
            })
            .catch((e) => {
              console.error('Reference lookup failed:', e);
              setReferenceResults([]);
            }),
        );
      } else {
        setReferenceResults([]);
      }
    } else {
      setReferenceResults([]);
    }

    // 2. Free-text FTS search (always try)
    const ftsQuery = sanitizeFtsQuery(query);
    if (ftsQuery) {
      tasks.push(
        searchVerses(
          ftsQuery,
          translation || undefined,
          undefined, // no result limit
          testament || undefined,
          genre || undefined,
          sort === 'relevance' ? undefined : sort,
        )
          .then((v) => setVerseResults(v))
          .catch((e) => {
            console.error('FTS search failed:', e);
            setVerseResults([]);
            setError('Search failed. Try a different query.');
          }),
      );
    } else {
      setVerseResults([]);
    }

    try {
      await Promise.all(tasks);
    } finally {
      setLoading(false);
    }
  }, [query, translation, testament, genre, sort, books, activeTranslations]);

  useEffect(() => {
    doSearch();
  }, [doSearch]);

  const totalResults = referenceResults.length + verseResults.length;

  return (
    <div style={{ maxWidth: '48rem', margin: '0 auto', padding: '1.5rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <SearchBar initialQuery={query} embedded />
      </div>
      {loading ? (
        <p style={{ textAlign: 'center', padding: '3rem', color: darkMode ? '#a8a29e' : '#78716c' }}>Searching...</p>
      ) : query ? (
        <>
          {totalResults > 0 ? (
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
                {totalResults} result{totalResults === 1 ? '' : 's'} for &ldquo;{query}&rdquo;
              </p>
            </>
          ) : null}
          {error && (
            <p style={{ color: '#dc2626', marginBottom: '0.75rem', fontSize: '0.85rem' }}>{error}</p>
          )}
          {referenceResults.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: darkMode ? '#a8a29e' : '#78716c',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.5rem',
                }}
              >
                Reference
              </div>
              <SearchResults verseResults={referenceResults} termResults={[]} query={query} />
            </div>
          )}
          {verseResults.length > 0 && (
            <div>
              {referenceResults.length > 0 && (
                <div
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: darkMode ? '#a8a29e' : '#78716c',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.5rem',
                  }}
                >
                  Text matches
                </div>
              )}
              <SearchResults verseResults={verseResults} termResults={[]} query={query} />
            </div>
          )}
          {!error && totalResults === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: darkMode ? '#a8a29e' : '#78716c' }}>
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: darkMode ? '#a8a29e' : '#78716c' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 1rem', opacity: 0.4 }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <p style={{ fontSize: '1rem', fontWeight: 500 }}>Search the Bible</p>
          <p style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>Type a reference (e.g. <em>John 3:16</em>) or any text.</p>
        </div>
      )}
    </div>
  );
}
