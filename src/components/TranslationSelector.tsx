import { useAppStore } from '../store/useAppStore';

const ALL_TRANSLATIONS = [
  { abbr: 'KJV', name: 'King James Version' },
  { abbr: 'NKJV', name: 'New King James Version' },
  { abbr: 'ESV', name: 'English Standard Version' },
  { abbr: 'OSHB', name: 'Open Hebrew Source Text' },
  { abbr: 'SBLGNT', name: 'SBL Greek New Testament' },
];

export function TranslationSelector() {
  const { activeTranslations, addTranslation, removeTranslation, darkMode } = useAppStore();

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
      <span style={{ fontSize: '0.75rem', color: darkMode ? '#a8a29e' : '#78716c', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Translations:
      </span>

      {activeTranslations.map((t) => (
        <span
          key={t}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.25rem 0.625rem',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 600,
            backgroundColor: darkMode ? '#78350f' : '#fef3c7',
            color: darkMode ? '#f5f5f4' : '#92400e',
            border: `1px solid ${darkMode ? '#92400e' : '#f59e0b'}`,
          }}
        >
          {t}
          <button
            onClick={() => removeTranslation(t)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'inherit',
              display: 'flex',
              alignItems: 'center',
              padding: '0',
              lineHeight: 1,
              opacity: 0.7,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </span>
      ))}

      {activeTranslations.length < 3 && (
        <div style={{ position: 'relative' }}>
          <button
            style={{
              padding: '0.25rem 0.625rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 500,
              border: `1px dashed ${darkMode ? '#44403c' : '#d6d3d1'}`,
              backgroundColor: 'transparent',
              color: darkMode ? '#a8a29e' : '#78716c',
              cursor: 'pointer',
            }}
            onClick={() => {
              const next = ALL_TRANSLATIONS.find(
                (t) => !activeTranslations.includes(t.abbr)
              );
              if (next) addTranslation(next.abbr);
            }}
          >
            + Add
          </button>
        </div>
      )}
    </div>
  );
}

export { ALL_TRANSLATIONS };
