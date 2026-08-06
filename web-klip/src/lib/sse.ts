import { useEffect, useRef } from 'react';
import { api, getBaseUrl } from './api';
import { useStore } from './stores';
import type { SseEvent } from '@/types';

export function useSseConnection() {
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const base = getBaseUrl();
    const setConnectionState = useStore.getState().setConnectionState;
    const addSseEvent = useStore.getState().addSseEvent;
    const prependItem = useStore.getState().prependItem;
    const loadStats = useStore.getState().loadStats;
    const loadItems = useStore.getState().loadItems;

    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      setConnectionState('connecting');
      // Close any existing connection
      if (esRef.current) {
        esRef.current.close();
      }

      try {
        const es = new EventSource(`${base}/api/events`);
        esRef.current = es;

        es.onopen = () => {
          setConnectionState('connected');
        };

        es.onerror = () => {
          setConnectionState('disconnected');
          es.close();
          reconnectTimer = setTimeout(connect, 3000);
        };

        es.addEventListener('clipboard-updated', (e) => {
          try {
            const raw = (e as MessageEvent).data;
            const data = JSON.parse(raw);
            const event: SseEvent = {
              type: 'clipboard-updated',
              timestamp: Date.now(),
              data,
            };
            addSseEvent(event);
            if (data && typeof data === 'object' && 'id' in data) {
              prependItem(data as any);
            }
            loadStats();
          } catch { /* ignore parse error */ }
        });

        es.addEventListener('clipboard-cleared', () => {
          addSseEvent({ type: 'clipboard-cleared', timestamp: Date.now(), data: null });
          loadItems(true);
          loadStats();
        });

        es.addEventListener('config-changed', (e) => {
          try {
            const raw = (e as MessageEvent).data;
            const data = JSON.parse(raw);
            addSseEvent({ type: 'config-changed', timestamp: Date.now(), data });
          } catch { /* ignore */ }
        });
      } catch {
        setConnectionState('error');
        reconnectTimer = setTimeout(connect, 5000);
      }
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (esRef.current) {
        esRef.current.close();
      }
    };
  }, []);
}
