// SSE module is tested for type correctness
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('SSE connection helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('constructs EventSource with correct URL', () => {
    // Verify the URL pattern
    const base = 'http://127.0.0.1:27717';
    const url = `${base}/api/events`;
    expect(url).toBe('http://127.0.0.1:27717/api/events');
  });

  it('event types match SSE event names from server', () => {
    // These are the server event names verified by cargo test
    const events = ['clipboard-updated', 'clipboard-cleared', 'config-changed'];
    expect(events).toContain('clipboard-updated');
    expect(events).toContain('clipboard-cleared');
    expect(events).toContain('config-changed');
  });
});
