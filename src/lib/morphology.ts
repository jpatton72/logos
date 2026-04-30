// Greek + Hebrew morphology parsing helpers shared by every component
// that displays per-word linguistic info (Reader, Compare, Lexicon,
// SearchResults, Strong's sidebar). Previously each file kept its own
// near-identical copy of these tables and parser, with subtle
// abbreviation differences ("Nominative" vs "Nom.").

export interface MorphologyPart {
  label: string;
  value: string;
}

// ---------------------------------------------------------------------------
// Greek tag tables
// ---------------------------------------------------------------------------

export const GREEK_PART_OF_SPEECH: Record<string, string> = {
  N: 'Noun',
  V: 'Verb',
  A: 'Adjective',
  D: 'Adverb',
  P: 'Preposition',
  C: 'Conjunction',
  X: 'Article',
  I: 'Interjection',
  R: 'Pronoun',
  S: 'Substantive',
};

export const GREEK_CASE: Record<string, string> = {
  N: 'Nominative',
  G: 'Genitive',
  D: 'Dative',
  A: 'Accusative',
  V: 'Vocative',
};

export const GREEK_NUMBER: Record<string, string> = { S: 'Singular', P: 'Plural' };
export const GREEK_GENDER: Record<string, string> = { M: 'Masculine', F: 'Feminine', N: 'Neuter' };
export const GREEK_PERSON: Record<string, string> = { '1': '1st', '2': '2nd', '3': '3rd' };

export const GREEK_TENSE: Record<string, string> = {
  P: 'Present',
  I: 'Imperfect',
  F: 'Future',
  A: 'Aorist',
  E: 'Perfect',
  L: 'Pluperfect',
  R: 'Perf.',
  X: 'No tense',
};

export const GREEK_VOICE: Record<string, string> = {
  A: 'Active',
  M: 'Middle',
  P: 'Passive',
  D: 'Mid./Pass.',
  O: 'Middle',
  N: 'Passive',
};

export const GREEK_MOOD: Record<string, string> = {
  I: 'Indic.',
  D: 'Imper.',
  S: 'Subj.',
  O: 'Opt.',
  N: 'Infin.',
  P: 'Partic.',
};

// ---------------------------------------------------------------------------
// Hebrew tag tables
// ---------------------------------------------------------------------------

export const HEBREW_PART_OF_SPEECH: Record<string, string> = {
  N: 'Noun',
  V: 'Verb',
  A: 'Adjective',
  D: 'Adverb',
  P: 'Preposition',
  C: 'Conjunction',
  R: 'Pronoun',
  I: 'Interjection',
};

export const HEBREW_NUMBER: Record<string, string> = { S: 'Singular', P: 'Plural' };
export const HEBREW_GENDER: Record<string, string> = { M: 'Masculine', F: 'Feminine' };
export const HEBREW_PERSON: Record<string, string> = { '1': '1st', '2': '2nd', '3': '3rd' };

const HEBREW_STEMS: Record<string, string> = {
  Q: 'Qal',
  q: 'Qal',
  N: 'Niphal',
  n: 'Niphal',
  D: 'Piel',
  d: 'Piel',
  P: 'Pual',
  p: 'Pual',
  H: 'Hiphil',
  h: 'Hiphil',
  O: 'Hophal',
  o: 'Hophal',
  T: 'Hithpael',
  t: 'Hithpael',
};

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

export function parseGreekMorphology(tag: string): MorphologyPart[] {
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
    if (p) parts.push({ label: 'Person', value: p });
    idx++;
  }

  if (idx < s.length && 'SP'.includes(s[idx])) {
    const n = GREEK_NUMBER[s[idx]];
    if (n) parts.push({ label: 'Number', value: n });
    idx++;
  }

  if (idx < s.length && 'MFN'.includes(s[idx])) {
    const g = GREEK_GENDER[s[idx]];
    if (g) parts.push({ label: 'Gender', value: g });
    idx++;
  }

  if (idx < s.length && 'NGDAV'.includes(s[idx])) {
    const c = GREEK_CASE[s[idx]];
    if (c) parts.push({ label: 'Case', value: c });
    idx++;
  }

  // Verbs: tense / voice / mood follow the same trail of single chars.
  if (parts.length === 1 || (parts[0]?.label === 'POS' && ['V', 'X'].includes(pos))) {
    const rem = s.slice(idx);
    if (rem.length > 0) {
      const t = GREEK_TENSE[rem[0]];
      if (t) {
        parts.push({ label: 'Tense', value: t });
        idx++;
      }
    }
    if (idx < rem.length) {
      const v = GREEK_VOICE[rem[idx]];
      if (v) {
        parts.push({ label: 'Voice', value: v });
        idx++;
      }
    }
    if (idx < rem.length) {
      const m = GREEK_MOOD[rem[idx]];
      if (m) {
        parts.push({ label: 'Mood', value: m });
        idx++;
      }
    }
  }

  return parts;
}

export function parseHebrewMorphology(tag: string): MorphologyPart[] {
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
    const stem = HEBREW_STEMS[s[idx]];
    if (stem) {
      parts.push({ label: 'Stem', value: stem });
      idx++;
    }
  }

  if (idx < s.length && '123'.includes(s[idx])) {
    const p = HEBREW_PERSON[s[idx]];
    if (p) {
      parts.push({ label: 'Person', value: p });
      idx++;
    }
  }

  if (idx < s.length && 'SPsp'.includes(s[idx])) {
    const n = HEBREW_NUMBER[s[idx].toUpperCase()];
    if (n) {
      parts.push({ label: 'Number', value: n });
      idx++;
    }
  }

  if (idx < s.length && 'MFmf'.includes(s[idx])) {
    const g = HEBREW_GENDER[s[idx].toUpperCase()];
    if (g) {
      parts.push({ label: 'Gender', value: g });
      idx++;
    }
  }

  if (idx < s.length && 'NGDAVngdav'.includes(s[idx])) {
    const c = GREEK_CASE[s[idx].toUpperCase()];
    if (c) {
      parts.push({ label: 'Case', value: c });
      idx++;
    }
  }

  return parts;
}

export function formatMorphologyParts(parts: MorphologyPart[]): string {
  return parts.map((p) => p.value).join(', ');
}
