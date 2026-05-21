# Klip E2E Tests

The E2E suite drives the packaged Tauri webview through `tauri-driver` and Selenium.

## Windows Setup

Install the native WebDriver pieces once:

```powershell
cargo install tauri-driver --locked
```

Install Microsoft Edge WebDriver (`msedgedriver.exe`) and make sure it is available on `PATH`.

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
