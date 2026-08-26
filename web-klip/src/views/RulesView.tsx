import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/stores';
import { ShieldWarning, Plus, Trash, Pencil, Check, X } from '@phosphor-icons/react';
import type { SourceRule, SourceRuleInput } from '@/types';
import { ConfirmDialog } from '@/components/ui';

export function RulesView() {
  const rules = useStore((s) => s.sourceRules);
  const refreshMeta = useStore((s) => s.refreshMeta);
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SourceRuleInput>({ matchType: 'process', pattern: '', enabled: true });
  const [pendingDelete, setPendingDelete] = useState<SourceRule | null>(null);

  useEffect(() => { refreshMeta(); }, []);

  async function handleCreate() {
    if (!form.pattern.trim()) return;
    try {
      await api.createSourceRule(form);
      setForm({ matchType: 'process', pattern: '', enabled: true });
      setShowForm(false);
      refreshMeta();
    } catch (e: unknown) { alert((e as Error).message); }
  }

  async function handleUpdate(id: number) {
    try { await api.updateSourceRule(id, form); setEditing(null); refreshMeta(); }
    catch (e: unknown) { alert((e as Error).message); }
  }

  async function handleDelete(id: number) {
    await api.deleteSourceRule(id);
    refreshMeta();
  }

  async function toggleEnabled(r: SourceRule) {
    await api.setSourceRuleEnabled(r.id, !r.enabled);
    refreshMeta();
  }

  function startEdit(r: SourceRule) {
    setEditing(r.id);
    setForm({ matchType: r.match_type as SourceRuleInput['matchType'], pattern: r.pattern, enabled: r.enabled });
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-ink-800">Source Rules</h2>
          <p className="text-xs text-ink-400">Ignore clipboard from specific apps or window titles</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setEditing(null); }}
          className="px-3 py-2 bg-teal-600 text-white text-xs rounded-lg hover:bg-teal-700 flex items-center gap-1.5">
          <Plus size={14} /> New Rule
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-ink-200 rounded-xl p-4 mb-4 space-y-3">
          <div className="flex gap-3">
            <select value={form.matchType} onChange={(e) => setForm({ ...form, matchType: e.target.value as SourceRuleInput['matchType'] })}
              className="px-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:border-teal-500">
              <option value="process">Process name</option>
              <option value="title">Window title</option>
              <option value="any">Any</option>
            </select>
            <input placeholder="Pattern (e.g. 1Password.exe, Private Browsing)" value={form.pattern}
              onChange={(e) => setForm({ ...form, pattern: e.target.value })}
              className="flex-1 px-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:border-teal-500" />
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-600">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            Enabled
          </label>
          <div className="flex gap-2">
            <button onClick={handleCreate} className="px-3 py-1.5 bg-teal-600 text-white text-xs rounded-lg">Create</button>
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 bg-ink-100 text-ink-600 text-xs rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {rules.length === 0 && (
          <div className="text-center py-12 text-ink-400 text-sm flex flex-col items-center">
            <ShieldWarning size={40} className="mb-2 opacity-30" />
            No rules yet
          </div>
        )}
        {rules.map((r) => editing === r.id ? (
          <div key={r.id} className="bg-white border border-teal-300 rounded-xl p-4 space-y-2">
            <div className="flex gap-2">
              <select value={form.matchType} onChange={(e) => setForm({ ...form, matchType: e.target.value as SourceRuleInput['matchType'] })}
                className="px-2 py-1 text-xs border border-ink-200 rounded">
                <option value="process">Process</option>
                <option value="title">Title</option>
                <option value="any">Any</option>
              </select>
              <input value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })}
                className="flex-1 px-2 py-1 text-xs border border-ink-200 rounded" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleUpdate(r.id)} aria-label="Save rule" title="Save" className="p-1.5 bg-teal-600 text-white rounded"><Check size={14} /></button>
              <button onClick={() => setEditing(null)} aria-label="Cancel editing" title="Cancel" className="p-1.5 bg-ink-100 rounded"><X size={14} /></button>
            </div>
          </div>
        ) : (
          <div key={r.id} className="bg-white border border-ink-200 rounded-lg p-4 flex items-center gap-3">
            <button onClick={() => toggleEnabled(r)}
              aria-label={r.enabled ? `Disable rule ${r.pattern}` : `Enable rule ${r.pattern}`}
              title={r.enabled ? "Disable" : "Enable"}
              className={`w-8 h-5 rounded-full relative transition-colors ${r.enabled ? 'bg-teal-500' : 'bg-ink-300'}`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${r.enabled ? 'left-3.5' : 'left-0.5'}`} />
            </button>
            <span className="text-xs px-2 py-0.5 bg-ink-100 text-ink-600 rounded font-mono">{r.match_type}</span>
            <span className="text-sm text-ink-800 flex-1 font-mono">{r.pattern}</span>
            <button onClick={() => startEdit(r)} aria-label={`Edit rule ${r.pattern}`} title="Edit" className="p-1.5 hover:bg-ink-100 rounded text-ink-400 hover:text-ink-700"><Pencil size={14} /></button>
            <button onClick={() => setPendingDelete(r)} aria-label={`Delete rule ${r.pattern}`} title="Delete" className="p-1.5 hover:bg-red-50 rounded text-ink-400 hover:text-red-600"><Trash size={14} /></button>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete rule?"
        message={pendingDelete ? `The ${pendingDelete.match_type} rule "${pendingDelete.pattern}" will be permanently deleted.` : ''}
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void handleDelete(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
