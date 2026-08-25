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

### Configure API URL

The dashboard connects to `http://127.0.0.1:27717` by default. To change the API endpoint:

1. Click the gear icon in the top-right corner
2. Enter the Klip HTTP API base URL (e.g. `http://127.0.0.1:27717`)
3. Click "Test" to verify connectivity, then "Connect"

The URL is persisted in `localStorage`.

You can also set a custom port for the Klip backend via environment variable:
```bash
KLIP_HTTP_PORT=30000 cargo run  # in src-tauri/
```

## Features

| Page | Description |
|------|-------------|
| **Clipboard** | Infinite-scroll history list with content type filters, favorites filter, detail panel showing full content, metadata, and tags; copy-to-OS-clipboard and delete actions |
| **Search** | Backend-powered advanced search with content type and favorites filters |
| **Tags** | Create and delete color-coded tags |
| **Snippets** | Full CRUD for reusable text snippets with inline editing |
| **Source Rules** | Manage ignore rules for process names and window titles with toggle switches |
| **Statistics** | Aggregate counts (by type, favorites, sensitive), storage breakdown |
| **QA Assistant** | Ask questions about clipboard history using the LLM integration; works out of the box with FakeProvider |
| **Event Stream** | Live SSE connection status indicator + log of all real-time events (clipboard-updated, clipboard-cleared, config-changed) |
| **Configuration** | Edit all Klip config keys with appropriate input types (boolean toggles, numbers, text); batch-save |
| **System** | System/diagnostics info, JSON/CSV export, backup, restore, sensitive rescan, history clear |
| **API Spec** | Browse the live OpenAPI 3.1 specification served by `/openapi.json` and `/api/openapi.json` |

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
|-- index.html
|-- vite.config.ts
|-- tsconfig.json
`-- package.json
```

## Requirements

- Klip desktop app running (or `cargo run` in `src-tauri/`)
- Node.js 18 or newer
- pnpm 9 or newer
