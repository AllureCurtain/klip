import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/stores';
import { Tag as TagIcon, Plus, Trash } from '@phosphor-icons/react';
import type { Tag } from '@/types';
import { EmptyState, ConfirmDialog } from '@/components/ui';

export function TagsView() {
  const tags = useStore((s) => s.tags);
  const refreshMeta = useStore((s) => s.refreshMeta);
  const pushToast = useStore((s) => s.pushToast);
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
      pushToast('success', `Tag "${name.trim()}" created`);
    } catch (e: unknown) {
      const err = e as { message?: string };
      pushToast('error', err.message || 'Failed to create tag');
    } finally { setCreating(false); }
  }

  async function handleDelete(id: number, tagName: string) {
    try {
      await api.deleteTag(id);
      refreshMeta();
      pushToast('success', `Tag "${tagName}" deleted`);
    } catch (e: unknown) {
      pushToast('error', (e as Error).message);
    }
  }

  const [pendingDelete, setPendingDelete] = useState<Tag | null>(null);

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <h2 className="text-lg font-semibold text-ink-800 mb-1">Tags</h2>
      <p className="text-xs text-ink-400 mb-5">Organize clipboard items with color-coded tags</p>

      <div className="bg-white border border-ink-200 rounded-xl p-4 mb-5">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label htmlFor="tag-name" className="text-xs text-ink-500 mb-1 block">Tag name</label>
            <input
              id="tag-name"
              value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. work, personal, secrets"
              className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:border-teal-500"
            />
          </div>
          <div>
            <label htmlFor="tag-color" className="text-xs text-ink-500 mb-1 block">Color</label>
            <input id="tag-color" type="color" value={color} onChange={(e) => setColor(e.target.value)}
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
          <EmptyState icon={<TagIcon size={40} />} title="No tags yet" hint="Create your first tag above, then assign it from any clipboard item's detail panel." />
        )}
        {tags.map((tag) => (
          <div key={tag.id} className="flex items-center gap-3 bg-white border border-ink-200 rounded-lg px-4 py-3">
            <div className="w-3 h-3 rounded-full" style={{ background: tag.color || '#0d9488' }} />
            <span className="text-sm font-medium text-ink-800 flex-1">{tag.name}</span>
            <span className="text-xs text-ink-400 font-mono">#{tag.id}</span>
            <button
              onClick={() => setPendingDelete(tag)}
              aria-label={`Delete tag ${tag.name}`}
              title={`Delete tag ${tag.name}`}
              className="p-1.5 hover:bg-red-50 rounded text-ink-400 hover:text-red-600"
            >
              <Trash size={14} />
            </button>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete tag?"
        message={pendingDelete ? `The tag "${pendingDelete.name}" will be removed from all clipboard items.` : ''}
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void handleDelete(pendingDelete.id, pendingDelete.name);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
