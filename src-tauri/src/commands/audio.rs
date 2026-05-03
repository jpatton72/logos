//! Tauri command wrappers for the optional Piper TTS module.
//!
//! Status / install / uninstall are cheap; synthesis is blocking and
//! gets shoved onto a `spawn_blocking` worker so it doesn't tie up the
//! tokio executor.

use tauri::State;

use crate::audio::{self, AudioStatus, DEFAULT_VOICE_ID};

#[tauri::command]
pub fn audio_status() -> AudioStatus {
    let data_dir = crate::get_app_data_dir();
    audio::status(&data_dir)
}

/// Download Piper + the chosen voice into the user-data dir. Long-running
/// (~88 MB on a fresh install); the frontend renders a spinner and
/// disables the button while this is in flight.
#[tauri::command]
pub async fn audio_install_voice(
    http: State<'_, reqwest::Client>,
    voice_id: Option<String>,
) -> Result<(), String> {
    let data_dir = crate::get_app_data_dir();
    let voice = voice_id.unwrap_or_else(|| DEFAULT_VOICE_ID.to_string());
    audio::install_voice(&http, &data_dir, &voice).await
}

/// Synthesize a verse to WAV bytes. Returned to JS as a number array
/// which the frontend wraps in a Blob → object URL → `<audio>` element.
#[tauri::command]
pub async fn audio_synthesize(
    text: String,
    voice_id: Option<String>,
) -> Result<Vec<u8>, String> {
    let data_dir = crate::get_app_data_dir();
    let voice = voice_id.unwrap_or_else(|| DEFAULT_VOICE_ID.to_string());
    tokio::task::spawn_blocking(move || audio::synthesize(&data_dir, &voice, &text))
        .await
        .map_err(|e| format!("synth task join: {e}"))?
}

#[tauri::command]
pub fn audio_uninstall() -> Result<(), String> {
    let data_dir = crate::get_app_data_dir();
    audio::uninstall(&data_dir)
}
