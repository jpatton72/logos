import { useState } from 'react';
import { createNote, updateNote } from '../api';
import { useAppStore } from '../store/useAppStore';
import type { Note } from '../lib/tauri';

interface NoteFormProps {
  note?: Note;
  verseId?: number | null;
  onSuccess: (note: Note) => void;
  onCancel: () => void;
}

export function NoteForm({ note, verseId, onSuccess, onCancel }: NoteFormProps) {
  const { darkMode, addNote, updateNote: updateStoreNote } = useAppStore();
  const [title, setTitle] = useState(note?.title ?? '');
  const [content, setContent] = useState(note?.content ?? '');
  const [tags, setTags] = useState(note?.tags?.join(', ') ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!note;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setError('Content is required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const tagList = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      let saved: Note;
      if (isEditing) {
        saved = await updateNote(note.id, content.trim(), title.trim() || undefined, tagList);
        updateStoreNote(saved.id, saved);
      } else {
        saved = await createNote(content.trim(), verseId ?? undefined, title.trim() || undefined, tagList);
        addNote(saved);
      }
      onSuccess(saved);
    } catch (e) {
      setError('Failed to save note.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      {note && (
        <div style={{ fontSize: '0.75rem', color: darkMode ? '#57534e' : '#a8a29e' }}>
          Editing note — created {new Date(note.created_at).toLocaleDateString()}
        </div>
      )}

      <div>
        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem', color: darkMode ? '#a8a29e' : '#78716c' }}>
          Title (optional)
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title..."
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            borderRadius: '6px',
            border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
            backgroundColor: darkMode ? '#1a1a14' : '#fff',
            color: darkMode ? '#f5f5f4' : '#292524',
            fontSize: '0.875rem',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem', color: darkMode ? '#a8a29e' : '#78716c' }}>
          Content *
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your note..."
          required
          rows={4}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            borderRadius: '6px',
            border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
            backgroundColor: darkMode ? '#1a1a14' : '#fff',
            color: darkMode ? '#f5f5f4' : '#292524',
            fontSize: '0.875rem',
            resize: 'vertical',
            fontFamily: "'Lora', serif",
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem', color: darkMode ? '#a8a29e' : '#78716c' }}>
          Tags (comma-separated)
        </label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="tag1, tag2, tag3"
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            borderRadius: '6px',
            border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
            backgroundColor: darkMode ? '#1a1a14' : '#fff',
            color: darkMode ? '#f5f5f4' : '#292524',
            fontSize: '0.875rem',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {error && (
        <p style={{ margin: 0, fontSize: '0.8rem', color: '#dc2626' }}>{error}</p>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            border: `1px solid ${darkMode ? '#3c3a36' : '#e7e5e4'}`,
            backgroundColor: darkMode ? '#252519' : '#fff',
            color: darkMode ? '#a8a29e' : '#78716c',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: 600,
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: '#92400e',
            color: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            fontSize: '0.8rem',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Note'}
        </button>
      </div>
    </form>
  );
}
