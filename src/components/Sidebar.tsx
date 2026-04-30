import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { Book } from '../api';

interface SidebarProps {
  onSelectBook: (abbr: string) => void;
  onSelectChapter: (chapter: number) => void;
}

export function Sidebar({ onSelectBook, onSelectChapter }: SidebarProps) {
  const { currentBook, darkMode, sidebarOpen, books, ensureBooks } = useAppStore();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ OT: false, NT: false, NC: true });
  const [filter, setFilter] = useState('');
  const [fellBack, setFellBack] = useState<Book[] | null>(null);

  useEffect(() => {
    if (books.length > 0) return;
    ensureBooks().catch(() => {
      // Fallback: import static data if Tauri isn't available (dev / browser preview).
      import('../api/mockData').then((m) => setFellBack(m.MOCK_BOOKS as Book[]));
    });
  }, [books.length, ensureBooks]);

  const effectiveBooks = books.length > 0 ? books : (fellBack ?? []);

  const q = filter.trim().toLowerCase();
  const filteredBooks = q
    ? effectiveBooks.filter((b) => b.full_name.toLowerCase().includes(q) || b.abbreviation.toLowerCase().includes(q))
    : effectiveBooks;

  const otBooks = filteredBooks.filter((b) => b.testament.toLowerCase() === 'ot');
  const ntBooks = filteredBooks.filter((b) => b.testament.toLowerCase() === 'nt');
  const ncBooks = filteredBooks.filter((b) => b.testament.toLowerCase() === 'apoc');

  const toggleSection = (section: string) => {
    setCollapsed((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const renderSection = (title: string, sectionBooks: Book[]) => (
    <div>
      <div
        className="sidebar-section-header"
        onClick={() => toggleSection(title)}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          style={{
            transform: collapsed[title] ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        {title === 'OT' ? 'Old Testament' : title === 'NT' ? 'New Testament' : 'Non-Canonical'}
        <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: '0.65rem' }}>
          {sectionBooks.length}
        </span>
      </div>
      {!collapsed[title] && (
        <div style={{ paddingBottom: '0.25rem' }}>
          {sectionBooks.length === 0 && title === 'NC' && (
            <div
              style={{
                padding: '0.5rem 0.75rem 0.75rem',
                fontSize: '0.7rem',
                color: darkMode ? '#a8a29e' : '#78716c',
                fontStyle: 'italic',
                lineHeight: 1.5,
              }}
            >
              No texts loaded yet. Run <code>scripts/ingest_apocrypha.py</code> to add the KJV Apocrypha.
            </div>
          )}
          {sectionBooks.map((book) => (
            <button
              key={book.abbreviation}
              onClick={() => {
                onSelectBook(book.abbreviation);
                onSelectChapter(1);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                width: '100%',
                padding: '0.375rem 0.75rem',
                background:
                  currentBook.toLowerCase() === book.abbreviation.toLowerCase()
                    ? darkMode ? '#78350f' : '#fef3c7'
                    : 'transparent',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s',
                color: darkMode ? '#f5f5f4' : '#292524',
              }}
              onMouseEnter={(e) => {
                if (currentBook.toLowerCase() !== book.abbreviation.toLowerCase()) {
                  e.currentTarget.style.background = darkMode ? '#2d2d24' : '#f5f5f4';
                }
              }}
              onMouseLeave={(e) => {
                if (currentBook.toLowerCase() !== book.abbreviation.toLowerCase()) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: darkMode ? '#a8a29e' : '#92400e',
                  minWidth: '2rem',
                }}
              >
                {book.abbreviation}
              </span>
              <span style={{ fontSize: '0.8rem' }}>{book.full_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (!sidebarOpen) return null;

  return (
    <aside
      style={{
        width: '280px',
        minWidth: '280px',
        height: '100%',
        backgroundColor: darkMode ? '#1a1a14' : '#fefce8',
        borderRight: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
        overflowY: 'auto',
        paddingTop: '0.5rem',
      }}
    >
      <div style={{ padding: '0 0.5rem 0.5rem', borderBottom: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`, marginBottom: '0.5rem' }}>
        <input
          type="search"
          placeholder="Search books..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            borderRadius: '8px',
            border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
            backgroundColor: darkMode ? '#252519' : '#ffffff',
            color: darkMode ? '#f5f5f4' : '#292524',
            fontSize: '0.8rem',
            outline: 'none',
          }}
        />
      </div>

      {effectiveBooks.length > 0 ? (
        <>
          {renderSection('OT', otBooks)}
          <div style={{ height: '0.5rem' }} />
          {renderSection('NT', ntBooks)}
          <div style={{ height: '0.5rem' }} />
          {renderSection('NC', ncBooks)}
        </>
      ) : (
        <p style={{ textAlign: 'center', padding: '2rem', color: darkMode ? '#a8a29e' : '#78716c', fontSize: '0.8rem' }}>
          Loading books...
        </p>
      )}
    </aside>
  );
}