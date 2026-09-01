// Minimal Chrome DevTools Protocol client for driving the live WebView2 inside
// a running `pnpm tauri:dev` session. Node ships a global WebSocket, so this
// needs nothing from npm and no WebDriver binaries.
//
// Start the app with remote debugging enabled first:
//   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 pnpm tauri:dev
//
// This is for interactive inspection and ad-hoc audits of a dev build. The
// packaged-app regression suite is clipboard-flow.e2e.js, which drives the
// release binary through tauri-driver.

const PORT = process.env.CDP_PORT ?? '9222';
// WebView2's debug server answers only on IPv6 loopback. Both IPv4 spellings
// return 404 from Node's fetch even though netstat reports them LISTENING,
// because the server validates the Host header it is given.
const HOST = '[::1]';

export async function findPage(match = 'localhost:1420') {
  const res = await fetch(`http://${HOST}:${PORT}/json/list`);
  const targets = await res.json();
  const page = targets.find(
    (t) => t.type === 'page' && (t.url.includes(match) || t.url.startsWith('http'))
  );
  if (!page) {
    throw new Error(
      `no page target found. targets: ${JSON.stringify(targets.map((t) => [t.type, t.url]))}`
    );
  }
  return page;
}

export class Session {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) {
          reject(new Error(JSON.stringify(msg.error)));
        } else {
          resolve(msg.result);
        }
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} timed out`));
        }
      }, 15000);
    });
  }

  /** Evaluate a function body in page context and return the value by JSON round-trip. */
  async eval(fnBody) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(() => { ${fnBody} })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(
        'page threw: ' +
          (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails))
      );
    }
    return r.result.value;
  }

  consoleErrors() {
    return this.events
      .filter(
        (e) =>
          (e.method === 'Runtime.consoleAPICalled' &&
            ['error', 'warning'].includes(e.params.type)) ||
          e.method === 'Runtime.exceptionThrown'
      )
      .map((e) =>
        e.method === 'Runtime.exceptionThrown'
          ? 'EXCEPTION: ' +
            (e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text)
          : e.params.type.toUpperCase() +
            ': ' +
            e.params.args.map((a) => a.description ?? a.value).join(' ')
      );
  }
}

export async function connect(match) {
  const page = await findPage(match);
  // The advertised ws URL uses `localhost`, which fails the same way the HTTP
  // endpoint does; point it at the IPv6 loopback that actually answers.
  const wsUrl = page.webSocketDebuggerUrl.replace('localhost:', `${HOST}:`);
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('ws connect failed')), { once: true });
  });
  const s = new Session(ws);
  await s.send('Runtime.enable');
  await s.send('Page.enable');
  await s.send('DOM.enable');
  return { session: s, page };
}
