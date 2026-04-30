import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getStrongsGreek, getStrongsHebrew, getChapterOriginals } from '../lib/tauri';
import type { WordMapping, StrongsGreek, StrongsHebrew, VerseWithWords } from '../lib/tauri';
import {
  parseGreekMorphology,
  parseHebrewMorphology,
  formatMorphologyParts,
} from '../lib/morphology';

// VerseWithWords lives in src/lib/tauri.ts; imported above.

// Extended Strongs entries that include the full lexicon fields from Rust
interface StrongsGreekFull extends StrongsGreek {
  see?: string;
}

interface StrongsHebrewFull extends StrongsHebrew {
  see?: string;
}

// Morphology parsers live in src/lib/morphology.ts.
// Books are loaded from the DB at runtime so abbreviations match `books.abbreviation`.

// ============================================================================
// Word Detail Popup
// ============================================================================

interface WordDetailProps {
  word: WordMapping;
  strongsEntry: StrongsGreekFull | StrongsHebrewFull | null;
  darkMode: boolean;
  onClose: () => void;
}

function WordDetail({ word, strongsEntry, darkMode, onClose }: WordDetailProps) {
  const isHebrew = word.language === 'hebrew';
  const morphParts = isHebrew ? parseHebrewMorphology(word.morphology ?? '') : parseGreekMorphology(word.morphology ?? '');
  const morphLabel = formatMorphologyParts(morphParts);

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: darkMode ? '#252519' : '#ffffff',
          border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
          borderRadius: '12px',
          padding: '1.5rem',
          maxWidth: '28rem',
          width: '90%',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <div
              style={{
                fontFamily: isHebrew ? "'Noto Serif Hebrew', serif" : "'Noto Serif', serif",
                fontSize: '2rem',
                fontWeight: 700,
                color: isHebrew ? '#15803d' : '#1d4ed8',
                direction: isHebrew ? 'rtl' : 'ltr',
                textAlign: isHebrew ? 'right' : 'left',
                lineHeight: 1.2,
              }}
            >
              {word.original_word}
            </div>
            {word.lemma && word.lemma !== word.original_word && (
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', fontStyle: 'italic', color: darkMode ? '#a8a29e' : '#78716c' }}>
                Lemma: {word.lemma}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: darkMode ? '#a8a29e' : '#78716c', padding: '0.25rem', flexShrink: 0 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <span
            style={{
              fontSize: '0.75rem',
              padding: '0.25rem 0.625rem',
              borderRadius: '9999px',
              backgroundColor: isHebrew ? (darkMode ? '#14532d' : '#dcfce7') : (darkMode ? '#1e3a8a' : '#dbeafe'),
              color: isHebrew ? (darkMode ? '#86efac' : '#15803d') : (darkMode ? '#93c5fd' : '#1d4ed8'),
              fontWeight: 700,
            }}
          >
            {word.strongs_id}
          </span>
          <span
            style={{
              fontSize: '0.75rem',
              padding: '0.25rem 0.625rem',
              borderRadius: '9999px',
              backgroundColor: darkMode ? '#2d2d24' : '#f5f5f4',
              color: darkMode ? '#a8a29e' : '#78716c',
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            {isHebrew ? 'Hebrew' : 'Greek'}
          </span>
          {morphLabel && (
            <span
              style={{
                fontSize: '0.75rem',
                padding: '0.25rem 0.625rem',
                borderRadius: '9999px',
                backgroundColor: darkMode ? '#2d2d24' : '#f5f5f4',
                color: darkMode ? '#a8a29e' : '#78716c',
              }}
            >
              {morphLabel}
            </span>
          )}
        </div>

        {/* Morphology breakdown */}
        {morphParts.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', fontWeight: 700, color: darkMode ? '#a8a29e' : '#78716c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Morphology
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
              {morphParts.map((p) => (
                <span
                  key={p.label}
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '6px',
                    backgroundColor: darkMode ? '#1a1a14' : '#fefce8',
                    border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
                    color: darkMode ? '#f5f5f4' : '#292524',
                  }}
                >
                  <span style={{ fontWeight: 600, color: darkMode ? '#a8a29e' : '#78716c' }}>{p.label}:</span> {p.value}
                </span>
              ))}
            </div>
            {word.morphology && (
              <p style={{ margin: '0.375rem 0 0', fontSize: '0.7rem', color: darkMode ? '#78716c' : '#a8a29e', fontFamily: 'monospace' }}>
                Raw: {word.morphology}
              </p>
            )}
          </div>
        )}

        {/* Strongs definition */}
        {strongsEntry ? (
          <div style={{ marginBottom: '1rem' }}>
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', fontWeight: 700, color: darkMode ? '#a8a29e' : '#78716c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Strongs Definition
            </h4>
            <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.6, color: darkMode ? '#f5f5f4' : '#292524' }}>
              {strongsEntry.definition || 'No definition available.'}
            </p>
            {('transliteration' in strongsEntry && strongsEntry.transliteration) && (
              <p style={{ margin: '0.375rem 0 0', fontSize: '0.8rem', fontStyle: 'italic', color: darkMode ? '#a8a29e' : '#78716c' }}>
                Transliteration: {strongsEntry.transliteration}
              </p>
            )}
            {strongsEntry.pronunciation && (
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: darkMode ? '#a8a29e' : '#78716c' }}>
                Pronunciation: {strongsEntry.pronunciation}
              </p>
            )}
            {strongsEntry.see && strongsEntry.see.trim() && (
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>
                <span style={{ fontWeight: 600, color: darkMode ? '#a8a29e' : '#78716c' }}>See also:</span>{' '}
                <span style={{ color: darkMode ? '#fcd34d' : '#92400e', cursor: 'pointer' }}>{strongsEntry.see}</span>
              </p>
            )}
          </div>
        ) : (
          <p style={{ fontSize: '0.85rem', color: darkMode ? '#78716c' : '#a8a29e', fontStyle: 'italic' }}>
            No lexicon entry found for {word.strongs_id}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Lexicon Page
// ============================================================================

type Tab = 'search' | 'chapter';

export default function Lexicon() {
  const { darkMode, currentBook, currentChapter, books, ensureBooks } = useAppStore();

  // Tab state
  const [activeTab, setActiveTab] = useState<Tab>('search');

  // Strongs search state
  const [strongsQuery, setStrongsQuery] = useState('');
  const [strongsResult, setStrongsResult] = useState<{ entry: StrongsGreekFull | StrongsHebrewFull | null; id: string } | null>(null);
  const [strongsLoading, setStrongsLoading] = useState(false);
  const [strongsError, setStrongsError] = useState('');

  // Chapter word list state
  const [chapterBook, setChapterBook] = useState(currentBook || 'john');
  const [chapterNum, setChapterNum] = useState(currentChapter || 1);

  useEffect(() => {
    if (books.length === 0) ensureBooks().catch(() => {});
  }, [books.length, ensureBooks]);
  const [chapterVerses, setChapterVerses] = useState<VerseWithWords[]>([]);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [chapterError, setChapterError] = useState('');

  // All words from chapter (flattened)
  const [allWords, setAllWords] = useState<WordMapping[]>([]);
  const [chapterLoaded, setChapterLoaded] = useState(false);

  // Selected word for popup
  const [selectedWord, setSelectedWord] = useState<WordMapping | null>(null);
  const [selectedStrongsEntry, setSelectedStrongsEntry] = useState<StrongsGreekFull | StrongsHebrewFull | null>(null);

  // Grouped words
  const [greekWords, setGreekWords] = useState<WordMapping[]>([]);
  const [hebrewWords, setHebrewWords] = useState<WordMapping[]>([]);

  // ===========================================================================
  // Strongs Search
  // ===========================================================================

  const handleStrongsSearch = async () => {
    const q = strongsQuery.trim().toUpperCase();
    if (!q) return;
    setStrongsLoading(true);
    setStrongsError('');
    setStrongsResult(null);

    try {
      if (q.startsWith('H')) {
        const entry = await getStrongsHebrew(q);
        setStrongsResult({ entry, id: q });
      } else if (q.startsWith('G')) {
        const entry = await getStrongsGreek(q);
        setStrongsResult({ entry, id: q });
      } else {
        setStrongsError('Please enter a valid Strong\'s ID (e.g., G1, H7225)');
      }
    } catch {
      setStrongsError('Failed to look up Strong\'s number. Please try again.');
    } finally {
      setStrongsLoading(false);
    }
  };

  // ===========================================================================
  // Chapter Word List
  // ===========================================================================

  const loadChapterWords = async () => {
    setChapterLoading(true);
    setChapterError('');
    setChapterVerses([]);
    setAllWords([]);
    setGreekWords([]);
    setHebrewWords([]);
    setChapterLoaded(false);

    try {
      const verses = await getChapterOriginals(chapterBook, chapterNum);
      setChapterVerses(verses);
      setChapterLoaded(true);

      // Collect all word mappings
      const wordMap = new Map<string, WordMapping>();
      verses.forEach((verse: VerseWithWords) => {
        if (verse.word_mappings) {
          verse.word_mappings.forEach((wm: WordMapping) => {
            if (!wordMap.has(wm.strongs_id)) {
              wordMap.set(wm.strongs_id, wm);
            }
          });
        }
      });

      const words = Array.from(wordMap.values());
      setAllWords(words);

      const greek = words.filter((w) => w.language === 'greek');
      const hebrew = words.filter((w) => w.language === 'hebrew');
      setGreekWords(greek);
      setHebrewWords(hebrew);
    } catch {
      setChapterError('Failed to load chapter. Please check the book and chapter.');
    } finally {
      setChapterLoading(false);
    }
  };

  // ===========================================================================
  // Word Click
  // ===========================================================================

  const handleWordClick = async (word: WordMapping) => {
    setSelectedWord(word);
    setSelectedStrongsEntry(null);

    try {
      const entry = word.language === 'hebrew'
        ? await getStrongsHebrew(word.strongs_id)
        : await getStrongsGreek(word.strongs_id);
      setSelectedStrongsEntry(entry);
    } catch {
      setSelectedStrongsEntry(null);
    }
  };

  // ===========================================================================
  // Render Helpers
  // ===========================================================================

  const strongsAccent = darkMode ? '#fcd34d' : '#92400e';
  const muted = darkMode ? '#78716c' : '#a8a29e';
  const border = darkMode ? '#3c3a36' : '#e7e5e4';
  const surface = darkMode ? '#252519' : '#ffffff';
  const bg = darkMode ? '#1a1a14' : '#fefce8';

  function WordChip({ word, showVerse = false, verseNum }: { word: WordMapping; showVerse?: boolean; verseNum?: number }) {
    const isHebrew = word.language === 'hebrew';
    return (
      <button
        onClick={() => handleWordClick(word)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '0.3rem 0.625rem',
          borderRadius: '8px',
          border: `1px solid ${isHebrew ? (darkMode ? '#14532d' : '#bbf7d0') : (darkMode ? '#1e3a8a' : '#bfdbfe')}`,
          backgroundColor: darkMode ? '#1a1a14' : '#fff',
          cursor: 'pointer',
          fontFamily: isHebrew ? "'Noto Serif Hebrew', serif" : "'Noto Serif', serif",
          fontSize: '1rem',
          fontWeight: 600,
          direction: isHebrew ? 'rtl' : 'ltr',
          textAlign: isHebrew ? 'right' : 'left',
          color: isHebrew ? '#15803d' : '#1d4ed8',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = darkMode ? '#252519' : '#fefce8';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = darkMode ? '#1a1a14' : '#fff';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
        title={`${word.strongs_id}${word.morphology ? ' · ' + word.morphology : ''}`}
      >
        {word.original_word}
        <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 700, opacity: 0.7, color: isHebrew ? '#15803d' : '#1d4ed8' }}>
          {word.strongs_id}
        </span>
        {showVerse && verseNum && (
          <span style={{ fontSize: '0.6rem', color: muted, fontFamily: 'inherit', opacity: 0.6 }}>{verseNum}</span>
        )}
      </button>
    );
  }

  function WordGroupSection({ title, words, language }: { title: string; words: WordMapping[]; language: 'hebrew' | 'greek' }) {
    const isHebrew = language === 'hebrew';
    const [expanded, setExpanded] = useState(true);

    return (
      <div style={{ marginBottom: '1.25rem' }}>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            width: '100%',
            padding: '0.5rem 0',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            borderBottom: `1px solid ${border}`,
            marginBottom: '0.75rem',
          }}
        >
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: muted }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: isHebrew ? '#15803d' : '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {title} ({words.length})
          </h3>
        </button>
        {expanded && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {words.sort((a, b) => a.strongs_id.localeCompare(b.strongs_id)).map((w) => (
              <WordChip key={`${w.strongs_id}-${w.lemma}`} word={w} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ===========================================================================
  // Render
  // ===========================================================================

  return (
    <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '1.5rem' }}>
      {/* Page header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: darkMode ? '#f5f5f4' : '#292524' }}>
          Lexicon
        </h1>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: muted }}>
          Study Greek and Hebrew words with Strong's numbers and morphological analysis.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: `2px solid ${border}` }}>
        {(['search', 'chapter'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.5rem 1.25rem',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: activeTab === tab ? strongsAccent : muted,
              borderBottom: `2px solid ${activeTab === tab ? strongsAccent : 'transparent'}`,
              marginBottom: '-2px',
              textTransform: 'capitalize',
              transition: 'color 0.15s',
            }}
          >
            {tab === 'search' ? "Strong's Lookup" : 'Chapter Words'}
          </button>
        ))}
      </div>

      {/* ================================================================ */}
      {/* Tab 1: Strongs ID Search */}
      {/* ================================================================ */}
      {activeTab === 'search' && (
        <div>
          {/* Search input */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                borderRadius: '10px',
                border: `2px solid ${darkMode ? '#44403c' : '#e7e5e4'}`,
                backgroundColor: surface,
                padding: '0 0.75rem',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2" style={{ flexShrink: 0 }}>
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={strongsQuery}
                onChange={(e) => setStrongsQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleStrongsSearch()}
                placeholder={"Enter Strong's ID (e.g., G1, H7225, G3588)..."}
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  padding: '0.75rem 0',
                  fontSize: '1rem',
                  color: darkMode ? '#f5f5f4' : '#292524',
                  outline: 'none',
                }}
              />
              {strongsQuery && (
                <button
                  onClick={() => { setStrongsQuery(''); setStrongsResult(null); setStrongsError(''); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, display: 'flex', alignItems: 'center', padding: '0.25rem' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
            <button
              onClick={handleStrongsSearch}
              disabled={strongsLoading || !strongsQuery.trim()}
              style={{
                padding: '0.625rem 1.25rem',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: strongsLoading ? (darkMode ? '#3c3a36' : '#d6d3d1') : strongsAccent,
                color: '#fff',
                fontSize: '0.875rem',
                fontWeight: 700,
                cursor: strongsLoading ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s',
              }}
            >
              {strongsLoading ? 'Looking up...' : 'Look Up'}
            </button>
          </div>

          {/* Quick suggestions */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            {[
              { id: 'G3588', label: 'G3588 (ὁ, ἡ, τό)' },
              { id: 'G746', label: 'G746 (ἀρχή)' },
              { id: 'G5207', label: 'G5207 (υἱός)' },
              { id: 'H430', label: 'H430 (אֱלֹהִים)' },
              { id: 'H7225', label: 'H7225 (רֵאשִׁית)' },
              { id: 'H853', label: 'H853 (אֵת)' },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => { setStrongsQuery(s.id); setStrongsResult(null); }}
                style={{
                  padding: '0.25rem 0.625rem',
                  borderRadius: '9999px',
                  border: `1px solid ${border}`,
                  backgroundColor: bg,
                  color: muted,
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Error */}
          {strongsError && (
            <div style={{ padding: '0.875rem', borderRadius: '8px', backgroundColor: darkMode ? '#450a0a' : '#fef2f2', border: `1px solid ${darkMode ? '#7f1d1d' : '#fecaca'}`, marginBottom: '1rem' }}>
              <p style={{ margin: 0, fontSize: '0.875rem', color: darkMode ? '#fca5a5' : '#dc2626' }}>{strongsError}</p>
            </div>
          )}

          {/* Result */}
          {strongsResult && (
            <div
              style={{
                borderRadius: '12px',
                border: `1px solid ${border}`,
                backgroundColor: surface,
                overflow: 'hidden',
              }}
            >
              {/* Strongs ID badge */}
              <div style={{ padding: '1rem 1.25rem', borderBottom: `1px solid ${border}`, backgroundColor: bg }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      padding: '0.25rem 0.75rem',
                      borderRadius: '9999px',
                      backgroundColor: strongsAccent,
                      color: '#fff',
                      fontFamily: 'monospace',
                    }}
                  >
                    {strongsResult.id}
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: muted, textTransform: 'uppercase' }}>
                    {strongsResult.id.startsWith('H') ? 'Hebrew' : 'Greek'}
                  </span>
                </div>
              </div>

              {strongsResult.entry ? (
                <div style={{ padding: '1.25rem' }}>
                  {/* Word display */}
                  <div
                    style={{
                      fontFamily: strongsResult.id.startsWith('H') ? "'Noto Serif Hebrew', serif" : "'Noto Serif', serif",
                      fontSize: '2.5rem',
                      fontWeight: 700,
                      color: strongsResult.id.startsWith('H') ? '#15803d' : '#1d4ed8',
                      direction: strongsResult.id.startsWith('H') ? 'rtl' : 'ltr',
                      textAlign: strongsResult.id.startsWith('H') ? 'right' : 'left',
                      marginBottom: '0.5rem',
                    }}
                  >
                    {strongsResult.entry.word}
                  </div>

                  {/* Transliteration */}
                  {('transliteration' in strongsResult.entry && strongsResult.entry.transliteration) && (
                    <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', fontStyle: 'italic', color: muted }}>
                      Transliteration: {strongsResult.entry.transliteration}
                    </p>
                  )}

                  {/* Pronunciation */}
                  {strongsResult.entry.pronunciation && (
                    <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: muted }}>
                      Pronunciation: {strongsResult.entry.pronunciation}
                    </p>
                  )}

                  {/* Definition */}
                  <div style={{ marginTop: '1rem' }}>
                    <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Definition
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.7, color: darkMode ? '#f5f5f4' : '#292524' }}>
                      {strongsResult.entry.definition || 'No definition available.'}
                    </p>
                  </div>

                  {/* See also */}
                  {strongsResult.entry.see && strongsResult.entry.see.trim() && (
                    <div style={{ marginTop: '1rem' }}>
                      <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        See Also
                      </h4>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: strongsAccent, fontWeight: 600 }}>
                        {strongsResult.entry.see}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center' }}>
                  <p style={{ margin: 0, color: muted, fontSize: '0.9rem' }}>
                    No lexicon entry found for {strongsResult.id}. This Strong's number may not be in the database.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {!strongsResult && !strongsLoading && !strongsError && (
            <div style={{ textAlign: 'center', padding: '2.5rem 0', color: muted }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 0.75rem', opacity: 0.3 }}>
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>Enter a Strong's number above</p>
              <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Greek words start with G (e.g., G1, G3588)</p>
              <p style={{ fontSize: '0.8rem' }}>Hebrew words start with H (e.g., H1, H7225)</p>
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* Tab 2: Chapter Word List */}
      {/* ================================================================ */}
      {activeTab === 'chapter' && (
        <div>
          {/* Book + chapter controls */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: muted, marginBottom: '0.375rem' }}>Book</label>
              <select
                value={chapterBook}
                onChange={(e) => setChapterBook(e.target.value)}
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  border: `1px solid ${border}`,
                  backgroundColor: surface,
                  color: darkMode ? '#f5f5f4' : '#292524',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  minWidth: '12rem',
                }}
              >
                {books.map((b) => (
                  <option key={b.abbreviation} value={b.abbreviation}>{b.full_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: muted, marginBottom: '0.375rem' }}>Chapter</label>
              <input
                type="number"
                min={1}
                max={200}
                value={chapterNum}
                onChange={(e) => setChapterNum(Math.max(1, parseInt(e.target.value) || 1))}
                onKeyDown={(e) => e.key === 'Enter' && loadChapterWords()}
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  border: `1px solid ${border}`,
                  backgroundColor: surface,
                  color: darkMode ? '#f5f5f4' : '#292524',
                  fontSize: '0.85rem',
                  width: '5rem',
                  textAlign: 'center',
                }}
              />
            </div>

            <button
              onClick={loadChapterWords}
              disabled={chapterLoading}
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: chapterLoading ? (darkMode ? '#3c3a36' : '#d6d3d1') : strongsAccent,
                color: '#fff',
                fontSize: '0.875rem',
                fontWeight: 700,
                cursor: chapterLoading ? 'not-allowed' : 'pointer',
              }}
            >
              {chapterLoading ? 'Loading...' : 'Load Words'}
            </button>

            <button
              onClick={() => { setChapterBook(currentBook || 'john'); setChapterNum(currentChapter || 1); }}
              style={{
                padding: '0.5rem 0.875rem',
                borderRadius: '8px',
                border: `1px solid ${border}`,
                backgroundColor: surface,
                color: muted,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              Reset
            </button>
          </div>

          {/* Error */}
          {chapterError && (
            <div style={{ padding: '0.875rem', borderRadius: '8px', backgroundColor: darkMode ? '#450a0a' : '#fef2f2', border: `1px solid ${darkMode ? '#7f1d1d' : '#fecaca'}`, marginBottom: '1rem' }}>
              <p style={{ margin: 0, fontSize: '0.875rem', color: darkMode ? '#fca5a5' : '#dc2626' }}>{chapterError}</p>
            </div>
          )}

          {/* Loading state */}
          {chapterLoading && (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: muted }}>
              <p>Loading original language text...</p>
            </div>
          )}

          {/* Chapter summary */}
          {!chapterLoading && allWords.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.8rem', color: muted }}>
                  {allWords.length} unique words in {chapterBook.toUpperCase()} {chapterNum}
                </span>
                <span style={{ fontSize: '0.8rem', color: '#15803d', fontWeight: 700 }}>
                  {hebrewWords.length} Hebrew
                </span>
                <span style={{ fontSize: '0.8rem', color: '#1d4ed8', fontWeight: 700 }}>
                  {greekWords.length} Greek
                </span>
              </div>

              {/* Verse-by-verse display */}
              {chapterVerses.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Verse Display (click any word)
                  </h3>
                  {chapterVerses.map((verse: VerseWithWords) => {
                    // Determine if Hebrew or Greek majority
                    const words = verse.word_mappings ?? [];
                    const isHebrewMajor = words.length > 0 && words.filter((w: WordMapping) => w.language === 'hebrew').length >= words.filter((w: WordMapping) => w.language === 'greek').length;
                    return (
                      <div
                        key={verse.id}
                        style={{
                          display: 'flex',
                          gap: '0.625rem',
                          alignItems: 'flex-start',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '8px',
                          marginBottom: '0.25rem',
                          backgroundColor: darkMode ? '#1a1a14' : '#fff',
                          border: `1px solid ${border}`,
                        }}
                      >
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: muted, minWidth: '2.5rem', paddingTop: '0.125rem', flexShrink: 0 }}>
                          {verse.verse_num}
                        </span>
                        <span
                          style={{
                            direction: isHebrewMajor ? 'rtl' : 'ltr',
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '0.25rem',
                            alignItems: 'center',
                            flex: 1,
                            fontFamily: isHebrewMajor ? "'Noto Serif Hebrew', serif" : "'Noto Serif', serif",
                            fontSize: '1.25rem',
                            lineHeight: 2,
                          }}
                        >
                          {words.map((w: WordMapping, i: number) => (
                            <button
                              key={`${w.id}-${i}`}
                              onClick={() => handleWordClick(w)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '0.1rem 0.15rem',
                                borderRadius: '3px',
                                fontFamily: w.language === 'hebrew' ? "'Noto Serif Hebrew', serif" : "'Noto Serif', serif",
                                fontSize: '1.25rem',
                                fontWeight: 600,
                                color: w.language === 'hebrew' ? '#15803d' : '#1d4ed8',
                                direction: w.language === 'hebrew' ? 'rtl' : 'ltr',
                                transition: 'background-color 0.1s',
                                position: 'relative',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = darkMode ? '#2a2a20' : '#f5f5dc'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                              title={`${w.original_word} (${w.strongs_id})${w.morphology ? ' · ' + w.morphology : ''}`}
                            >
                              {w.original_word}
                              {w.strongs_id && (
                                <span style={{ fontSize: '0.55rem', position: 'absolute', bottom: '-0.1rem', right: '0.05rem', fontFamily: 'monospace', fontWeight: 700, opacity: 0.6, color: w.language === 'hebrew' ? '#15803d' : '#1d4ed8' }}>
                                  {w.strongs_id}
                                </span>
                              )}
                            </button>
                          ))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Word groups */}
              <div style={{ marginBottom: '1rem' }}>
                <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Unique Words by Language
                </h3>
                {hebrewWords.length > 0 && <WordGroupSection title="Hebrew" words={hebrewWords} language="hebrew" />}
                {greekWords.length > 0 && <WordGroupSection title="Greek" words={greekWords} language="greek" />}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!chapterLoading && allWords.length === 0 && !chapterError && (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: muted }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 0.75rem', opacity: 0.3 }}>
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              {chapterLoaded ? (
                <>
                  <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>No original-language data for {chapterBook} {chapterNum}</p>
                  <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>WLC covers the Hebrew Old Testament; SBLGNT covers the Greek New Testament.</p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>Select a book and chapter above</p>
                  <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Original Hebrew/Greek words will appear here with their Strong's numbers</p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Word detail popup */}
      {selectedWord && (
        <WordDetail
          word={selectedWord}
          strongsEntry={selectedStrongsEntry}
          darkMode={darkMode}
          onClose={() => setSelectedWord(null)}
        />
      )}
    </div>
  );
}
