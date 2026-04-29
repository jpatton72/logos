import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';

interface SearchBarProps {
  initialQuery?: string;
  embedded?: boolean;
}

export function SearchBar({ initialQuery = '', embedded = false }: SearchBarProps) {
  const navigate = useNavigate();
  const { darkMode } = useAppStore();
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialQuery && inputRef.current) {
      inputRef.current.value = initialQuery;
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  const handleSearch = (q: string) => {
    setQuery(q);
    if (embedded && q.trim()) {
      navigate(`/search?q=${encodeURIComponent(q)}`);
    }
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0',
          borderRadius: '10px',
          border: `2px solid ${darkMode ? '#44403c' : '#e7e5e4'}`,
          backgroundColor: darkMode ? '#252519' : '#ffffff',
          padding: '0 0.75rem',
          transition: 'border-color 0.2s',
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke={darkMode ? '#a8a29e' : '#78716c'}
          strokeWidth="2"
          style={{ flexShrink: 0 }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search the Bible..."
          defaultValue={initialQuery}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSearch(query);
          }}
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            padding: '0.75rem 0.625rem',
            fontSize: '1rem',
            color: darkMode ? '#f5f5f4' : '#292524',
            outline: 'none',
          }}
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              if (inputRef.current) inputRef.current.value = '';
              inputRef.current?.focus();
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: darkMode ? '#a8a29e' : '#78716c',
              display: 'flex',
              alignItems: 'center',
              padding: '0.25rem',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: darkMode ? '#78716c' : '#a8a29e' }}>
        Search by reference (e.g. <em>John 3:16</em>, <em>Gen 1</em>, <em>1 Cor 13:4-7</em>) or by any text.
      </div>
    </div>
  );
}
