import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/stores';
import { formatTime, truncate } from '@/lib/utils';
import { NoteBlank, Plus, Trash, Pencil, X, Check } from '@phosphor-icons/react';
import type { Snippet, SnippetInput } from '@/types';

export function SnippetsView() {
  const snippets = useStore((s) => s.snippets);
  const refreshMeta = useStore((s) => s.refreshMeta);
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SnippetInput>({ title: '', content: '', tagId: null, isFavorited: false });

  useEffect(() => { refreshMeta(); }, []);

  async function handleCreate() {
    if (!form.title.trim() || !form.content.trim()) return;
    try {
      await api.createSnippet(form);
      setForm({ title: '', content: '', tagId: null, isFavorited: false });
      setShowForm(false);
      refreshMeta();
    } catch (e: unknown) { alert((e as Error).message); }
  }

  async function handleUpdate(id: number) {
    try {
      await api.updateSnippet(id, form);
      setEditing(null);
      refreshMeta();
    } catch (e: unknown) { alert((e as Error).message); }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this snippet?')) return;
    await api.deleteSnippet(id);
    refreshMeta();
  }

  function startEdit(s: Snippet) {
    setEditing(s.id);
    setForm({ title: s.title, content: s.content, tagId: s.tag_id, isFavorited: s.is_favorited });
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-ink-800">Snippets</h2>
          <p className="text-xs text-ink-400">Reusable text snippets</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setEditing(null); }}
          className="px-3 py-2 bg-teal-600 text-white text-xs rounded-lg hover:bg-teal-700 flex items-center gap-1.5">
          <Plus size={14} /> New Snippet
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-ink-200 rounded-xl p-4 mb-4 space-y-3">
          <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:border-teal-500" />
          <textarea placeholder="Content" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
            rows={4} className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:border-teal-500 font-mono" />
          <div className="flex gap-2">
            <button onClick={handleCreate} className="px-3 py-1.5 bg-teal-600 text-white text-xs rounded-lg hover:bg-teal-700">Create</button>
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 bg-ink-100 text-ink-600 text-xs rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {snippets.length === 0 && (
          <div className="text-center py-12 text-ink-400 text-sm flex flex-col items-center">
            <NoteBlank size={40} className="mb-2 opacity-30" />
            No snippets yet
          </div>
        )}
        {snippets.map((s) => editing === s.id ? (
          <div key={s.id} className="bg-white border border-teal-300 rounded-xl p-4 space-y-2">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-ink-200 rounded focus:outline-none focus:border-teal-500" />
            <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={3} className="w-full px-3 py-2 text-sm border border-ink-200 rounded font-mono focus:outline-none focus:border-teal-500" />
            <div className="flex gap-2">
              <button onClick={() => handleUpdate(s.id)} className="p-1.5 bg-teal-600 text-white rounded"><Check size={14} /></button>
              <button onClick={() => setEditing(null)} className="p-1.5 bg-ink-100 rounded"><X size={14} /></button>
            </div>
          </div>
        ) : (
          <div key={s.id} className="bg-white border border-ink-200 rounded-lg p-4 flex gap-3">
            <NoteBlank size={16} className="text-teal-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-ink-800">{s.title}</span>
                <span className="text-xs text-ink-400">{formatTime(s.updated_at)}</span>
              </div>
              <div className="text-xs text-ink-500 font-mono whitespace-pre-wrap line-clamp-2">{truncate(s.content, 200)}</div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => startEdit(s)} className="p-1.5 hover:bg-ink-100 rounded text-ink-400 hover:text-ink-700"><Pencil size={14} /></button>
              <button onClick={() => handleDelete(s.id)} className="p-1.5 hover:bg-red-50 rounded text-ink-400 hover:text-red-600"><Trash size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
