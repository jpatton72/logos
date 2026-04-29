import { useAppStore } from '../store/useAppStore';

const ALL_TRANSLATIONS = [
  { abbr: 'KJV', name: 'King James Version' },
  { abbr: 'NKJV', name: 'New King James Version' },
  { abbr: 'ESV', name: 'English Standard Version' },
  { abbr: 'WLC', name: 'Westminster Leningrad Codex (Hebrew)' },
  { abbr: 'SBLGNT', name: 'SBL Greek New Testament' },
];

export function TranslationSelector() {
  const { activeTranslations, setActiveTranslations, darkMode } = useAppStore();
  const current = activeTranslations[0] ?? 'KJV';

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
      <label
        htmlFor="translation-select"
        style={{
          fontSize: '0.75rem',
          color: darkMode ? '#a8a29e' : '#78716c',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        Translation:
      </label>
      <select
        id="translation-select"
        value={current}
        onChange={(e) => setActiveTranslations([e.target.value])}
        style={{
          padding: '0.25rem 0.625rem',
          borderRadius: '8px',
          border: `1px solid ${darkMode ? '#3c3a36' : '#d6d3d1'}`,
          backgroundColor: darkMode ? '#252519' : '#fff',
          color: darkMode ? '#f5f5f4' : '#292524',
          fontSize: '0.8rem',
          fontWeight: 600,
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {ALL_TRANSLATIONS.map((t) => (
          <option key={t.abbr} value={t.abbr}>{t.abbr} — {t.name}</option>
        ))}
      </select>
    </div>
  );
}

export { ALL_TRANSLATIONS };
