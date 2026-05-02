import { useEffect, useState } from 'react';
import { getNotes, deleteNote, exportNotesAndBookmarks } from '../lib/tauri';
import type { Note as TauriNote } from '../lib/tauri';
import { NoteForm } from './NoteForm';
import { useFocusTrap } from '../lib/useFocusTrap';

const NOTES_PAGE = 100;

interface NotesSidebarProps {
  darkMode: boolean;
  onClose: () => void;
}

/** Right-side notes panel that lives next to the reader so the user can
 *  jot thoughts without losing their place. Click a note card to open
 *  the full-screen detail view; click "+ New" or Edit on a card to open
 *  the centered create/edit modal. The modal-form path stays a centered
 *  modal so the textarea has room to breathe. */
export function NotesSidebar({ darkMode, onClose }: NotesSidebarProps) {
  const [notes, setNotes] = useState<TauriNote[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<TauriNote | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewingNote, setViewingNote] = useState<TauriNote | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);

  const fetchPage = async (offset: number, replace: boolean) => {
    try {
      if (replace) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      const data = await getNotes(undefined, NOTES_PAGE, offset);
      setTotal(data.total);
      setNotes((prev) => (replace ? data.items : [...prev, ...data.items]));
    } catch (e) {
      setError('Failed to load notes.');
      console.error(e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => { fetchPage(0, true); }, []);

  const handleDelete = async (id: number) => {
    try {
      await deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      if (viewingNote?.id === id) setViewingNote(null);
    } catch (e) {
      console.error('Failed to delete note:', e);
    }
  };

  const handleNoteSuccess = (saved: TauriNote) => {
    if (editingNote) {
      setNotes((prev) => prev.map((n) => (n.id === saved.id ? saved : n)));
      setEditingNote(null);
      // If the user was viewing the note in detail before editing, keep
      // them there with the saved version so the edit feels in-place.
      if (viewingNote?.id === saved.id) setViewingNote(saved);
    } else {
      setNotes((prev) => [saved, ...prev]);
      setTotal((t) => t + 1);
      setCreating(false);
    }
  };

  const filteredNotes = searchQuery.trim()
    ? notes.filter((note) => {
        const q = searchQuery.toLowerCase();
        return (
          (note.title?.toLowerCase().includes(q) ?? false) ||
          note.content.toLowerCase().includes(q) ||
          (note.tags?.some((t) => t.toLowerCase().includes(q)) ?? false)
        );
      })
    : notes;

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      setShowExportMenu(false);
      const data = await exportNotesAndBookmarks();
      const today = new Date().toISOString().split('T')[0];
      if (format === 'json') {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        triggerDownload(blob, `aletheia-export-${today}.json`);
      } else {
        // Spreadsheets technically support multi-line CSV cells when
        // properly quoted, but every "Open in Excel"-grade tool and
        // grep-based pipeline still mishandles them — collapse newlines
        // into a single space so each row stays one line.
        const csvCell = (raw: string | null | undefined): string =>
          (raw ?? '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""');
        const lines: string[] = ['Type,ID,Title,Content,Tags,Verse Reference,Created,Updated'];
        for (const n of data.notes) {
          lines.push(`Note,${n.id},"${csvCell(n.title)}","${csvCell(n.content)}","${csvCell((n.tags || []).join('; '))}","${csvCell(n.verse_ref)}",${n.created_at},${n.updated_at}`);
        }
        for (const bm of data.bookmarks) {
          lines.push(`Bookmark,${bm.id},"${csvCell(bm.label)}","${csvCell(bm.verse_text)}","","${csvCell(bm.verse_ref)}",${bm.created_at},`);
        }
        const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
        triggerDownload(blob, `aletheia-export-${today}.csv`);
      }
    } catch (e) {
      console.error('Failed to export:', e);
      alert('Failed to export data.');
    }
  };

  // --- Styles ---
  const muted = darkMode ? '#a8a29e' : '#78716c';
  const border = darkMode ? '#3c3a36' : '#e7e5e4';
  const surface = darkMode ? '#252519' : '#ffffff';

  const headingText = searchQuery
    ? `${filteredNotes.length} of ${notes.length}`
    : `${notes.length}${notes.length < total ? ` of ${total}` : ''}`;

  return (
    <>
      {/* Sidebar column */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          backgroundColor: darkMode ? '#1a1a14' : '#fefce8',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.75rem 1rem',
            borderBottom: `1px solid ${border}`,
            backgroundColor: surface,
            gap: '0.5rem',
          }}
        >
          <span style={{ fontSize: '1rem', fontWeight: 700 }}>Notes ({headingText})</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {/* Export dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowExportMenu((v) => !v)}
                aria-label="Export notes and bookmarks"
                style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: '6px',
                  border: `1px solid ${border}`,
                  backgroundColor: 'transparent',
                  color: darkMode ? '#f5f5f4' : '#292524',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                }}
              >
                Export ▾
              </button>
              {showExportMenu && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '0.25rem',
                    backgroundColor: surface,
                    border: `1px solid ${border}`,
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                    zIndex: 10,
                    minWidth: '120px',
                  }}
                >
                  <ExportMenuItem darkMode={darkMode} label="Export as JSON" onClick={() => handleExport('json')} />
                  <ExportMenuItem darkMode={darkMode} label="Export as CSV" onClick={() => handleExport('csv')} />
                </div>
              )}
            </div>
            <button
              onClick={() => setCreating(true)}
              aria-label="New note"
              style={{
                padding: '0.25rem 0.5rem',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#92400e',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.7rem',
                fontWeight: 600,
              }}
            >
              + New
            </button>
            <button
              onClick={onClose}
              aria-label="Close notes"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: muted,
                padding: '0.25rem',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '0.75rem 1rem', borderBottom: `1px solid ${border}` }}>
          <input
            type="text"
            placeholder="Search notes…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem 0.625rem',
              borderRadius: '6px',
              border: `1px solid ${border}`,
              backgroundColor: surface,
              color: darkMode ? '#f5f5f4' : '#292524',
              fontSize: '0.85rem',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
          {loading ? (
            <p style={{ textAlign: 'center', padding: '2rem', color: muted }}>Loading…</p>
          ) : error ? (
            <p style={{ textAlign: 'center', padding: '2rem', color: '#dc2626' }}>{error}</p>
          ) : filteredNotes.length === 0 ? (
            searchQuery ? (
              <p style={{ textAlign: 'center', padding: '2rem', color: muted, fontSize: '0.85rem' }}>
                No notes match your search.
              </p>
            ) : (
              <p style={{ textAlign: 'center', padding: '2rem', color: muted, fontSize: '0.85rem' }}>
                No notes yet. Click "+ New" to create one.
              </p>
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {filteredNotes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  darkMode={darkMode}
                  onView={() => setViewingNote(note)}
                  onEdit={() => setEditingNote(note)}
                  onDelete={() => handleDelete(note.id)}
                />
              ))}
              {!searchQuery && notes.length < total && (
                <button
                  onClick={() => fetchPage(notes.length, false)}
                  disabled={loadingMore}
                  style={{
                    marginTop: '0.25rem',
                    padding: '0.5rem 0.625rem',
                    borderRadius: '6px',
                    border: `1px solid ${border}`,
                    backgroundColor: 'transparent',
                    color: muted,
                    cursor: loadingMore ? 'wait' : 'pointer',
                    fontSize: '0.75rem',
                  }}
                >
                  {loadingMore ? 'Loading…' : `Load more (${total - notes.length} remaining)`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Full-screen detail */}
      {viewingNote && (
        <NoteDetailModal
          note={viewingNote}
          darkMode={darkMode}
          onClose={() => setViewingNote(null)}
          onEdit={() => { setEditingNote(viewingNote); }}
          onDelete={() => handleDelete(viewingNote.id)}
        />
      )}

      {/* Create/edit form (centered modal). Backdrop click does NOT
          close — only X / Cancel / Escape, to match v0.1.1's
          click-outside fix. */}
      {(creating || editingNote) && (
        <NoteFormModal
          note={editingNote ?? undefined}
          darkMode={darkMode}
          onSuccess={handleNoteSuccess}
          onCancel={() => { setCreating(false); setEditingNote(null); }}
        />
      )}
    </>
  );
}

// ----------------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------------

function NoteCard({
  note,
  darkMode,
  onView,
  onEdit,
  onDelete,
}: {
  note: TauriNote;
  darkMode: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const muted = darkMode ? '#a8a29e' : '#78716c';
  const border = darkMode ? '#3c3a36' : '#e7e5e4';
  const cardBg = darkMode ? '#1a1a14' : '#fefce8';

  return (
    <div
      onClick={onView}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onView(); } }}
      style={{
        padding: '0.75rem',
        borderRadius: '8px',
        backgroundColor: cardBg,
        border: `1px solid ${border}`,
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#92400e'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = border; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <h3 style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {note.title || 'Untitled'}
        </h3>
        <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            aria-label="Edit note"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, fontSize: '0.7rem', padding: '0.125rem 0.375rem' }}
          >
            Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            aria-label="Delete note"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '0.7rem', padding: '0.125rem 0.375rem' }}
          >
            Delete
          </button>
        </div>
      </div>
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
        {note.content}
      </p>
      {(note.tags ?? []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem', marginTop: '0.375rem' }}>
          {(note.tags ?? []).slice(0, 4).map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: '0.6rem',
                padding: '0.1rem 0.4rem',
                borderRadius: '9999px',
                backgroundColor: darkMode ? '#2d2d24' : '#f5f5f4',
                color: muted,
              }}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function NoteDetailModal({
  note,
  darkMode,
  onClose,
  onEdit,
  onDelete,
}: {
  note: TauriNote;
  darkMode: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const trapRef = useFocusTrap<HTMLDivElement>();
  const muted = darkMode ? '#a8a29e' : '#78716c';
  const border = darkMode ? '#3c3a36' : '#e7e5e4';
  const surface = darkMode ? '#252519' : '#ffffff';

  // Closes on Escape (handled globally by AppInner) and on outside-click
  // (the backdrop). Read-only view, so click-to-close is fine — there's
  // no in-progress text to lose.
  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="note-detail-title"
    >
      <div
        ref={trapRef}
        className="modal-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '48rem',
          width: '90vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: surface,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '1rem' }}>
          <h2 id="note-detail-title" style={{ margin: 0, fontWeight: 700, fontSize: '1.5rem', flex: 1 }}>
            {note.title || 'Untitled'}
          </h2>
          <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
            <button
              onClick={onEdit}
              style={{
                padding: '0.375rem 0.75rem',
                borderRadius: '6px',
                border: `1px solid ${border}`,
                backgroundColor: 'transparent',
                color: darkMode ? '#f5f5f4' : '#292524',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              Edit
            </button>
            <button
              onClick={() => { if (confirm('Delete this note?')) onDelete(); }}
              style={{
                padding: '0.375rem 0.75rem',
                borderRadius: '6px',
                border: `1px solid ${border}`,
                backgroundColor: 'transparent',
                color: '#dc2626',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              Delete
            </button>
            <button
              onClick={onClose}
              aria-label="Close note"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, padding: '0.375rem' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Metadata strip */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.75rem', color: muted }}>
          <span>Created {formatDate(note.created_at)}</span>
          {note.updated_at && note.updated_at !== note.created_at && (
            <>
              <span>·</span>
              <span>Updated {formatDate(note.updated_at)}</span>
            </>
          )}
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0.75rem 0',
            fontSize: '1rem',
            lineHeight: 1.65,
            whiteSpace: 'pre-wrap',
            color: darkMode ? '#f5f5f4' : '#292524',
          }}
        >
          {note.content}
        </div>

        {(note.tags ?? []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', paddingTop: '0.75rem', borderTop: `1px solid ${border}` }}>
            {(note.tags ?? []).map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: '0.75rem',
                  padding: '0.2rem 0.625rem',
                  borderRadius: '9999px',
                  backgroundColor: darkMode ? '#2d2d24' : '#f5f5f4',
                  color: muted,
                  fontWeight: 500,
                }}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NoteFormModal({
  note,
  darkMode,
  onSuccess,
  onCancel,
}: {
  note?: TauriNote;
  darkMode: boolean;
  onSuccess: (saved: TauriNote) => void;
  onCancel: () => void;
}) {
  const trapRef = useFocusTrap<HTMLDivElement>();
  const muted = darkMode ? '#a8a29e' : '#78716c';

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="note-form-title"
    >
      <div ref={trapRef} className="modal-panel" style={{ maxWidth: '32rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 id="note-form-title" style={{ margin: 0, fontWeight: 700 }}>
            {note ? 'Edit Note' : 'New Note'}
          </h2>
          <button
            onClick={onCancel}
            aria-label="Close note form"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <NoteForm
          note={note}
          verseId={null}
          onSuccess={onSuccess}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}

function ExportMenuItem({ darkMode, label, onClick }: { darkMode: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        padding: '0.5rem 0.75rem',
        textAlign: 'left',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: darkMode ? '#f5f5f4' : '#292524',
        fontSize: '0.8rem',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = darkMode ? '#3c3a36' : '#f5f5f4'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      {label}
    </button>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}
