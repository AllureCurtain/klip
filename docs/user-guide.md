# User guide

How to use Klip day to day. For architecture and developer setup see
`docs/INDEX.md`.

## Opening Klip

- Press **Ctrl+Alt+K** (configurable) anywhere to show/hide the window.
- Or click the tray icon.
- The window auto-hides when it loses focus.

## Finding items

- Type in the search box to full-text search your history (content, previews,
  and image OCR text).
- Filter by content type (text / image / file), favorites, or tags.
- Scroll the list to load older history; the newest items are on top.

## Pasting back

- Click an item (or press Enter on the selection) — Klip copies it and pastes
  into the previously focused app.
- **Ctrl+Alt+1..9** pastes the first 9 items of the *currently visible* list
  (respects your active search/filter order).
- Copy-without-paste actions are available per item (copy, copy as plain text).

## Organizing

- ★ Favorite pins items; tags group related items (create and assign from the
  item menu or settings).
- Edit an item to set a custom title or note — both are searchable.
- Snippets are reusable text blocks you create once and paste like history.

## Privacy

- **Pause monitoring** stops all capture until you resume.
- **Privacy mode** suppresses capture for a set duration.
- **Source rules** ignore captures from apps/windows you name (e.g. a password
  manager) — best-effort by process/window title.
- Items detected as sensitive are masked in the list; manage and rescan from
  settings.

## Storage & data

- Images carry the most storage cost; configure the image budget in settings —
  Klip warns (`image-storage-warning`) before it grows unbounded.
- Image OCR runs offline in the background so image content is searchable.
- Export history to JSON/CSV; import it back; full DB backup/restore is in
  settings.

## Settings

- Shortcuts: toggle-window and quick-paste prefix are configurable (Ctrl+Alt
  combos are the tested-good pattern on Windows).
- Autostart on login, window size, monitoring and privacy defaults are under
  the settings rail.

## Platform notes

- Windows/macOS: paste simulation is built in. Linux: depends on the desktop
  session and installed clipboard/paste helpers.
- Everything stays on your machine — Klip has no account and no sync.
