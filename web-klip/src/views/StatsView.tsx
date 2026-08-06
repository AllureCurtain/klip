import { useEffect } from 'react';
import { useStore } from '@/lib/stores';
import { formatSize } from '@/lib/utils';
import { ChartPie, FileText, Image as ImageIcon, Files, Star, ShieldWarning, Tag, NoteBlank, Eye, Database } from '@phosphor-icons/react';

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="bg-white border border-ink-200 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center`}>
          <Icon size={18} className="text-white" weight="fill" />
        </div>
      </div>
      <div className="text-2xl font-semibold text-ink-900 tracking-tight font-mono">{value}</div>
      <div className="text-xs text-ink-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-ink-400 mt-1">{sub}</div>}
    </div>
  );
}

function BarRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-ink-600">{label}</span>
        <span className="text-ink-900 font-mono font-medium">{count}</span>
      </div>
      <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function StatsView() {
  const stats = useStore((s) => s.stats);
  const loadStats = useStore((s) => s.loadStats);

  useEffect(() => { loadStats(); }, [loadStats]);

  if (!stats) return (
    <div className="flex-1 p-6 flex items-center justify-center text-ink-400 text-sm">Loading stats…</div>
  );

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <h2 className="text-lg font-semibold text-ink-800 mb-1">Statistics</h2>
      <p className="text-xs text-ink-400 mb-5">Aggregate clipboard database statistics</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={ChartPie} label="Total Items" value={stats.total_items} color="bg-teal-600" />
        <StatCard icon={FileText} label="Text Items" value={stats.text_count} sub={`${((stats.text_count / Math.max(stats.total_items, 1)) * 100).toFixed(0)}%`} color="bg-blue-600" />
        <StatCard icon={ImageIcon} label="Images" value={stats.image_count} color="bg-violet-600" />
        <StatCard icon={Files} label="Files" value={stats.file_count} color="bg-orange-600" />
        <StatCard icon={Star} label="Favorited" value={stats.favorite_count} color="bg-amber-500" />
        <StatCard icon={ShieldWarning} label="Sensitive" value={stats.sensitive_count} color="bg-red-500" />
        <StatCard icon={Tag} label="Tags" value={stats.tag_count} color="bg-cyan-600" />
        <StatCard icon={NoteBlank} label="Snippets" value={stats.snippet_count} color="bg-emerald-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-ink-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-ink-800 mb-4 flex items-center gap-2">
            <Eye size={16} /> Content breakdown
          </h3>
          <div className="space-y-4">
            <BarRow label="Text" count={stats.text_count} total={stats.total_items} color="bg-blue-500" />
            <BarRow label="Images" count={stats.image_count} total={stats.total_items} color="bg-violet-500" />
            <BarRow label="Files" count={stats.file_count} total={stats.total_items} color="bg-orange-500" />
          </div>
        </div>

        <div className="bg-white border border-ink-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-ink-800 mb-4 flex items-center gap-2">
            <Database size={16} /> Storage
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-ink-500">Total content size</span>
              <span className="text-sm font-mono text-ink-900">{formatSize(stats.total_size_bytes)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-ink-500">Database file size</span>
              <span className="text-sm font-mono text-ink-900">{formatSize(stats.db_size_bytes)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-ink-500">Source rules</span>
              <span className="text-sm font-mono text-ink-900">{stats.source_rule_count}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-ink-500">Avg item size</span>
              <span className="text-sm font-mono text-ink-900">
                {stats.total_items > 0 ? formatSize(Math.round(stats.total_size_bytes / stats.total_items)) : '0 B'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
