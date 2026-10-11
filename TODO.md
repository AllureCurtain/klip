# TODO

Status mirror of GitHub issues. Update with the PR that changes task state.
"Recently completed" keeps at most 10 entries.

## In progress

- [ ] #14 Clipboard search is unreliable — history items not found by content
  - Done when: searching a recently copied item's text returns it consistently;
    Tantivy index health/rebuild verified; regression test added.
- [ ] #15 Clipboard history cannot scroll to older items
  - Done when: scrolling down loads older items beyond the first page; no
    duplicates or gaps; works with active filters.
- [ ] #17 Clipboard-write self-suppression has multiple holes
  - Done when: pasting/copying from Klip does not re-insert the item as new
    history (text, image, and file paths); hotkey rollback does not leave stale
    shortcut state; per-event config reads are not on the hot path.

## Next

- [ ] Migrate authoritative Chinese docs to the English standard file set
  (`docs/product.md`, `docs/architecture.md`, `docs/api.md`, `docs/development.md`,
  `docs/user-guide.md` filled from `PRD/ARCHITECTURE/DATABASE/API/DEVELOPMENT`).
  Done when: each standard file covers its topic and INDEX marks source docs archived.
- [ ] Minor audit leftovers (unfiled): `upsertItem` does not re-sort and can
  desync quick-paste index alignment; `get_stats.db_size_bytes` always 0;
  `productivityStore` writes config bypassing `configStore` normalization;
  `setPrivacyModeForMinutes(0)` writes `Date.now()` instead of clearing.
- [ ] Repo hygiene per `coding-standard/GITHUB-SETUP.md`: verify branch
  protection, auto-delete head branches, single merge method on `main`.

## Blocked

<!-- Empty: nothing currently blocked. -->

## Recently completed

- [x] #16 Settings page feels visually disjointed — Data tab unified onto the
  SectionCard/SettingToggle primitives and shared tokens per DESIGN.md; contrast
  ≥4.5:1 verified (`fix/settings-visual-consistency`)
- [x] Documentation standard applied: `AGENTS.md`, `TODO.md`, `DESIGN.md`,
  `docs/{product,api,decisions,development,user-guide}.md`, `src/AGENTS.md`,
  `src-tauri/AGENTS.md`, `.github` templates (2026-10-11)
- [x] Full codebase audit; filed issues #14–#17 (2026-10-11)
- [x] 0.3.1 Windows packages and configurable shortcuts (2026-10)
- [x] #12 Restore WCAG contrast for alpha-modified text (2026-10)
- [x] #13 Post-tag 0.3.0 changelog fixes (2026-10)
