import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  playQueue,
  stopAudio,
  subscribePlayback,
  type PlaybackState,
  type PlayItem,
} from '../lib/audioPlayback';

/** Verses with text fetched, as App.tsx already collects them for the
 *  AI panel. Lifted as a prop here so we don't double-fetch. */
export interface SelectedVerseWithText {
  book_abbreviation: string;
  chapter: number;
  verse_num: number;
  text: string;
}

interface SelectionActionBarProps {
  /** Same `aiVerses` array App.tsx maintains for the AI panel — verse
   *  text already fetched in the active English translation. */
  selectedWithText: SelectedVerseWithText[];
  audioReady: boolean;
  darkMode: boolean;
}

/** Floating bar that surfaces actions for the current verse selection
 *  (Play) and for any active multi-verse playback queue (Stop +
 *  progress indicator). Hides itself when both are idle.
 *
 *  The "Play" action plays the selected verses in canonical reading
 *  order — book → chapter → verse, using `books.order_index` from the
 *  store — not in selection order, since hearing them out of order
 *  defeats the point.
 */
export function SelectionActionBar({ selectedWithText, audioReady, darkMode }: SelectionActionBarProps) {
  const { books } = useAppStore();
  const [playback, setPlayback] = useState<PlaybackState>({ key: null, phase: 'idle', progress: null });

  useEffect(() => subscribePlayback(setPlayback), []);

  const isPlayingQueue = playback.progress !== null && playback.progress.total > 1;
  const hasSelection = selectedWithText.length > 0;
  const visible = audioReady && (hasSelection || isPlayingQueue);
  if (!visible) return null;

  const handlePlaySelected = () => {
    if (selectedWithText.length === 0) return;
    // Sort by canonical reading order: book.order_index → chapter → verse.
    // Fall back to ∞ for unknown books so we never crash on a stale
    // selection that references a book the index doesn't have yet.
    const orderOf = (abbr: string) => {
      const b = books.find((x) => x.abbreviation.toLowerCase() === abbr.toLowerCase());
      return b ? b.order_index : Number.POSITIVE_INFINITY;
    };
    const sorted = [...selectedWithText].sort((a, b) => {
      const oa = orderOf(a.book_abbreviation);
      const ob = orderOf(b.book_abbreviation);
      if (oa !== ob) return oa - ob;
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      return a.verse_num - b.verse_num;
    });
    const items: PlayItem[] = sorted
      .filter((v) => v.text && v.text.trim() !== '')
      .map((v) => ({
        text: v.text,
        // Translation suffix omitted because aiVerses doesn't carry
        // the abbreviation — collisions across translations aren't
        // possible since aiVerses is fetched from a single one.
        key: `selected-${v.book_abbreviation.toLowerCase()}-${v.chapter}-${v.verse_num}`,
      }));
    if (items.length === 0) return;
    void playQueue(items);
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.5rem 0.875rem',
        borderRadius: '9999px',
        backgroundColor: darkMode ? '#1a1a14' : '#ffffff',
        border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        fontSize: '0.8rem',
        color: darkMode ? '#f5f5f4' : '#292524',
      }}
    >
      {isPlayingQueue ? (
        <>
          <button
            onClick={stopAudio}
            title="Stop playback (Esc also works)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.75rem',
              borderRadius: '9999px',
              border: 'none',
              backgroundColor: '#92400e',
              color: '#ffffff',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
            Stop
          </button>
          {playback.progress && (
            <span style={{ color: darkMode ? '#a8a29e' : '#78716c' }}>
              Playing {playback.progress.position} of {playback.progress.total}
              {playback.phase === 'synthesizing' ? ' (generating…)' : ''}
            </span>
          )}
        </>
      ) : (
        <>
          <button
            onClick={handlePlaySelected}
            title={`Play ${selectedWithText.length} selected verse${selectedWithText.length !== 1 ? 's' : ''} in reading order`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.75rem',
              borderRadius: '9999px',
              border: 'none',
              backgroundColor: '#92400e',
              color: '#ffffff',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Play selected
          </button>
          <span style={{ color: darkMode ? '#a8a29e' : '#78716c' }}>
            {selectedWithText.length} verse{selectedWithText.length !== 1 ? 's' : ''}
          </span>
        </>
      )}
    </div>
  );
}
