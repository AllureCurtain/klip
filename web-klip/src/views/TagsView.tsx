import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/stores';
import { Tag as TagIcon, Plus, Trash } from '@phosphor-icons/react';
import type { Tag } from '@/types';

export function TagsView() {
  const tags = useStore((s) => s.tags);
  const refreshMeta = useStore((s) => s.refreshMeta);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#0d9488');
  const [creating, setCreating] = useState(false);

  useEffect(() => { refreshMeta(); }, []);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await api.createTag(name.trim(), color);
      setName('');
      refreshMeta();
    } catch (e: unknown) {
      const err = e as { message?: string };
      alert(err.message || 'Failed to create tag');
    } finally { setCreating(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this tag?')) return;
    await api.deleteTag(id);
    refreshMeta();
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <h2 className="text-lg font-semibold text-ink-800 mb-1">Tags</h2>
      <p className="text-xs text-ink-400 mb-5">Organize clipboard items with color-coded tags</p>

      <div className="bg-white border border-ink-200 rounded-xl p-4 mb-5">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs text-ink-500 mb-1 block">Tag name</label>
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. work, personal, secrets"
              className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:border-teal-500"
            />
          </div>
          <div>
            <label className="text-xs text-ink-500 mb-1 block">Color</label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
              className="w-10 h-9 border border-ink-200 rounded-lg cursor-pointer" />
          </div>
          <button onClick={handleCreate} disabled={creating || !name.trim()}
            className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1.5">
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      <div className="grid gap-2">
        {tags.length === 0 && (
          <div className="text-center py-10 text-ink-400 text-sm flex flex-col items-center">
            <TagIcon size={40} className="mb-2 opacity-30" />
            No tags yet
          </div>
        )}
        {tags.map((tag) => (
          <div key={tag.id} className="flex items-center gap-3 bg-white border border-ink-200 rounded-lg px-4 py-3">
            <div className="w-3 h-3 rounded-full" style={{ background: tag.color || '#0d9488' }} />
            <span className="text-sm font-medium text-ink-800 flex-1">{tag.name}</span>
            <span className="text-xs text-ink-400 font-mono">#{tag.id}</span>
            <button onClick={() => handleDelete(tag.id)} className="p-1.5 hover:bg-red-50 rounded text-ink-400 hover:text-red-600">
              <Trash size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
