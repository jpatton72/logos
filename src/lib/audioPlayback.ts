// Singleton playback coordinator for verse narration.
//
// At most one verse plays at a time. `playWav` stops whatever is
// currently playing before starting the new clip; `stopAudio` is what
// the global Escape handler in App.tsx calls. Subscribers (the per-verse
// Listen buttons) get notified when playback starts/stops so they can
// flip their icon between play and stop without polling.

let current: HTMLAudioElement | null = null;
let currentToken: symbol | null = null;
const listeners = new Set<(playingToken: symbol | null) => void>();

function notify() {
  for (const fn of listeners) fn(currentToken);
}

export function subscribePlayback(fn: (playingToken: symbol | null) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Plays WAV bytes. Returns a token; that token is `playingToken` while
 *  this clip is active, then becomes null when it ends or is stopped.
 *  The verse's Listen button uses identity-comparison to know whether
 *  *this* button is the one that's currently playing. */
export function playWav(bytes: Uint8Array): symbol {
  stopAudio();
  const blob = new Blob([bytes as any], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  const token = Symbol('verse-audio');

  const cleanup = () => {
    URL.revokeObjectURL(url);
    if (currentToken === token) {
      current = null;
      currentToken = null;
      notify();
    }
  };
  audio.addEventListener('ended', cleanup);
  audio.addEventListener('error', cleanup);

  current = audio;
  currentToken = token;
  notify();
  // play() returns a promise; swallow rejections so an autoplay-blocked
  // browser doesn't surface as an unhandled rejection.
  audio.play().catch(() => cleanup());
  return token;
}

export function stopAudio(): void {
  if (current) {
    try {
      current.pause();
      current.currentTime = 0;
    } catch {
      /* fine */
    }
  }
  if (currentToken !== null) {
    current = null;
    currentToken = null;
    notify();
  } else {
    current = null;
  }
}

export function currentPlaybackToken(): symbol | null {
  return currentToken;
}
