//! Optional Piper TTS for "Listen to this verse" playback.
//!
//! The Piper binary + voice model are NOT bundled with the installer
//! (~88 MB total). Users opt in via Settings → Audio → Install voice,
//! which downloads everything to the user-data dir. Synthesis runs
//! locally with no network calls after install.
//!
//! The bundled `biblical_lexicon.json` provides respellings for common
//! mispronunciations (Mephibosheth, Habakkuk, etc.). Verse text is
//! preprocessed through it before being fed to Piper.

use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::OnceLock;

use regex::Regex;
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

/// Pinned Piper release. The 2023.11.14-2 release is the last one with
/// fully self-contained native binaries; later versions of the upstream
/// project are Python-only. If/when we need to update, swap to a fork
/// that maintains binaries (e.g. `piper-cpp`).
const PIPER_RELEASE: &str = "2023.11.14-2";

/// Default voice. Clear American English, ~63 MB. Future feature: let
/// users pick a different voice in Settings.
pub const DEFAULT_VOICE_ID: &str = "en_US-amy-medium";

/// Bundled at compile time so the lexicon is always available without
/// needing to thread the AppHandle through every command.
const LEXICON_JSON: &str = include_str!("./biblical_lexicon.json");

/// Cache the parsed lexicon (HashMap + compiled regex) on first use so
/// every synth call doesn't re-parse JSON + recompile regexes.
struct Lexicon {
    /// Lowercased word -> respelling.
    map: HashMap<String, String>,
    /// `\b(word1|word2|...)\b` case-insensitive — replace each match
    /// with the corresponding entry from `map`.
    pattern: Regex,
}

static LEXICON: OnceLock<Lexicon> = OnceLock::new();

fn lexicon() -> &'static Lexicon {
    LEXICON.get_or_init(|| {
        // Filter the comment field out before constructing the map.
        let raw: HashMap<String, serde_json::Value> = serde_json::from_str(LEXICON_JSON)
            .expect("biblical_lexicon.json is malformed at compile time");
        let mut map: HashMap<String, String> = HashMap::with_capacity(raw.len());
        for (k, v) in raw {
            if k.starts_with('_') {
                continue;
            }
            if let serde_json::Value::String(s) = v {
                map.insert(k.to_lowercase(), s);
            }
        }
        // Build one big alternation so all replacements happen in a
        // single pass. Sort by length desc so longer phrases match
        // before any shorter substring of them.
        let mut keys: Vec<&str> = map.keys().map(|s| s.as_str()).collect();
        keys.sort_by(|a, b| b.len().cmp(&a.len()));
        let alternation = keys
            .iter()
            .map(|k| regex::escape(k))
            .collect::<Vec<_>>()
            .join("|");
        let pattern_str = format!(r"(?i)\b({})\b", alternation);
        let pattern = Regex::new(&pattern_str).expect("lexicon pattern is invalid regex");
        Lexicon { map, pattern }
    })
}

/// Replace any biblical name/place in `text` with its respelled
/// pronunciation. Caller passes the result to Piper.
pub fn apply_lexicon(text: &str) -> String {
    let lex = lexicon();
    lex.pattern
        .replace_all(text, |caps: &regex::Captures| {
            let key = caps.get(1).unwrap().as_str().to_lowercase();
            lex.map.get(&key).cloned().unwrap_or_else(|| caps[0].to_string())
        })
        .into_owned()
}

// ---------------------------------------------------------------------------
// Filesystem layout
// ---------------------------------------------------------------------------

pub fn audio_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("audio")
}

pub fn piper_dir(data_dir: &Path) -> PathBuf {
    audio_dir(data_dir).join("piper")
}

pub fn voices_dir(data_dir: &Path) -> PathBuf {
    audio_dir(data_dir).join("voices")
}

/// Path to the Piper executable. Inside the extracted archive Piper
/// lives at `piper/piper(.exe)` — both the binary and the
/// `espeak-ng-data/` it relies on share that directory.
pub fn piper_binary_path(data_dir: &Path) -> PathBuf {
    let inner = piper_dir(data_dir).join("piper");
    if cfg!(windows) {
        inner.join("piper.exe")
    } else {
        inner.join("piper")
    }
}

pub fn voice_model_path(data_dir: &Path, voice_id: &str) -> PathBuf {
    voices_dir(data_dir).join(format!("{voice_id}.onnx"))
}

pub fn voice_config_path(data_dir: &Path, voice_id: &str) -> PathBuf {
    voices_dir(data_dir).join(format!("{voice_id}.onnx.json"))
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AudioStatus {
    pub installed: bool,
    pub voice_id: Option<String>,
    pub disk_bytes: u64,
    pub piper_release: String,
}

pub fn status(data_dir: &Path) -> AudioStatus {
    let piper_present = piper_binary_path(data_dir).is_file();
    let voice_present = voice_model_path(data_dir, DEFAULT_VOICE_ID).is_file()
        && voice_config_path(data_dir, DEFAULT_VOICE_ID).is_file();
    let installed = piper_present && voice_present;
    AudioStatus {
        installed,
        voice_id: if installed { Some(DEFAULT_VOICE_ID.to_string()) } else { None },
        disk_bytes: dir_size_bytes(&audio_dir(data_dir)).unwrap_or(0),
        piper_release: PIPER_RELEASE.to_string(),
    }
}

fn dir_size_bytes(path: &Path) -> std::io::Result<u64> {
    if !path.exists() {
        return Ok(0);
    }
    let mut total: u64 = 0;
    let mut stack = vec![path.to_path_buf()];
    while let Some(p) = stack.pop() {
        for entry in fs::read_dir(&p)? {
            let entry = entry?;
            let meta = entry.metadata()?;
            if meta.is_dir() {
                stack.push(entry.path());
            } else {
                total += meta.len();
            }
        }
    }
    Ok(total)
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

fn piper_archive_url() -> &'static str {
    if cfg!(windows) {
        "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip"
    } else {
        "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz"
    }
}

fn voice_base_url(voice_id: &str) -> Option<String> {
    // Voice IDs map to a path on the rhasspy/piper-voices Hugging Face
    // repo: en_US-amy-medium -> en/en_US/amy/medium/. Hard-coded for
    // the one voice we ship by default; future voice-selection support
    // would either include a mapping table or accept a full URL.
    if voice_id != DEFAULT_VOICE_ID {
        return None;
    }
    Some(
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium"
            .to_string(),
    )
}

pub async fn install_voice(
    http: &reqwest::Client,
    data_dir: &Path,
    voice_id: &str,
) -> Result<(), String> {
    fs::create_dir_all(audio_dir(data_dir)).map_err(|e| format!("create audio dir: {e}"))?;
    fs::create_dir_all(voices_dir(data_dir)).map_err(|e| format!("create voices dir: {e}"))?;

    if !piper_binary_path(data_dir).is_file() {
        info!("Audio: downloading Piper {}", PIPER_RELEASE);
        download_piper_archive(http, data_dir).await?;
    } else {
        info!("Audio: Piper already installed; skipping binary download");
    }

    let needs_model = !voice_model_path(data_dir, voice_id).is_file();
    let needs_config = !voice_config_path(data_dir, voice_id).is_file();
    if needs_model || needs_config {
        info!("Audio: downloading voice {}", voice_id);
        download_voice(http, data_dir, voice_id).await?;
    }

    Ok(())
}

async fn download_piper_archive(http: &reqwest::Client, data_dir: &Path) -> Result<(), String> {
    let url = piper_archive_url();
    let bytes = http
        .get(url)
        .send()
        .await
        .map_err(|e| format!("piper download request: {e}"))?
        .error_for_status()
        .map_err(|e| format!("piper download HTTP: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("piper download body: {e}"))?;

    let dest = piper_dir(data_dir);
    fs::create_dir_all(&dest).map_err(|e| format!("create piper dir: {e}"))?;

    if cfg!(windows) {
        extract_zip(&bytes, &dest)?;
    } else {
        extract_tar_gz(&bytes, &dest)?;
        // The Linux release ships with the binary's executable bit set;
        // re-set it after extraction in case the tar handler dropped it.
        let bin = piper_binary_path(data_dir);
        if let Ok(meta) = fs::metadata(&bin) {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mut perms = meta.permissions();
                perms.set_mode(perms.mode() | 0o111);
                let _ = fs::set_permissions(&bin, perms);
            }
            let _ = meta;
        }
    }

    if !piper_binary_path(data_dir).is_file() {
        return Err(format!(
            "piper binary not found at {:?} after extraction",
            piper_binary_path(data_dir)
        ));
    }
    Ok(())
}

fn extract_zip(bytes: &[u8], dest: &Path) -> Result<(), String> {
    let cursor = std::io::Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("open zip: {e}"))?;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("zip entry {i}: {e}"))?;
        // `mangled_name` strips ".." and absolute roots — guards
        // against malicious archives writing outside `dest`.
        let outpath = dest.join(file.mangled_name());
        if file.is_dir() {
            fs::create_dir_all(&outpath).map_err(|e| format!("mkdir {outpath:?}: {e}"))?;
        } else {
            if let Some(parent) = outpath.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("mkdir {parent:?}: {e}"))?;
            }
            let mut out = fs::File::create(&outpath)
                .map_err(|e| format!("create {outpath:?}: {e}"))?;
            std::io::copy(&mut file, &mut out)
                .map_err(|e| format!("copy {outpath:?}: {e}"))?;
        }
    }
    Ok(())
}

fn extract_tar_gz(bytes: &[u8], dest: &Path) -> Result<(), String> {
    let gz = flate2::read::GzDecoder::new(std::io::Cursor::new(bytes));
    let mut archive = tar::Archive::new(gz);
    archive
        .unpack(dest)
        .map_err(|e| format!("untar: {e}"))?;
    Ok(())
}

async fn download_voice(
    http: &reqwest::Client,
    data_dir: &Path,
    voice_id: &str,
) -> Result<(), String> {
    let base = voice_base_url(voice_id)
        .ok_or_else(|| format!("unknown voice id: {voice_id}"))?;
    let model_url = format!("{base}/{voice_id}.onnx?download=true");
    let config_url = format!("{base}/{voice_id}.onnx.json?download=true");

    save_url_to(http, &model_url, &voice_model_path(data_dir, voice_id)).await?;
    save_url_to(http, &config_url, &voice_config_path(data_dir, voice_id)).await?;
    Ok(())
}

async fn save_url_to(
    http: &reqwest::Client,
    url: &str,
    dest: &Path,
) -> Result<(), String> {
    let bytes = http
        .get(url)
        .send()
        .await
        .map_err(|e| format!("download {url}: {e}"))?
        .error_for_status()
        .map_err(|e| format!("HTTP for {url}: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("body for {url}: {e}"))?;

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir {parent:?}: {e}"))?;
    }
    // Atomic-ish write: stage to .part then rename so a crash mid-
    // write doesn't leave a half-baked file that the next launch
    // mistakes for a complete download.
    let staging = dest.with_extension(format!(
        "{}.part",
        dest.extension().and_then(|s| s.to_str()).unwrap_or("dl")
    ));
    {
        let mut f = fs::File::create(&staging)
            .map_err(|e| format!("create {staging:?}: {e}"))?;
        f.write_all(&bytes)
            .map_err(|e| format!("write {staging:?}: {e}"))?;
    }
    fs::rename(&staging, dest).map_err(|e| format!("rename to {dest:?}: {e}"))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Synthesis
// ---------------------------------------------------------------------------

/// Run Piper on `text` and return the resulting WAV bytes (with header,
/// ready to feed to an HTML `<audio>` element via Blob URL).
///
/// Blocking; intended to be called from a tokio task. Verses are short
/// enough that synthesis completes in well under a second.
pub fn synthesize(data_dir: &Path, voice_id: &str, text: &str) -> Result<Vec<u8>, String> {
    let bin = piper_binary_path(data_dir);
    if !bin.is_file() {
        return Err("Voice not installed. Open Settings → Audio → Install voice.".to_string());
    }
    let model = voice_model_path(data_dir, voice_id);
    if !model.is_file() {
        return Err(format!("Voice model {voice_id} not installed."));
    }

    let prepared = apply_lexicon(text);
    if prepared.trim().is_empty() {
        return Err("No text to speak.".to_string());
    }

    // Run from inside the piper directory so its bundled
    // espeak-ng-data/ + sibling shared libraries are picked up
    // automatically. Piper requires those next to the binary.
    let workdir = bin.parent().ok_or("piper binary has no parent dir")?;

    let mut child = Command::new(&bin)
        .current_dir(workdir)
        .arg("--model")
        .arg(&model)
        .arg("--output_file")
        .arg("-")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn piper: {e}"))?;

    {
        let mut stdin = child.stdin.take().ok_or("piper stdin missing")?;
        stdin
            .write_all(prepared.as_bytes())
            .map_err(|e| format!("write to piper stdin: {e}"))?;
    } // drop stdin to signal EOF

    let mut wav = Vec::with_capacity(64 * 1024);
    let mut stderr_buf = String::new();
    let stdout = child.stdout.take().ok_or("piper stdout missing")?;
    let stderr = child.stderr.take().ok_or("piper stderr missing")?;

    // Drain stdout + stderr concurrently from threads so a stderr
    // flood can't deadlock the stdout reader.
    let stderr_thread = std::thread::spawn(move || -> std::io::Result<String> {
        let mut s = String::new();
        let mut r = stderr;
        r.read_to_string(&mut s)?;
        Ok(s)
    });
    {
        let mut r = stdout;
        r.read_to_end(&mut wav)
            .map_err(|e| format!("read piper stdout: {e}"))?;
    }
    if let Ok(Ok(s)) = stderr_thread.join() {
        stderr_buf = s;
    }

    let status = child.wait().map_err(|e| format!("wait piper: {e}"))?;
    if !status.success() {
        warn!("Piper stderr: {}", stderr_buf);
        return Err(format!("piper exited with {status}: {stderr_buf}"));
    }

    if wav.is_empty() {
        return Err("piper produced no audio output".to_string());
    }
    Ok(wav)
}

// ---------------------------------------------------------------------------
// Uninstall
// ---------------------------------------------------------------------------

pub fn uninstall(data_dir: &Path) -> Result<(), String> {
    let dir = audio_dir(data_dir);
    if !dir.exists() {
        return Ok(());
    }
    fs::remove_dir_all(&dir).map_err(|e| format!("remove {dir:?}: {e}"))?;
    info!("Audio: uninstalled");
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lexicon_matches_case_insensitive() {
        let out = apply_lexicon("And Mephibosheth dwelt in Jerusalem.");
        assert!(out.contains("Mefibosheth"), "got: {out}");
    }

    #[test]
    fn lexicon_only_matches_word_boundaries() {
        // "Isaiah" should match but "Isaiahs" shouldn't get half-replaced.
        let out = apply_lexicon("Isaiah said and Isaiahsfoo.");
        assert!(out.contains("Eye-zay-uh"), "got: {out}");
        assert!(out.contains("Isaiahsfoo"), "got: {out}");
    }

    #[test]
    fn lexicon_no_op_when_no_matches() {
        let s = "the quick brown fox";
        assert_eq!(apply_lexicon(s), s);
    }
}
