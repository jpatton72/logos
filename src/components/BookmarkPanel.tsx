import { useAppStore } from '../store/useAppStore';

interface BookmarkPanelProps {
  onClose: () => void;
}

export function BookmarkPanel({ onClose }: BookmarkPanelProps) {
  const { bookmarks, removeBookmark, darkMode } = useAppStore();

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }}
      />
      <div
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          width: '360px',
          backgroundColor: darkMode ? '#1a1a14' : '#fefce8',
          borderLeft: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem',
            borderBottom: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: darkMode ? '#f5f5f4' : '#292524' }}>
            Bookmarks
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: darkMode ? '#a8a29e' : '#78716c', display: 'flex', alignItems: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
          {bookmarks.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '2rem', color: darkMode ? '#a8a29e' : '#78716c', fontSize: '0.875rem' }}>
              No bookmarks yet. Click the bookmark icon on any verse to save it.
            </p>
          ) : (
            bookmarks.map((bm) => (
              <div
                key={bm.id}
                style={{
                  padding: '0.75rem',
                  borderRadius: '8px',
                  backgroundColor: darkMode ? '#252519' : '#ffffff',
                  border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
                  marginBottom: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                  <span className="verse-ref">
                    {bm.book_abbreviation.toUpperCase()} {bm.chapter}:{bm.verse_num}
                  </span>
                  <button
                    onClick={() => removeBookmark(bm.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: darkMode ? '#a8a29e' : '#78716c', display: 'flex', alignItems: 'center', padding: '0', opacity: 0.7 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
                    </svg>
                  </button>
                </div>
                {bm.label && (
                  <p style={{ margin: '0 0 0.25rem', fontWeight: 600, fontSize: '0.8rem', color: darkMode ? '#f5f5f4' : '#292524' }}>
                    {bm.label}
                  </p>
                )}
                <p style={{ margin: 0, fontFamily: "'Lora', Georgia, serif", fontSize: '0.85rem', lineHeight: 1.5, color: darkMode ? '#a8a29e' : '#78716c' }}>
                  {bm.text.slice(0, 120)}{bm.text.length > 120 ? '...' : ''}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
