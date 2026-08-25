import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { StatusBar } from '@/components/StatusBar';
import { useSseConnection } from '@/lib/sse';
import { useStore } from '@/lib/stores';
import { api, getBaseUrl, setBaseUrl, getAccessToken, setAccessToken } from '@/lib/api';
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
import { DiagnosticsView } from '@/views/DiagnosticsView';
import { OpenApiView } from '@/views/OpenApiView';
import { Toasts } from '@/components/ui';
import { Gear } from '@phosphor-icons/react';

function ApiSettings({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState(getBaseUrl());
  const [token, setToken] = useState(getAccessToken());
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function test() {
    setTesting(true); setResult(null);
    const previousUrl = api.getBaseUrl();
    const previousToken = getAccessToken();
    api.setBaseUrl(url.replace(/\/$/, ''));
    setAccessToken(token.trim());
    try {
      const r = await api.health();
      setResult({ ok: true, text: `Connected (v${r.version})` });
    } catch (e) {
      const err = e as { status?: number; message?: string };
      setResult({
        ok: false,
        text: err.status === 401
          ? 'Reachable, but the access token was rejected (401).'
          : `Could not connect: ${err.message || 'unknown error'}`,
      });
    } finally {
      setTesting(false);
      // Restore; only persist on save.
      api.setBaseUrl(previousUrl);
      setAccessToken(previousToken);
    }
  }

  function save() {
    setBaseUrl(url);
    setAccessToken(token.trim());
    window.location.reload();
  }

  return (
    <div className="fixed inset-0 bg-ink-950/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-96 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="API connection settings">
        <h3 className="text-sm font-semibold text-ink-800 mb-3">API Connection</h3>
        <label className="text-xs text-ink-500 mb-1 block" htmlFor="api-url">API Base URL</label>
        <input
          id="api-url"
          value={url} onChange={(e) => setUrl(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg mb-3 font-mono focus:outline-none focus:border-teal-500"
        />
        <label className="text-xs text-ink-500 mb-1 block" htmlFor="api-token">
          Access token {!token.trim() && <span className="text-ink-300">(empty = authentication disabled)</span>}
        </label>
        <div className="relative mb-1">
          <input
            id="api-token"
            type={showToken ? 'text' : 'password'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Leave empty unless the server requires a token"
            autoComplete="off"
            className="w-full px-3 py-2 pr-16 text-sm border border-ink-200 rounded-lg font-mono focus:outline-none focus:border-teal-500"
          />
          <button
            type="button"
            onClick={() => setShowToken(!showToken)}
            aria-label={showToken ? 'Hide token' : 'Show token'}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-400 hover:text-ink-700"
          >
            {showToken ? 'Hide' : 'Show'}
          </button>
        </div>
        <p className="text-[11px] text-ink-400 mb-3">
          Stored only in this browser (localStorage). Sent as <code>Authorization: Bearer</code>.
        </p>
        {result && (
          <p className={`text-xs mb-3 ${result.ok ? 'text-emerald-700' : 'text-red-600'}`}>{result.text}</p>
        )}
        <div className="flex gap-2">
          <button onClick={test} disabled={testing}
            className="px-3 py-2 text-xs bg-ink-100 rounded-lg hover:bg-ink-200 disabled:opacity-50">
            {testing ? 'Testing…' : 'Test'}
          </button>
          <button onClick={save}
            className="px-3 py-2 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700">Connect</button>
          <button onClick={onClose}
            className="px-3 py-2 text-xs text-ink-500 ml-auto">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function AuthGate({ onConfigure }: { onConfigure: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-red-50 flex items-center justify-center">
          <Gear size={22} className="text-red-600" />
        </div>
        <h2 className="text-base font-semibold text-ink-800 mb-2">Access token required</h2>
        <p className="text-sm text-ink-500 mb-5">
          The Klip server rejected this client (401). If the server has
          <code className="mx-1">http_access_token</code> configured, enter the same token in the connection settings.
        </p>
        <button
          onClick={onConfigure}
          className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700"
        >
          Open connection settings
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const reloadAll = useStore((s) => s.reloadAll);
  const view = useStore((s) => s.view);
  const authState = useStore((s) => s.authState);

  useSseConnection();

  useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  const renderView = () => {
    if (authState === 'unauthorized') {
      return <AuthGate onConfigure={() => setShowSettings(true)} />;
    }
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
      case 'diagnostics': return <DiagnosticsView />;
      case 'system': return <SystemView />;
      case 'openapi': return <OpenApiView />;
      default: return <ClipboardView />;
    }
  };

  return (
    <div className="flex min-h-dvh bg-ink-50">
      <Sidebar current={view} onNavigate={useStore.getState().setView} onRefresh={reloadAll} />
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
              title="API connection settings"
              aria-label="API connection settings"
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
      <Toasts />
    </div>
  );
}
