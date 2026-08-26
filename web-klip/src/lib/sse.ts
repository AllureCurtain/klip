import { useEffect, useRef } from 'react';
import { api, getBaseUrl, withAccessToken, onAuthFailure } from './api';
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
    const setAuthState = useStore.getState().setAuthState;

    let reconnectTimer: ReturnType<typeof setTimeout>;
    let stopped = false;

    // If the server starts requiring a token (or our token is wrong), stop
    // hammering the stream and surface the auth state instead.
    const unsubscribeAuth = onAuthFailure(() => {
      stopped = true;
      setAuthState('unauthorized');
      setConnectionState('disconnected');
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    });

    function connect() {
      if (stopped) return;
      setConnectionState('connecting');
      if (esRef.current) {
        esRef.current.close();
      }

      try {
        // EventSource cannot set headers — the token rides the query string.
        const es = new EventSource(withAccessToken(`${base}/api/events`));
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
              prependItem(data as never);
            }
            loadStats();
          } catch { /* ignore parse error */ }
        });

        es.addEventListener('clipboard-item-updated', (e) => {
          try {
            const raw = (e as MessageEvent).data;
            const data = JSON.parse(raw);
            addSseEvent({ type: 'clipboard-item-updated', timestamp: Date.now(), data });
            // An item changed (e.g. OCR finished): swap it in place.
            if (data && typeof data === 'object' && 'id' in data) {
              useStore.getState().updateItem(data as never);
            }
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
          } catch { /* ignore parse error */ }
        });
      } catch {
        setConnectionState('error');
        reconnectTimer = setTimeout(connect, 5000);
      }
    }

    // Probe auth state once at startup (cheap health call). The middleware
    // answers 401 fast when a token is required.
    void api.health().then(() => setAuthState('ok')).catch((error: unknown) => {
      const status = (error as { status?: number })?.status;
      if (status === 401) setAuthState('unauthorized');
    });

    connect();

    return () => {
      stopped = true;
      clearTimeout(reconnectTimer);
      if (esRef.current) {
        esRef.current.close();
      }
      unsubscribeAuth();
    };
  }, []);
}
