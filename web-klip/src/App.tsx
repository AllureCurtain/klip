import { useState, useEffect } from 'react';
import { Sidebar, type View } from '@/components/Sidebar';
import { StatusBar } from '@/components/StatusBar';
import { useSseConnection } from '@/lib/sse';
import { useStore } from '@/lib/stores';
import { api, getBaseUrl, setBaseUrl } from '@/lib/api';
import { ClipboardView } from '@/views/ClipboardView';
import { SearchView } from '@/views/SearchView';
import { TagsView } from '@/views/TagsView';
import { SnippetsView } from '@/views/SnippetsView';
import { RulesView } from '@/views/RulesView';
import { StatsView } from '@/views/StatsView';
import { QaView } from '@/views/QaView';
import { EventsView } from '@/views/EventsView';
import { ConfigView } from '@/views/ConfigView';
import { SystemView } from '@/views/SystemView';
import { OpenApiView } from '@/views/OpenApiView';
import { Gear } from '@phosphor-icons/react';

function ApiSettings({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState(getBaseUrl());
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function test() {
    setTesting(true); setResult(null);
    try {
      const r = await fetch(url.replace(/\/$/, '') + '/api/health');
      if (r.ok) {
        const j = await r.json();
        setResult(`Connected (v${j.version})`);
      } else {
        setResult(`HTTP ${r.status}`);
      }
    } catch (e) {
      setResult('Failed to connect');
    } finally { setTesting(false); }
  }

  function save() {
    setBaseUrl(url);
    window.location.reload();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-96 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-ink-800 mb-3">API Connection</h3>
        <label className="text-xs text-ink-500 mb-1 block">API Base URL</label>
        <input
          value={url} onChange={(e) => setUrl(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg mb-3 font-mono focus:outline-none focus:border-teal-500"
        />
        {result && <p className="text-xs mb-3 text-ink-600">{result}</p>}
        <div className="flex gap-2">
          <button onClick={test} disabled={testing}
            className="px-3 py-2 text-xs bg-ink-100 rounded-lg hover:bg-ink-200 disabled:opacity-50">Test</button>
          <button onClick={save}
            className="px-3 py-2 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700">Connect</button>
          <button onClick={onClose}
            className="px-3 py-2 text-xs text-ink-500 ml-auto">Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>('clipboard');
  const [showSettings, setShowSettings] = useState(false);
  const reloadAll = useStore((s) => s.reloadAll);

  useSseConnection();

  useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  const renderView = () => {
    switch (view) {
      case 'clipboard': return <ClipboardView />;
      case 'search': return <SearchView />;
      case 'tags': return <TagsView />;
      case 'snippets': return <SnippetsView />;
      case 'rules': return <RulesView />;
      case 'stats': return <StatsView />;
      case 'qa': return <QaView />;
      case 'events': return <EventsView />;
      case 'config': return <ConfigView />;
      case 'system': return <SystemView />;
      case 'openapi': return <OpenApiView />;
      default: return <ClipboardView />;
    }
  };

  return (
    <div className="flex min-h-dvh bg-ink-50">
      <Sidebar current={view} onNavigate={setView} onRefresh={reloadAll} />
      <main className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-5 py-2.5 border-b border-ink-200 bg-white">
          <div className="flex items-center gap-3">
            <StatusBar />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-400 font-mono">{getBaseUrl()}</span>
            <button
              onClick={() => setShowSettings(true)}
              className="p-1.5 hover:bg-ink-100 rounded text-ink-500 hover:text-ink-800"
              title="API Settings"
            >
              <Gear size={16} />
            </button>
          </div>
        </header>
        <div className="flex flex-1 min-h-0">
          {renderView()}
        </div>
      </main>
      {showSettings && <ApiSettings onClose={() => setShowSettings(false)} />}
    </div>
  );
}
