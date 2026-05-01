//! OS-native credential storage for AI provider API keys.
//!
//! Keys live in Windows Credential Manager / macOS Keychain / Linux Secret
//! Service rather than the SQLite preferences table, so a stolen DB file
//! (backup, sync drive, etc.) doesn't leak credentials. The AI chat
//! command reads keys through this module on every request.

use keyring::Entry;

/// Service name used for every keyring entry. The user/account field is
/// `api_key_<provider>`.
const SERVICE: &str = "com.aletheia.app";

/// Service name used by builds shipped under the previous app name. Read
/// only by `migrate_legacy_keyring_entries` so renamed installs pick up
/// existing keys without forcing the user to re-paste them.
const LEGACY_SERVICE: &str = "com.logos.app";

/// Providers we know about. Used by the legacy-keyring migration since
/// the keyring API has no "list every entry for this service" call —
/// we have to probe each known account name.
const KNOWN_PROVIDERS: &[&str] = &["openai", "anthropic", "google", "groq", "ollama"];

#[derive(Debug, thiserror::Error)]
pub enum SecretError {
    #[error("keyring error: {0}")]
    Keyring(#[from] keyring::Error),
}

fn entry(provider: &str) -> Result<Entry, SecretError> {
    let user = format!("api_key_{}", provider);
    Entry::new(SERVICE, &user).map_err(SecretError::from)
}

/// Stores or replaces the API key for `provider`. Empty strings are
/// treated as a delete so the UI can "clear" a key by saving an empty
/// value.
pub fn set_api_key(provider: &str, key: &str) -> Result<(), SecretError> {
    let entry = entry(provider)?;
    if key.is_empty() {
        // Ignore NoEntry — clearing an already-empty slot is a no-op.
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(SecretError::Keyring(e)),
        }
    } else {
        entry.set_password(key).map_err(SecretError::from)
    }
}

/// Returns the stored API key for `provider`, or `None` if no key is
/// saved. Callers should treat absence as "ask the user to add a key in
/// Settings" — never as an error.
pub fn get_api_key(provider: &str) -> Result<Option<String>, SecretError> {
    let entry = entry(provider)?;
    match entry.get_password() {
        Ok(s) => Ok(Some(s)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(SecretError::Keyring(e)),
    }
}

/// `true` if a non-empty key is stored for `provider`. The UI calls this
/// to render a "saved" indicator without round-tripping the cleartext
/// secret through the renderer process.
pub fn has_api_key(provider: &str) -> Result<bool, SecretError> {
    Ok(get_api_key(provider)?.map_or(false, |s| !s.is_empty()))
}

/// Removes the stored API key for `provider`, if any. Idempotent.
pub fn delete_api_key(provider: &str) -> Result<(), SecretError> {
    let entry = entry(provider)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(SecretError::Keyring(e)),
    }
}

/// One-time migration: copies any keyring entries left over from the
/// previous app name (`com.logos.app`) into the new service. Probes each
/// known provider; if a value exists under the legacy service it gets
/// re-stored under the new one and the legacy entry is deleted.
///
/// Idempotent — the second invocation finds no legacy entries and exits
/// without touching anything. Failures are logged but non-fatal.
pub fn migrate_legacy_keyring_entries() {
    for provider in KNOWN_PROVIDERS {
        let user = format!("api_key_{}", provider);
        let legacy = match keyring::Entry::new(LEGACY_SERVICE, &user) {
            Ok(e) => e,
            Err(_) => continue,
        };
        let value = match legacy.get_password() {
            Ok(s) => s,
            Err(keyring::Error::NoEntry) => continue,
            Err(e) => {
                tracing::error!("Legacy keyring read failed for {}: {}", provider, e);
                continue;
            }
        };
        match set_api_key(provider, &value) {
            Ok(()) => {
                tracing::info!("Migrated legacy keyring entry for {}", provider);
                if let Err(e) = legacy.delete_credential() {
                    tracing::error!("Failed to remove legacy keyring entry for {}: {}", provider, e);
                }
            }
            Err(e) => {
                // Leave the legacy entry alone so the user doesn't lose
                // the key if the new vault store failed.
                tracing::error!("Failed to copy legacy keyring entry for {}: {}", provider, e);
            }
        }
    }
}

/// One-time migration: drains every `api_key_*` row from the preferences
/// table into the OS credential vault. Earlier builds wrote these in
/// plaintext; this runs once at startup so existing users keep working
/// without re-entering anything. Idempotent — re-running on an already
/// migrated DB is a no-op (no `api_key_*` rows remain to drain).
///
/// Failures are logged but non-fatal: a transient keyring outage on a
/// Linux box without a running secret-service daemon shouldn't brick the
/// whole app, since the AI feature is optional.
pub fn migrate_api_keys_from_preferences(db: &crate::database::Database) {
    let rows = match crate::database::queries::list_preferences_with_prefix(db, "api_key_") {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("Keyring migration: failed to read preferences: {}", e);
            return;
        }
    };
    if rows.is_empty() {
        return;
    }
    tracing::info!("Migrating {} API key(s) from preferences table to OS keyring", rows.len());
    for (key, value) in rows {
        // `key` looks like "api_key_anthropic"; strip the prefix to get
        // the provider name we use in `secrets::set_api_key`.
        let provider = match key.strip_prefix("api_key_") {
            Some(p) => p,
            None => continue,
        };
        if value.is_empty() {
            // Drop empty plaintext rows without touching the keyring —
            // there's nothing to migrate, just stale state.
            let _ = crate::database::queries::delete_preference(db, &key);
            continue;
        }
        match set_api_key(provider, &value) {
            Ok(()) => {
                if let Err(e) = crate::database::queries::delete_preference(db, &key) {
                    tracing::error!("Keyring migration: copied {} but failed to delete row: {}", key, e);
                }
            }
            Err(e) => {
                // Leave the preference row in place so the user doesn't
                // silently lose their key if the vault is unreachable.
                tracing::error!("Keyring migration: failed to store {}: {}", key, e);
            }
        }
    }
}
