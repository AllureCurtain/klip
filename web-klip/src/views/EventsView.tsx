import { useStore } from '@/lib/stores';
import { formatTime } from '@/lib/utils';
import { Pulse, ClipboardText, Trash, Gear } from '@phosphor-icons/react';

const eventIcon = (type: string) => {
  switch (type) {
    case 'clipboard-updated': return <ClipboardText size={14} className="text-teal-600" />;
    case 'clipboard-cleared': return <Trash size={14} className="text-red-500" />;
    case 'config-changed': return <Gear size={14} className="text-amber-600" />;
    default: return <Pulse size={14} className="text-ink-400" />;
  }
};

export function EventsView() {
  const events = useStore((s) => s.sseEvents);
  const connectionState = useStore((s) => s.connectionState);

  const stateConfig = {
    connected: { color: 'bg-teal-500', text: 'Connected', ring: 'ring-teal-200' },
    connecting: { color: 'bg-amber-500', text: 'Connecting...', ring: 'ring-amber-200' },
    disconnected: { color: 'bg-red-500', text: 'Disconnected', ring: 'ring-red-200' },
    error: { color: 'bg-red-600', text: 'Error', ring: 'ring-red-200' },
  }[connectionState];

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-ink-800">Event Stream</h2>
          <p className="text-xs text-ink-400">Real-time SSE events from Klip</p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-ink-200 ring-2 ${stateConfig.ring}`}>
          <span className={`w-2 h-2 rounded-full ${stateConfig.color} ${connectionState === 'connecting' ? 'animate-pulse-dot' : ''}`} />
          <span className="text-xs font-medium text-ink-700">{stateConfig.text}</span>
        </div>
      </div>

      <div className="bg-white border border-ink-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-ink-100 flex items-center justify-between text-xs text-ink-500">
          <span>Event log ({events.length} events)</span>
          <span className="font-mono">/api/events</span>
        </div>
        {events.length === 0 ? (
          <div className="py-16 text-center text-ink-400 text-sm flex flex-col items-center">
            <Pulse size={40} className="mb-2 opacity-20" />
            Waiting for events...
            <p className="text-xs mt-1 text-ink-300">Copy something to see clipboard-updated events</p>
          </div>
        ) : (
          <div className="divide-y divide-ink-100 max-h-[600px] overflow-y-auto">
            {events.map((e, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3 fade-in-up">
                {eventIcon(e.type)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-mono font-medium text-ink-800">{e.type}</span>
                    <span className="text-xs text-ink-400">{formatTime(e.timestamp)}</span>
                  </div>
                  {e.data != null && (
                    <pre className="text-xs font-mono text-ink-500 overflow-x-auto whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                      {JSON.stringify(e.data, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
