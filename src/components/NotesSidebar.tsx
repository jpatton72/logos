import { useEffect, useState } from 'react';
import { getNotes, deleteNote, exportNotesAndBookmarks } from '../lib/tauri';
import type { Note as TauriNote } from '../lib/tauri';
import { NoteForm } from './NoteForm';

const NOTES_PAGE = 100;

interface NotesSidebarProps {
  darkMode: boolean;
  onClose: () => void;
}

/** What the sidebar is currently rendering. The reader stays visible
 *  in all three views — that's the whole point of moving notes from a
 *  modal to a sidebar: the user can read AND take notes without
 *  popping in/out of an overlay. */
type View =
  | { kind: 'list' }
  | { kind: 'detail'; note: TauriNote }
  | { kind: 'form'; note?: TauriNote };  // note=undefined => "new"

export function NotesSidebar({ darkMode, onClose }: NotesSidebarProps) {
  const [notes, setNotes] = useState<TauriNote[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [view, setView] = useState<View>({ kind: 'list' });

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
      // If the deleted note was open in detail/form, drop back to list.
      if (view.kind !== 'list' && view.kind === 'detail' && view.note.id === id) setView({ kind: 'list' });
      if (view.kind === 'form' && view.note?.id === id) setView({ kind: 'list' });
    } catch (e) {
      console.error('Failed to delete note:', e);
    }
  };

  const handleNoteSuccess = (saved: TauriNote) => {
    if (view.kind === 'form' && view.note) {
      // Editing an existing note: update list, return to detail of the
      // saved version so the user sees the result without an extra
      // click back through the list.
      setNotes((prev) => prev.map((n) => (n.id === saved.id ? saved : n)));
      setView({ kind: 'detail', note: saved });
    } else {
      // Created new: prepend, jump to its detail view.
      setNotes((prev) => [saved, ...prev]);
      setTotal((t) => t + 1);
      setView({ kind: 'detail', note: saved });
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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: darkMode ? '#1a1a14' : '#fefce8',
      }}
    >
      {/* Header — content varies by view; close button is always there. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 1rem',
          borderBottom: `1px solid ${border}`,
          backgroundColor: surface,
          gap: '0.5rem',
          minHeight: '48px',
        }}
      >
        {view.kind === 'list' ? (
          <>
            <span style={{ fontSize: '1rem', fontWeight: 700 }}>
              Notes ({searchQuery ? `${filteredNotes.length} of ${notes.length}` : `${notes.length}${notes.length < total ? ` of ${total}` : ''}`})
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowExportMenu((v) => !v)}
                  aria-label="Export notes and bookmarks"
                  style={pillBtnStyle(darkMode, border)}
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
                onClick={() => setView({ kind: 'form' })}
                aria-label="New note"
                style={primaryPillBtnStyle()}
              >
                + New
              </button>
              <CloseBtn muted={muted} onClick={onClose} />
            </div>
          </>
        ) : view.kind === 'detail' ? (
          <>
            <button
              onClick={() => setView({ kind: 'list' })}
              aria-label="Back to notes list"
              style={ghostBtnStyle(muted)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>Back</span>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <button
                onClick={() => setView({ kind: 'form', note: view.note })}
                style={pillBtnStyle(darkMode, border)}
              >
                Edit
              </button>
              <button
                onClick={() => { if (confirm('Delete this note?')) handleDelete(view.note.id); }}
                style={{
                  ...pillBtnStyle(darkMode, border),
                  color: '#dc2626',
                }}
              >
                Delete
              </button>
              <CloseBtn muted={muted} onClick={onClose} />
            </div>
          </>
        ) : (
          <>
            <button
              onClick={() => setView(view.note ? { kind: 'detail', note: view.note } : { kind: 'list' })}
              aria-label={view.note ? 'Back to note' : 'Back to notes list'}
              style={ghostBtnStyle(muted)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>Back</span>
            </button>
            <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>{view.note ? 'Edit Note' : 'New Note'}</span>
            <CloseBtn muted={muted} onClick={onClose} />
          </>
        )}
      </div>

      {/* Body */}
      {view.kind === 'list' && (
        <ListView
          darkMode={darkMode}
          loading={loading}
          loadingMore={loadingMore}
          error={error}
          notes={filteredNotes}
          totalNotes={notes.length}
          total={total}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onView={(n) => setView({ kind: 'detail', note: n })}
          onEdit={(n) => setView({ kind: 'form', note: n })}
          onDelete={handleDelete}
          onLoadMore={() => fetchPage(notes.length, false)}
        />
      )}
      {view.kind === 'detail' && (
        <DetailView note={view.note} darkMode={darkMode} />
      )}
      {view.kind === 'form' && (
        <FormView
          note={view.note}
          onSuccess={handleNoteSuccess}
          onCancel={() => setView(view.note ? { kind: 'detail', note: view.note } : { kind: 'list' })}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// Sub-views (inline column content; not modals)
// ----------------------------------------------------------------------

function ListView({
  darkMode,
  loading,
  loadingMore,
  error,
  notes,
  totalNotes,
  total,
  searchQuery,
  onSearchChange,
  onView,
  onEdit,
  onDelete,
  onLoadMore,
}: {
  darkMode: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  notes: TauriNote[];
  totalNotes: number;  // length of unfiltered notes array
  total: number;       // server-side total count
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onView: (n: TauriNote) => void;
  onEdit: (n: TauriNote) => void;
  onDelete: (id: number) => void;
  onLoadMore: () => void;
}) {
  const muted = darkMode ? '#a8a29e' : '#78716c';
  const border = darkMode ? '#3c3a36' : '#e7e5e4';
  const surface = darkMode ? '#252519' : '#ffffff';

  return (
    <>
      <div style={{ padding: '0.75rem 1rem', borderBottom: `1px solid ${border}` }}>
        <input
          type="text"
          placeholder="Search notes…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
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

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
        {loading ? (
          <p style={{ textAlign: 'center', padding: '2rem', color: muted }}>Loading…</p>
        ) : error ? (
          <p style={{ textAlign: 'center', padding: '2rem', color: '#dc2626' }}>{error}</p>
        ) : notes.length === 0 ? (
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
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                darkMode={darkMode}
                onView={() => onView(note)}
                onEdit={() => onEdit(note)}
                onDelete={() => onDelete(note.id)}
              />
            ))}
            {!searchQuery && totalNotes < total && (
              <button
                onClick={onLoadMore}
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
                {loadingMore ? 'Loading…' : `Load more (${total - totalNotes} remaining)`}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function DetailView({ note, darkMode }: { note: TauriNote; darkMode: boolean }) {
  const muted = darkMode ? '#a8a29e' : '#78716c';
  const border = darkMode ? '#3c3a36' : '#e7e5e4';

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column' }}>
      <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, lineHeight: 1.3 }}>
        {note.title || 'Untitled'}
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.375rem', fontSize: '0.7rem', color: muted }}>
        <span>Created {formatDate(note.created_at)}</span>
        {note.updated_at && note.updated_at !== note.created_at && (
          <>
            <span>·</span>
            <span>Updated {formatDate(note.updated_at)}</span>
          </>
        )}
      </div>
      <div
        style={{
          marginTop: '1rem',
          fontSize: '0.92rem',
          lineHeight: 1.65,
          whiteSpace: 'pre-wrap',
          color: darkMode ? '#f5f5f4' : '#292524',
          flex: 1,
        }}
      >
        {note.content}
      </div>
      {(note.tags ?? []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '1rem', paddingTop: '0.75rem', borderTop: `1px solid ${border}` }}>
          {(note.tags ?? []).map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: '0.7rem',
                padding: '0.15rem 0.55rem',
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
  );
}

function FormView({
  note,
  onSuccess,
  onCancel,
}: {
  note?: TauriNote;
  onSuccess: (saved: TauriNote) => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
      <NoteForm
        note={note}
        verseId={null}
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    </div>
  );
}

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

// ----------------------------------------------------------------------
// Style + element helpers
// ----------------------------------------------------------------------

function pillBtnStyle(darkMode: boolean, border: string): React.CSSProperties {
  return {
    padding: '0.25rem 0.5rem',
    borderRadius: '6px',
    border: `1px solid ${border}`,
    backgroundColor: 'transparent',
    color: darkMode ? '#f5f5f4' : '#292524',
    cursor: 'pointer',
    fontSize: '0.7rem',
    fontWeight: 600,
  };
}

function primaryPillBtnStyle(): React.CSSProperties {
  return {
    padding: '0.25rem 0.5rem',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: '#92400e',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.7rem',
    fontWeight: 600,
  };
}

function ghostBtnStyle(muted: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: muted,
    fontSize: '0.78rem',
    fontWeight: 600,
    padding: '0.25rem 0.375rem',
    fontFamily: 'inherit',
  };
}

function CloseBtn({ muted, onClick }: { muted: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
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
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
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
