import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  getPreference,
  setPreference,
  setApiKey,
  hasApiKey,
  audioStatus,
  audioInstallVoice,
  audioUninstall,
  type AudioStatus,
} from '../lib/tauri';
import { type AiProvider, PROVIDER_LABELS, PROVIDER_MODELS, defaultModelFor } from '../lib/aiModels';
import { notifyAudioStatusChanged } from '../components/VerseDisplay';

function formatBytes(n: number): string {
  if (n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

const ALL_PROVIDERS: AiProvider[] = ['openai', 'anthropic', 'google', 'groq', 'ollama'];

export default function Settings() {
  const { darkMode, toggleDarkMode, fontSize, setFontSize } = useAppStore();

  // AI settings state. `apiKeys` holds only what the user has just typed
  // in this session — saved keys live in the OS credential vault and are
  // never read back into the renderer (the vault returns the cleartext
  // each time, but pulling it through JS just to repopulate the input is
  // an unnecessary leak surface). `savedKeys` tracks which providers
  // already have a key in the vault so we can render a "Saved" indicator
  // and a meaningful placeholder.
  const [provider, setProvider] = useState<AiProvider>('openai');
  const [model, setModel] = useState<string>(defaultModelFor('openai'));
  const [apiKeys, setApiKeys] = useState<Record<AiProvider, string>>({
    openai: '',
    anthropic: '',
    google: '',
    groq: '',
    ollama: '',
  });
  const [savedKeys, setSavedKeys] = useState<Record<AiProvider, boolean>>({
    openai: false,
    anthropic: false,
    google: false,
    groq: false,
    ollama: false,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Audio (Piper TTS) state. `audio` is null until the first status
  // probe completes; `audioBusy` covers both install and uninstall so
  // the buttons can't double-fire while a download is in flight.
  const [audio, setAudio] = useState<AudioStatus | null>(null);
  const [audioBusy, setAudioBusy] = useState<null | 'install' | 'uninstall'>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  const refreshAudioStatus = async () => {
    try {
      setAudio(await audioStatus());
    } catch (e) {
      console.error('Failed to load audio status:', e);
    }
  };

  // Load preferences on mount
  useEffect(() => {
    (async () => {
      const [savedProvider, savedModel] = await Promise.all([
        getPreference('ai_provider'),
        getPreference('ai_model'),
      ]);
      const resolvedProvider: AiProvider =
        savedProvider && savedProvider in PROVIDER_LABELS
          ? (savedProvider as AiProvider)
          : 'openai';
      setProvider(resolvedProvider);
      setModel(savedModel && savedModel.trim() !== '' ? savedModel : defaultModelFor(resolvedProvider));
      // Probe which providers already have a key stored in the vault.
      const flags = await Promise.all(ALL_PROVIDERS.map((p) => hasApiKey(p)));
      setSavedKeys(
        ALL_PROVIDERS.reduce((acc, p, i) => {
          acc[p] = flags[i];
          return acc;
        }, {} as Record<AiProvider, boolean>)
      );
      await refreshAudioStatus();
    })();
  }, []);

  const handleInstallAudio = async () => {
    setAudioBusy('install');
    setAudioError(null);
    try {
      await audioInstallVoice();
      await refreshAudioStatus();
      notifyAudioStatusChanged();
    } catch (e) {
      setAudioError(typeof e === 'string' ? e : (e as Error).message);
    } finally {
      setAudioBusy(null);
    }
  };

  const handleUninstallAudio = async () => {
    if (!window.confirm('Remove the downloaded voice and Piper binary? This frees ~88 MB. You can reinstall any time.')) {
      return;
    }
    setAudioBusy('uninstall');
    setAudioError(null);
    try {
      await audioUninstall();
      await refreshAudioStatus();
      notifyAudioStatusChanged();
    } catch (e) {
      setAudioError(typeof e === 'string' ? e : (e as Error).message);
    } finally {
      setAudioBusy(null);
    }
  };

  const handleProviderChange = (newProvider: AiProvider) => {
    setProvider(newProvider);
    setModel(defaultModelFor(newProvider)); // pick the new provider's top suggestion
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const resolvedModel = model.trim() === '' ? defaultModelFor(provider) : model.trim();
      // Only push API keys the user actually edited this session — empty
      // inputs leave the existing vault entry alone instead of clearing
      // it. Users can clear a key explicitly via the "Clear" button.
      const keyWrites = ALL_PROVIDERS
        .filter((p) => apiKeys[p] !== '')
        .map((p) => setApiKey(p, apiKeys[p]));
      await Promise.all([
        setPreference('ai_provider', provider),
        setPreference('ai_model', resolvedModel),
        ...keyWrites,
      ]);
      // Reflect new vault state and clear the inputs so the cleartext
      // doesn't linger in form state.
      setSavedKeys((prev) => {
        const next = { ...prev };
        for (const p of ALL_PROVIDERS) {
          if (apiKeys[p] !== '') next[p] = true;
        }
        return next;
      });
      setApiKeys({ openai: '', anthropic: '', google: '', groq: '', ollama: '' });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Failed to save settings:', e);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    borderRadius: '6px',
    border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
    backgroundColor: darkMode ? '#252519' : '#fff',
    color: darkMode ? '#f5f5f4' : '#292524',
    fontSize: '0.8rem',
    boxSizing: 'border-box',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    fontWeight: 600,
    display: 'block',
    marginBottom: '0.25rem',
    color: darkMode ? '#a8a29e' : '#78716c',
  };

  const sectionTitleStyle: React.CSSProperties = {
    margin: '0 0 0.75rem',
    fontSize: '0.875rem',
    fontWeight: 600,
  };

  return (
    <div className="page-content" style={{ maxWidth: '32rem', margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 1.5rem', fontWeight: 700, fontSize: '1.5rem' }}>Settings</h2>

      {/* Appearance */}
      <section style={{ marginBottom: '2rem', padding: '1.25rem', borderRadius: '12px', backgroundColor: darkMode ? '#1a1a14' : '#fefce8', border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>
        <h3 style={sectionTitleStyle}>Appearance</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <span style={{ fontSize: '0.875rem' }}>Dark mode</span>
          <button
            onClick={toggleDarkMode}
            style={{
              padding: '0.375rem 1rem',
              borderRadius: '9999px',
              border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
              backgroundColor: darkMode ? '#252519' : '#fff',
              color: darkMode ? '#f5f5f4' : '#292524',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            {darkMode ? 'On' : 'Off'}
          </button>
        </div>
        <div>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
            Font size: <span style={{ fontWeight: 600 }}>{fontSize}px</span>
          </label>
          <input
            type="range"
            min={14}
            max={28}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
      </section>

      {/* AI Settings */}
      <section style={{ marginBottom: '2rem', padding: '1.25rem', borderRadius: '12px', backgroundColor: darkMode ? '#1a1a14' : '#fefce8', border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>
        <h3 style={sectionTitleStyle}>AI Integration</h3>
        <p style={{ fontSize: '0.75rem', color: darkMode ? '#a8a29e' : '#78716c', margin: '0 0 1rem', lineHeight: 1.5 }}>
          Configure your AI provider for verse explanations, word analysis, and more. API keys are stored locally and never transmitted except to the provider.
        </p>

        {/* Provider selector */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>AI Provider</label>
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            {(Object.entries(PROVIDER_LABELS) as [AiProvider, string][]).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {/* Model selector — free text with curated suggestions. */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Model</label>
          <input
            type="text"
            list={`models-${provider}`}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={defaultModelFor(provider)}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            style={inputStyle}
          />
          <datalist id={`models-${provider}`}>
            {PROVIDER_MODELS[provider].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.7rem', color: darkMode ? '#78716c' : '#a8a29e' }}>
            Type any model ID supported by {PROVIDER_LABELS[provider]}, or pick from the suggestions.
            Leave blank to use <code>{defaultModelFor(provider)}</code>.
          </p>
        </div>

        {/* API Key inputs. Stored in the OS credential vault, never the
            DB. Inputs start blank on every visit; "Saved" means a key
            already lives in the vault, "Not set" means none does. */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>
            {PROVIDER_LABELS[provider]} API Key
            <span
              style={{
                marginLeft: '0.5rem',
                fontSize: '0.65rem',
                fontWeight: 600,
                color: savedKeys[provider] ? '#15803d' : (darkMode ? '#78716c' : '#a8a29e'),
              }}
            >
              {savedKeys[provider] ? '● Saved' : '○ Not set'}
            </span>
          </label>
          <input
            type="password"
            placeholder={savedKeys[provider] ? 'Stored — type to replace' : 'sk-…'}
            value={apiKeys[provider]}
            onChange={(e) => setApiKeys((prev) => ({ ...prev, [provider]: e.target.value }))}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="off"
            style={inputStyle}
          />
        </div>

        {/* All API keys (collapsible reference) */}
        <details style={{ marginBottom: '1rem' }}>
          <summary style={{ fontSize: '0.75rem', fontWeight: 600, color: darkMode ? '#a8a29e' : '#78716c', cursor: 'pointer', userSelect: 'none' }}>
            Configure other API keys
          </summary>
          <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {(['anthropic', 'google', 'groq', 'ollama'] as AiProvider[]).map((p) => (
              <div key={p}>
                <label style={labelStyle}>
                  {PROVIDER_LABELS[p]} API Key
                  <span
                    style={{
                      marginLeft: '0.5rem',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      color: savedKeys[p] ? '#15803d' : (darkMode ? '#78716c' : '#a8a29e'),
                    }}
                  >
                    {savedKeys[p] ? '● Saved' : '○ Not set'}
                  </span>
                </label>
                <input
                  type="password"
                  placeholder={savedKeys[p] ? 'Stored — type to replace' : 'sk-…'}
                  value={apiKeys[p]}
                  onChange={(e) => setApiKeys((prev) => ({ ...prev, [p]: e.target.value }))}
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  autoComplete="off"
                  style={inputStyle}
                />
              </div>
            ))}
          </div>
        </details>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem 1.25rem',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: '#92400e',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.8rem',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save AI Settings'}
        </button>
      </section>

      {/* Audio (Piper TTS) */}
      <section style={{ marginBottom: '2rem', padding: '1.25rem', borderRadius: '12px', backgroundColor: darkMode ? '#1a1a14' : '#fefce8', border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>
        <h3 style={sectionTitleStyle}>Audio (Verse Narration)</h3>
        <p style={{ fontSize: '0.75rem', color: darkMode ? '#a8a29e' : '#78716c', margin: '0 0 1rem', lineHeight: 1.5 }}>
          Optional offline text-to-speech via <a href="https://github.com/rhasspy/piper" target="_blank" rel="noopener noreferrer" style={{ color: '#92400e' }}>Piper</a>.
          Adds a Listen button to every verse. Downloads ~88 MB (binary + voice model) on first install; nothing leaves your machine after that.
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', fontSize: '0.8rem' }}>
          <span>
            Status:{' '}
            <span style={{ fontWeight: 600, color: audio?.installed ? '#15803d' : (darkMode ? '#a8a29e' : '#78716c') }}>
              {audio === null ? 'Loading…' : audio.installed ? `Installed (${audio.voice_id})` : 'Not installed'}
            </span>
          </span>
          {audio?.installed && (
            <span style={{ color: darkMode ? '#a8a29e' : '#78716c', fontSize: '0.7rem' }}>
              {formatBytes(audio.disk_bytes)} on disk
            </span>
          )}
        </div>

        {audioError && (
          <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: '6px', backgroundColor: darkMode ? '#3f1d1d' : '#fef2f2', color: darkMode ? '#fca5a5' : '#991b1b', fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}>
            {audioError}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {!audio?.installed ? (
            <button
              onClick={handleInstallAudio}
              disabled={audioBusy !== null}
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#92400e',
                color: '#fff',
                cursor: audioBusy ? 'wait' : 'pointer',
                fontWeight: 600,
                fontSize: '0.8rem',
                opacity: audioBusy ? 0.6 : 1,
              }}
            >
              {audioBusy === 'install' ? 'Downloading… (~88 MB)' : 'Install voice'}
            </button>
          ) : (
            <button
              onClick={handleUninstallAudio}
              disabled={audioBusy !== null}
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: '8px',
                border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
                backgroundColor: 'transparent',
                color: darkMode ? '#f5f5f4' : '#292524',
                cursor: audioBusy ? 'wait' : 'pointer',
                fontWeight: 600,
                fontSize: '0.8rem',
                opacity: audioBusy ? 0.6 : 1,
              }}
            >
              {audioBusy === 'uninstall' ? 'Removing…' : 'Uninstall'}
            </button>
          )}
        </div>
      </section>

      {/* About / Attributions */}
      <section style={{ marginBottom: '2rem', padding: '1.25rem', borderRadius: '12px', backgroundColor: darkMode ? '#1a1a14' : '#fefce8', border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}` }}>
        <h3 style={sectionTitleStyle}>About</h3>
        <p style={{ fontSize: '0.8rem', color: darkMode ? '#a8a29e' : '#78716c', margin: '0 0 0.75rem', lineHeight: 1.55 }}>
          <strong style={{ color: darkMode ? '#f5f5f4' : '#292524' }}>Aletheia</strong> — Greek <em>ἀλήθεια</em>, "truth" or
          "unconcealedness". A local-first Bible study application with original-language tools and optional AI assistance.
        </p>
        <details>
          <summary style={{ fontSize: '0.75rem', fontWeight: 600, color: darkMode ? '#a8a29e' : '#78716c', cursor: 'pointer', userSelect: 'none', marginBottom: '0.5rem' }}>
            Data sources & licenses
          </summary>
          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', lineHeight: 1.6, color: darkMode ? '#a8a29e' : '#78716c' }}>
            <p style={{ margin: '0 0 0.5rem' }}>
              <strong>Bibles & lexicons:</strong> KJV (Public Domain), Westminster Leningrad Codex (Open Translation License),
              OpenScriptures Hebrew Bible morphology (CC-BY 4.0), MorphGNT/SBLGNT morphology (CC-BY-SA 3.0),
              Strong's Greek + Hebrew (Public Domain), eBible.org KJV2006 USFM with Strong's tags (Public Domain) for the Lexicon English-lookup index.
            </p>
            <p style={{ margin: '0 0 0.5rem' }}>
              <strong>Pseudepigrapha:</strong> 1 Enoch (R.H. Charles, 1917) and Jubilees (R.H. Charles, 1913), both Public Domain in the US. 2 Enoch / Slavonic Enoch translated from the Slavonic by W.R. Morfill in R.H. Charles ed., 1896, also Public Domain.
            </p>
            <p style={{ margin: '0 0 0.5rem' }}>
              <strong>Fonts:</strong> Inter, Lora, Noto Serif, and Noto Serif Hebrew — all SIL Open Font License,
              vendored locally (the app makes no font CDN calls).
            </p>
            <p style={{ margin: '0 0 0.5rem' }}>
              See <code>ATTRIBUTIONS.md</code> in the source repository for the full list with links.
            </p>
            <p style={{ margin: '0', fontStyle: 'italic' }}>
              Not affiliated with, endorsed by, or sponsored by Faithlife Corporation's Logos Bible Software product line.
            </p>
          </div>
        </details>
      </section>
    </div>
  );
}
