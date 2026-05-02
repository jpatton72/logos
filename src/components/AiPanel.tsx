import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  getPreference,
  hasApiKey,
  saveAiConversation,
  listAiConversations,
  getAiConversation,
  deleteAiConversation,
} from '../lib/tauri';
import type { AiConversationSummary } from '../lib/tauri';
import { aiChat, ChatMessage } from '../lib/ai';
import { defaultModelFor } from '../lib/aiModels';

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
  /**
   * Override for the "Deselect all" button. The Reader leaves this
   * undefined so the panel falls back to clearing the global
   * `selectedVerses` store; Compare passes its own handler that resets
   * its local `verse` row state (since Compare's AI context is the
   * active row, not the global selection).
   */
  onDeselectAll?: () => void;
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

/** First user message, shortened to ~60 chars, for the auto-generated
 *  conversation title. Falls back to "Conversation" if there's no user
 *  message yet (shouldn't happen in practice — we save after the first
 *  assistant turn). */
function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'Conversation';
  const t = firstUser.content.trim().replace(/\s+/g, ' ');
  return t.length > 60 ? t.slice(0, 57) + '…' : t || 'Conversation';
}

type View = 'chat' | 'history';

export function AiPanel({ verses = [], wordContext, onClose, onDeselectAll }: AiPanelProps) {
  // Conversation state + the half-typed question both live in the
  // Zustand store so neither survives only as long as the AiPanel
  // component instance. Closing the panel, navigating to another
  // route, and the home button all unmount AiPanel; the store keeps
  // everything intact until the user clicks Clear or the app restarts.
  const {
    darkMode,
    clearVerseSelection,
    aiMessages: messages,
    aiLoading: loading,
    aiQuestion: question,
    currentConversationId,
    appendAiMessage,
    setAiLoading,
    setAiQuestion: setQuestion,
    setAiMessages,
    setCurrentConversationId,
    clearAiConversation,
  } = useAppStore();
  const deselectAll = onDeselectAll ?? clearVerseSelection;

  const [view, setView] = useState<View>('chat');

  // Keep the auto-save aware of the most recently used provider/model
  // without re-reading preferences on every save call. Captured the
  // last time we successfully sent a message.
  const lastProviderRef = useRef<string | null>(null);
  const lastModelRef = useRef<string | null>(null);

  // ---------------------------------------------------------------------
  // Auto-scroll: when a new message arrives or the assistant starts/stops
  // typing, snap the messages container to the bottom so the user always
  // sees the freshest content. Uses `behavior: 'smooth'` so it doesn't
  // jolt; honors prefers-reduced-motion via the global CSS rule.
  // ---------------------------------------------------------------------
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (view !== 'chat') return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, loading, view]);

  // ---------------------------------------------------------------------
  // Auto-save the conversation after each assistant turn lands. Inserts
  // a new row on the first save (then stores the rowid), updates the
  // same row thereafter. Tolerates offline / DB hiccups silently — the
  // in-memory chat is unaffected.
  // ---------------------------------------------------------------------
  const persistConversation = async () => {
    if (messages.length === 0) return;
    try {
      const id = await saveAiConversation({
        id: currentConversationId ?? undefined,
        title: deriveTitle(messages),
        messagesJson: JSON.stringify(messages),
        verseContextJson: verses.length > 0 ? JSON.stringify(verses) : null,
        wordContextJson: wordContext ? JSON.stringify(wordContext) : null,
        provider: lastProviderRef.current,
        model: lastModelRef.current,
      });
      if (currentConversationId === null) setCurrentConversationId(id);
    } catch (e) {
      console.error('[AiPanel] Failed to save conversation:', e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    const userMsg: ChatMessage = { role: 'user', content: question.trim() };
    appendAiMessage(userMsg);
    setQuestion('');
    setAiLoading(true);

    try {
      const [providerPref, modelPref] = await Promise.all([
        getPreference('ai_provider'),
        getPreference('ai_model'),
      ]);

      if (!providerPref) {
        appendAiMessage({
          role: 'assistant',
          content:
            'No AI provider selected. Open Settings, choose a provider (OpenAI, Anthropic, Google, Groq, or Ollama), enter your API key, and click Save.',
        });
        setAiLoading(false);
        return;
      }

      const keyPresent = await hasApiKey(providerPref);
      if (providerPref !== 'ollama' && !keyPresent) {
        appendAiMessage({
          role: 'assistant',
          content: `No API key saved for ${providerPref}. Open Settings, paste your API key in the ${providerPref} field, and click Save.`,
        });
        setAiLoading(false);
        return;
      }

      const model = modelPref && modelPref.trim() !== '' ? modelPref : defaultModelFor(providerPref);
      lastProviderRef.current = providerPref;
      lastModelRef.current = model;

      const conversationHistory = [...messages, userMsg];
      const allMessages: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt(verses, wordContext) },
        ...conversationHistory,
      ];

      console.log('[AiPanel] Sending AI request:', { provider: providerPref, model, messageCount: allMessages.length });

      const response = await aiChat(allMessages, providerPref, model);
      appendAiMessage({ role: 'assistant', content: response });
      deselectAll();
    } catch (e: unknown) {
      console.error('[AiPanel] Error:', e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      appendAiMessage({
        role: 'assistant',
        content: `Error: ${errorMessage || 'Failed to get a response. Please check your API key in Settings.'}`,
      });
    } finally {
      setAiLoading(false);
    }
  };

  // After messages settle (loading flips false), persist. We don't save
  // on every appendAiMessage because we'd save twice per turn (once
  // with just the user message, once with the assistant reply). The
  // !loading edge captures both initial inserts and updates cleanly.
  useEffect(() => {
    if (loading) return;
    if (messages.length === 0) return;
    persistConversation();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only on settle
  }, [loading, messages.length]);

  // Switch from history back to chat after loading a saved conversation
  // (handled inside HistoryView via setView callback).

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
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1rem', fontWeight: 700 }}>
            {view === 'chat' ? 'Ask AI' : 'AI History'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {view === 'chat' ? (
            <>
              <HeaderButton
                label="History"
                onClick={() => setView('history')}
                title="View saved conversations"
                darkMode={darkMode}
              />
              {messages.length > 0 && (
                <HeaderButton
                  label="New chat"
                  onClick={clearAiConversation}
                  title="Start a new chat (current conversation stays in history)"
                  darkMode={darkMode}
                />
              )}
            </>
          ) : (
            <HeaderButton
              label="← Back"
              onClick={() => setView('chat')}
              title="Back to active chat"
              darkMode={darkMode}
            />
          )}
          <button
            onClick={onClose}
            aria-label="Close AI panel"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: darkMode ? '#a8a29e' : '#78716c',
              padding: '0.25rem',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {view === 'chat' ? (
        <ChatView
          darkMode={darkMode}
          verses={verses}
          messages={messages}
          loading={loading}
          question={question}
          onQuestionChange={setQuestion}
          onSubmit={handleSubmit}
          onDeselectAll={deselectAll}
          messagesEndRef={messagesEndRef}
        />
      ) : (
        <HistoryView
          darkMode={darkMode}
          activeConversationId={currentConversationId}
          onLoad={(conv) => {
            setAiMessages(conv.messages);
            setCurrentConversationId(conv.id);
            setView('chat');
          }}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// Chat view
// ----------------------------------------------------------------------

function ChatView({
  darkMode,
  verses,
  messages,
  loading,
  question,
  onQuestionChange,
  onSubmit,
  onDeselectAll,
  messagesEndRef,
}: {
  darkMode: boolean;
  verses: VerseRef[];
  messages: ChatMessage[];
  loading: boolean;
  question: string;
  onQuestionChange: (q: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onDeselectAll: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}) {
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
    <>
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
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.25rem',
              gap: '0.5rem',
            }}
          >
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                color: darkMode ? '#78716c' : '#a8a29e',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Selected Verses ({verses.length})
            </span>
            <button
              type="button"
              onClick={onDeselectAll}
              title="Deselect all verses"
              style={{
                fontSize: '0.65rem',
                fontWeight: 600,
                padding: '0.15rem 0.5rem',
                borderRadius: '9999px',
                border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
                background: 'transparent',
                color: darkMode ? '#a8a29e' : '#78716c',
                cursor: 'pointer',
              }}
            >
              Deselect all
            </button>
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
        {/* Anchor for auto-scroll. Sits below the latest message; the
            useEffect in AiPanel calls scrollIntoView on this element
            after every message change. */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input form */}
      <form
        onSubmit={onSubmit}
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
          onChange={(e) => onQuestionChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSubmit(e);
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
    </>
  );
}

// ----------------------------------------------------------------------
// History view
// ----------------------------------------------------------------------

function HistoryView({
  darkMode,
  activeConversationId,
  onLoad,
}: {
  darkMode: boolean;
  activeConversationId: number | null;
  onLoad: (conv: { id: number; messages: ChatMessage[] }) => void;
}) {
  const [items, setItems] = useState<AiConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAiConversations(100, 0);
      setItems(data.items);
    } catch (e) {
      console.error('[AiPanel] Failed to list conversations:', e);
      setError('Failed to load conversation history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleLoad = async (id: number) => {
    setBusy(id);
    try {
      const conv = await getAiConversation(id);
      if (!conv) {
        setError('Conversation not found.');
        return;
      }
      const parsed: ChatMessage[] = JSON.parse(conv.messages);
      onLoad({ id: conv.id, messages: parsed });
    } catch (e) {
      console.error('[AiPanel] Failed to load conversation:', e);
      setError('Failed to load that conversation.');
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this conversation?')) return;
    try {
      await deleteAiConversation(id);
      setItems((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      console.error('[AiPanel] Failed to delete conversation:', e);
    }
  };

  const muted = darkMode ? '#a8a29e' : '#78716c';
  const border = darkMode ? '#3c3a36' : '#e7e5e4';
  const cardBg = darkMode ? '#1a1a14' : '#fefce8';

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
      {loading ? (
        <p style={{ textAlign: 'center', padding: '2rem', color: muted }}>Loading…</p>
      ) : error ? (
        <p style={{ textAlign: 'center', padding: '2rem', color: '#dc2626' }}>{error}</p>
      ) : items.length === 0 ? (
        <p style={{ textAlign: 'center', padding: '2rem', color: muted, fontSize: '0.85rem' }}>
          No saved conversations yet. They'll appear here once you start chatting.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {items.map((c) => {
            const isActive = c.id === activeConversationId;
            return (
              <div
                key={c.id}
                onClick={() => handleLoad(c.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') handleLoad(c.id); }}
                style={{
                  padding: '0.75rem',
                  borderRadius: '8px',
                  backgroundColor: cardBg,
                  border: `1px solid ${isActive ? '#92400e' : border}`,
                  cursor: busy === c.id ? 'wait' : 'pointer',
                  opacity: busy === c.id ? 0.6 : 1,
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#92400e'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = isActive ? '#92400e' : border; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.title || 'Untitled chat'}
                  </h3>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                    aria-label="Delete conversation"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '0.7rem', padding: '0.125rem 0.375rem', flexShrink: 0 }}
                  >
                    Delete
                  </button>
                </div>
                {c.preview && (
                  <p
                    style={{
                      margin: '0.25rem 0 0',
                      fontSize: '0.78rem',
                      color: muted,
                      lineHeight: 1.4,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {c.preview}
                  </p>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.375rem', fontSize: '0.65rem', color: muted, opacity: 0.8 }}>
                  <span>{c.message_count} message{c.message_count === 1 ? '' : 's'}</span>
                  <span>{formatRelative(c.updated_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

function HeaderButton({
  label,
  onClick,
  title,
  darkMode,
}: {
  label: string;
  onClick: () => void;
  title: string;
  darkMode: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: darkMode ? '#a8a29e' : '#78716c',
        fontSize: '0.7rem',
        fontWeight: 600,
        padding: '0.25rem 0.5rem',
        borderRadius: '6px',
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  );
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const now = Date.now();
    const diffMs = now - d.getTime();
    const sec = Math.round(diffMs / 1000);
    if (sec < 60) return 'just now';
    const min = Math.round(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.round(hr / 24);
    if (day < 14) return `${day}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}
