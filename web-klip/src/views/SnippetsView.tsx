import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/stores';
import { formatTime, truncate } from '@/lib/utils';
import { NoteBlank, Plus, Trash, Pencil, X, Check, Star } from '@phosphor-icons/react';
import type { Snippet, SnippetInput } from '@/types';
import { EmptyState } from '@/components/ui';

export function SnippetsView() {
  const snippets = useStore((s) => s.snippets);
  const tags = useStore((s) => s.tags);
  const refreshMeta = useStore((s) => s.refreshMeta);
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SnippetInput>({ title: '', content: '', tagId: null, isFavorited: false });

  useEffect(() => { refreshMeta(); }, []);

  function resetForm() {
    setForm({ title: '', content: '', tagId: null, isFavorited: false });
  }

  async function handleCreate() {
    if (!form.title.trim() || !form.content.trim()) return;
    try {
      await api.createSnippet(form);
      resetForm();
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
    await api.deleteSnippet(id);
    refreshMeta();
  }

  function startEdit(s: Snippet) {
    setEditing(s.id);
    setForm({ title: s.title, content: s.content, tagId: s.tag_id, isFavorited: s.is_favorited });
  }

  function tagPicker(id: string) {
    return (
      <select
        id={id}
        value={form.tagId ?? ''}
        onChange={(e) => setForm({ ...form, tagId: e.target.value ? Number(e.target.value) : null })}
        aria-label="Snippet tag"
        className="px-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:border-teal-500 bg-white"
      >
        <option value="">No tag</option>
        {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-ink-800">Snippets</h2>
          <p className="text-xs text-ink-400">Reusable text snippets</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setEditing(null); resetForm(); }}
          className="px-4 py-2 bg-teal-600 text-white text-xs rounded-lg hover:bg-teal-700 flex items-center gap-1.5">
          <Plus size={14} /> New Snippet
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-ink-200 rounded-xl p-4 mb-4 space-y-3">
          <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            aria-label="Snippet title"
            className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:border-teal-500" />
          <textarea placeholder="Content" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
            aria-label="Snippet content"
            rows={4} className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:border-teal-500 font-mono" />
          <div className="flex gap-2 items-center">
            {tagPicker('snippet-tag-new')}
            <label className="flex items-center gap-1.5 text-xs text-ink-600 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isFavorited}
                onChange={(e) => setForm({ ...form, isFavorited: e.target.checked })}
              />
              <Star size={12} weight={form.isFavorited ? 'fill' : 'regular'} className={form.isFavorited ? 'text-amber-500' : 'text-ink-400'} />
              Favorite
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!form.title.trim() || !form.content.trim()}
              className="px-4 py-1.5 bg-teal-600 text-white text-xs rounded-lg hover:bg-teal-700 disabled:opacity-50">Create</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-1.5 bg-ink-100 text-ink-600 text-xs rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {snippets.length === 0 && !showForm && (
          <EmptyState icon={<NoteBlank size={40} />} title="No snippets yet" hint="Save frequently-used text with a tag and a favorite flag." />
        )}
        {snippets.map((s) => editing === s.id ? (
          <div key={s.id} className="bg-white border border-teal-300 rounded-xl p-4 space-y-2">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              aria-label="Snippet title"
              className="w-full px-3 py-2 text-sm border border-ink-200 rounded focus:outline-none focus:border-teal-500" />
            <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
              aria-label="Snippet content"
              rows={3} className="w-full px-3 py-2 text-sm border border-ink-200 rounded font-mono focus:outline-none focus:border-teal-500" />
            <div className="flex gap-2 items-center">
              {tagPicker(`snippet-tag-${s.id}`)}
              <label className="flex items-center gap-1.5 text-xs text-ink-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isFavorited}
                  onChange={(e) => setForm({ ...form, isFavorited: e.target.checked })}
                />
                Favorite
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleUpdate(s.id)} aria-label="Save snippet" title="Save"
                className="p-1.5 bg-teal-600 text-white rounded"><Check size={14} /></button>
              <button onClick={() => setEditing(null)} aria-label="Cancel editing" title="Cancel"
                className="p-1.5 bg-ink-100 rounded"><X size={14} /></button>
            </div>
          </div>
        ) : (
          <div key={s.id} className="bg-white border border-ink-200 rounded-lg p-4 flex gap-3">
            <NoteBlank size={16} className="text-teal-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-ink-800">{s.title}</span>
                {s.is_favorited && <Star size={12} weight="fill" className="text-amber-500" />}
                <span className="text-xs text-ink-400">{formatTime(s.updated_at)}</span>
              </div>
              <div className="text-xs text-ink-500 font-mono whitespace-pre-wrap line-clamp-2">{truncate(s.content, 200)}</div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => startEdit(s)} aria-label={`Edit snippet ${s.title}`} title="Edit"
                className="p-1.5 hover:bg-ink-100 rounded text-ink-400 hover:text-ink-700"><Pencil size={14} /></button>
              <button onClick={() => handleDelete(s.id)} aria-label={`Delete snippet ${s.title}`} title="Delete"
                className="p-1.5 hover:bg-red-50 rounded text-ink-400 hover:text-red-600"><Trash size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
