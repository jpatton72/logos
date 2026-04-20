import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getPreference, setPreference } from '../lib/tauri';

type AiProvider = 'openai' | 'anthropic' | 'google' | 'groq' | 'ollama';

const PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google AI',
  groq: 'Groq',
  ollama: 'Ollama (local)',
};

const PROVIDER_MODELS: Record<AiProvider, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'],
  anthropic: ['claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241010', 'claude-3-opus-20240229'],
  google: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro'],
  groq: ['llama-3.1-70b-versatile', 'mixtral-8x7b-32768', 'llama3-70b-8192'],
  ollama: ['llama3.2', 'phi3', 'mistral', 'gemma2'],
};

export default function Settings() {
  const { darkMode, toggleDarkMode, fontSize, setFontSize } = useAppStore();

  // AI settings state
  const [provider, setProvider] = useState<AiProvider>('openai');
  const [model, setModel] = useState('');
  const [apiKeys, setApiKeys] = useState<Record<AiProvider, string>>({
    openai: '',
    anthropic: '',
    google: '',
    groq: '',
    ollama: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load preferences on mount
  useEffect(() => {
    (async () => {
      const [savedProvider, savedModel] = await Promise.all([
        getPreference('ai_provider'),
        getPreference('ai_model'),
      ]);
      if (savedProvider && savedProvider in PROVIDER_LABELS) {
        setProvider(savedProvider as AiProvider);
      }
      if (savedModel) {
        setModel(savedModel);
      }
      // Load API keys
      const providers: AiProvider[] = ['openai', 'anthropic', 'google', 'groq', 'ollama'];
      const results = await Promise.all(
        providers.map((p) => getPreference(`api_key_${p}`))
      );
      setApiKeys(
        providers.reduce((acc, p, i) => {
          acc[p] = results[i] ?? '';
          return acc;
        }, {} as Record<AiProvider, string>)
      );
    })();
  }, []);

  const handleProviderChange = (newProvider: AiProvider) => {
    setProvider(newProvider);
    setModel(''); // reset model when provider changes
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await Promise.all([
        setPreference('ai_provider', provider),
        setPreference('ai_model', model),
        setPreference('api_key_openai', apiKeys.openai),
        setPreference('api_key_anthropic', apiKeys.anthropic),
        setPreference('api_key_google', apiKeys.google),
        setPreference('api_key_groq', apiKeys.groq),
        setPreference('api_key_ollama', apiKeys.ollama),
      ]);
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

        {/* Model selector */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="">Default ({PROVIDER_MODELS[provider][0]})</option>
            {PROVIDER_MODELS[provider].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* API Key inputs */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>{PROVIDER_LABELS[provider]} API Key</label>
          <input
            type="password"
            placeholder="sk-…"
            value={apiKeys[provider]}
            onChange={(e) => setApiKeys((prev) => ({ ...prev, [provider]: e.target.value }))}
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
                <label style={labelStyle}>{PROVIDER_LABELS[p]} API Key</label>
                <input
                  type="password"
                  placeholder="sk-…"
                  value={apiKeys[p]}
                  onChange={(e) => setApiKeys((prev) => ({ ...prev, [p]: e.target.value }))}
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
    </div>
  );
}
