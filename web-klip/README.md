# web-klip - Browser Dashboard for Klip

A standalone web dashboard that connects to the Klip clipboard manager's HTTP API. Browse clipboard history, search, manage tags and snippets, configure the app, ask QA questions about your clipboard, watch real-time SSE events, and explore the full OpenAPI spec from your browser.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start dev server (requires Klip running on http://127.0.0.1:27717)
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

Then open http://localhost:5173 in your browser.

### Configure API URL and access token

The dashboard connects to `http://127.0.0.1:27717` by default. To change the API endpoint and (optionally) the access token:

1. Click the gear icon in the top-right corner
2. Enter the Klip HTTP API base URL (e.g. `http://127.0.0.1:27717`)
3. If the server has `http_access_token` configured, paste the same token (leave empty when authentication is disabled)
4. Click "Test" to verify connectivity (a wrong token is reported as 401), then "Connect"

Both the URL and the token are persisted in `localStorage`. The token is sent as
`Authorization: Bearer <token>` on every request, and appended as `?access_token=`
on `<img>` and `EventSource` URLs (which cannot set headers). When the server
rejects the token (401), the app shows an "Access token required" screen instead
of silently failing.

You can also set a custom port for the Klip backend via environment variable:
```bash
KLIP_HTTP_PORT=30000 cargo run  # in src-tauri/
```

## Features

| Page | Description |
|------|-------------|
| **Clipboard** | Infinite-scroll history list with content type / favorites / tag filters, multi-select batch favorite & delete, thumbnails for image items, detail panel with OCR state + re-run, tag assignment, and copy-to-OS-clipboard |
| **Search** | Backend-powered advanced search with content type, tag, favorites, sensitive, exact-match, and time-range filters |
| **Tags** | Create and delete color-coded tags (deletion is confirmed) |
| **Snippets** | Full CRUD for reusable text snippets with inline editing, tag picker, and favorite flag |
| **Source Rules** | Manage ignore rules for process names and window titles with toggle switches |
| **Statistics** | Aggregate counts (by type, favorites, sensitive), storage breakdown |
| **QA Assistant** | Streaming SSE answers with a stop button, clickable references that jump to the source item, and explicit error/timeout states |
| **Event Stream** | Live SSE connection status + token indicator, log of all real-time events (including `clipboard-item-updated`) |
| **Configuration** | Edit all Klip config keys with appropriate input types; includes the `http_access_token` field |
| **Diagnostics** | Read-only self-checks (SQLite integrity, search-index consistency, disk usage) with a one-click JSON report export |
| **System** | System/diagnostics info, main-window status, JSON/CSV export, backup, restore, sensitive rescan, history clear |
| **API Spec** | Browse the live OpenAPI 3.1 specification served by `/openapi.json` |

## Architecture

- **React 19** + **TypeScript** + **Vite 6**
- **Tailwind CSS 4** for styling (zero-config, custom theme in `src/index.css`)
- **Zustand** for global state
- **@phosphor-icons/react** for icons
- **No mock data** - every API call goes to the real Klip HTTP server
- **SSE** via native `EventSource` with auto-reconnect every 3 seconds

## API Verification

```bash
# Run the full API verification script against a running Klip server:
bash scripts/verify-api.sh [BASE_URL]
```

This exercises all public HTTP endpoints including success paths, error cases, CRUD operations, QA with FakeProvider, and SSE connectivity.

## Project Structure

```
web-klip/
|-- src/
|   |-- components/       # Sidebar, StatusBar
|   |-- views/            # Page components (ClipboardView, SearchView, etc.)
|   |-- lib/
|   |   |-- api.ts        # Typed HTTP client for all Klip API endpoints
|   |   |-- stores.ts     # Zustand global state
|   |   |-- sse.ts        # SSE EventSource connection hook
|   |   `-- utils.ts      # Formatting helpers
|   |-- types/            # TypeScript types matching Rust structs
|   |-- App.tsx
|   |-- main.tsx
|   `-- index.css
|-- scripts/
|   `-- verify-api.sh     # Bash API verification script
|-- screenshots/          # Dashboard screenshots
|-- index.html
|-- vite.config.ts
|-- tsconfig.json
`-- package.json
```

## Requirements

- Klip desktop app running (or `cargo run` in `src-tauri/`)
- Node.js 18 or newer
- pnpm 9 or newer
