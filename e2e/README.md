# Klip E2E Tests

The E2E suite drives the packaged Tauri webview through `tauri-driver` and Selenium.

## Windows Setup

Install the native WebDriver pieces once:

```powershell
cargo install tauri-driver --locked
```

Install Microsoft Edge WebDriver (`msedgedriver.exe`) and make sure it is available on `PATH`.

## Run

```powershell
pnpm e2e
```

The runner builds the frontend and debug Tauri binary, starts `tauri-driver`, launches Klip with an isolated app data directory under `e2e/.tmp/`, and runs the clipboard capture/search/paste flow.

`pnpm verify` does not run E2E because it depends on a real desktop session, system clipboard access, and WebDriver binaries.
