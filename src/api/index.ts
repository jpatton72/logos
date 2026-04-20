// Real Tauri API — all functions delegate to src/lib/tauri.ts invoke calls

import * as tauri from '../lib/tauri';
export type { Book, Verse, VerseGroup, SearchResult, TermResult, Bookmark, Note, WordMapping, StrongsGreek, StrongsHebrew } from '../lib/tauri';

// Re-export all functions from lib/tauri
export const getBookIndex = tauri.getBookIndex;
export const getChapter = tauri.getChapter;
export const getVerse = tauri.getVerse;
export const searchVerses = tauri.searchVerses;
export const searchTerms = tauri.searchTerms;
export const createBookmark = tauri.createBookmark;
export const getBookmarks = tauri.getBookmarks;
export const deleteBookmark = tauri.deleteBookmark;
export const createNote = tauri.createNote;
export const getNotes = tauri.getNotes;
export const updateNote = tauri.updateNote;
export const deleteNote = tauri.deleteNote;
export const getKetivQere = tauri.getKetivQere;
export const getStrongsGreek = tauri.getStrongsGreek;
export const getStrongsHebrew = tauri.getStrongsHebrew;
export const getVerseWords = tauri.getVerseWords;
export const getPreference = tauri.getPreference;
export const setPreference = tauri.setPreference;
export const getReadingProgress = tauri.getReadingProgress;
export const updateReadingProgress = tauri.updateReadingProgress;
export const compareVerses = tauri.compareVerses;