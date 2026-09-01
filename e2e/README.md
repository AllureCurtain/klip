# Klip E2E Tests

Two ways to drive the real webview:

- **`clipboard-flow.e2e.js`** — the regression suite. Drives the packaged Tauri webview through
  `tauri-driver` and Selenium, with isolated app data. This is what CI runs.
- **`cdp.mjs` + `contrast-audit.mjs`** — ad-hoc inspection of a `pnpm tauri:dev` session over the
  Chrome DevTools Protocol. No WebDriver binaries and no npm dependencies; see
  [Inspecting A Dev Session](#inspecting-a-dev-session).

## Windows Setup

Install the native WebDriver pieces once:

```powershell
cargo install tauri-driver --locked
```

Install the Microsoft Edge WebDriver version matching the installed WebView2 Runtime and make
sure `msedgedriver.exe` is available on `PATH`. GitHub Actions detects the WebView2 version and
installs the matching driver with `scripts/install-matching-edgedriver.ps1` instead of relying on
the runner's bundled Edge browser driver.

## Linux Setup

Install the native WebDriver and clipboard pieces once:

```bash
cargo install tauri-driver --locked
sudo apt install xclip xsel xdotool
# Wayland sessions should also install wl-clipboard and may need wtype or ydotool.
```

Linux E2E needs a real desktop session with clipboard access. Wayland compositors can block global shortcuts and synthetic paste; use an X11 session for full paste-flow coverage, or install compositor-compatible tools (`wl-clipboard`, `wtype`, `ydotool`) and expect compositor-specific behavior.

## Run On Windows

```powershell
pnpm e2e
```

## Run On Linux

```bash
scripts/run-e2e-linux.sh
```

The runners build the frontend and debug Tauri binary, start `tauri-driver`, launch Klip with isolated app data under `e2e/.tmp/`, and run the clipboard capture/search/paste flow.

`pnpm verify` does not run E2E because it depends on a real desktop session, system clipboard access, and WebDriver binaries.

## Inspecting A Dev Session

For quick checks against a dev build — measuring paint latency, counting IPC calls, auditing
computed styles — `cdp.mjs` talks to WebView2's DevTools endpoint directly. Start the app with
remote debugging enabled:

```bash
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 pnpm tauri:dev
```

Then run a script against it:

```bash
node e2e/contrast-audit.mjs
```

`connect()` returns a session with `eval(body)` (runs a function body in page context, returns the
value by JSON round-trip) and `consoleErrors()`. Write throwaway scripts against it as needed.

Two things to know. WebView2's debug server answers only on IPv6 loopback (`[::1]`); both IPv4
spellings return 404 from Node's `fetch` even while netstat reports them LISTENING, because the
server validates the Host header. And the window is transparent, so `body` has no background —
any contrast math must composite translucent layers over the `--background` token rather than
walking ancestors for an opaque one, or every muted foreground appears to sit on black and reports
a failure that does not exist.

`contrast-audit.mjs` complements `pnpm check:contrast`: the static gate checks token pairs from
source, this one checks what the browser actually painted across all eight theme combos, which is
what catches a token wired to the wrong variable.
