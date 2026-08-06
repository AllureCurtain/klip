import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/stores';
import { Gear, FloppyDisk, Check } from '@phosphor-icons/react';

const CONFIG_FIELDS = [
  { key: 'max_history_count', label: 'Max history count', type: 'number' },
  { key: 'search_debounce_ms', label: 'Search debounce (ms)', type: 'number' },
  { key: 'language', label: 'Language', type: 'text' },
  { key: 'window_width', label: 'Window width', type: 'number' },
  { key: 'window_height', label: 'Window height', type: 'number' },
  { key: 'close_to_tray', label: 'Close to tray', type: 'bool' },
  { key: 'clipboard_monitor_enabled', label: 'Clipboard monitoring', type: 'bool' },
  { key: 'sensitive_capture_policy', label: 'Sensitive policy (flag/skip)', type: 'text' },
  { key: 'mask_sensitive_previews', label: 'Mask sensitive previews', type: 'bool' },
  { key: 'llm_provider', label: 'LLM provider (fake/openai)', type: 'text' },
  { key: 'llm_model', label: 'LLM model', type: 'text' },
  { key: 'llm_base_url', label: 'LLM base URL', type: 'text' },
  { key: 'llm_max_context_items', label: 'LLM max context items', type: 'number' },
];

export function ConfigView() {
  const config = useStore((s) => s.config);
  const loadConfig = useStore((s) => s.loadConfig);
  const [local, setLocal] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { loadConfig(); }, [loadConfig]);
  useEffect(() => { setLocal(config); }, [config]);

  async function handleSave() {
    setSaving(true);
    try {
      await api.setConfigMany(local);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      loadConfig();
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally { setSaving(false); }
  }

  function setVal(key: string, val: string) {
    setLocal((prev) => ({ ...prev, [key]: val }));
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-ink-800 flex items-center gap-2">
            <Gear size={20} /> Configuration
          </h2>
          <p className="text-xs text-ink-400">App configuration (stored in SQLite)</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 bg-teal-600 text-white text-xs rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1.5">
          {saved ? <Check size={14} /> : <FloppyDisk size={14} />}
          {saved ? 'Saved' : saving ? 'Saving...' : 'Save changes'}
        </button>
      </div>

      <div className="bg-white border border-ink-200 rounded-xl overflow-hidden">
        {CONFIG_FIELDS.map((field, i) => (
          <div key={field.key} className={`flex items-center gap-4 px-5 py-3 ${i > 0 ? 'border-t border-ink-100' : ''}`}>
            <label className="text-xs text-ink-600 w-48 flex-shrink-0">{field.label}</label>
            {field.type === 'bool' ? (
              <label className="flex items-center gap-2 cursor-pointer">
                <button
                  type="button"
                  onClick={() => setVal(field.key, local[field.key] === 'true' ? 'false' : 'true')}
                  className={`w-9 h-5 rounded-full relative transition-colors ${local[field.key] === 'true' ? 'bg-teal-500' : 'bg-ink-300'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${local[field.key] === 'true' ? 'left-[18px]' : 'left-0.5'}`} />
                </button>
                <span className="text-xs font-mono text-ink-400">{local[field.key] ?? config[field.key]}</span>
              </label>
            ) : (
              <input
                type={field.type}
                value={local[field.key] ?? config[field.key] ?? ''}
                onChange={(e) => setVal(field.key, e.target.value)}
                className="flex-1 max-w-xs px-3 py-1.5 text-xs border border-ink-200 rounded-lg focus:outline-none focus:border-teal-500 font-mono"
              />
            )}
            <span className="text-xs text-ink-300 font-mono">{field.key}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 bg-ink-50 border border-ink-200 rounded-xl p-4">
        <div className="text-xs text-ink-500 mb-2">Raw config (all keys):</div>
        <pre className="text-xs font-mono text-ink-700 overflow-auto max-h-48">
{JSON.stringify(config, null, 2)}
        </pre>
      </div>
    </div>
  );
}
