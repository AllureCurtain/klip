import { useStore } from '@/lib/stores';

export function StatusBar() {
  const state = useStore((s) => s.connectionState);

  const config = {
    connected: { color: 'bg-emerald-500', label: 'Connected', pulse: false },
    connecting: { color: 'bg-amber-500', label: 'Connecting...', pulse: true },
    disconnected: { color: 'bg-red-500', label: 'Disconnected', pulse: false },
    error: { color: 'bg-red-600', label: 'Error', pulse: true },
  }[state];

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-ink-500">
      <span
        className={`inline-block w-2 h-2 rounded-full ${config.color} ${config.pulse ? 'animate-pulse-dot' : ''}`}
      />
      <span>SSE: {config.label}</span>
    </div>
  );
}
