import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ALL_TRANSLATIONS } from '../components/TranslationSelector';
import { getChapterOriginals, compareVerses, getChapter } from '../lib/tauri';
import type { WordMapping } from '../lib/tauri';

interface VerseRef {
  book: string;
  chapter: number;
  verse: number;
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

const BOOKS = [
  { abbr: 'gen', name: 'Genesis' },
  { abbr: 'exo', name: 'Exodus' },
  { abbr: 'lev', name: 'Leviticus' },
  { abbr: 'num', name: 'Numbers' },
  { abbr: 'deu', name: 'Deuteronomy' },
  { abbr: 'jos', name: 'Joshua' },
  { abbr: 'jdg', name: 'Judges' },
  { abbr: 'rut', name: 'Ruth' },
  { abbr: '1sa', name: '1 Samuel' },
  { abbr: '2sa', name: '2 Samuel' },
  { abbr: '1ki', name: '1 Kings' },
  { abbr: '2ki', name: '2 Kings' },
  { abbr: '1ch', name: '1 Chronicles' },
  { abbr: '2ch', name: '2 Chronicles' },
  { abbr: 'ezr', name: 'Ezra' },
  { abbr: 'neh', name: 'Nehemiah' },
  { abbr: 'est', name: 'Esther' },
  { abbr: 'job', name: 'Job' },
  { abbr: 'psa', name: 'Psalm' },
  { abbr: 'pro', name: 'Proverbs' },
  { abbr: 'ecc', name: 'Ecclesiastes' },
  { abbr: 'sng', name: 'Song of Solomon' },
  { abbr: 'isa', name: 'Isaiah' },
  { abbr: 'jer', name: 'Jeremiah' },
  { abbr: 'lam', name: 'Lamentations' },
  { abbr: 'eze', name: 'Ezekiel' },
  { abbr: 'dan', name: 'Daniel' },
  { abbr: 'hos', name: 'Hosea' },
  { abbr: 'joe', name: 'Joel' },
  { abbr: 'amo', name: 'Amos' },
  { abbr: 'oba', name: 'Obadiah' },
  { abbr: 'jon', name: 'Jonah' },
  { abbr: 'mic', name: 'Micah' },
  { abbr: 'nah', name: 'Nahum' },
  { abbr: 'hab', name: 'Habakkuk' },
  { abbr: 'zep', name: 'Zephaniah' },
  { abbr: 'hag', name: 'Haggai' },
  { abbr: 'zec', name: 'Zechariah' },
  { abbr: 'mal', name: 'Malachi' },
  { abbr: 'mat', name: 'Matthew' },
  { abbr: 'mrk', name: 'Mark' },
  { abbr: 'luk', name: 'Luke' },
  { abbr: 'jhn', name: 'John' },
  { abbr: 'act', name: 'Acts' },
  { abbr: 'rom', name: 'Romans' },
  { abbr: '1co', name: '1 Corinthians' },
  { abbr: '2co', name: '2 Corinthians' },
  { abbr: 'gal', name: 'Galatians' },
  { abbr: 'eph', name: 'Ephesians' },
  { abbr: 'php', name: 'Philippians' },
  { abbr: 'col', name: 'Colossians' },
  { abbr: '1th', name: '1 Thessalonians' },
  { abbr: '2th', name: '2 Thessalonians' },
  { abbr: '1ti', name: '1 Timothy' },
  { abbr: '2ti', name: '2 Timothy' },
  { abbr: 'tit', name: 'Titus' },
  { abbr: 'phm', name: 'Philemon' },
  { abbr: 'heb', name: 'Hebrews' },
  { abbr: 'jas', name: 'James' },
  { abbr: '1pe', name: '1 Peter' },
  { abbr: '2pe', name: '2 Peter' },
  { abbr: '1jn', name: '1 John' },
  { abbr: '2jn', name: '2 John' },
  { abbr: '3jn', name: '3 John' },
  { abbr: 'jud', name: 'Jude' },
  { abbr: 'rev', name: 'Revelation' },
];

interface useCompareDataResult {
  rows: CompareRow[];
  loading: boolean;
  verseCount: number;
}

function useCompareData(ref: VerseRef, translations: string[]): useCompareDataResult {
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [verseCount, setVerseCount] = useState(30);

  useEffect(() => {
    if (translations.length === 0) {
      setRows([]);
      setVerseCount(0);
      return;
    }
    setLoading(true);
    compareVerses(ref.book, ref.chapter, ref.verse, translations)
      .then((result) => {
        const verses: CompareVerse[] = result.translations.map((v) => ({
          translation: v.translation_abbreviation ?? '',
          text: v.text,
        }));
        setRows([{ verseNum: result.verse_num, verses }]);
        setLoading(false);
      })
      .catch(() => {
        setRows([]);
        setLoading(false);
      });
  }, [ref.book, ref.chapter, ref.verse, translations.join(',')]);

  // Load verse count when book/chapter changes
  useEffect(() => {
    if (translations.length > 0) {
      getChapter(ref.book, ref.chapter, [translations[0]]).then((groups) => {
        setVerseCount(groups.length);
      }).catch(() => {});
    }
  }, [ref.book, ref.chapter]);

  return { rows, loading, verseCount };
}

// ============================================================================
// Morphology Parsing (reused from Lexicon.tsx)
// ============================================================================

interface MorphologyPart {
  label: string;
  value: string;
}

const GREEK_PART_OF_SPEECH: Record<string, string> = {
  N: 'Noun', V: 'Verb', A: 'Adjective', D: 'Adverb', P: 'Preposition',
  C: 'Conjunction', X: 'Article', I: 'Interjection', R: 'Pronoun', 'S': 'Substantive',
};

const GREEK_CASE: Record<string, string> = { N: 'Nom.', G: 'Gen.', D: 'Dat.', A: 'Acc.', V: 'Voc.' };
const GREEK_NUMBER: Record<string, string> = { S: 'Sg.', P: 'Pl.' };
const GREEK_GENDER: Record<string, string> = { M: 'Masc.', F: 'Fem.', N: 'Neut.' };
const GREEK_PERSON: Record<string, string> = { '1': '1st', '2': '2nd', '3': '3rd' };
const GREEK_TENSE: Record<string, string> = { P: 'Pres.', I: 'Imperf.', F: 'Fut.', A: 'Aor.', E: 'Perf.', L: 'Plupf.', R: 'Perf.', X: 'No tense' };
const GREEK_VOICE: Record<string, string> = { A: 'Act.', M: 'Mid.', P: 'Pass.', D: 'Mid./Pass.', O: 'Mid.', N: 'Pass.' };
const GREEK_MOOD: Record<string, string> = { I: 'Ind.', D: 'Imp.', S: 'Subj.', O: 'Opt.', N: 'Inf.', P: 'Ptc.' };

const HEBREW_PART_OF_SPEECH: Record<string, string> = {
  N: 'Noun', V: 'Verb', A: 'Adj.', D: 'Adv.', P: 'Prep.',
  C: 'Conj.', R: 'Pron.', I: 'Interj.',
};

const HEBREW_NUMBER: Record<string, string> = { S: 'Sg.', P: 'Pl.' };
const HEBREW_GENDER: Record<string, string> = { M: 'Masc.', F: 'Fem.' };
const HEBREW_PERSON: Record<string, string> = { '1': '1st', '2': '2nd', '3': '3rd' };

function parseGreekMorphology(tag: string): MorphologyPart[] {
  if (!tag) return [];
  const parts: MorphologyPart[] = [];
  let rest = tag;
  const pos = rest.charAt(0);
  if (GREEK_PART_OF_SPEECH[pos]) {
    parts.push({ label: 'POS', value: GREEK_PART_OF_SPEECH[pos] });
    rest = rest.slice(1);
  }
  let idx = 0;
  const s = rest;
  if (idx < s.length && '123'.includes(s[idx])) {
    const p = GREEK_PERSON[s[idx]];
    if (p) { parts.push({ label: 'Pers.', value: p }); idx++; }
  }
  if (idx < s.length && 'SP'.includes(s[idx])) {
    const n = GREEK_NUMBER[s[idx]];
    if (n) { parts.push({ label: 'Num.', value: n }); idx++; }
  }
  if (idx < s.length && 'MFN'.includes(s[idx])) {
    const g = GREEK_GENDER[s[idx]];
    if (g) { parts.push({ label: 'Gen.', value: g }); idx++; }
  }
  if (idx < s.length && 'NGDAV'.includes(s[idx])) {
    const c = GREEK_CASE[s[idx]];
    if (c) { parts.push({ label: 'Case', value: c }); idx++; }
  }
  if (parts.length === 1 || (parts[0]?.label === 'POS' && ['V', 'X'].includes(pos))) {
    const rem = s.slice(idx);
    if (rem.length > 0) {
      const t = GREEK_TENSE[rem[0]];
      if (t) { parts.push({ label: 'Tense', value: t }); idx++; }
    }
    if (idx < rem.length) {
      const v = GREEK_VOICE[rem[idx]];
      if (v) { parts.push({ label: 'Voice', value: v }); idx++; }
    }
    if (idx < rem.length) {
      const m = GREEK_MOOD[rem[idx]];
      if (m) { parts.push({ label: 'Mood', value: m }); idx++; }
    }
  }
  return parts;
}

function parseHebrewMorphology(tag: string): MorphologyPart[] {
  if (!tag) return [];
  const parts: MorphologyPart[] = [];
  let rest = tag;
  const pos = rest.charAt(0);
  if (HEBREW_PART_OF_SPEECH[pos]) {
    parts.push({ label: 'POS', value: HEBREW_PART_OF_SPEECH[pos] });
    rest = rest.slice(1);
  }
  const s = rest;
  let idx = 0;
  if (idx < s.length && 'QqNnDdPpHhOoTt'.includes(s[idx])) {
    const stemMap: Record<string, string> = {
      Q: 'Qal', q: 'Qal', N: 'Niph.', n: 'Niph.',
      D: 'Piel', d: 'Piel', P: 'Pual', p: 'Pual',
      H: 'Hiph.', h: 'Hiph.', O: 'Hoph.', o: 'Hoph.',
      T: 'Hith.', t: 'Hith.',
    };
    const stem = stemMap[s[idx]];
    if (stem) { parts.push({ label: 'Stem', value: stem }); idx++; }
  }
  if (idx < s.length && '123'.includes(s[idx])) {
    const p = HEBREW_PERSON[s[idx]];
    if (p) { parts.push({ label: 'Pers.', value: p }); idx++; }
  }
  if (idx < s.length && 'SPsp'.includes(s[idx])) {
    const n = HEBREW_NUMBER[s[idx].toUpperCase()];
    if (n) { parts.push({ label: 'Num.', value: n }); idx++; }
  }
  if (idx < s.length && 'MFmf'.includes(s[idx])) {
    const g = HEBREW_GENDER[s[idx].toUpperCase()];
    if (g) { parts.push({ label: 'Gen.', value: g }); idx++; }
  }
  if (idx < s.length && 'NGDAVngdav'.includes(s[idx])) {
    const c = GREEK_CASE[s[idx].toUpperCase()];
    if (c) { parts.push({ label: 'Case', value: c }); idx++; }
  }
  return parts;
}

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
      {tooltip && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: Math.max(8, tooltip.pos.top - 10),
            left: Math.min(tooltip.pos.left, window.innerWidth - 280),
            zIndex: 100,
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
            Click elsewhere to close
          </div>
        </div>
      )}
    </div>
  );
}

export default function Compare() {
  const { darkMode, currentBook, currentChapter } = useAppStore();
  const columnRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const [book, setBook] = useState(currentBook || 'jhn');
  const [chapter, setChapter] = useState(currentChapter || 3);
  const [verse, setVerse] = useState(1);
  const [selectedTranslations, setSelectedTranslations] = useState<string[]>(['KJV', 'NKJV', 'ESV']);
  const [copied, setCopied] = useState(false);
  const [originalWords, setOriginalWords] = useState<OriginalVerseWords[]>([]);

  const { rows, loading, verseCount } = useCompareData({ book, chapter, verse }, selectedTranslations);

  // Load original language words when OSHB or SBLGNT is selected
  useEffect(() => {
    const hasOriginal = selectedTranslations.some(t => t.toLowerCase() === 'oshb' || t.toLowerCase() === 'sblgnt');
    if (!hasOriginal) {
      setOriginalWords([]);
      return;
    }

    getChapterOriginals(book, chapter).then((verses) => {
      const words: OriginalVerseWords[] = verses.map(v => ({
        verseNum: v.verse_num,
        translation: v.translation_abbreviation ?? '',
        words: (v as any).word_mappings ?? [],
      }));
      setOriginalWords(words);
    });
  }, [book, chapter, selectedTranslations.join(',')]);

  const handleCopyRef = () => {
    const bookObj = BOOKS.find((b) => b.abbr === book);
    const label = `${bookObj?.name ?? book} ${chapter}:${verse}`;
    navigator.clipboard.writeText(label).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

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
            {BOOKS.map((b) => (
              <option key={b.abbr} value={b.abbr}>{b.name}</option>
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

      {/* Synced comparison grid */}
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
  );
}