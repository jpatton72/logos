//! Per-process rate limiter for AI provider calls.
//!
//! Sliding window: at most `max_requests` calls per `window` interval. A
//! shared instance lives in `AppState` so every `ai_chat` invocation
//! consults the same counter, regardless of which provider/model the user
//! picked.
//!
//! The defaults (60 requests / 60 seconds) are intentionally generous —
//! the goal is "stop a runaway frontend from racking up $100 in 30 seconds",
//! not "keep the user from doing their job". Configurable via env vars
//! `ALETHEIA_AI_RATE_LIMIT` (count) and `ALETHEIA_AI_RATE_WINDOW_SECS` for
//! users who hit the ceiling on legitimate use. The legacy
//! `LOGOS_AI_RATE_LIMIT` / `LOGOS_AI_RATE_WINDOW_SECS` names from the
//! pre-rename build are still honored as fallbacks.

use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub struct RateLimiter {
    inner: Mutex<Inner>,
    max_requests: usize,
    window: Duration,
}

struct Inner {
    /// Timestamps of recent requests, oldest first. We prune entries
    /// older than `window` on every check, so the queue is bounded by
    /// `max_requests` items.
    history: VecDeque<Instant>,
}

impl RateLimiter {
    pub fn new(max_requests: usize, window: Duration) -> Self {
        Self {
            inner: Mutex::new(Inner {
                history: VecDeque::with_capacity(max_requests),
            }),
            max_requests,
            window,
        }
    }

    /// Read environment overrides, falling back to (60, 60s). Prefers
    /// the new `ALETHEIA_*` names; falls through to the pre-rename
    /// `LOGOS_*` ones so existing power-user shell configs keep
    /// working without an env-var update.
    pub fn from_env() -> Self {
        let max_requests = std::env::var("ALETHEIA_AI_RATE_LIMIT")
            .or_else(|_| std::env::var("LOGOS_AI_RATE_LIMIT"))
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(60);
        let window_secs = std::env::var("ALETHEIA_AI_RATE_WINDOW_SECS")
            .or_else(|_| std::env::var("LOGOS_AI_RATE_WINDOW_SECS"))
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(60);
        Self::new(max_requests, Duration::from_secs(window_secs))
    }

    /// Try to consume a slot. Returns `Ok(())` on success, or
    /// `Err(retry_after)` describing how long the caller should wait.
    pub fn try_acquire(&self) -> Result<(), Duration> {
        let now = Instant::now();
        let mut inner = self.inner.lock().expect("rate limiter mutex poisoned");

        // Prune expired entries.
        while let Some(&front) = inner.history.front() {
            if now.duration_since(front) >= self.window {
                inner.history.pop_front();
            } else {
                break;
            }
        }

        if inner.history.len() >= self.max_requests {
            // The oldest entry will fall out of the window first.
            let retry_after = self
                .window
                .saturating_sub(now.duration_since(*inner.history.front().unwrap()));
            return Err(retry_after);
        }

        inner.history.push_back(now);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread::sleep;

    #[test]
    fn allows_up_to_max() {
        let rl = RateLimiter::new(3, Duration::from_secs(60));
        assert!(rl.try_acquire().is_ok());
        assert!(rl.try_acquire().is_ok());
        assert!(rl.try_acquire().is_ok());
        assert!(rl.try_acquire().is_err());
    }

    #[test]
    fn replenishes_after_window() {
        let rl = RateLimiter::new(2, Duration::from_millis(100));
        assert!(rl.try_acquire().is_ok());
        assert!(rl.try_acquire().is_ok());
        assert!(rl.try_acquire().is_err());
        sleep(Duration::from_millis(120));
        assert!(rl.try_acquire().is_ok());
    }
}
