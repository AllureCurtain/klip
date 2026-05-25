# Klip Roadmap

## MVP: Windows v0.1

- Stabilize clipboard capture for text, image, and file paths.
- Keep global hotkeys, quick paste, tray actions, and settings reliable.
- Provide tags, favorites, snippets, advanced search, sensitive-content controls, import/export, and backup/restore in the Windows-first local product.
- Support monitoring pause, timed privacy mode, and Windows foreground-source ignore rules.
- Align docs, CI, linting, formatting, and tests with the current code.
- Maintain a desktop E2E smoke test for copy, search, and paste behavior.
- Keep the tag/manual Release workflow able to build Windows installer artifacts.
- Report release readiness for Windows signing inputs and update feed URL without requiring real credentials in local verification.
- Validate installer behavior, especially startup launch and tray persistence.

## Post-MVP

- macOS and Linux behavior parity.
- Broader installed-build validation for import/export, backup/restore, sensitive content rules, source rules, and advanced search.
- Real database-at-rest encryption beyond the current local readiness setting.
- Hosted update feed integration and updater client behavior.
- Optional sync service beyond the current local sync folder setting.
- Plugin runtime and marketplace beyond the current local plugin folder setting.
