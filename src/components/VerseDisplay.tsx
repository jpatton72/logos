import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../store/useAppStore';
import { createBookmark, deleteBookmark, getKetivQere, getStrongsGreek, getStrongsHebrew } from '../api';
import { audioStatus } from '../lib/tauri';
import type { VerseGroup, WordMapping, KetivQere, VerseWithWords, StrongsGreek, StrongsHebrew, EnglishToken } from '../lib/tauri';
import { parseGreekMorphology, parseHebrewMorphology } from '../lib/morphology';
import { playOne, playQueue, stopAudio, subscribePlayback, type PlaybackState, type PlayItem } from '../lib/audioPlayback';

// Translations whose text is in the original Hebrew/Greek. Listen
// buttons are hidden for these because Piper's English voice would
// just produce garbage — a future feature could ship a different
// voice and re-enable them.
const ORIGINAL_LANG_ABBRS = new Set(['wlc', 'sblgnt', 'oshb']);

/** Build a stable playback key for a given verse + translation. Used
 *  by both single-verse and continuous-queue playback so a Listen
 *  button can simply ask "is this my key playing?". */
function playbackKey(book: string, chapter: number, verseNum: number, translationAbbr: string): string {
  return `${book.toLowerCase()}-${chapter}-${verseNum}-${translationAbbr.toLowerCase()}`;
}

// Module-level cache of the audio install state. The Listen button is
// hidden until Piper is installed; probing once per app session is
// enough since install/uninstall happen in Settings, which dispatches
// the `aletheia:audio-status-changed` event after either action so any
// mounted verse re-checks.
let cachedInstalled: boolean | null = null;
let pendingProbe: Promise<boolean> | null = null;

async function isAudioInstalled(): Promise<boolean> {
  if (cachedInstalled !== null) return cachedInstalled;
  if (!pendingProbe) {
    pendingProbe = audioStatus()
      .then((s) => {
        cachedInstalled = s.installed;
        return s.installed;
      })
      .catch(() => {
        cachedInstalled = false;
        return false;
      })
      .finally(() => {
        pendingProbe = null;
      });
  }
  return pendingProbe;
}

export const AUDIO_STATUS_EVENT = 'aletheia:audio-status-changed';

/** Called by Settings after install/uninstall succeeds — clears the
 *  cached probe and broadcasts so every mounted VerseDisplay flips its
 *  Listen-button visibility immediately. */
export function notifyAudioStatusChanged(): void {
  cachedInstalled = null;
  pendingProbe = null;
  window.dispatchEvent(new Event(AUDIO_STATUS_EVENT));
}

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
        // Clamp inside the viewport so the popup never gets clipped on
        // either edge. The right edge (340px popup + 12px margin) is
        // the bug we're fixing here; the left/top guards keep the
        // popup on-screen on small windows or near top edges too.
        top: Math.max(8, Math.min(position.top - 10, window.innerHeight - 100)),
        left: Math.max(8, Math.min(position.left, window.innerWidth - 352)),
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
  /** All verse groups in the chapter, in reading order. Used to build
   *  a continuation queue when the user Shift-clicks a Listen button
   *  ("play this verse and every verse after it"). The parent passes
   *  this so VerseDisplay doesn't have to fetch the chapter itself. */
  chapterVerses?: VerseGroup[];
}

export function VerseDisplay({ group, originalVerses, englishAlignment, chapterVerses }: VerseDisplayProps) {
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
  const [audioReady, setAudioReady] = useState<boolean>(cachedInstalled ?? false);
  // Single subscription to the global playback state. Each Listen
  // button below derives its own active/synthesizing/playing state by
  // comparing this state's `key` against its own playbackKey().
  const [playback, setPlayback] = useState<PlaybackState>({ key: null, phase: 'idle', progress: null });

  useEffect(() => {
    isAudioInstalled().then(setAudioReady);
    const onChange = () => isAudioInstalled().then(setAudioReady);
    window.addEventListener(AUDIO_STATUS_EVENT, onChange);
    return () => window.removeEventListener(AUDIO_STATUS_EVENT, onChange);
  }, []);

  useEffect(() => subscribePlayback(setPlayback), []);

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

  const handleListen = (verse: VerseGroup['verses'][number], continuous: boolean) => {
    const myKey = playbackKey(
      verse.book_abbreviation || currentBook,
      group.chapter,
      verse.verse_num,
      verse.translation_abbreviation || '',
    );
    // Already the active item (synthesizing or playing) → toggle off.
    if (playback.key === myKey && playback.phase !== 'idle') {
      stopAudio();
      return;
    }

    if (!continuous || !chapterVerses || chapterVerses.length === 0) {
      playOne({ text: verse.text, key: myKey });
      return;
    }

    // Continuous: queue this verse + every later verse in the chapter
    // that has the same translation. Skip empty texts (apocrypha
    // gaps) and original-language entries — Piper's English voice
    // would just produce garbage.
    const targetAbbr = (verse.translation_abbreviation || '').toLowerCase();
    const items: PlayItem[] = [];
    for (const g of chapterVerses) {
      if (g.verse_num < verse.verse_num) continue;
      const v = g.verses.find(
        (x) => (x.translation_abbreviation || '').toLowerCase() === targetAbbr,
      );
      if (!v) continue;
      if (!v.text || !v.text.trim()) continue;
      if (ORIGINAL_LANG_ABBRS.has(targetAbbr)) continue;
      items.push({
        text: v.text,
        key: playbackKey(
          v.book_abbreviation || currentBook,
          group.chapter,
          v.verse_num,
          v.translation_abbreviation || '',
        ),
      });
    }
    if (items.length === 0) {
      // Should never happen (we just clicked a verse) but bail safely.
      return;
    }
    void playQueue(items);
  };

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
            {/* Listen button — only after the optional Piper voice is
                installed AND only for English translations (Piper's
                English voice can't read Hebrew/Greek). Hidden on idle
                so the verse stays uncluttered. Shift+click plays this
                verse plus every later verse in the chapter. */}
            {audioReady && !ORIGINAL_LANG_ABBRS.has((verse.translation_abbreviation ?? '').toLowerCase()) && (() => {
              const myKey = playbackKey(
                verse.book_abbreviation || currentBook,
                group.chapter,
                verse.verse_num,
                verse.translation_abbreviation || '',
              );
              const isMine = playback.key === myKey;
              const isSynth = isMine && playback.phase === 'synthesizing';
              const isPlaying = isMine && playback.phase === 'playing';
              const isAnyPlaying = playback.key !== null;
              return (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleListen(verse, e.shiftKey);
                  }}
                  disabled={isSynth && !isMine}
                  title={
                    isPlaying
                      ? 'Stop playback (Esc also works)'
                      : isSynth
                      ? 'Generating audio…'
                      : 'Listen to this verse — Shift+click to play continuously through the chapter'
                  }
                  style={{
                    opacity: bmHover || isActive || isAnyPlaying ? 1 : 0,
                    background: 'none',
                    border: 'none',
                    cursor: isSynth ? 'wait' : 'pointer',
                    padding: '2px',
                    borderRadius: '4px',
                    color: isMine ? '#d97706' : darkMode ? '#78716c' : '#92400e',
                    transition: 'opacity 0.15s',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  {isPlaying ? (
                    // Stop (filled square)
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="1" />
                    </svg>
                  ) : isSynth ? (
                    // Pulsing dot while synthesis is in flight
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="3" fill="currentColor" />
                    </svg>
                  ) : (
                    // Speaker icon
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    </svg>
                  )}
                </button>
              );
            })()}
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