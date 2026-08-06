import { useState, useRef, useEffect } from 'react';
import { api } from '@/lib/api';
import { ChatCircle, PaperPlaneRight, Spinner } from '@phosphor-icons/react';
import type { QaAnswer } from '@/types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  provider?: string;
  model?: string;
  context_count?: number;
  context?: QaAnswer['context'];
}

export function QaView() {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function send() {
    const q = question.trim();
    if (!q || loading) return;
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setQuestion('');
    setLoading(true);
    try {
      const res = await api.qaAsk(q);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: res.answer,
        provider: res.provider,
        model: res.model,
        context_count: res.context_count,
        context: res.context,
      }]);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${err.message || 'Unknown error'}` }]);
    } finally { setLoading(false); }
  }

  const llmProvider = config.llm_provider || 'fake';
  const llmModel = config.llm_model || 'gpt-4o-mini';

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-6 py-4 border-b border-ink-200 bg-white">
        <h2 className="text-lg font-semibold text-ink-800 flex items-center gap-2">
          <ChatCircle size={20} /> QA Assistant
        </h2>
        <div className="flex items-center gap-3 mt-1">
          <p className="text-xs text-ink-400">Ask questions about your clipboard history</p>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            llmProvider === 'fake' ? 'bg-amber-50 text-amber-700' : 'bg-teal-50 text-teal-700'
          }`}>
            Provider: {llmProvider} / {llmModel}
          </span>
          {llmProvider === 'fake' && (
            <span className="text-xs text-amber-600">(FakeProvider returns canned responses; configure llm_provider=openai for real LLM)</span>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-ink-400">
            <ChatCircle size={48} className="mb-3 opacity-20" />
            <p className="text-sm">Ask a question about your clipboard content</p>
            <p className="text-xs mt-1">Try: "what is the deploy token?" or "what did I copy yesterday?"</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
              msg.role === 'user'
                ? 'bg-teal-600 text-white'
                : 'bg-white border border-ink-200 text-ink-800'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.provider && (
                <div className="flex gap-2 mt-2 pt-2 border-t border-ink-100 text-xs text-ink-400">
                  <span>{msg.provider}/{msg.model}</span>
                  {msg.context_count !== undefined && (
                    <span>{msg.context_count} context items</span>
                  )}
                </div>
              )}
              {msg.context && msg.context.length > 0 && (
                <div className="mt-2 space-y-1">
                  {msg.context.map((ctx) => (
                    <div key={ctx.id} className="text-xs bg-ink-50 p-2 rounded">
                      <span className="font-mono text-ink-400">#{ctx.id}</span>
                      <span className="ml-2 text-ink-600">{ctx.preview.slice(0, 120)}</span>
                      <span className="ml-2 text-teal-600 font-mono">{(ctx.score * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-ink-200 rounded-xl px-4 py-3">
              <Spinner size={16} className="animate-spin text-ink-400" />
            </div>
          </div>
        )}
      </div>

      <div className="px-6 py-4 border-t border-ink-200 bg-white">
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="Ask about your clipboard history..."
            className="flex-1 px-4 py-2.5 text-sm border border-ink-200 rounded-xl focus:outline-none focus:border-teal-500"
          />
          <button onClick={send} disabled={loading || !question.trim()}
            className="px-4 py-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
            <PaperPlaneRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
