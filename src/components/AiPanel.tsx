import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getPreference } from '../lib/tauri';
import { aiChat, ChatMessage } from '../lib/ai';

interface VerseRef {
  book_abbreviation: string;
  chapter: number;
  verse_num: number;
  text: string;
}

export interface WordContext {
  word: string;
  strongsId: string;
  language: 'hebrew' | 'greek';
  transliteration?: string;
  definition?: string;
}

export interface AiPanelProps {
  verses?: VerseRef[];
  wordContext?: WordContext;
  onClose: () => void;
}

const SYSTEM_PROMPT_BASE = `You are a Bible study assistant. Answer questions about the biblical text, its Greek/Hebrew words, and related passages. Keep answers concise and scholarly.`;

function buildSystemPrompt(verses: VerseRef[], word?: WordContext): string {
  let prompt = SYSTEM_PROMPT_BASE;

  if (verses.length > 0) {
    const verseLines = verses
      .map((v) => {
        const ref = `${v.book_abbreviation.toUpperCase()} ${v.chapter}:${v.verse_num}`;
        return `• ${ref}: "${v.text}"`;
      })
      .join('\n');

    const context = verses.length === 1
      ? `The user is reading: ${verses[0].book_abbreviation.toUpperCase()} ${verses[0].chapter}:${verses[0].verse_num}`
      : `The user is reading ${verses.length} selected verses`;

    prompt += `\n\n${context}\nSelected verse text:\n${verseLines}\n\nRefer to the selected verses when answering.`;
  }

  if (word) {
    const lang = word.language === 'hebrew' ? 'Hebrew' : 'Greek';
    prompt += `\n\nThe user is asking about a ${lang} word:\n• Word: ${word.word}\n• Strongs: ${word.strongsId}`;
    if (word.transliteration) prompt += `\n• Transliteration: ${word.transliteration}`;
    if (word.definition) prompt += `\n• Definition: ${word.definition}`;
    prompt += '\n\nProvide linguistic and contextual analysis of this word.';
  }

  return prompt;
}

export function AiPanel({ verses = [], wordContext, onClose }: AiPanelProps) {
  const { darkMode } = useAppStore();
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    const userMsg: ChatMessage = { role: 'user', content: question.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setQuestion('');
    setLoading(true);

    try {
      // Load provider and model from preferences
      const [provider, model] = await Promise.all([
        getPreference('ai_provider'),
        getPreference('ai_model'),
      ]);

      if (!provider || !model) {
        const stubResponse: ChatMessage = {
          role: 'assistant',
          content:
            'AI is not configured. Visit the Settings page to select a provider, model, and add your API key.',
        };
        setMessages((prev) => [...prev, stubResponse]);
        setLoading(false);
        return;
      }

      // Build messages: system prompt + conversation history + new user question
      const conversationHistory = [...messages, userMsg];
      const allMessages: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt(verses, wordContext) },
        ...conversationHistory,
      ];

      console.log('[AiPanel] Sending AI request:', { provider, model, messageCount: allMessages.length });

      // The backend reads the API key from user_preferences using the provider name
      const response = await aiChat(allMessages, provider, model);
      const assistantMsg: ChatMessage = { role: 'assistant', content: response };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e: unknown) {
      console.error('[AiPanel] Error:', e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: `Error: ${errorMessage || 'Failed to get a response. Please check your API key in Settings.'}`,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    borderRadius: '8px',
    border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
    backgroundColor: darkMode ? '#252519' : '#fff',
    color: darkMode ? '#f5f5f4' : '#292524',
    fontSize: '0.85rem',
    boxSizing: 'border-box',
    resize: 'none',
    outline: 'none',
    fontFamily: "'Lora', Georgia, serif",
    lineHeight: 1.5,
  };

  const msgUserStyle: React.CSSProperties = {
    backgroundColor: darkMode ? '#78350f' : '#fef3c7',
    color: darkMode ? '#fcd34d' : '#92400e',
    borderRadius: '10px 10px 2px 10px',
    padding: '0.5rem 0.75rem',
    fontSize: '0.85rem',
    maxWidth: '85%',
    alignSelf: 'flex-end',
  };

  const msgAssistantStyle: React.CSSProperties = {
    backgroundColor: darkMode ? '#252519' : '#f5f5f4',
    color: darkMode ? '#f5f5f4' : '#292524',
    border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
    borderRadius: '10px 10px 10px 2px',
    padding: '0.5rem 0.75rem',
    fontSize: '0.85rem',
    maxWidth: '85%',
    alignSelf: 'flex-start',
    lineHeight: 1.6,
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: darkMode ? '#1a1a14' : '#fefce8',
        borderLeft: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 1rem',
          borderBottom: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
          backgroundColor: darkMode ? '#252519' : '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1rem', fontWeight: 700 }}>Ask AI</span>
          <span
            style={{
              fontSize: '0.65rem',
              padding: '0.1rem 0.4rem',
              borderRadius: '9999px',
              backgroundColor: darkMode ? '#78350f' : '#fef3c7',
              color: darkMode ? '#fcd34d' : '#92400e',
              fontWeight: 600,
            }}
          >
            Phase 7
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: darkMode ? '#a8a29e' : '#78716c',
            padding: '0.25rem',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Verse context */}
      {verses.length > 0 && (
        <div
          style={{
            padding: '0.625rem 1rem',
            borderBottom: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
            backgroundColor: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          }}
        >
          <div
            style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              color: darkMode ? '#78716c' : '#a8a29e',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.25rem',
            }}
          >
            Selected Verses
          </div>
          {verses.map((v) => (
            <div
              key={`${v.book_abbreviation}-${v.chapter}-${v.verse_num}`}
              style={{ fontSize: '0.78rem', fontFamily: "'Lora', Georgia, serif", color: darkMode ? '#a8a29e' : '#78716c', marginBottom: '0.125rem' }}
            >
              <span className="verse-ref">
                {v.book_abbreviation.toUpperCase()} {v.chapter}:{v.verse_num}
              </span>{' '}
              — {v.text.slice(0, 80)}{v.text.length > 80 ? '…' : ''}
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '2rem 1rem',
              color: darkMode ? '#57534e' : '#a8a29e',
              fontSize: '0.85rem',
            }}
          >
            <svg
              style={{ marginBottom: '0.5rem', color: darkMode ? '#57534e' : '#a8a29e' }}
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p style={{ margin: 0 }}>
              Select a verse and ask a question about it.
            </p>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem' }}>
              Configure your AI provider and API key in Settings first.
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div style={msg.role === 'user' ? msgUserStyle : msgAssistantStyle}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            <div style={msgAssistantStyle}>
              <span style={{ animation: 'pulse 1s ease-in-out infinite' }}>…</span>
            </div>
          </div>
        )}
      </div>

      {/* Input form */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: '0.75rem 1rem',
          borderTop: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
          backgroundColor: darkMode ? '#252519' : '#fff',
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'flex-end',
        }}
      >
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder="Ask about the selected verse…"
          rows={2}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: '#92400e',
            color: '#fff',
            cursor: loading || !question.trim() ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            fontSize: '0.8rem',
            opacity: loading || !question.trim() ? 0.5 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
