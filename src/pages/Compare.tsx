import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../store/useAppStore';
import { ALL_TRANSLATIONS } from '../components/TranslationSelector';
import { getChapterOriginals, getChapter } from '../lib/tauri';
import type { WordMapping } from '../lib/tauri';
import { AiPanel } from '../components/AiPanel';
import { StrongsSidebar } from '../components/StrongsSidebar';
import { parseGreekMorphology, parseHebrewMorphology } from '../lib/morphology';

const ORIGINAL_LANG_CODES = new Set(['wlc', 'sblgnt', 'oshb']);

interface ChapterRef {
  book: string;
  chapter: number;
}

interface CompareVerse {
  translation: string;
  text: string;
}

interface CompareRow {
  verseNum: number;
  verses: CompareVerse[];
}

// Original language word data
interface OriginalVerseWords {
  verseNum: number;
  translation: string;
  words: WordMapping[];
}

// Books are loaded from the DB at runtime so abbreviations match `books.abbreviation`.

interface useCompareDataResult {
  rows: CompareRow[];
  loading: boolean;
  verseCount: number;
}

function useCompareData(ref: ChapterRef, translations: string[]): useCompareDataResult {
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [verseCount, setVerseCount] = useState(0);

  useEffect(() => {
    if (translations.length === 0) {
      setRows([]);
      setVerseCount(0);
      return;
    }
    let cancelled = false;
    setLoading(true);

    // Pull the chapter for every selected translation in parallel, then merge by verse_num.
    Promise.all(
      translations.map((t) =>
        getChapter(ref.book, ref.chapter, [t])
          .then((groups) => ({ trans: t, groups }))
          .catch(() => ({ trans: t, groups: [] })),
      ),
    )
      .then((perTrans) => {
        if (cancelled) return;
        const map = new Map<number, CompareVerse[]>();
        for (const { trans, groups } of perTrans) {
          for (const g of groups) {
            const text = g.verses[0]?.text ?? '';
            const list = map.get(g.verse_num) ?? [];
            list.push({ translation: trans, text });
            map.set(g.verse_num, list);
          }
        }
        // Ensure every row has every translation slot in the order user picked them
        const sortedNums = Array.from(map.keys()).sort((a, b) => a - b);
        const merged: CompareRow[] = sortedNums.map((vn) => {
          const have = new Map(map.get(vn)!.map((cv) => [cv.translation, cv]));
          const verses = translations.map((t) => have.get(t) ?? { translation: t, text: '' });
          return { verseNum: vn, verses };
        });
        setRows(merged);
        setVerseCount(sortedNums.length);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ref.book, ref.chapter, translations.join(',')]);

  return { rows, loading, verseCount };
}

// Morphology parsers live in src/lib/morphology.ts.

// ============================================================================
// Original Language Row Component
// ============================================================================

interface OriginalRowProps {
  words: WordMapping[];
  isHebrew: boolean;
}

function OriginalRow({ words, isHebrew }: OriginalRowProps) {
  const { darkMode } = useAppStore();
  const [tooltip, setTooltip] = useState<{ word: WordMapping; pos: { top: number; left: number } } | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!tooltip) return;
    const onMouseDown = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setTooltip(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTooltip(null);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [tooltip]);

  return (
    <div
      style={{
        direction: isHebrew ? 'rtl' : 'ltr',
        paddingLeft: isHebrew ? 0 : '0.75rem',
        paddingRight: isHebrew ? '0.75rem' : 0,
        paddingTop: '0.15rem',
        paddingBottom: '0.15rem',
        fontSize: '0.82rem',
        lineHeight: 1.6,
        color: isHebrew ? (darkMode ? '#fcd34d' : '#92400e') : (darkMode ? '#93c5fd' : '#1d4ed8'),
        backgroundColor: darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
        borderTop: `1px solid ${darkMode ? '#2a2a20' : '#f0f0eb'}`,
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.1rem',
        alignItems: 'center',
      }}
    >
      {words.map((w) => (
        <span
          key={w.id}
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setTooltip({ word: w, pos: { top: rect.bottom + 4, left: rect.left } });
          }}
          style={{
            fontFamily: isHebrew ? "'Noto Serif Hebrew', serif" : "'Noto Serif', serif",
            fontSize: '0.88rem',
            padding: '0.05rem 0.25rem',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'background-color 0.15s',
          }}
          title={`${w.lemma ? `Lemma: ${w.lemma}\n` : ''}Strong's: ${w.strongs_id}`}
        >
          {w.original_word}
        </span>
      ))}
      {tooltip && createPortal(
        <div
          ref={tooltipRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: Math.max(8, tooltip.pos.top - 10),
            left: Math.min(tooltip.pos.left, window.innerWidth - 280),
            zIndex: 9999,
            backgroundColor: darkMode ? '#252519' : '#ffffff',
            border: `1px solid ${darkMode ? '#92400e' : '#d97706'}`,
            borderRadius: '10px',
            padding: '0.75rem',
            width: '260px',
            maxWidth: '90vw',
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          }}
        >
          <div style={{
            fontFamily: isHebrew ? "'Noto Serif Hebrew', serif" : "'Noto Serif', serif",
            fontSize: '1.4rem',
            fontWeight: 700,
            direction: isHebrew ? 'rtl' : 'ltr',
            textAlign: isHebrew ? 'right' : 'left',
            color: isHebrew ? (darkMode ? '#fcd34d' : '#92400e') : (darkMode ? '#93c5fd' : '#1d4ed8'),
            marginBottom: '0.25rem',
          }}>
            {tooltip.word.original_word}
          </div>
          {tooltip.word.lemma && tooltip.word.lemma !== tooltip.word.original_word && (
            <div style={{ fontSize: '0.75rem', fontStyle: 'italic', color: darkMode ? '#a8a29e' : '#78716c', direction: isHebrew ? 'rtl' : 'ltr', textAlign: isHebrew ? 'right' : 'left' }}>
              Lemma: {tooltip.word.lemma}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.375rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '9999px', backgroundColor: darkMode ? '#78350f' : '#fef3c7', color: darkMode ? '#fcd34d' : '#92400e' }}>
              {tooltip.word.strongs_id}
            </span>
            <span style={{ fontSize: '0.65rem', color: darkMode ? '#78716c' : '#a8a29e', textTransform: 'uppercase' }}>
              {isHebrew ? 'Hebrew' : 'Greek'}
            </span>
          </div>
          {(isHebrew ? parseHebrewMorphology(tooltip.word.morphology ?? '') : parseGreekMorphology(tooltip.word.morphology ?? '')).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem', marginTop: '0.375rem' }}>
              {(isHebrew ? parseHebrewMorphology(tooltip.word.morphology ?? '') : parseGreekMorphology(tooltip.word.morphology ?? '')).map((p) => (
                <span key={p.label} style={{ fontSize: '0.68rem', padding: '0.1rem 0.35rem', borderRadius: '4px', backgroundColor: darkMode ? '#1a1a14' : '#fefce8', border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`, color: darkMode ? '#f5f5f4' : '#292524' }}>
                  <span style={{ fontWeight: 600, color: darkMode ? '#a8a29e' : '#78716c' }}>{p.label}:</span> {p.value}
                </span>
              ))}
            </div>
          )}
          <div style={{ fontSize: '0.6rem', color: darkMode ? '#57534e' : '#a8a29e', marginTop: '0.25rem', textAlign: 'center' }}>
            Click elsewhere or press Esc to close
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default function Compare() {
  const { darkMode, currentBook, currentChapter, setBook: setStoreBook, setChapter: setStoreChapter, books, ensureBooks } = useAppStore();
  const columnRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // Drive book/chapter directly from the global store so the sidebar and the
  // Compare page picker stay in sync (whichever one the user changes).
  const book = (currentBook || 'john').toLowerCase();
  const chapter = currentChapter || 1;
  const setBook = (b: string) => setStoreBook(b);
  const setChapter = (c: number) => setStoreChapter(c);

  const [verse, setVerse] = useState(1);
  const [selectedTranslations, setSelectedTranslations] = useState<string[]>(['KJV', 'NKJV', 'ESV']);
  const [copied, setCopied] = useState(false);
  const [originalWords, setOriginalWords] = useState<OriginalVerseWords[]>([]);
  const [showAi, setShowAi] = useState(false);
  const [strongsClosed, setStrongsClosed] = useState(false);
  const hasOriginalLang = selectedTranslations.some((t) =>
    ORIGINAL_LANG_CODES.has(t.toLowerCase()),
  );
  const showStrongs = hasOriginalLang && !strongsClosed;

  // Auto-reopen the Strong's sidebar whenever the translation mix changes.
  const transKey = selectedTranslations.join('|');
  useEffect(() => { setStrongsClosed(false); }, [transKey]);

  useEffect(() => {
    if (books.length === 0) ensureBooks().catch(() => {});
  }, [books.length, ensureBooks]);

  // Reset highlighted verse whenever the user navigates to a new chapter/book.
  useEffect(() => {
    setVerse(1);
  }, [book, chapter]);

  const { rows, loading, verseCount } = useCompareData({ book, chapter }, selectedTranslations);

  // Load original language words when OSHB or SBLGNT is selected
  useEffect(() => {
    const hasOriginal = selectedTranslations.some(t => t.toLowerCase() === 'oshb' || t.toLowerCase() === 'sblgnt');
    if (!hasOriginal) {
      setOriginalWords([]);
      return;
    }

    getChapterOriginals(book, chapter).then((verses) => {
      const words: OriginalVerseWords[] = verses.map((v) => ({
        verseNum: v.verse_num,
        translation: v.translation_abbreviation ?? '',
        words: v.word_mappings ?? [],
      }));
      setOriginalWords(words);
    });
  }, [book, chapter, selectedTranslations.join(',')]);

  const handleCopyRef = () => {
    const bookObj = books.find((b) => b.abbreviation.toLowerCase() === book.toLowerCase());
    const label = `${bookObj?.full_name ?? book} ${chapter}:${verse}`;
    navigator.clipboard.writeText(label).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Build a context object for the AI panel based on the current row.
  const activeRow = rows.find((r) => r.verseNum === verse);
  const bookObj = books.find((b) => b.abbreviation.toLowerCase() === book.toLowerCase());
  const aiVerses = activeRow
    ? activeRow.verses
        .filter((v) => v.text)
        .map((v) => ({
          book_abbreviation: bookObj?.abbreviation ?? book,
          chapter,
          verse_num: activeRow.verseNum,
          text: `[${v.translation}] ${v.text}`,
        }))
    : [];

  const verseColWidth = '2.5rem';

  // Get original words for a specific verse and translation
  const getOriginalWords = (verseNum: number, transAbbrev: string): WordMapping[] => {
    return originalWords.find(ow => ow.verseNum === verseNum && ow.translation.toLowerCase() === transAbbrev.toLowerCase())?.words ?? [];
  };

  // Check if a translation is an original language
  const isOriginalLang = (abbr: string) => abbr.toLowerCase() === 'oshb' || abbr.toLowerCase() === 'sblgnt';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Controls bar */}
      <div
        style={{
          padding: '0.75rem 1.25rem',
          borderBottom: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'center',
          backgroundColor: darkMode ? '#1a1a14' : '#fff',
        }}
      >
        {/* Book selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: darkMode ? '#a8a29e' : '#78716c' }}>Book</label>
          <select
            value={book}
            onChange={(e) => { setBook(e.target.value); setVerse(1); }}
            style={{
              padding: '0.25rem 0.5rem',
              borderRadius: '6px',
              border: `1px solid ${darkMode ? '#3c3a36' : '#d6d3d1'}`,
              backgroundColor: darkMode ? '#252519' : '#fff',
              color: darkMode ? '#f5f5f4' : '#292524',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            {books.map((b) => (
              <option key={b.abbreviation} value={b.abbreviation}>{b.full_name}</option>
            ))}
          </select>
        </div>

        {/* Chapter selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: darkMode ? '#a8a29e' : '#78716c' }}>Ch.</label>
          <input
            type="number"
            min={1}
            max={150}
            value={chapter}
            onChange={(e) => { setChapter(Math.max(1, parseInt(e.target.value) || 1)); setVerse(1); }}
            style={{
              width: '3.5rem',
              padding: '0.25rem 0.375rem',
              borderRadius: '6px',
              border: `1px solid ${darkMode ? '#3c3a36' : '#d6d3d1'}`,
              backgroundColor: darkMode ? '#252519' : '#fff',
              color: darkMode ? '#f5f5f4' : '#292524',
              fontSize: '0.8rem',
              textAlign: 'center',
            }}
          />
        </div>

        {/* Verse selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: darkMode ? '#a8a29e' : '#78716c' }}>V.</label>
          <input
            type="number"
            min={1}
            max={verseCount}
            value={verse}
            onChange={(e) => setVerse(Math.max(1, Math.min(verseCount, parseInt(e.target.value) || 1)))}
            style={{
              width: '3.5rem',
              padding: '0.25rem 0.375rem',
              borderRadius: '6px',
              border: `1px solid ${darkMode ? '#3c3a36' : '#d6d3d1'}`,
              backgroundColor: darkMode ? '#252519' : '#fff',
              color: darkMode ? '#f5f5f4' : '#292524',
              fontSize: '0.8rem',
              textAlign: 'center',
            }}
          />
          <span style={{ fontSize: '0.75rem', color: darkMode ? '#a8a29e' : '#78716c' }}>/ {verseCount}</span>
        </div>

        {/* Copy reference */}
        <button
          onClick={handleCopyRef}
          style={{
            padding: '0.25rem 0.75rem',
            borderRadius: '6px',
            border: `1px solid ${darkMode ? '#3c3a36' : '#d6d3d1'}`,
            backgroundColor: darkMode ? '#252519' : '#fff',
            color: darkMode ? '#a8a29e' : '#78716c',
            fontSize: '0.75rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
          title="Copy verse reference"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {copied ? 'Copied!' : 'Copy Ref'}
        </button>

        <button
          onClick={() => setShowAi((v) => !v)}
          style={{
            padding: '0.25rem 0.75rem',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: showAi ? '#78350f' : '#92400e',
            color: '#fff',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
          title={`Ask AI about ${bookObj?.full_name ?? book} ${chapter}:${verse}`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2" />
            <path d="M12 8v4l3 3" />
          </svg>
          {showAi ? 'Hide AI' : 'Ask AI'}
        </button>

        {/* Translation picker */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginLeft: 'auto' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: darkMode ? '#a8a29e' : '#78716c' }}>Compare:</span>
          {ALL_TRANSLATIONS.map((t) => {
            const active = selectedTranslations.includes(t.abbr);
            return (
              <button
                key={t.abbr}
                onClick={() => {
                  if (active) {
                    if (selectedTranslations.length > 2) {
                      setSelectedTranslations(selectedTranslations.filter((s) => s !== t.abbr));
                    }
                  } else {
                    if (selectedTranslations.length < 5) {
                      setSelectedTranslations([...selectedTranslations, t.abbr]);
                    }
                  }
                }}
                style={{
                  padding: '0.2rem 0.5rem',
                  borderRadius: '9999px',
                  border: `1px solid ${active ? (darkMode ? '#92400e' : '#d97706') : (darkMode ? '#3c3a36' : '#d6d3d1')}`,
                  backgroundColor: active ? (darkMode ? '#78350f' : '#fef3c7') : 'transparent',
                  color: active ? (darkMode ? '#fcd34d' : '#92400e') : (darkMode ? '#78716c' : '#78716c'),
                  fontSize: '0.7rem',
                  fontWeight: active ? 700 : 400,
                  cursor: 'pointer',
                }}
                title={t.name}
              >
                {t.abbr}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body: comparison grid + optional AI panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: darkMode ? '#a8a29e' : '#78716c' }}>
          Loading...
        </div>
      ) : selectedTranslations.length < 2 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: darkMode ? '#a8a29e' : '#78716c', fontSize: '0.9rem' }}>
          Select at least 2 translations to compare.
        </div>
      ) : (
        <div
          onScroll={(e) => {
            const source = e.currentTarget;
            columnRefs.current.forEach((col) => {
              if (col !== source) {
                col.scrollTop = source.scrollTop;
              }
            });
          }}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0 0.5rem 2rem',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: `${verseColWidth} repeat(${selectedTranslations.length}, 1fr)`, minWidth: '600px' }}>
            {/* Header row */}
            <div style={{ borderBottom: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`, padding: '0.5rem 0.25rem', backgroundColor: darkMode ? '#1e1e16' : '#f5f5f4' }} />
            {selectedTranslations.map((trans) => {
              const meta = ALL_TRANSLATIONS.find((t) => t.abbr === trans);
              const origLang = isOriginalLang(trans);
              return (
                <div
                  key={trans}
                  style={{
                    borderBottom: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
                    borderLeft: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: origLang ? (darkMode ? '#fcd34d' : '#92400e') : (darkMode ? '#f5f5f4' : '#292524'),
                    textAlign: 'center',
                    backgroundColor: darkMode ? '#1e1e16' : '#f5f5f4',
                  }}
                >
                  {meta?.name ?? trans}
                </div>
              );
            })}

            {/* Verse rows */}
            {rows.map((row) => {
              const isActive = row.verseNum === verse;
              return (
                <div key={row.verseNum} style={{ display: 'contents' }}>
                  {/* Verse number */}
                  <div
                    onClick={() => setVerse(row.verseNum)}
                    style={{
                      padding: '0.5rem 0.25rem',
                      fontSize: '0.8rem',
                      fontWeight: isActive ? 800 : 500,
                      color: isActive ? (darkMode ? '#fcd34d' : '#92400e') : (darkMode ? '#78716c' : '#a8a29e'),
                      textAlign: 'center',
                      cursor: 'pointer',
                      borderBottom: `1px solid ${darkMode ? '#2a2a20' : '#f5f5f4'}`,
                      borderRight: `1px solid ${darkMode ? '#2a2a20' : '#f5f5f4'}`,
                      backgroundColor: isActive ? (darkMode ? '#252519' : '#fef9f0') : 'transparent',
                    }}
                  >
                    {row.verseNum}
                  </div>

                  {/* Translation columns */}
                  {row.verses.map((v, colIdx) => {
                    const colRef = (el: HTMLDivElement | null) => {
                      if (el) columnRefs.current.set(colIdx, el);
                      else columnRefs.current.delete(colIdx);
                    };
                    const origLang = isOriginalLang(v.translation);
                    const origWords = origLang ? getOriginalWords(row.verseNum, v.translation) : [];

                    return (
                      <div key={v.translation} style={{ borderBottom: `1px solid ${darkMode ? '#2a2a20' : '#f5f5f4'}`, borderLeft: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>
                        <div
                          ref={colRef}
                          onClick={() => setVerse(row.verseNum)}
                          style={{
                            padding: '0.5rem 0.75rem',
                            fontSize: '0.9rem',
                            lineHeight: 1.7,
                            fontFamily: "'Lora', serif",
                            cursor: 'pointer',
                            backgroundColor: isActive ? (darkMode ? '#252519' : '#fef9f0') : 'transparent',
                            color: origLang ? (darkMode ? '#fcd34d' : '#92400e') : (darkMode ? '#f5f5f4' : '#292524'),
                          }}
                        >
                          {v.text}
                        </div>
                        {/* Original language words row */}
                        {origLang && origWords.length > 0 && (
                          <OriginalRow
                            words={origWords}
                            isHebrew={v.translation.toLowerCase() === 'oshb'}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
        </div>
        {showStrongs && (
          <StrongsSidebar
            book={book}
            chapter={chapter}
            verseNum={verse}
            onClose={() => setStrongsClosed(true)}
          />
        )}
        {showAi && (
          <div style={{ width: '380px', flexShrink: 0, borderLeft: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`, display: 'flex', flexDirection: 'column' }}>
            <AiPanel
              verses={aiVerses}
              onClose={() => setShowAi(false)}
              // Compare's AI context is the active row, not the global
              // selectedVerses store. Setting `verse` to 0 makes activeRow
              // undefined, which empties aiVerses on the next render.
              onDeselectAll={() => setVerse(0)}
            />
          </div>
        )}
      </div>
    </div>
  );
}