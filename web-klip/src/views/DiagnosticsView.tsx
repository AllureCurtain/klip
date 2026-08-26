import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/stores';
import type { HealthCheck, HealthReport } from '@/types';
import {
  Pulse, CheckCircle, Warning, XCircle, ArrowsClockwise, Download,
} from '@phosphor-icons/react';

const STATUS_META = {
  ok: { label: 'Healthy', cls: 'text-emerald-600 bg-emerald-50 border-emerald-200', Icon: CheckCircle },
  degraded: { label: 'Degraded', cls: 'text-amber-700 bg-amber-50 border-amber-200', Icon: Warning },
  error: { label: 'Failed', cls: 'text-red-700 bg-red-50 border-red-200', Icon: XCircle },
} as const;

function CheckCard({ check }: { check: HealthCheck }) {
  const meta = STATUS_META[check.status];
  const Icon = meta.Icon;
  return (
    <div className={`rounded-xl border p-4 ${meta.cls}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={18} weight="fill" />
        <span className="text-sm font-semibold">{check.label}</span>
        <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-white/70">{meta.label}</span>
      </div>
      <p className="text-xs leading-relaxed opacity-90">{check.summary}</p>
    </div>
  );
}

export function DiagnosticsView() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pushToast = useStore((s) => s.pushToast);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.getHealthReport();
      setReport(r);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message || 'Could not run diagnostics');
    } finally {
      setLoading(false);
    }
  }, []);

  const exportReport = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date(report.generated_at).toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `klip-diagnostics-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast('success', 'Diagnostics report exported');
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-ink-800 flex items-center gap-2">
            <Pulse size={20} /> Diagnostics
          </h2>
          <p className="text-xs text-ink-400">Read-only self-checks: database, search index, disk usage</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={run}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 text-white text-xs rounded-lg hover:bg-teal-700 disabled:opacity-50"
          >
            <ArrowsClockwise size={14} className={loading ? 'animate-spin' : ''} />
            {report ? 'Re-run checks' : 'Run checks'}
          </button>
          <button
            onClick={exportReport}
            disabled={!report}
            className="flex items-center gap-1.5 px-3 py-2 bg-ink-100 text-ink-700 text-xs rounded-lg hover:bg-ink-200 disabled:opacity-40"
            title="Download the report as a JSON file"
          >
            <Download size={14} /> Export JSON
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">{error}</div>
      )}

      {loading && !report && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 border border-ink-200 rounded-xl shimmer" />
          ))}
        </div>
      )}

      {!loading && !report && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-ink-400">
          <Pulse size={48} className="mb-3 opacity-30" />
          <p className="text-sm">No diagnostics run yet</p>
          <p className="text-xs mt-1">Run the checks to verify database integrity, search-index consistency, and data-directory usage.</p>
        </div>
      )}

      {report && (
        <>
          <div className={`mb-4 px-4 py-2.5 rounded-lg border text-sm font-medium flex items-center gap-2 ${STATUS_META[report.status].cls}`}>
            {(() => { const Icon = STATUS_META[report.status].Icon; return <Icon size={16} weight="fill" />; })()}
            Overall: {STATUS_META[report.status].label}
            <span className="ml-auto text-xs font-normal opacity-70">
              {new Date(report.generated_at).toLocaleString()}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {report.checks.map((check) => <CheckCard key={check.id} check={check} />)}
          </div>
        </>
      )}
    </div>
  );
}
