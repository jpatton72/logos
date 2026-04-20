// mockData.ts — static fallback data used when Tauri backend is unavailable
// Types come from ../lib/tauri.ts (imported via api/index.ts for consumers)
// MOCK_BOOKS uses 'OT'/'NT' testament values (uppercase) for UI compatibility

import type { Book } from '../lib/tauri';

export const MOCK_BOOKS: Book[] = [
  { id: 1, abbreviation: 'gen', full_name: 'Genesis', testament: 'OT', genre: 'Law', order_index: 1 },
  { id: 2, abbreviation: 'exod', full_name: 'Exodus', testament: 'OT', genre: 'Law', order_index: 2 },
  { id: 3, abbreviation: 'lev', full_name: 'Leviticus', testament: 'OT', genre: 'Law', order_index: 3 },
  { id: 4, abbreviation: 'num', full_name: 'Numbers', testament: 'OT', genre: 'Law', order_index: 4 },
  { id: 5, abbreviation: 'deut', full_name: 'Deuteronomy', testament: 'OT', genre: 'Law', order_index: 5 },
  { id: 6, abbreviation: 'josh', full_name: 'Joshua', testament: 'OT', genre: 'Historical', order_index: 6 },
  { id: 7, abbreviation: 'judg', full_name: 'Judges', testament: 'OT', genre: 'Historical', order_index: 7 },
  { id: 8, abbreviation: 'ruth', full_name: 'Ruth', testament: 'OT', genre: 'Historical', order_index: 8 },
  { id: 9, abbreviation: '1sam', full_name: '1 Samuel', testament: 'OT', genre: 'Historical', order_index: 9 },
  { id: 10, abbreviation: '2sam', full_name: '2 Samuel', testament: 'OT', genre: 'Historical', order_index: 10 },
  { id: 11, abbreviation: '1kgs', full_name: '1 Kings', testament: 'OT', genre: 'Historical', order_index: 11 },
  { id: 12, abbreviation: '2kgs', full_name: '2 Kings', testament: 'OT', genre: 'Historical', order_index: 12 },
  { id: 13, abbreviation: '1chr', full_name: '1 Chronicles', testament: 'OT', genre: 'Historical', order_index: 13 },
  { id: 14, abbreviation: '2chr', full_name: '2 Chronicles', testament: 'OT', genre: 'Historical', order_index: 14 },
  { id: 15, abbreviation: 'ezra', full_name: 'Ezra', testament: 'OT', genre: 'Historical', order_index: 15 },
  { id: 16, abbreviation: 'neh', full_name: 'Nehemiah', testament: 'OT', genre: 'Historical', order_index: 16 },
  { id: 17, abbreviation: 'est', full_name: 'Esther', testament: 'OT', genre: 'Historical', order_index: 17 },
  { id: 18, abbreviation: 'job', full_name: 'Job', testament: 'OT', genre: 'Wisdom', order_index: 18 },
  { id: 19, abbreviation: 'ps', full_name: 'Psalms', testament: 'OT', genre: 'Wisdom', order_index: 19 },
  { id: 20, abbreviation: 'prov', full_name: 'Proverbs', testament: 'OT', genre: 'Wisdom', order_index: 20 },
  { id: 21, abbreviation: 'eccl', full_name: 'Ecclesiastes', testament: 'OT', genre: 'Wisdom', order_index: 21 },
  { id: 22, abbreviation: 'song', full_name: 'Song of Solomon', testament: 'OT', genre: 'Wisdom', order_index: 22 },
  { id: 23, abbreviation: 'isa', full_name: 'Isaiah', testament: 'OT', genre: 'Prophets', order_index: 23 },
  { id: 24, abbreviation: 'jer', full_name: 'Jeremiah', testament: 'OT', genre: 'Prophets', order_index: 24 },
  { id: 25, abbreviation: 'lam', full_name: 'Lamentations', testament: 'OT', genre: 'Prophets', order_index: 25 },
  { id: 26, abbreviation: 'ezek', full_name: 'Ezekiel', testament: 'OT', genre: 'Prophets', order_index: 26 },
  { id: 27, abbreviation: 'dan', full_name: 'Daniel', testament: 'OT', genre: 'Prophets', order_index: 27 },
  { id: 28, abbreviation: 'hosea', full_name: 'Hosea', testament: 'OT', genre: 'Prophets', order_index: 28 },
  { id: 29, abbreviation: 'joel', full_name: 'Joel', testament: 'OT', genre: 'Prophets', order_index: 29 },
  { id: 30, abbreviation: 'amos', full_name: 'Amos', testament: 'OT', genre: 'Prophets', order_index: 30 },
  { id: 31, abbreviation: 'obad', full_name: 'Obadiah', testament: 'OT', genre: 'Prophets', order_index: 31 },
  { id: 32, abbreviation: 'jonah', full_name: 'Jonah', testament: 'OT', genre: 'Prophets', order_index: 32 },
  { id: 33, abbreviation: 'mic', full_name: 'Micah', testament: 'OT', genre: 'Prophets', order_index: 33 },
  { id: 34, abbreviation: 'nah', full_name: 'Nahum', testament: 'OT', genre: 'Prophets', order_index: 34 },
  { id: 35, abbreviation: 'hab', full_name: 'Habakkuk', testament: 'OT', genre: 'Prophets', order_index: 35 },
  { id: 36, abbreviation: 'zeph', full_name: 'Zephaniah', testament: 'OT', genre: 'Prophets', order_index: 36 },
  { id: 37, abbreviation: 'hag', full_name: 'Haggai', testament: 'OT', genre: 'Prophets', order_index: 37 },
  { id: 38, abbreviation: 'zech', full_name: 'Zechariah', testament: 'OT', genre: 'Prophets', order_index: 38 },
  { id: 39, abbreviation: 'mal', full_name: 'Malachi', testament: 'OT', genre: 'Prophets', order_index: 39 },
  { id: 40, abbreviation: 'matt', full_name: 'Matthew', testament: 'NT', genre: 'Gospel', order_index: 40 },
  { id: 41, abbreviation: 'mark', full_name: 'Mark', testament: 'NT', genre: 'Gospel', order_index: 41 },
  { id: 42, abbreviation: 'luke', full_name: 'Luke', testament: 'NT', genre: 'Gospel', order_index: 42 },
  { id: 43, abbreviation: 'john', full_name: 'John', testament: 'NT', genre: 'Gospel', order_index: 43 },
  { id: 44, abbreviation: 'acts', full_name: 'Acts', testament: 'NT', genre: 'History', order_index: 44 },
  { id: 45, abbreviation: 'rom', full_name: 'Romans', testament: 'NT', genre: 'Epistle', order_index: 45 },
  { id: 46, abbreviation: '1cor', full_name: '1 Corinthians', testament: 'NT', genre: 'Epistle', order_index: 46 },
  { id: 47, abbreviation: '2cor', full_name: '2 Corinthians', testament: 'NT', genre: 'Epistle', order_index: 47 },
  { id: 48, abbreviation: 'gal', full_name: 'Galatians', testament: 'NT', genre: 'Epistle', order_index: 48 },
  { id: 49, abbreviation: 'eph', full_name: 'Ephesians', testament: 'NT', genre: 'Epistle', order_index: 49 },
  { id: 50, abbreviation: 'phil', full_name: 'Philippians', testament: 'NT', genre: 'Epistle', order_index: 50 },
  { id: 51, abbreviation: 'col', full_name: 'Colossians', testament: 'NT', genre: 'Epistle', order_index: 51 },
  { id: 52, abbreviation: '1thess', full_name: '1 Thessalonians', testament: 'NT', genre: 'Epistle', order_index: 52 },
  { id: 53, abbreviation: '2thess', full_name: '2 Thessalonians', testament: 'NT', genre: 'Epistle', order_index: 53 },
  { id: 54, abbreviation: '1tim', full_name: '1 Timothy', testament: 'NT', genre: 'Epistle', order_index: 54 },
  { id: 55, abbreviation: '2tim', full_name: '2 Timothy', testament: 'NT', genre: 'Epistle', order_index: 55 },
  { id: 56, abbreviation: 'titus', full_name: 'Titus', testament: 'NT', genre: 'Epistle', order_index: 56 },
  { id: 57, abbreviation: 'phlm', full_name: 'Philemon', testament: 'NT', genre: 'Epistle', order_index: 57 },
  { id: 58, abbreviation: 'heb', full_name: 'Hebrews', testament: 'NT', genre: 'Epistle', order_index: 58 },
  { id: 59, abbreviation: 'jas', full_name: 'James', testament: 'NT', genre: 'Epistle', order_index: 59 },
  { id: 60, abbreviation: '1pet', full_name: '1 Peter', testament: 'NT', genre: 'Epistle', order_index: 60 },
  { id: 61, abbreviation: '2pet', full_name: '2 Peter', testament: 'NT', genre: 'Epistle', order_index: 61 },
  { id: 62, abbreviation: '1john', full_name: '1 John', testament: 'NT', genre: 'Epistle', order_index: 62 },
  { id: 63, abbreviation: '2john', full_name: '2 John', testament: 'NT', genre: 'Epistle', order_index: 63 },
  { id: 64, abbreviation: '3john', full_name: '3 John', testament: 'NT', genre: 'Epistle', order_index: 64 },
  { id: 65, abbreviation: 'jude', full_name: 'Jude', testament: 'NT', genre: 'Epistle', order_index: 65 },
  { id: 66, abbreviation: 'rev', full_name: 'Revelation', testament: 'NT', genre: 'Apocalyptic', order_index: 66 },
];

export const MOCK_CHAPTER_COUNTS: Record<string, number> = {
  gen: 50, exod: 40, lev: 27, num: 36, deut: 34, josh: 24, judg: 21, ruth: 4,
  '1sam': 31, '2sam': 24, '1kgs': 22, '2kgs': 25, '1chr': 29, '2chr': 36, ezra: 10, neh: 13,
  est: 10, job: 42, ps: 150, prov: 31, eccl: 12, song: 8, isa: 66, jer: 52,
  lam: 5, ezek: 48, dan: 12, hosea: 14, joel: 3, amos: 9, obad: 1, jonah: 4,
  mic: 7, nah: 3, hab: 3, zeph: 3, hag: 2, zech: 14, mal: 4, matt: 28, mark: 16,
  luke: 24, john: 21, acts: 28, rom: 16, '1cor': 16, '2cor': 13, gal: 6, eph: 6,
  phil: 4, col: 4, '1thess': 5, '2thess': 3, '1tim': 6, '2tim': 4, titus: 3, phlm: 1,
  heb: 13, jas: 5, '1pet': 5, '2pet': 3, '1john': 5, '2john': 1, '3john': 1, jude: 1, rev: 22,
};

// Genesis 1:1-3 real text
const gen1real: Record<number, Record<string, string>> = {
  1: {
    KJV: 'In the beginning God created the heaven and the earth.',
    NKJV: 'In the beginning God created the heavens and the earth.',
    ESV: 'In the beginning, God created the heavens and the earth.',
  },
  2: {
    KJV: 'And the earth was without form, and void; and darkness was upon the face of the deep. And the Spirit of God moved upon the face of the waters.',
    NKJV: 'The earth was without form, and void; and darkness was on the face of the deep. And the Spirit of God was hovering over the face of the waters.',
    ESV: 'The earth was without form and void, and darkness was over the face of the deep. And the Spirit of God was hovering over the face of the waters.',
  },
  3: {
    KJV: 'And God said, Let there be light: and there was light.',
    NKJV: 'Then God said, "Let there be light"; and there was light.',
    ESV: 'And God said, "Let there be light." And there was light.',
  },
  4: { KJV: 'And God saw the light, that it was good: and God divided the light from the darkness.', NKJV: 'And God saw the light, that it was good; and God divided the light from the darkness.', ESV: 'And God saw that the light was good. And God separated the light from the darkness.' },
  5: { KJV: 'And God called the light Day, and the darkness he called Night. And the evening and the morning were the first day.', NKJV: 'God called the light Day, and the darkness He called Night. So the evening and the morning were the first day.', ESV: 'God called the light Day, and the darkness He called Night. And there was evening and there was morning, the first day.' },
  6: { KJV: 'And God said, Let there be a firmament in the midst of the waters, and let it divide the waters from the waters.', NKJV: 'Then God said, "Let there be a firmament in the midst of the waters, and let it divide the waters from the waters."', ESV: 'And God said, "Let there be an expanse in the midst of the waters, and let it separate the waters from the waters."' },
  7: { KJV: 'And God made the firmament, and divided the waters which were under the firmament from the waters which were above the firmament: and it was so.', NKJV: 'Thus God made the firmament, and divided the waters which were under the firmament from the waters which were above the firmament; and it was so.', ESV: 'And God made the expanse and divided the waters under the expanse from the waters above the expanse. And it was so.' },
  8: { KJV: 'And God called the firmament Heaven. And the evening and the morning were the second day.', NKJV: 'And God called the firmament Heaven. Then the evening and the morning were the second day.', ESV: 'And God called the expanse Heaven. And there was evening and there was morning, the second day.' },
  9: { KJV: 'And God said, Let the waters under the heaven be gathered together unto one place, and let the dry land appear: and it was so.', NKJV: 'Then God said, "Let the waters under the heavens be gathered together into one place, and let the dry land appear"; and it was so.', ESV: 'And God said, "Let the waters under the heavens be gathered together into one place, and let the dry land appear." And it was so.' },
  10: { KJV: 'And God called the dry land Earth; and the gathering together of the waters called he Seas: and God saw that it was good.', NKJV: 'And God called the dry land Earth, and the gathering together of the waters He called Seas. And God saw that it was good.', ESV: 'And God called the dry land Earth, and the gathering together of the waters He called Seas. And God saw that it was good.' },
  11: { KJV: 'And God said, Let the earth bring forth grass, the herb yielding seed, and the fruit tree yielding fruit after his kind, whose seed is in itself, after his kind: and God saw that it was good.', NKJV: 'Then God said, "Let the earth bring forth grass, the herb yielding seed after its kind, the tree that bears fruit with the seed in it according to its kind." And God saw that it was good.', ESV: 'And God said, "Let the earth bring forth vegetation, plants yielding seed after their kind, and trees bearing fruit with seed in them according to their kind." And God saw that it was good.' },
  12: { KJV: 'And the evening and the morning were the third day.', NKJV: 'So the evening and the morning were the third day.', ESV: 'And there was evening and there was morning, the third day.' },
};

for (let v = 13; v <= 31; v++) {
  const verb = v === 13 || v === 19 || v === 25 ? 'made' : 'said';
  gen1real[v] = {
    KJV: `And God ${verb} the lights in the firmament of heaven to divide the day from the night.`,
    NKJV: `Then God made two great lights: the greater light to rule the day and the lesser light to rule the night.`,
    ESV: `And God made the two great lights—the greater light to rule the day and the lesser light to rule the night—to separate the light from the darkness.`,
  };
}

export { gen1real as MOCK_GENESIS_CHAPTER_1 };

export const MOCK_SEARCH_RESULTS = [
  { verse_id: 1, book_abbreviation: 'gen', chapter: 1, verse_num: 1, text: 'In the beginning God created the heaven and the earth.', translation_abbreviation: 'KJV', rank: 1.0 },
  { verse_id: 1002, book_abbreviation: 'john', chapter: 1, verse_num: 1, text: 'In the beginning was the Word, and the Word was with God, and the Word was God.', translation_abbreviation: 'KJV', rank: 0.95 },
  { verse_id: 5001, book_abbreviation: 'ps', chapter: 33, verse_num: 6, text: 'By the word of the LORD were the heavens made; and all the host of them by the breath of his mouth.', translation_abbreviation: 'KJV', rank: 0.8 },
  { verse_id: 5010, book_abbreviation: 'ps', chapter: 119, verse_num: 105, text: 'Thy word is a lamp unto my feet, and a light unto my path.', translation_abbreviation: 'KJV', rank: 0.75 },
];

export const MOCK_STRONGS_GREEK: Record<string, object> = {
  'G5206': { id: 'G5206', strongs_id: 'G5206', greek_word: 'υἱός', transliteration: 'huios', pronunciation: 'hwee-os', definition: 'a son (used very widely of near, lateral relationship, and by implication inventor); in a limited sense, an offspring, a male descendant — son, child', part_of_speech: 'Noun', derivation: 'apparently a primary word', kjv_lemma: 'son' },
  'G746': { id: 'G746', strongs_id: 'G746', greek_word: 'ἀρχή', transliteration: 'arche', pronunciation: 'ar-khay', definition: 'commencement, or (concretely) first (in place, time, order, or importance): — beginning, chief', part_of_speech: 'Noun', derivation: 'from G756', kjv_lemma: 'beginning' },
  'G3056': { id: 'G3056', strongs_id: 'G3056', greek_word: 'λόγος', transliteration: 'logos', pronunciation: 'log-os', definition: 'word (as uttered by the living voice), i.e. divine utterance or the Gospel — discourse, doctrine, matter, speech, word', part_of_speech: 'Noun', derivation: 'from G3004', kjv_lemma: 'word' },
  'G25': { id: 'G25', strongs_id: 'G25', greek_word: 'ἀγαπάω', transliteration: 'agapao', pronunciation: 'ag-ap-ah-o', definition: 'to love (in a social or moral sense): — love', part_of_speech: 'Verb', derivation: 'from G1 (as a base)', kjv_lemma: 'to love' },
};

export const MOCK_STRONGS_HEBREW: Record<string, object> = {
  'H430': { id: 'H430', strongs_id: 'H430', hebrew_word: 'אֱלֹהִים', transliteration: 'elohiym', pronunciation: 'el-o-heem', definition: 'gods (as object of worship), magistrates, or super-human beings including the angels; also God', part_of_speech: 'Noun masculine plural', derivation: 'plural of H433', kjv_lemma: 'god(s)' },
  'H7225': { id: 'H7225', strongs_id: 'H7225', hebrew_word: 'רֵאשִׁית', transliteration: 'reshith', pronunciation: 'ray-sheeth', definition: 'first, in place, time, order or dignity — beginning, first, chief', part_of_speech: 'Noun feminine', derivation: 'from H7218', kjv_lemma: 'beginning' },
  'H1254': { id: 'H1254', strongs_id: 'H1254', hebrew_word: 'בָּרָא', transliteration: 'bara', pronunciation: 'baw-raw', definition: 'to create — create, make', part_of_speech: 'Verb', derivation: 'a primitive root', kjv_lemma: 'to create' },
  'H853': { id: 'H853', strongs_id: 'H853', hebrew_word: 'אֵת', transliteration: 'eth', pronunciation: 'ayth', definition: 'properly, self, i.e. this or these — this, these', part_of_speech: 'Particle', derivation: 'apparently contracted from H226', kjv_lemma: 'object marker' },
  'H8064': { id: 'H8064', strongs_id: 'H8064', hebrew_word: 'שָּׁמַיִם', transliteration: 'shamayim', pronunciation: 'shaw-mah-yim', definition: 'the sky (as vaulted over the earth) — heaven, heavens, sky', part_of_speech: 'Noun masculine dual', derivation: 'from an unused root meaning to be lofty', kjv_lemma: 'heaven(s)' },
  'H776': { id: 'H776', strongs_id: 'H776', hebrew_word: 'אָרֶץ', transliteration: 'erets', pronunciation: "eh'-rets", definition: 'the earth (as standing out from a world) — earth, field, ground, land, world', part_of_speech: 'Noun feminine', derivation: 'from an unused root meaning to be firm', kjv_lemma: 'earth, land' },
};

export const MOCK_WORD_MAPPINGS: Record<number, object[]> = {
  1: [
    { id: 1, verse_id: 1, word_index: 0, strongs_id: 'H7225', original_word: 'בְּרֵאשִׁית', lemma: 'רֵאשִׁית', morphology: 'N-fsc', language: 'hebrew' },
    { id: 2, verse_id: 1, word_index: 1, strongs_id: 'H1254', original_word: 'בָּרָא', lemma: 'בָּרָא', morphology: 'V-Qal-Perf-3ms', language: 'hebrew' },
    { id: 3, verse_id: 1, word_index: 2, strongs_id: 'H430', original_word: 'אֱלֹהִים', lemma: 'אֱלֹהִים', morphology: 'N-mp', language: 'hebrew' },
    { id: 4, verse_id: 1, word_index: 3, strongs_id: 'H853', original_word: 'אֵת', lemma: 'אֵת', morphology: 'ObjMark', language: 'hebrew' },
    { id: 5, verse_id: 1, word_index: 4, strongs_id: 'H8064', original_word: 'הַשָּׁמַיִם', lemma: 'שָּׁמַיִם', morphology: 'N-mp-Sd', language: 'hebrew' },
    { id: 6, verse_id: 1, word_index: 5, strongs_id: 'H853', original_word: 'וְאֵת', lemma: 'אֵת', morphology: 'ConjObjMark', language: 'hebrew' },
    { id: 7, verse_id: 1, word_index: 6, strongs_id: 'H776', original_word: 'הָאָרֶץ', lemma: 'אֶרֶץ', morphology: 'N-fsc-Sd', language: 'hebrew' },
  ],
};

export const MOCK_TERM_RESULTS = [
  { term: 'beginning', verse_count: 89 },
  { term: 'love', verse_count: 310 },
  { term: 'faith', verse_count: 245 },
  { term: 'righteousness', verse_count: 175 },
];

export const MOCK_BOOKMARKS = [
  { id: 1, verse_id: 1, label: 'Creation', book_abbreviation: 'gen', chapter: 1, verse_num: 1, text: 'In the beginning God created the heaven and the earth.', translation_abbreviation: 'KJV', created_at: '2024-01-15T10:30:00Z' },
  { id: 2, verse_id: 1002, label: 'John 1:1', book_abbreviation: 'john', chapter: 1, verse_num: 1, text: 'In the beginning was the Word...', translation_abbreviation: 'KJV', created_at: '2024-01-16T14:00:00Z' },
];

export const MOCK_NOTES = [
  { id: 1, verse_id: 1, title: 'Creation narrative', content: 'This verse establishes the foundational cosmology of the Bible. Note the trinitarian implication: God speaks and the Spirit hovers.', tags: ['genesis', 'creation', 'theology'], created_at: '2024-01-15T10:35:00Z', updated_at: '2024-01-15T10:35:00Z' },
  { id: 2, verse_id: null, title: 'Reading plan notes', content: 'Start with Genesis to understand the metanarrative before diving into the New Testament.', tags: ['plan', 'strategy'], created_at: '2024-01-10T09:00:00Z', updated_at: '2024-01-10T09:00:00Z' },
];
