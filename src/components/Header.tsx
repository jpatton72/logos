import { useAppStore } from '../store/useAppStore';

interface HeaderProps {
  onOpenSettings: () => void;
  onOpenBookmarks: () => void;
  onOpenNotes: () => void;
  onOpenCompare: () => void;
  onOpenLexicon: () => void;
  onGoHome: () => void;
}

export function Header({ onOpenSettings, onOpenBookmarks, onOpenNotes, onOpenCompare, onOpenLexicon, onGoHome }: HeaderProps) {
  const { darkMode, toggleDarkMode } = useAppStore();

  return (
    <header
      style={{
        height: '56px',
        backgroundColor: darkMode ? '#252519' : '#ffffff',
        borderBottom: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 1rem',
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}
    >
      {/* Left: hamburger + logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button
          onClick={() => useAppStore.getState().toggleSidebar()}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: darkMode ? '#a8a29e' : '#78716c',
            padding: '0.25rem',
            display: 'flex',
            alignItems: 'center',
            borderRadius: '4px',
          }}
          aria-label="Toggle sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={darkMode ? '#a8a29e' : '#92400e'} strokeWidth="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            <line x1="8" y1="7" x2="16" y2="7" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
          <span
            style={{
              fontWeight: 700,
              fontSize: '1.125rem',
              color: darkMode ? '#f5f5f4' : '#292524',
              letterSpacing: '-0.02em',
            }}
          >
            Aletheia
          </span>
        </div>
      </div>

      {/* Right: actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <button
          onClick={onGoHome}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: darkMode ? '#a8a29e' : '#78716c',
            padding: '0.375rem',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Home (reset reader)"
          aria-label="Home (reset reader)"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M3 9.5L12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
          </svg>
        </button>

        <button
          onClick={onOpenBookmarks}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: darkMode ? '#a8a29e' : '#78716c',
            padding: '0.375rem',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Bookmarks"
          aria-label="Bookmarks"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </button>

        <button
          onClick={onOpenNotes}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: darkMode ? '#a8a29e' : '#78716c',
            padding: '0.375rem',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Notes"
          aria-label="Notes"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </button>

        <button
          onClick={onOpenCompare}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: darkMode ? '#a8a29e' : '#78716c',
            padding: '0.375rem',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Compare Translations"
          aria-label="Compare Translations"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        </button>

        <button
          onClick={onOpenLexicon}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: darkMode ? '#a8a29e' : '#78716c',
            padding: '0.375rem',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Lexicon"
          aria-label="Lexicon"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            <line x1="8" y1="7" x2="16" y2="7" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>

        <button
          onClick={toggleDarkMode}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: darkMode ? '#a8a29e' : '#78716c',
            padding: '0.375rem',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
          }}
          title={darkMode ? 'Light mode' : 'Dark mode'}
          aria-label={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
        >
          {darkMode ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        <button
          onClick={onOpenSettings}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: darkMode ? '#a8a29e' : '#78716c',
            padding: '0.375rem',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Settings"
          aria-label="Settings"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
