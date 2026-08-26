import { useState, useRef, useEffect } from 'react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/stores';
import { ChatCircle, PaperPlaneRight, Spinner, Stop, Warning, ArrowLeft } from '@phosphor-icons/react';
import type { QaContextItem } from '@/types';

type MessageStatus = 'streaming' | 'done' | 'error' | 'timeout';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  provider?: string;
  model?: string;
  context_count?: number;
  context?: QaContextItem[];
  status?: MessageStatus;
  error?: string;
}

export function QaView() {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const setView = useStore((s) => s.setView);
  const setFocusItemId = useStore((s) => s.setFocusItemId);
  const pushToast = useStore((s) => s.pushToast);

  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const jumpToItem = (id: number) => {
    setFocusItemId(id);
    setView('clipboard');
  };

  async function send() {
    const q = question.trim();
    if (!q || busy) return;
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setQuestion('');
    setBusy(true);

    const assistant: Message = { role: 'assistant', content: '', status: 'streaming' };
    setMessages((prev) => [...prev, assistant]);
    const patch = (p: Partial<Message>) =>
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { ...next[next.length - 1], ...p };
        return next;
      });

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await api.qaAskStream(
        q,
        {
          onContext: (items, count) => patch({ context: items, context_count: count }),
          onDelta: (text) =>
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              next[next.length - 1] = { ...last, content: last.content + text };
              return next;
            }),
          onDone: (provider, model, count) =>
            patch({ provider, model, context_count: count, status: 'done' }),
          onError: (error, message) =>
            patch({
              status: error === 'timeout' ? 'timeout' : 'error',
              error: message,
            }),
        },
        controller.signal,
      );
      // If the stream closed without a done/error frame, mark accordingly.
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last.status === 'streaming') {
          const next = [...prev];
          next[next.length - 1] = { ...last, status: 'error', error: 'Stream ended without a result' };
          return next;
        }
        return prev;
      });
    } catch (e: unknown) {
      const err = e as { message?: string };
      if (controller.signal.aborted) {
        patch({ status: 'done', error: 'Stopped by user' });
      } else {
        patch({ status: 'error', error: err.message || 'Unknown error' });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    pushToast('info', 'Stopped');
  }

  const llmProvider = config.llm_provider || 'fake';
  const llmModel = config.llm_model || 'gpt-4o-mini';

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-6 py-4 border-b border-ink-200 bg-white">
        <h2 className="text-lg font-semibold text-ink-800 flex items-center gap-2">
          <ChatCircle size={20} /> QA Assistant
        </h2>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <p className="text-xs text-ink-400">Ask questions about your clipboard history</p>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            llmProvider === 'fake' ? 'bg-amber-50 text-amber-700' : 'bg-teal-50 text-teal-700'
          }`}>
            Provider: {llmProvider} / {llmModel}
          </span>
          {llmProvider === 'fake' && (
            <span className="text-xs text-amber-600">(FakeProvider returns canned responses; set llm_provider=openai for a real LLM)</span>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-ink-400">
            <ChatCircle size={48} className="mb-3 opacity-20" />
            <p className="text-sm">Ask a question about your clipboard content</p>
            <p className="text-xs mt-1">Try: &quot;what is the deploy token?&quot; — answers stream in with clickable references</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
              msg.role === 'user'
                ? 'bg-teal-600 text-white'
                : msg.status === 'error' || msg.status === 'timeout'
                  ? 'bg-red-50 border border-red-200 text-red-800'
                  : 'bg-white border border-ink-200 text-ink-800'
            }`}>
              {msg.role === 'assistant' && (msg.status === 'error' || msg.status === 'timeout') ? (
                <div className="flex items-start gap-2">
                  <Warning size={16} weight="fill" className="text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium text-xs">
                      {msg.status === 'timeout' ? 'Answer timed out' : 'Could not answer'}
                    </div>
                    <div className="text-xs text-red-600 mt-0.5">{msg.error}</div>
                  </div>
                </div>
              ) : (
                <div className="whitespace-pre-wrap">
                  {msg.content}
                  {msg.status === 'streaming' && (
                    <span className="inline-block w-1.5 h-3.5 bg-teal-500 align-middle ml-0.5 animate-pulse" aria-label="streaming" />
                  )}
                  {msg.status === 'streaming' && msg.content === '' && (
                    <Spinner size={14} className="animate-spin text-ink-400" />
                  )}
                </div>
              )}
              {msg.role === 'assistant' && msg.status === 'done' && msg.context_count === 0 && (
                <div className="mt-2 text-xs text-ink-400 italic">No matching clipboard content was found.</div>
              )}
              {msg.role === 'assistant' && msg.context && msg.context.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-[10px] uppercase tracking-wide text-ink-400">References</div>
                  {msg.context.map((ctx) => (
                    <button
                      key={ctx.id}
                      onClick={() => jumpToItem(ctx.id)}
                      title="Open this clipboard item"
                      className="flex items-center gap-2 w-full text-left text-xs bg-ink-50 hover:bg-teal-50 border border-ink-100 hover:border-teal-300 p-2 rounded transition-colors"
                    >
                      <ArrowLeft size={11} className="text-teal-600 rotate-180 shrink-0" />
                      <span className="font-mono text-ink-400 shrink-0">#{ctx.id}</span>
                      <span className="text-ink-600 truncate flex-1">{ctx.preview}</span>
                      <span className="text-teal-600 font-mono shrink-0">{(ctx.score * 100).toFixed(0)}%</span>
                    </button>
                  ))}
                </div>
              )}
              {msg.role === 'assistant' && msg.provider && (
                <div className="flex gap-2 mt-2 pt-2 border-t border-ink-100 text-xs text-ink-400">
                  <span>{msg.provider}/{msg.model}</span>
                  {msg.context_count !== undefined && <span>{msg.context_count} context items</span>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="px-6 py-4 border-t border-ink-200 bg-white">
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="Ask about your clipboard history..."
            aria-label="Question"
            className="flex-1 px-4 py-2.5 text-sm border border-ink-200 rounded-xl focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
          {busy ? (
            <button
              onClick={stop}
              className="px-4 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-xl hover:bg-red-100 flex items-center gap-2 text-sm"
            >
              <Stop size={16} weight="fill" /> Stop
            </button>
          ) : (
            <button
              onClick={send}
              disabled={!question.trim()}
              aria-label="Send question"
              className="px-4 py-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2"
            >
              <PaperPlaneRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
