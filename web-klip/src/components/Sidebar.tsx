import {
  ClipboardText, MagnifyingGlass, Tag, NoteBlank, ShieldWarning, Gear,
  ChartPie, ChatCircle, Pulse, Database, Code, ArrowClockwise,
} from '@phosphor-icons/react';

export type View =
  | 'clipboard' | 'search' | 'tags' | 'snippets' | 'rules'
  | 'stats' | 'qa' | 'events' | 'config' | 'system' | 'openapi';

interface Props {
  current: View;
  onNavigate: (v: View) => void;
  onRefresh: () => void;
}

const navItems: { id: View; label: string; icon: React.ElementType }[] = [
  { id: 'clipboard', label: 'Clipboard', icon: ClipboardText },
  { id: 'search', label: 'Search', icon: MagnifyingGlass },
  { id: 'tags', label: 'Tags', icon: Tag },
  { id: 'snippets', label: 'Snippets', icon: NoteBlank },
  { id: 'rules', label: 'Source Rules', icon: ShieldWarning },
  { id: 'stats', label: 'Statistics', icon: ChartPie },
  { id: 'qa', label: 'QA Assistant', icon: ChatCircle },
  { id: 'events', label: 'Event Stream', icon: Pulse },
  { id: 'config', label: 'Configuration', icon: Gear },
  { id: 'system', label: 'System', icon: Database },
  { id: 'openapi', label: 'API Spec', icon: Code },
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
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-ink-400 hover:bg-ink-800/50 hover:text-ink-200 text-xs transition-colors"
        >
          <ArrowClockwise size={16} />
          Refresh All
        </button>
      </div>
    </aside>
  );
}
