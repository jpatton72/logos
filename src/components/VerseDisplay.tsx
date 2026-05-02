import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../store/useAppStore';
import { createBookmark, deleteBookmark, getKetivQere, getStrongsGreek, getStrongsHebrew } from '../api';
import type { VerseGroup, WordMapping, KetivQere, VerseWithWords, StrongsGreek, StrongsHebrew, EnglishToken } from '../lib/tauri';
import { parseGreekMorphology, parseHebrewMorphology } from '../lib/morphology';

// ============================================================================
// Word Tooltip
// ============================================================================

interface WordTooltipProps {
  word: WordMapping;
  ketivQeres: KetivQere[];
  position: { top: number; left: number };
  onClose: () => void;
}

function WordTooltip({ word, ketivQeres, position, onClose }: WordTooltipProps) {
  const { darkMode } = useAppStore();
  const isHebrew = word.language === 'hebrew';
  const morphParts = isHebrew ? parseHebrewMorphology(word.morphology ?? '') : parseGreekMorphology(word.morphology ?? '');
  const ref = useRef<HTMLDivElement | null>(null);

  // Strong's lexicon entry. Fetched on every popup open — the entries
  // are tiny (single-row JOIN) and round-tripping it gives users the
  // same definition/transliteration/pronunciation they'd see in the
  // Lexicon page without making them switch screens. Treat null + not
  // loading as "lookup returned no row" (rare but possible for
  // dictionary-less Strong's IDs).
  const [strongsEntry, setStrongsEntry] = useState<StrongsGreek | StrongsHebrew | null>(null);
  const [loadingStrongs, setLoadingStrongs] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoadingStrongs(true);
    setStrongsEntry(null);
    const fetcher = isHebrew ? getStrongsHebrew : getStrongsGreek;
    fetcher(word.strongs_id)
      .then((entry) => { if (!cancelled) setStrongsEntry(entry); })
      .catch(() => { if (!cancelled) setStrongsEntry(null); })
      .finally(() => { if (!cancelled) setLoadingStrongs(false); });
    return () => { cancelled = true; };
  }, [word.strongs_id, isHebrew]);

  // Close on outside-click and on Escape.
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: Math.max(8, position.top - 10),
        left: Math.min(position.left, window.innerWidth - 300),
        zIndex: 9999,
        backgroundColor: darkMode ? '#252519' : '#ffffff',
        border: `1px solid ${darkMode ? '#92400e' : '#d97706'}`,
        borderRadius: '10px',
        padding: '0.875rem',
        width: '340px',
        maxWidth: '92vw',
        maxHeight: '80vh',
        overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        cursor: 'default',
      }}
    >
      {/* Caption — names the field for users who don't know they're
          looking at the source-language token. */}
      <div
        style={{
          fontSize: '0.6rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: darkMode ? '#78716c' : '#a8a29e',
          marginBottom: '0.125rem',
        }}
      >
        {isHebrew ? 'Hebrew word' : 'Greek word'}
      </div>

      {/* Original word */}
      <div
        style={{
          fontFamily: isHebrew ? "'Noto Serif Hebrew', serif" : "'Noto Serif', serif",
          fontSize: '1.5rem',
          fontWeight: 700,
          direction: isHebrew ? 'rtl' : 'ltr',
          textAlign: isHebrew ? 'right' : 'left',
          color: isHebrew ? (darkMode ? '#fcd34d' : '#92400e') : (darkMode ? '#93c5fd' : '#1d4ed8'),
          marginBottom: '0.375rem',
          lineHeight: 1.2,
        }}
      >
        {word.original_word}
      </div>

      {/* Lemma — labeled. Lemma = the dictionary form of an inflected
          word (e.g., "loved" -> "love"). */}
      {word.lemma && word.lemma !== word.original_word && (
        <div style={{ fontSize: '0.78rem', color: darkMode ? '#a8a29e' : '#78716c', marginBottom: '0.375rem', direction: isHebrew ? 'rtl' : 'ltr', textAlign: isHebrew ? 'right' : 'left' }}>
          <span style={{ fontWeight: 600 }}>Dictionary form:</span>{' '}
          <span style={{ fontStyle: 'italic' }}>{word.lemma}</span>
        </div>
      )}

      {/* Identity row: full-text labels so first-time users know what
          "G25" and "Heb"/"Gk" actually mean. The Strong's pill carries
          a `title` with a one-sentence explanation of the numbering
          system for users who aren't familiar with it. */}
      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span
          title="James Strong's 1890 concordance assigned a unique number to every Hebrew and Greek word in the Bible. This is that number."
          style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            padding: '0.15rem 0.5rem',
            borderRadius: '9999px',
            backgroundColor: darkMode ? '#78350f' : '#fef3c7',
            color: darkMode ? '#fcd34d' : '#92400e',
            cursor: 'help',
          }}
        >
          Strong's # {word.strongs_id}
        </span>
        <span
          style={{
            fontSize: '0.7rem',
            fontWeight: 600,
            padding: '0.15rem 0.5rem',
            borderRadius: '9999px',
            backgroundColor: darkMode ? '#1a1a14' : '#f5f5f4',
            color: darkMode ? '#a8a29e' : '#78716c',
          }}
        >
          {isHebrew ? 'Hebrew' : 'Greek'}
        </span>
      </div>

      {/* Morphology breakdown */}
      {morphParts.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: darkMode ? '#78716c' : '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
            Morphology
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
            {morphParts.map((p) => (
              <span
                key={p.label}
                style={{
                  fontSize: '0.7rem',
                  padding: '0.15rem 0.4rem',
                  borderRadius: '4px',
                  backgroundColor: darkMode ? '#1a1a14' : '#fefce8',
                  border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
                  color: darkMode ? '#f5f5f4' : '#292524',
                }}
              >
                <span style={{ fontWeight: 600, color: darkMode ? '#a8a29e' : '#78716c' }}>{p.label}:</span> {p.value}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Raw morphology — the parser code-string the breakdown above
          was derived from. Power users sometimes want to see it; new
          users can ignore it, so it's labeled compactly. */}
      {word.morphology && (
        <div
          style={{ fontSize: '0.65rem', color: darkMode ? '#57534e' : '#a8a29e', marginTop: '0.25rem' }}
          title="Source code from the morphology dataset, e.g. 'V-IAI-3S' = Verb, Imperfect Active Indicative, 3rd person Singular."
        >
          <span style={{ fontWeight: 600 }}>Source code:</span>{' '}
          <span style={{ fontFamily: 'monospace' }}>{word.morphology}</span>
        </div>
      )}

      {/* Strong's lexicon entry */}
      <div style={{ marginTop: '0.625rem', paddingTop: '0.625rem', borderTop: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: darkMode ? '#78716c' : '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>
          Strong's Definition
        </div>
        {loadingStrongs ? (
          <div style={{ fontSize: '0.78rem', color: darkMode ? '#78716c' : '#a8a29e', fontStyle: 'italic' }}>
            Loading…
          </div>
        ) : strongsEntry ? (
          <>
            {strongsEntry.transliteration && (
              <div style={{ fontSize: '0.78rem', color: darkMode ? '#a8a29e' : '#78716c', marginBottom: '0.2rem' }}>
                <span style={{ fontWeight: 600 }} title="The original-language word spelled in Latin letters, so you can pronounce it without reading Hebrew or Greek script.">
                  Transliteration:
                </span>{' '}
                <span style={{ fontStyle: 'italic' }}>{strongsEntry.transliteration}</span>
              </div>
            )}
            {strongsEntry.pronunciation && (
              <div style={{ fontSize: '0.78rem', color: darkMode ? '#a8a29e' : '#78716c', marginBottom: '0.35rem' }}>
                <span style={{ fontWeight: 600 }} title="An approximate phonetic spelling for English speakers.">
                  Pronunciation:
                </span>{' '}
                {strongsEntry.pronunciation}
              </div>
            )}
            <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.5, color: darkMode ? '#f5f5f4' : '#292524' }}>
              {strongsEntry.definition || 'No definition available.'}
            </p>
          </>
        ) : (
          <div style={{ fontSize: '0.78rem', color: darkMode ? '#78716c' : '#a8a29e', fontStyle: 'italic' }}>
            No lexicon entry found for {word.strongs_id}.
          </div>
        )}
      </div>

      {/* Ketiv/Qere display */}
      {ketivQeres.length > 0 && isHebrew && (
        <div style={{ marginTop: '0.625rem', padding: '0.5rem', borderRadius: '6px', backgroundColor: darkMode ? '#1a1a14' : '#fefce8', border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: darkMode ? '#78716c' : '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
            Ketiv / Qere
          </div>
          {ketivQeres.map((kq, i) => (
            <div key={i} style={{ fontSize: '0.78rem', marginBottom: '0.125rem' }}>
              <span style={{ fontFamily: "'Noto Serif Hebrew', serif", direction: 'rtl', display: 'block', color: darkMode ? '#92400e' : '#b45309', fontWeight: 600 }}>
                Ketiv (written): {kq.ketiv}
              </span>
              <span style={{ fontFamily: "'Noto Serif Hebrew', serif", direction: 'rtl', display: 'block', color: darkMode ? '#15803d' : '#166534', fontWeight: 600 }}>
                Qere (read): {kq.qere}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Close hint */}
      <div style={{ fontSize: '0.62rem', color: darkMode ? '#57534e' : '#a8a29e', marginTop: '0.5rem', textAlign: 'center' }}>
        Click elsewhere or press Esc to close
      </div>
    </div>,
    document.body,
  );
}

// ============================================================================
// Word Chip
// ============================================================================

interface WordChipProps {
  word: WordMapping;
  isHebrew: boolean;
  ketivQeres: KetivQere[];
  onClick: (word: WordMapping, pos: { top: number; left: number }) => void;
}

function WordChip({ word, isHebrew, ketivQeres, onClick }: WordChipProps) {
  const [hovered, setHovered] = useState(false);
  const { darkMode, setHoveredStrongsId } = useAppStore();

  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        onClick(word, { top: rect.bottom + 4, left: rect.left });
      }}
      onMouseEnter={() => {
        setHovered(true);
        // Tell the chapter container which Strong's ID is hot so the
        // matching English token spans light up. Cleared on leave.
        if (word.strongs_id) setHoveredStrongsId(word.strongs_id);
      }}
      onMouseLeave={() => {
        setHovered(false);
        setHoveredStrongsId(null);
      }}
      style={{
        display: 'inline-block',
        fontFamily: isHebrew ? "'Noto Serif Hebrew', serif" : "'Noto Serif', serif",
        fontSize: '0.95rem',
        padding: '0.1rem 0.3rem',
        borderRadius: '4px',
        cursor: 'pointer',
        transition: 'background-color 0.15s, color 0.15s',
        backgroundColor: hovered
          ? (isHebrew ? (darkMode ? '#78350f' : '#fef3c7') : (darkMode ? '#1e3a8a' : '#dbeafe'))
          : 'transparent',
        color: isHebrew
          ? (darkMode ? '#fcd34d' : '#92400e')
          : (darkMode ? '#93c5fd' : '#1d4ed8'),
        fontWeight: hovered ? 700 : 500,
        margin: '0.05rem 0.1rem',
      }}
      title={`${word.lemma ? `Lemma: ${word.lemma}\n` : ''}Strong's: ${word.strongs_id}${ketivQeres.length > 0 ? `\nKetiv/Qere: ${ketivQeres.map(k => `${k.ketiv} → ${k.qere}`).join(', ')}` : ''}`}
    >
      {word.original_word}
    </span>
  );
}

// ============================================================================
// Original Language Row
// ============================================================================

interface OriginalRowProps {
  words: WordMapping[];
  isHebrew: boolean;
  ketivQeres: KetivQere[];
}

function OriginalRow({ words, isHebrew, ketivQeres }: OriginalRowProps) {
  const { darkMode } = useAppStore();
  const [tooltip, setTooltip] = useState<{ word: WordMapping; pos: { top: number; left: number } } | null>(null);

  return (
    <div
      style={{
        direction: isHebrew ? 'rtl' : 'ltr',
        paddingLeft: isHebrew ? '0' : '1.75rem',
        paddingRight: isHebrew ? '1.75rem' : '0',
        paddingTop: '0.2rem',
        paddingBottom: '0.2rem',
        fontSize: '0.85rem',
        lineHeight: 1.8,
        color: isHebrew
          ? (darkMode ? '#fcd34d' : '#92400e')
          : (darkMode ? '#93c5fd' : '#1d4ed8'),
        backgroundColor: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
        borderRadius: '4px',
        marginTop: '0.125rem',
        opacity: 0.85,
      }}
    >
      {words.map((w) => (
        <WordChip
          key={w.id}
          word={w}
          isHebrew={isHebrew}
          ketivQeres={ketivQeres}
          onClick={(word, pos) => setTooltip({ word, pos })}
        />
      ))}
      {tooltip && (
        <WordTooltip
          word={tooltip.word}
          ketivQeres={ketivQeres}
          position={tooltip.pos}
          onClose={() => setTooltip(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// VerseDisplay Props & Component
// ============================================================================

interface VerseDisplayProps {
  group: VerseGroup;
  originalVerses?: VerseWithWords[];
  /** Per-verse English token alignment keyed by `verse.id`. When a
   *  KJV verse has an entry, we render its tokens as individual spans
   *  so the hover-to-highlight feature can target words. Verses
   *  without alignment fall back to the plain-text rendering. */
  englishAlignment?: Record<number, EnglishToken[]>;
}

export function VerseDisplay({ group, originalVerses, englishAlignment }: VerseDisplayProps) {
  const {
    darkMode,
    fontSize,
    currentBook,
    currentChapter,
    selectedVerses,
    toggleVerseSelection,
    extendVerseSelection,
    addBookmark,
    removeBookmark,
    bookmarks,
  } = useAppStore();
  const [bmHover, setBmHover] = useState(false);
  const [ketivQere, setKetivQere] = useState<Record<number, KetivQere[]>>({});

  const verseRef = {
    book: currentBook.toLowerCase(),
    chapter: currentChapter,
    verseNum: group.verse_num,
  };
  const isActive = selectedVerses.some(
    (v) =>
      v.book === verseRef.book &&
      v.chapter === verseRef.chapter &&
      v.verseNum === verseRef.verseNum,
  );

  const handleVerseClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.shiftKey) {
      extendVerseSelection(verseRef);
    } else {
      // Plain click and Ctrl/Cmd-click both toggle this verse in/out of
      // the persistent selection.
      toggleVerseSelection(verseRef);
    }
  };
  const primaryVerse = group.verses[0];
  const isBookmarked = bookmarks.some((b) => b.verse_id === primaryVerse?.id);

  // Fetch Ketiv/Qere data for OSHB verses
  useEffect(() => {
    const oshbVerse = originalVerses?.find(v => v.translation_abbreviation === 'oshb' || v.translation_id === 3);
    if (!oshbVerse) return;
    (async () => {
      try {
        const kq = await getKetivQere(oshbVerse.book_abbreviation, oshbVerse.chapter, oshbVerse.verse_num);
        if (kq.length > 0) {
          setKetivQere((prev) => ({ ...prev, [group.verse_num]: kq }));
        }
      } catch {
        // silent — K/Q just won't show
      }
    })();
  }, [group.verse_num, originalVerses]);

  const handleBookmark = async () => {
    if (!primaryVerse) return;
    if (isBookmarked) {
      // Toggle off: find every Zustand entry for this verse and delete from DB + store.
      const matching = bookmarks.filter((b) => b.verse_id === primaryVerse.id);
      for (const bm of matching) {
        try {
          await deleteBookmark(bm.id);
        } catch (e) {
          console.error('Failed to delete bookmark:', e);
        }
        removeBookmark(bm.id);
      }
      return;
    }
    try {
      const created = await createBookmark(primaryVerse.id);
      addBookmark({
        id: created.id,
        verse_id: primaryVerse.id,
        label: created.label,
        book_abbreviation: primaryVerse.book_abbreviation,
        chapter: group.chapter,
        verse_num: group.verse_num,
        text: primaryVerse.text,
        translation_abbreviation: primaryVerse.translation_abbreviation || '',
        created_at: created.created_at,
      });
    } catch (e) {
      console.error('Failed to create bookmark:', e);
    }
  };
  // Separate OSHB and SBLGNT words
  const oshbWords = originalVerses
    ?.find(v => v.translation_abbreviation === 'oshb' || v.translation_id === 3)
    ?.word_mappings ?? [];
  const sblgntWords = originalVerses
    ?.find(v => v.translation_abbreviation === 'sblgnt' || v.translation_id === 4)
    ?.word_mappings ?? [];

  return (
    <div
      id={`verse-${group.verses[0]?.book_abbreviation}-${group.chapter}-${group.verse_num}`}
      onClick={handleVerseClick}
      onMouseEnter={() => setBmHover(true)}
      onMouseLeave={() => setBmHover(false)}
      style={{
        display: 'block',
        gap: '0.5rem',
        alignItems: 'stretch',
        backgroundColor: isActive
          ? darkMode ? 'rgba(120, 53, 15, 0.2)' : 'rgba(254, 243, 199, 0.5)'
          : 'transparent',
        borderRadius: '4px',
        padding: isActive ? '0.25rem 0.5rem' : '0.125rem 0.5rem',
        cursor: 'pointer',
        transition: 'background-color 0.15s',
      }}
    >
      {group.verses.map((verse) => (
        <div key={verse.translation_abbreviation} style={{ flex: 1 }}>
          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'flex-start',
              position: 'relative',
            }}
          >
            <span
              className="verse-number"
              style={{ color: darkMode ? '#a8a29e' : '#92400e', fontSize: '0.65em' }}
            >
              {verse.verse_num}
            </span>
            <p
              style={{
                margin: 0,
                fontFamily: "'Lora', Georgia, serif",
                fontSize: `${fontSize}px`,
                lineHeight: 1.8,
                color: darkMode ? '#f5f5f4' : '#292524',
                flex: 1,
              }}
            >
              {(() => {
                // For KJV verses with token alignment, render
                // word-by-word so hover-to-highlight can target the
                // exact spans translating a Hebrew/Greek word. For
                // every other translation (and for KJV verses without
                // alignment), keep the plain-text rendering.
                const tokens = englishAlignment?.[verse.id];
                const isKjv = (verse.translation_abbreviation ?? '').toLowerCase() === 'kjv';
                if (isKjv && tokens && tokens.length > 0) {
                  return <TokenizedVerseText tokens={tokens} />;
                }
                return verse.text;
              })()}
            </p>
            {/* Bookmark button — appears on hover */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleBookmark();
              }}
              title={isBookmarked ? 'Click to remove bookmark' : 'Click to bookmark this verse'}
              style={{
                opacity: bmHover || isBookmarked || isActive ? 1 : 0,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                borderRadius: '4px',
                color: isBookmarked ? '#d97706' : darkMode ? '#78716c' : '#92400e',
                transition: 'opacity 0.15s',
                flexShrink: 0,
                marginTop: '2px',
              }}
              onMouseEnter={() => setBmHover(true)}
              onMouseLeave={() => setBmHover(false)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          </div>
        </div>
      ))}

      {/* Original language rows */}
      {oshbWords.length > 0 && (
        <OriginalRow words={oshbWords} isHebrew={true} ketivQeres={ketivQere[group.verse_num] ?? []} />
      )}
      {sblgntWords.length > 0 && (
        <OriginalRow words={sblgntWords} isHebrew={false} ketivQeres={[]} />
      )}
    </div>
  );
}

// ============================================================================
// Tokenized verse renderer (KJV)
// ============================================================================

const PUNCTUATION = /^[.,:;!?\-—–()[\]"“”'’]+$/;

/** Renders a KJV verse from its token alignment data. Tagged words get a
 *  data-strongs attribute so the chapter-level hover effect can target
 *  them; untagged words and punctuation are plain text. Tokens are
 *  joined with spaces, except a leading space is suppressed before
 *  punctuation tokens so commas and periods hug the previous word. */
function TokenizedVerseText({ tokens }: { tokens: EnglishToken[] }) {
  return (
    <>
      {tokens.map((tok, i) => {
        const prev = tokens[i - 1];
        const isPunct = PUNCTUATION.test(tok.w);
        const needsLeadingSpace = i > 0 && !isPunct && prev !== undefined && !PUNCTUATION.test(prev.w);
        // Untagged tokens render as plain text — no extra DOM weight,
        // and they're skipped by the highlight selector. Tagged tokens
        // get a span with data-strongs (space-separated list) so the
        // attribute-includes selector matches when hovered.
        if (tok.s && tok.s.length > 0) {
          return (
            <span key={i}>
              {needsLeadingSpace ? ' ' : ''}
              <span className="eng-token" data-strongs={tok.s.join(' ')}>{tok.w}</span>
            </span>
          );
        }
        return (
          <span key={i}>
            {needsLeadingSpace ? ' ' : ''}{tok.w}
          </span>
        );
      })}
    </>
  );
}