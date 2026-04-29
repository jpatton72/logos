import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  getChapterOriginals,
  getStrongsGreek,
  getStrongsHebrew,
} from '../lib/tauri';
import type {
  WordMapping,
  StrongsGreek,
  StrongsHebrew,
  Verse,
} from '../lib/tauri';

interface StrongsSidebarProps {
  book: string;
  chapter: number;
  verseNum: number | null;
  onClose: () => void;
}

interface VerseWithWords extends Verse {
  word_mappings?: WordMapping[];
}

type Entry = (StrongsGreek | StrongsHebrew) & { language: 'hebrew' | 'greek' };

export function StrongsSidebar({ book, chapter, verseNum, onClose }: StrongsSidebarProps) {
  const { darkMode } = useAppStore();
  const [originals, setOriginals] = useState<VerseWithWords[]>([]);
  const [entries, setEntries] = useState<Record<string, Entry | null>>({});
  const [loadingChapter, setLoadingChapter] = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(false);

  // Fetch the chapter's original-language words once per (book, chapter).
  useEffect(() => {
    let cancelled = false;
    setLoadingChapter(true);
    getChapterOriginals(book, chapter)
      .then((verses) => {
        if (!cancelled) setOriginals(verses as VerseWithWords[]);
      })
      .catch(() => {
        if (!cancelled) setOriginals([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingChapter(false);
      });
    return () => {
      cancelled = true;
    };
  }, [book, chapter]);

  // Words for the currently-selected verse (across both Hebrew and Greek copies).
  const words = useMemo<WordMapping[]>(() => {
    if (verseNum == null) return [];
    return originals
      .filter((v) => v.verse_num === verseNum)
      .flatMap((v) => v.word_mappings ?? []);
  }, [originals, verseNum]);

  // Look up Strong's entries for every distinct strongs_id in those words.
  useEffect(() => {
    let cancelled = false;
    const ids = Array.from(new Set(words.map((w) => w.strongs_id)));
    if (ids.length === 0) {
      setEntries({});
      return;
    }
    setLoadingEntries(true);
    Promise.all(
      ids.map(async (id) => {
        const word = words.find((w) => w.strongs_id === id)!;
        try {
          const entry =
            word.language === 'hebrew'
              ? await getStrongsHebrew(id)
              : await getStrongsGreek(id);
          if (!entry) return [id, null] as const;
          return [id, { ...entry, language: word.language }] as const;
        } catch {
          return [id, null] as const;
        }
      }),
    )
      .then((pairs) => {
        if (cancelled) return;
        const out: Record<string, Entry | null> = {};
        for (const [id, entry] of pairs) out[id] = entry;
        setEntries(out);
      })
      .finally(() => {
        if (!cancelled) setLoadingEntries(false);
      });
    return () => {
      cancelled = true;
    };
  }, [words]);

  const muted = darkMode ? '#a8a29e' : '#78716c';
  const border = darkMode ? '#3c3a36' : '#e7e5e4';
  const bg = darkMode ? '#1a1a14' : '#fefce8';
  const surface = darkMode ? '#252519' : '#fff';

  const isLoading = loadingChapter || loadingEntries;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: bg,
        borderLeft: `1px solid ${border}`,
        width: '380px',
        minWidth: '380px',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 1rem',
          borderBottom: `1px solid ${border}`,
          backgroundColor: surface,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1rem', fontWeight: 700 }}>Strong's</span>
          {verseNum != null && (
            <span style={{ fontSize: '0.75rem', color: muted }}>
              {book.toUpperCase()} {chapter}:{verseNum}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: muted,
            padding: '0.25rem',
          }}
          title="Close Strong's sidebar"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
        {verseNum == null ? (
          <p style={{ textAlign: 'center', color: muted, fontSize: '0.85rem', padding: '2rem' }}>
            Select a verse to see Strong's lookups for each original-language word.
          </p>
        ) : isLoading && words.length === 0 ? (
          <p style={{ textAlign: 'center', color: muted, fontSize: '0.85rem', padding: '2rem' }}>
            Loading...
          </p>
        ) : words.length === 0 ? (
          <p style={{ textAlign: 'center', color: muted, fontSize: '0.85rem', padding: '2rem' }}>
            No Hebrew or Greek words available for this verse.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {words.map((w, i) => {
              const entry = entries[w.strongs_id];
              const isHebrew = w.language === 'hebrew';
              return (
                <div
                  key={`${w.id}-${i}`}
                  style={{
                    padding: '0.625rem 0.75rem',
                    borderRadius: '8px',
                    backgroundColor: surface,
                    border: `1px solid ${border}`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      gap: '0.5rem',
                      marginBottom: '0.25rem',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: isHebrew ? "'Noto Serif Hebrew', serif" : "'Noto Serif', serif",
                        fontSize: '1.1rem',
                        fontWeight: 700,
                        direction: isHebrew ? 'rtl' : 'ltr',
                        color: isHebrew ? '#15803d' : '#1d4ed8',
                      }}
                    >
                      {w.original_word}
                    </span>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '0.1rem 0.4rem',
                        borderRadius: '9999px',
                        backgroundColor: darkMode ? '#78350f' : '#fef3c7',
                        color: darkMode ? '#fcd34d' : '#92400e',
                        fontFamily: 'monospace',
                      }}
                    >
                      {w.strongs_id}
                    </span>
                  </div>

                  {entry?.transliteration && (
                    <div style={{ fontSize: '0.75rem', fontStyle: 'italic', color: muted, marginBottom: '0.25rem' }}>
                      {entry.transliteration}
                      {w.lemma && w.lemma !== w.original_word && (
                        <span style={{ marginLeft: '0.5rem' }}>· lemma: {w.lemma}</span>
                      )}
                    </div>
                  )}

                  {entry?.definition ? (
                    <p
                      style={{
                        margin: 0,
                        fontSize: '0.8rem',
                        lineHeight: 1.5,
                        color: darkMode ? '#f5f5f4' : '#292524',
                      }}
                    >
                      {entry.definition}
                    </p>
                  ) : entry === null ? (
                    <p style={{ margin: 0, fontSize: '0.75rem', color: muted, fontStyle: 'italic' }}>
                      No lexicon entry found.
                    </p>
                  ) : null}

                  {w.morphology && (
                    <div
                      style={{
                        marginTop: '0.375rem',
                        fontSize: '0.65rem',
                        color: muted,
                        fontFamily: 'monospace',
                      }}
                    >
                      {w.morphology}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
