# Design

Visual rules for the Klip UI. Token *values* are not duplicated here — the single
source of truth is `src/styles/globals.css` (Tailwind 4 theme variables). This
file defines how to *use* them.

## Tokens

Defined in `src/styles/globals.css` under `:root` (light) and `.dark`:

- Surfaces: `--surface`, `--surface-raised`, `--surface-muted`, `--surface-selected`,
  `--glass-bg` (window chrome), `--card`, `--popover`
- Text: `--ink` (primary), `--text`, `--muted`, `--faint`, `--ink-inverse`
- Accent: `--accent`, `--accent-strong`, `--accent-soft`, `--on-accent`, `--focus`
- Status: `--success`, `--warning`, `--danger`, `--info`
- Content-type badges: `--color-content-text`, `--color-content-image`, `--color-content-file`
- Settings rail: `--color-rail`, `--color-rail-raised`, `--color-rail-ink`,
  `--color-rail-active`, `--color-rail-accent`
- Sidebar (secondary surfaces): `--color-sidebar*`
- Shape: `--radius-sm/md/lg/xl`; shadows: `--shadow-raised`, `--shadow-pop`,
  `--shadow-card`, `--shadow-card-hover`, `--shadow-glow`
- Type: `--font-sans`, `--font-mono`

Rules:

- Never hardcode hex/rgba values in components — use the token (Tailwind
  utilities generated from these vars, or `var(--name)` in CSS).
- Alpha-modified text (`text-*/NN`, `color-mix`, opacity utilities) must still
  resolve to ≥4.5:1 contrast against its actual background token — this was the
  root cause of issue #12; regression test exists.
- New surfaces or states get a new token in `globals.css`, not an inline value.

## Component states

Every interactive element must cover: default, hover, focus-visible (uses
`--focus`/`--ring`, never remove the outline without a visible replacement),
active/pressed, disabled (reduced opacity AND `cursor: not-allowed` semantics),
selected (uses `--surface-selected` / `--accent-soft`), loading where applicable.

## Page states

Each view covers: loading, empty (`components/layout/EmptyState`), error
(with a retry path — failed IPC must not strand the UI), and content. The list
additionally covers "more available" pagination state (see issue #15).

## Layout consistency

- The settings rail (`--color-rail*`) and the main window chrome share spacing
  scale, radius, and type — issue #16 tracks visible drift; new settings sections
  reuse rail tokens and existing section-header patterns.
- Keyboard reachability: every action reachable by mouse is reachable by
  keyboard (the app is hotkey-driven; focus must survive window show/hide).
- The window is a floating panel, not a full page: respect `--stage`/glass
  background and bounded radii; no edge-to-edge opaque fills.

## Accessibility

- Contrast: text ≥4.5:1, large text/icons ≥3:1 (WCAG AA).
- Status is never conveyed by color alone — pair `--danger`/`--success`/`--info`
  with an icon or label.
- `prefers-reduced-motion`: transitions/animations must degrade.
- Interactive targets expose accessible names (icon-only buttons get `aria-label`).

## Responsive

The window is resizable within configured bounds; layouts must not clip content
or the list below the minimum window size stored in config. No fixed-pixel
text truncation that hides full item previews at default size.
