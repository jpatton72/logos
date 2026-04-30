// Curated suggestions per provider. Users can type any model name in
// Settings — these are autocomplete hints + the fallback default for new
// configurations.
//
// Update this list when upstream catalogs change. The Rust backend just
// passes the model string through, so adding a new entry here is usually
// the only change needed.

export type AiProvider = 'openai' | 'anthropic' | 'google' | 'groq' | 'ollama';

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google AI',
  groq: 'Groq',
  ollama: 'Ollama (local)',
};

// First entry of each list is the "Default" used when the user picks a
// provider without specifying a model.
export const PROVIDER_MODELS: Record<AiProvider, string[]> = {
  openai: [
    'gpt-5',
    'gpt-5-mini',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4o',
    'gpt-4o-mini',
    'o4-mini',
    'o3',
    'o3-mini',
  ],
  anthropic: [
    'claude-opus-4-7',
    'claude-sonnet-4-6',
    'claude-haiku-4-5-20251001',
    'claude-opus-4-1',
    'claude-sonnet-4-5',
    'claude-3-7-sonnet-20250219',
  ],
  google: [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-pro',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ],
  groq: [
    'llama-3.3-70b-versatile',
    'llama-3.1-70b-versatile',
    'llama-3.1-8b-instant',
    'moonshotai/kimi-k2-instruct',
    'mixtral-8x7b-32768',
    'gemma2-9b-it',
  ],
  ollama: [
    'llama3.3',
    'llama3.2',
    'gemma3',
    'qwen2.5',
    'mistral-nemo',
    'phi3.5',
  ],
};

export function defaultModelFor(provider: AiProvider | string | null | undefined): string {
  if (!provider) return PROVIDER_MODELS.openai[0];
  const list = PROVIDER_MODELS[provider as AiProvider];
  return list?.[0] ?? '';
}
