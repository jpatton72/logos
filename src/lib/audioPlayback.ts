// Singleton playback coordinator for verse narration.
//
// At most one verse plays at a time. Items are queued so a single
// `playQueue` call can run a sequence of verses one after another
// without the caller having to chain `ended` events. Each item is
// synthesized lazily — `audioSynthesize` is only invoked when its
// turn comes, not all upfront — so a 30-verse continuous chain
// doesn't allocate 30MB of WAV bytes ahead of time.
//
// `stopAudio` (and Esc, via App.tsx) cancels everything in flight,
// including any synthesis still mid-await on a later item.
// Subscribers (Listen buttons, the selection action bar) get the
// current playback state pushed on every transition.

import { audioSynthesize } from './tauri';

export interface PlayItem {
  /** Plain text to feed to TTS. The biblical-name lexicon is applied
   *  Rust-side before synthesis. */
  text: string;
  /** Stable identifier for this item, used by Listen buttons to ask
   *  "am I the active one?". Recommended format: `book-chapter-verse-translation`. */
  key: string;
}

export type PlaybackPhase = 'idle' | 'synthesizing' | 'playing';

export interface PlaybackState {
  /** Key of the currently active item (`null` when idle). */
  key: string | null;
  phase: PlaybackPhase;
  /** 1-indexed position + total length of the active queue. `null`
   *  when idle. */
  progress: { position: number; total: number } | null;
}

let current: HTMLAudioElement | null = null;
// Session token used to invalidate in-flight synth/play work when a
// new queue starts or stopAudio fires. Every async hop checks
// `session !== mySession` and bails if it's been superseded.
let session: symbol | null = null;
let queue: PlayItem[] = [];
let queueIndex = 0;
let phase: PlaybackPhase = 'idle';

const listeners = new Set<(state: PlaybackState) => void>();

function snapshot(): PlaybackState {
  if (session === null) {
    return { key: null, phase: 'idle', progress: null };
  }
  const item = queue[queueIndex];
  return {
    key: item ? item.key : null,
    phase,
    progress: { position: queueIndex + 1, total: queue.length },
  };
}

function notify() {
  const s = snapshot();
  for (const fn of listeners) fn(s);
}

export function subscribePlayback(fn: (state: PlaybackState) => void): () => void {
  listeners.add(fn);
  // Push the current state immediately so a freshly-mounted subscriber
  // doesn't have to wait for a transition before knowing whether
  // anything is playing.
  fn(snapshot());
  return () => { listeners.delete(fn); };
}

/** Synchronous read for the current key. Useful in click handlers
 *  where awaiting a subscription would race the user. */
export function currentPlaybackKey(): string | null {
  return session === null ? null : (queue[queueIndex]?.key ?? null);
}

/** Plays a single verse. Stops any ongoing playback first. */
export function playOne(item: PlayItem): void {
  void playQueue([item]);
}

/** Plays through `items` in order, synthesizing each on demand.
 *  Stops any ongoing playback first. Returns once the queue starts —
 *  the queue itself runs in the background. */
export async function playQueue(items: PlayItem[]): Promise<void> {
  stopAudio();
  if (items.length === 0) return;
  const mySession = Symbol('playback');
  session = mySession;
  queue = items.slice();
  queueIndex = 0;
  await runIndex(0, mySession);
}

async function runIndex(i: number, mySession: symbol): Promise<void> {
  if (session !== mySession) return;
  if (i >= queue.length) {
    finish(mySession);
    return;
  }
  queueIndex = i;
  phase = 'synthesizing';
  notify();

  let bytes: Uint8Array;
  try {
    bytes = await audioSynthesize(queue[i].text);
  } catch (e) {
    console.error('TTS synthesis failed for', queue[i].key, e);
    // Skip this item rather than killing the whole queue. A transient
    // synth failure on verse 12 shouldn't strand the user partway
    // through a 30-verse playback.
    return runIndex(i + 1, mySession);
  }
  if (session !== mySession) return;

  const blob = new Blob([bytes as any], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  current = audio;
  phase = 'playing';
  notify();

  let advanced = false;
  const advance = () => {
    if (advanced) return;
    advanced = true;
    URL.revokeObjectURL(url);
    audio.removeEventListener('ended', advance);
    audio.removeEventListener('error', advance);
    if (session === mySession) {
      void runIndex(i + 1, mySession);
    }
  };
  audio.addEventListener('ended', advance);
  audio.addEventListener('error', advance);

  try {
    await audio.play();
  } catch {
    // Autoplay blocked, decode failed, etc — skip ahead.
    advance();
  }
}

function finish(mySession: symbol) {
  if (session !== mySession) return;
  current = null;
  session = null;
  queue = [];
  queueIndex = 0;
  phase = 'idle';
  notify();
}

export function stopAudio(): void {
  if (current) {
    try {
      current.pause();
      current.currentTime = 0;
    } catch { /* fine */ }
  }
  current = null;
  // Setting session=null is what cuts off any pending await in
  // runIndex (the next session-check after the await fires bails).
  session = null;
  queue = [];
  queueIndex = 0;
  phase = 'idle';
  notify();
}
