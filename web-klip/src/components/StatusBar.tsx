import { useStore } from '@/lib/stores';
import { getAccessToken } from '@/lib/api';

export function StatusBar() {
  const state = useStore((s) => s.connectionState);
  const authState = useStore((s) => s.authState);
  const hasToken = getAccessToken().length > 0;

  const config = {
    connected: { color: 'bg-emerald-500', label: 'Connected', pulse: false },
    connecting: { color: 'bg-amber-500', label: 'Connecting...', pulse: true },
    disconnected: { color: 'bg-red-500', label: 'Disconnected', pulse: false },
    error: { color: 'bg-red-600', label: 'Error', pulse: true },
  }[state];

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 text-xs text-ink-500">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-2 h-2 rounded-full ${config.color} ${config.pulse ? 'animate-pulse-dot' : ''}`}
        />
        <span>SSE: {config.label}</span>
      </div>
      {authState === 'unauthorized' ? (
        <span className="flex items-center gap-1.5 text-red-600 font-medium" title="The server rejected the access token (401). Open API settings to fix it.">
          <span className="inline-block w-2 h-2 rounded-full bg-red-600" />
          Token rejected
        </span>
      ) : hasToken ? (
        <span className="flex items-center gap-1.5 text-emerald-700" title="Sending a stored access token">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
          Token set
        </span>
      ) : null}
    </div>
  );
}
