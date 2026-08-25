import {
  ClipboardText, MagnifyingGlass, Tag, NoteBlank, ShieldWarning, Gear,
  ChartPie, ChatCircle, Pulse, Database, Code, ArrowClockwise, Heartbeat,
} from '@phosphor-icons/react';

export type View =
  | 'clipboard' | 'search' | 'tags' | 'snippets' | 'rules'
  | 'stats' | 'qa' | 'events' | 'config' | 'diagnostics' | 'system' | 'openapi';

interface Props {
  current: View;
  onNavigate: (v: View) => void;
  onRefresh: () => void;
}

const navItems: { id: View; label: string; icon: React.ElementType; title: string }[] = [
  { id: 'clipboard', label: 'Clipboard', icon: ClipboardText, title: 'Browse clipboard history' },
  { id: 'search', label: 'Search', icon: MagnifyingGlass, title: 'Advanced search' },
  { id: 'tags', label: 'Tags', icon: Tag, title: 'Manage tags' },
  { id: 'snippets', label: 'Snippets', icon: NoteBlank, title: 'Reusable text snippets' },
  { id: 'rules', label: 'Source Rules', icon: ShieldWarning, title: 'Ignore clipboard sources' },
  { id: 'stats', label: 'Statistics', icon: ChartPie, title: 'Usage statistics' },
  { id: 'qa', label: 'QA Assistant', icon: ChatCircle, title: 'Ask about clipboard history' },
  { id: 'events', label: 'Event Stream', icon: Pulse, title: 'Live SSE events' },
  { id: 'config', label: 'Configuration', icon: Gear, title: 'App configuration' },
  { id: 'diagnostics', label: 'Diagnostics', icon: Heartbeat, title: 'Self-checks and health report' },
  { id: 'system', label: 'System', icon: Database, title: 'System, data, and maintenance' },
  { id: 'openapi', label: 'API Spec', icon: Code, title: 'OpenAPI specification' },
];

export function Sidebar({ current, onNavigate, onRefresh }: Props) {
  return (
    <aside className="w-56 flex-shrink-0 bg-ink-900 text-ink-300 flex flex-col min-h-dvh">
      <div className="p-5 border-b border-ink-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center">
            <ClipboardText size={18} weight="bold" className="text-white" />
          </div>
          <div>
            <div className="text-white font-semibold text-sm tracking-tight">Klip</div>
            <div className="text-ink-500 text-xs">Dashboard</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-2 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = current === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={item.title}
              aria-label={item.title}
              aria-current={active ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left text-xs transition-colors
                ${active
                  ? 'bg-ink-800 text-white'
                  : 'text-ink-400 hover:bg-ink-800/50 hover:text-ink-200'
                }`}
            >
              <Icon size={16} weight={active ? 'fill' : 'regular'} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="p-2 border-t border-ink-800">
        <button
          onClick={onRefresh}
          title="Reload all data"
          aria-label="Reload all data"
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-ink-400 hover:bg-ink-800/50 hover:text-ink-200 text-xs transition-colors"
        >
          <ArrowClockwise size={16} />
          Refresh All
        </button>
      </div>
    </aside>
  );
}
