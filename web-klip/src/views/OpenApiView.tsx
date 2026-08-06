import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Code, Copy, Check } from '@phosphor-icons/react';

export function OpenApiView() {
  const [spec, setSpec] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pathsExpanded, setPathsExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.getOpenApiSpec()
      .then(setSpec)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function copySpec() {
    if (spec) {
      navigator.clipboard.writeText(JSON.stringify(spec, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  if (loading) return <div className="flex-1 p-6 text-ink-400 text-sm">Loading OpenAPI spec...</div>;
  if (error) return <div className="flex-1 p-6 text-red-600 text-sm">Failed to load spec: {error}</div>;

  const s = spec as any;
  const paths = s.paths || {};
  const pathEntries = Object.entries(paths) as [string, Record<string, any>][];
  const methodColors: Record<string, string> = {
    get: 'bg-emerald-100 text-emerald-700',
    post: 'bg-blue-100 text-blue-700',
    put: 'bg-amber-100 text-amber-700',
    patch: 'bg-orange-100 text-orange-700',
    delete: 'bg-red-100 text-red-700',
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-ink-800 flex items-center gap-2">
            <Code size={20} /> API Specification
          </h2>
          <p className="text-xs text-ink-400">OpenAPI {s.openapi} - {s.info?.title} v{s.info?.version}</p>
        </div>
        <button onClick={copySpec}
          className="px-3 py-2 text-xs bg-ink-900 text-white rounded-lg hover:bg-ink-800 flex items-center gap-1.5">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy JSON'}
        </button>
      </div>

      <div className="bg-white border border-ink-200 rounded-xl overflow-hidden mb-4">
        <div className="px-5 py-3 border-b border-ink-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-800">Endpoints ({pathEntries.length})</h3>
          <span className="text-xs text-ink-400 font-mono">/openapi.json, /api/openapi.json</span>
        </div>
        <div className="divide-y divide-ink-100">
          {pathEntries.map(([path, methods]) => (
            <div key={path}>
              <button
                onClick={() => setPathsExpanded((p) => ({ ...p, [path]: !p[path] }))}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-ink-50 text-left"
              >
                <div className="flex gap-1.5 w-28 flex-shrink-0">
                  {Object.keys(methods).map((m) => (
                    <span key={m} className={`text-xs px-1.5 py-0.5 rounded font-mono font-medium uppercase ${methodColors[m] || 'bg-ink-100'}`}>
                      {m}
                    </span>
                  ))}
                </div>
                <span className="text-xs font-mono text-ink-800 flex-1">{path}</span>
                <span className="text-xs text-ink-400">
                  {Object.values(methods)[0]?.summary || ''}
                </span>
              </button>
              {pathsExpanded[path] && (
                <div className="px-5 pb-4 bg-ink-50/50">
                  {Object.entries(methods).map(([method, spec]: [string, any]) => (
                    <div key={method} className="mb-3 last:mb-0">
                      <div className={`inline-block text-xs px-2 py-0.5 rounded font-mono uppercase ${methodColors[method]}`}>
                        {method}
                      </div>
                      {spec.description && <p className="text-xs text-ink-600 mt-1">{spec.description}</p>}
                      {spec.responses && (
                        <div className="mt-2 space-y-1">
                          {Object.entries(spec.responses).map(([code, r]: [string, any]) => (
                            <div key={code} className="flex gap-2 text-xs">
                              <span className={`font-mono ${code.startsWith('2') ? 'text-emerald-600' : code.startsWith('4') ? 'text-amber-600' : 'text-red-600'}`}>
                                {code}
                              </span>
                              <span className="text-ink-600">{r.description}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
