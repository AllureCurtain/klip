import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/stores';
import { Database, Download, Upload, Trash, ShieldWarning } from '@phosphor-icons/react';
import type { SystemInfo, DiagnosticsInfo } from '@/types';

export function SystemView() {
  const systemInfo = useStore((s) => s.systemInfo);
  const diagnostics = useStore((s) => s.diagnostics);
  const refreshMeta = useStore((s) => s.refreshMeta);
  const [path, setPath] = useState('klip-export.json');
  const [csvPath, setCsvPath] = useState('klip-export.csv');
  const [backupPath, setBackupPath] = useState('klip-backup.db');
  const [restorePath, setRestorePath] = useState('klip-backup.db');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { refreshMeta(); }, [refreshMeta]);

  useEffect(() => {
    if (!diagnostics) return;
    const separator = diagnostics.data_dir.includes('\\') ? '\\' : '/';
    const inDataDir = (name: string) => `${diagnostics.data_dir}${separator}${name}`;
    setPath(inDataDir('klip-export.json'));
    setCsvPath(inDataDir('klip-export.csv'));
    setBackupPath(inDataDir('klip-backup.db'));
    setRestorePath(inDataDir('klip-backup.db'));
  }, [diagnostics]);

  function showMsg(m: string) { setMsg(m); setTimeout(() => setMsg(null), 3000); }

  async function handleExportJson() {
    try { const r = await api.exportJson(path); showMsg(`Exported ${r.size} bytes to ${r.path}`); }
    catch (e: unknown) { showMsg('Error: ' + (e as Error).message); }
  }
  async function handleExportCsv() {
    try { const r = await api.exportCsv(csvPath); showMsg(`Exported ${r.size} bytes to ${r.path}`); }
    catch (e: unknown) { showMsg('Error: ' + (e as Error).message); }
  }
  async function handleBackup() {
    try { const r = await api.backupDatabase(backupPath); showMsg(`Backup: ${r.size} bytes at ${r.path}`); }
    catch (e: unknown) { showMsg('Error: ' + (e as Error).message); }
  }
  async function handleRestore() {
    if (!confirm('Restore from backup? This will overwrite current data.')) return;
    try { const r = await api.restoreDatabase(restorePath); showMsg(`Restored ${r.size} bytes`); }
    catch (e: unknown) { showMsg('Error: ' + (e as Error).message); }
  }
  async function handleRescan() {
    try { const r = await api.rescanSensitive(); showMsg(`Rescanned, ${r.count} sensitive items flagged`); }
    catch (e: unknown) { showMsg('Error: ' + (e as Error).message); }
  }
  async function handleClear() {
    if (!confirm('Clear ALL clipboard history? This cannot be undone.')) return;
    try { await api.clearClipboard(); showMsg('History cleared'); }
    catch (e: unknown) { showMsg('Error: ' + (e as Error).message); }
  }
  async function handleToggleWindow() {
    try { await api.toggleWindow(); showMsg('Toggled window'); }
    catch (e: unknown) { showMsg('Window control requires Tauri app running'); }
  }
  async function handleAutostart() {
    try { const v = await api.getAutostart(); showMsg(`Autostart: ${v}`); }
    catch (e: unknown) { showMsg('Autostart requires Tauri app'); }
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <h2 className="text-lg font-semibold text-ink-800 mb-1 flex items-center gap-2">
        <Database size={20} /> System & Data
      </h2>
      <p className="text-xs text-ink-400 mb-5">System info, data management, and app control</p>

      {msg && <div className="mb-4 p-2.5 bg-ink-900 text-white text-xs rounded-lg fade-in-up">{msg}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-ink-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-ink-800 mb-3">System Info</h3>
          {systemInfo ? (
            <div className="space-y-2 text-xs">
              {[
                ['Platform', systemInfo.platform],
                ['OS Version', systemInfo.version],
                ['App Version', systemInfo.app_version],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-ink-500">{k}</span>
                  <span className="font-mono text-ink-800">{v}</span>
                </div>
              ))}
            </div>
          ) : <div className="text-xs text-ink-400">Loading...</div>}
        </div>

        <div className="bg-white border border-ink-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-ink-800 mb-3">Diagnostics</h3>
          {diagnostics ? (
            <div className="space-y-2 text-xs">
              {[
                ['Data directory', diagnostics.data_dir],
                ['Database path', diagnostics.db_path],
                ['Log directory', diagnostics.log_dir],
              ].map(([k, v]) => (
                <div key={k}>
                  <span className="text-ink-500">{k}</span>
                  <div className="font-mono text-ink-700 break-all mt-0.5">{v}</div>
                </div>
              ))}
            </div>
          ) : <div className="text-xs text-ink-400">Loading...</div>}
        </div>
      </div>

      <div className="bg-white border border-ink-200 rounded-xl p-5 mb-4">
        <h3 className="text-sm font-semibold text-ink-800 mb-3">App Control</h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleToggleWindow} className="px-3 py-2 text-xs bg-ink-100 hover:bg-ink-200 rounded-lg">Toggle Window</button>
          <button onClick={handleAutostart} className="px-3 py-2 text-xs bg-ink-100 hover:bg-ink-200 rounded-lg">Check Autostart</button>
        </div>
      </div>

      <div className="bg-white border border-ink-200 rounded-xl p-5 mb-4">
        <h3 className="text-sm font-semibold text-ink-800 mb-3 flex items-center gap-2">
          <Download size={16} /> Export / Backup
        </h3>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="JSON export path"
              className="flex-1 px-3 py-2 text-xs border border-ink-200 rounded-lg font-mono focus:outline-none focus:border-teal-500" />
            <button onClick={handleExportJson} className="px-3 py-2 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700">Export JSON</button>
          </div>
          <div className="flex gap-2">
            <input value={csvPath} onChange={(e) => setCsvPath(e.target.value)} placeholder="CSV export path"
              className="flex-1 px-3 py-2 text-xs border border-ink-200 rounded-lg font-mono focus:outline-none focus:border-teal-500" />
            <button onClick={handleExportCsv} className="px-3 py-2 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700">Export CSV</button>
          </div>
          <div className="flex gap-2">
            <input value={backupPath} onChange={(e) => setBackupPath(e.target.value)} placeholder="Backup path"
              className="flex-1 px-3 py-2 text-xs border border-ink-200 rounded-lg font-mono focus:outline-none focus:border-teal-500" />
            <button onClick={handleBackup} className="px-3 py-2 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">Backup DB</button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-ink-200 rounded-xl p-5 mb-4">
        <h3 className="text-sm font-semibold text-ink-800 mb-3 flex items-center gap-2">
          <Upload size={16} /> Import / Restore
        </h3>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input placeholder="JSON file path to import" className="flex-1 px-3 py-2 text-xs border border-ink-200 rounded-lg font-mono focus:outline-none focus:border-teal-500"
              onKeyDown={(e) => e.key === 'Enter' && api.importJson((e.target as HTMLInputElement).value).then(r => showMsg(`Imported ${r.imported} items`)).catch(e => showMsg(e.message))} />
          </div>
          <div className="flex gap-2">
            <input value={restorePath} onChange={(e) => setRestorePath(e.target.value)} placeholder="Backup file to restore"
              className="flex-1 px-3 py-2 text-xs border border-ink-200 rounded-lg font-mono focus:outline-none focus:border-teal-500" />
            <button onClick={handleRestore} className="px-3 py-2 text-xs bg-amber-600 text-white rounded-lg hover:bg-amber-700">Restore</button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-red-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-2">
          <ShieldWarning size={16} /> Maintenance
        </h3>
        <div className="flex gap-2">
          <button onClick={handleRescan} className="px-3 py-2 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 flex items-center gap-1.5">
            <ShieldWarning size={13} /> Rescan sensitive
          </button>
          <button onClick={handleClear} className="px-3 py-2 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 flex items-center gap-1.5">
            <Trash size={13} /> Clear all history
          </button>
        </div>
      </div>
    </div>
  );
}
