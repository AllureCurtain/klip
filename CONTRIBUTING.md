# Contributing to Klip

Klip is currently focused on a Windows-first MVP. Keep changes small, local, and aligned with the existing React + Tauri + Rust structure.

## Local Checks

Run these before opening a pull request:

```bash
pnpm lint
pnpm test
pnpm build
cd src-tauri
cargo fmt -- --check
cargo clippy -- -D warnings
cargo test
```

## Scope

For the MVP, prioritize reliability of clipboard history, search, paste, settings, tray behavior, privacy controls, and local data management. Cloud sync, plugins, account features, full cross-platform parity, and database encryption should stay out of scope unless the roadmap is updated first.
