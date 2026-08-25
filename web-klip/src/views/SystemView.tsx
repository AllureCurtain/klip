import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/stores';
import type { SystemInfo, DiagnosticsInfo, WindowStatus, HealthReport } from '@/types';
import {
  Database, Download, Upload, Trash, ShieldWarning, AppWindow, ArrowsClockwise,
  CheckCircle, Warning, XCircle,
} from '@phosphor-icons/react';
import { ConfirmDialog } from '@/components/ui';

const checkIcon = (status: string) =>
  status === 'ok' ? <CheckCircle size={14} weight="fill" className="text-emerald-600" />
  : status === 'degraded' ? <Warning size={14} weight="fill" className="text-amber-600" />
  : <XCircle size={14} weight="fill" className="text-red-600" />;

function WindowStatusCard() {
  const [status, setStatus] = useState<WindowStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await api.windowStatus());
    } catch (e: unknown) {
      const err = e as { body?: { message?: string }; message?: string };
      setError(err.body?.message || err.message || 'Window status requires the desktop app');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <div className="bg-white border border-ink-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink-800 flex items-center gap-2">
          <AppWindow size={16} /> Main Window
        </h3>
        <button
          onClick={load}
          disabled={loading}
          title="Refresh window status"
          aria-label="Refresh window status"
          className="p-1 hover:bg-ink-100 rounded text-ink-400"
        >
          <ArrowsClockwise size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      {error && <div className="text-xs text-amber-700 bg-amber-50 rounded p-2">{error}</div>}
      {status && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {[
            ['Visible', status.visible ? 'Yes' : 'No'],
            ['Minimized', status.minimized ? 'Yes' : 'No'],
            ['Maximized', status.maximized ? 'Yes' : 'No'],
            ['Focused', status.focused ? 'Yes' : 'No'],
            ['Position', `${status.x}, ${status.y}`],
            ['Size', `${status.width} × ${status.height}`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-ink-500">{k}</span>
              <span className="font-mono text-ink-800">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DiagnosticsSummary() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const setView = useStore((s) => s.setView);
  const load = async () => {
    try { setReport(await api.getHealthReport()); } catch { /* surfaced elsewhere */ }
  };
  useEffect(() => { void load(); }, []);
  if (!report) return null;
  return (
    <div className="bg-white border border-ink-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink-800 flex items-center gap-2">
          <ShieldWarning size={16} /> Self-checks
        </h3>
        <button onClick={() => setView('diagnostics')} className="text-xs text-teal-700 hover:underline">
          Open diagnostics
        </button>
      </div>
      <div className="space-y-1.5">
        {report.checks.map((check) => (
          <div key={check.id} className="flex items-center gap-2 text-xs">
            {checkIcon(check.status)}
            <span className="text-ink-700 flex-1 truncate" title={check.summary}>{check.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SystemView() {
  const systemInfo = useStore((s) => s.systemInfo);
  const diagnostics = useStore((s) => s.diagnostics);
  const refreshMeta = useStore((s) => s.refreshMeta);
  const [path, setPath] = useState('klip-export.json');
  const [csvPath, setCsvPath] = useState('klip-export.csv');
  const [backupPath, setBackupPath] = useState('klip-backup.db');
  const [restorePath, setRestorePath] = useState('klip-backup.db');
  const [importPath, setImportPath] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'restore' | 'clear'>(null);

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
    try { const r = await api.restoreDatabase(restorePath); showMsg(`Restored ${r.size} bytes`); }
    catch (e: unknown) { showMsg('Error: ' + (e as Error).message); }
  }
  async function handleImportJson() {
    if (!importPath.trim()) return;
    try { const r = await api.importJson(importPath.trim()); showMsg(`Imported ${r.imported} item(s)`); }
    catch (e: unknown) { showMsg('Error: ' + (e as Error).message); }
  }
  async function handleRescan() {
    try { const r = await api.rescanSensitive(); showMsg(`Rescanned, ${r.count} sensitive items flagged`); }
    catch (e: unknown) { showMsg('Error: ' + (e as Error).message); }
  }
  async function handleClear() {
    try { await api.clearClipboard(); showMsg('History cleared'); }
    catch (e: unknown) { showMsg('Error: ' + (e as Error).message); }
  }
  async function handleToggleWindow() {
    try { await api.toggleWindow(); showMsg('Toggled window'); }
    catch { showMsg('Window control requires the Tauri app running'); }
  }
  async function handleAutostart() {
    try { const v = await api.getAutostart(); showMsg(`Autostart: ${v}`); }
    catch { showMsg('Autostart requires the Tauri app'); }
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <h2 className="text-lg font-semibold text-ink-800 mb-1 flex items-center gap-2">
        <Database size={20} /> System & Data
      </h2>
      <p className="text-xs text-ink-400 mb-5">System info, data management, and app control</p>

      {msg && (
        <div role="status" aria-live="polite" className="mb-4 p-2.5 bg-ink-900 text-white text-xs rounded-lg fade-in-up">{msg}</div>
      )}

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <WindowStatusCard />
        <DiagnosticsSummary />
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
              aria-label="JSON export path"
              className="flex-1 px-3 py-2 text-xs border border-ink-200 rounded-lg font-mono focus:outline-none focus:border-teal-500" />
            <button onClick={handleExportJson} className="px-3 py-2 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700">Export JSON</button>
          </div>
          <div className="flex gap-2">
            <input value={csvPath} onChange={(e) => setCsvPath(e.target.value)} placeholder="CSV export path"
              aria-label="CSV export path"
              className="flex-1 px-3 py-2 text-xs border border-ink-200 rounded-lg font-mono focus:outline-none focus:border-teal-500" />
            <button onClick={handleExportCsv} className="px-3 py-2 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700">Export CSV</button>
          </div>
          <div className="flex gap-2">
            <input value={backupPath} onChange={(e) => setBackupPath(e.target.value)} placeholder="Backup path"
              aria-label="Backup path"
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
            <input value={importPath} onChange={(e) => setImportPath(e.target.value)} placeholder="JSON file path to import"
              aria-label="JSON file path to import"
              onKeyDown={(e) => e.key === 'Enter' && handleImportJson()}
              className="flex-1 px-3 py-2 text-xs border border-ink-200 rounded-lg font-mono focus:outline-none focus:border-teal-500" />
            <button onClick={handleImportJson} disabled={!importPath.trim()}
              className="px-3 py-2 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-40">Import JSON</button>
          </div>
          <div className="flex gap-2">
            <input value={restorePath} onChange={(e) => setRestorePath(e.target.value)} placeholder="Backup file to restore"
              aria-label="Backup file to restore"
              className="flex-1 px-3 py-2 text-xs border border-ink-200 rounded-lg font-mono focus:outline-none focus:border-teal-500" />
            <button onClick={() => setConfirm('restore')} className="px-3 py-2 text-xs bg-amber-600 text-white rounded-lg hover:bg-amber-700">Restore</button>
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
          <button onClick={() => setConfirm('clear')} className="px-3 py-2 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 flex items-center gap-1.5">
            <Trash size={13} /> Clear all history
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'restore' ? 'Restore from backup?' : 'Clear all history?'}
        message={confirm === 'restore'
          ? 'This overwrites the current database with the backup file. Current data is replaced.'
          : 'This permanently deletes ALL clipboard history. This cannot be undone.'}
        confirmLabel={confirm === 'restore' ? 'Restore' : 'Clear all'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm === 'restore') void handleRestore();
          else void handleClear();
          setConfirm(null);
        }}
      />
    </div>
  );
}
