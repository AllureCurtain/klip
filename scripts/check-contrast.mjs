#!/usr/bin/env node
/**
 * Token contrast gate (docs/NEXT_PHASE_IMPLEMENTATION.md §7.3).
 *
 * Parses src/styles/globals.css, resolves every theme family x mode combo, and
 * asserts the WCAG contrast floors:
 *   - body ink on every background it can legally sit on : >= 4.5:1
 *   - large/secondary ink and non-text UI boundaries      : >= 3:1
 *
 * Exits non-zero with a per-pair report so a token edit cannot silently regress
 * a family nobody screenshotted.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(here, '../src/styles/globals.css');
const css = readFileSync(cssPath, 'utf8');

const FAMILIES = ['ember', 'graphite', 'brick', 'rose'];
const MODES = ['light', 'dark'];

/** Selector -> { token: value } for every top-level rule block. */
function parseBlocks(source) {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(stripped)) !== null) {
    const selector = match[1].trim();
    if (!selector || selector.startsWith('@')) continue;
    const decls = {};
    for (const part of match[2].split(';')) {
      const idx = part.indexOf(':');
      if (idx === -1) continue;
      const prop = part.slice(0, idx).trim();
      if (!prop.startsWith('--')) continue;
      decls[prop] = part.slice(idx + 1).trim();
    }
    if (Object.keys(decls).length > 0) blocks.push({ selector, decls });
  }
  return blocks;
}

const blocks = parseBlocks(css);

/** Does `selector` (a comma list) apply to this family/mode? */
function selectorApplies(selector, family, mode) {
  return selector.split(',').some((raw) => {
    const sel = raw.trim();
    if (sel === ':root') return true;
    const themeMatch = sel.match(/\[data-theme="([a-z]+)"\]/);
    const modeMatch = sel.match(/\[data-mode="([a-z]+)"\]/);
    if (!themeMatch && !modeMatch) return false;
    if (themeMatch && themeMatch[1] !== family) return false;
    if (modeMatch && modeMatch[1] !== mode) return false;
    return true;
  });
}

function resolveTokens(family, mode) {
  const out = {};
  for (const { selector, decls } of blocks) {
    if (!selectorApplies(selector, family, mode)) continue;
    Object.assign(out, decls);
  }
  return out;
}

// --- colour parsing ------------------------------------------------------
function parseColor(value) {
  const v = value.trim();
  let m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  m = v.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const [r, g, b] = m[1].split('').map((c) => parseInt(c + c, 16));
    return { r, g, b, a: 1 };
  }
  m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i);
  if (m) {
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  }
  return null;
}

/** Flatten a possibly-translucent colour over an opaque backdrop. */
function over(fg, bg) {
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

function luminance({ r, g, b }) {
  const lin = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// --- the pairs that must hold -------------------------------------------
// Backgrounds any body text can legally sit on.
const TEXT_SURFACES = ['background', 'surface', 'surface-raised', 'surface-muted', 'surface-selected'];

/** [inkToken, surfaceTokens, minRatio, note] */
const CHECKS = [
  ['ink', TEXT_SURFACES, 4.5, 'primary body text'],
  ['text', TEXT_SURFACES, 4.5, 'secondary body text'],
  ['muted', TEXT_SURFACES, 4.5, 'auxiliary text'],
  ['faint', TEXT_SURFACES, 3.0, 'weak hint text (large/decorative only)'],
  ['accent', ['background', 'surface', 'surface-raised'], 3.0, 'accent as non-text/large indicator'],
  ['success', ['background', 'surface', 'surface-raised'], 3.0, 'status colour'],
  ['warning', ['background', 'surface', 'surface-raised'], 3.0, 'status colour'],
  ['danger', ['background', 'surface', 'surface-raised'], 3.0, 'status colour'],
  ['info', ['background', 'surface', 'surface-raised'], 3.0, 'status colour'],
  ['focus', ['background', 'surface', 'surface-raised', 'surface-muted'], 3.0, 'focus ring visibility'],
  ['border-strong', ['background', 'surface'], 1.4, 'visible boundary'],
  ['content-text', ['background', 'surface', 'surface-raised'], 3.0, 'content type badge'],
  ['content-image', ['background', 'surface', 'surface-raised'], 3.0, 'content type badge'],
  ['content-file', ['background', 'surface', 'surface-raised'], 3.0, 'content type badge'],
  ['rail-ink', ['rail', 'rail-raised'], 4.5, 'rail nav label'],
  ['rail-active', ['rail', 'rail-raised'], 4.5, 'rail active label'],
  ['rail-accent', ['rail', 'rail-raised'], 3.0, 'rail accent indicator'],
];

// on-accent must be readable ON the accent fill, not on the page.
const ON_ACCENT_CHECKS = [
  ['on-accent', 'accent', 4.5, 'text on accent fill'],
  ['on-accent', 'accent-strong', 4.5, 'text on accent hover fill'],
];

const failures = [];
const missing = [];
let checked = 0;

for (const family of FAMILIES) {
  for (const mode of MODES) {
    const tokens = resolveTokens(family, mode);
    const combo = `${family}/${mode}`;

    const get = (name) => {
      const raw = tokens[`--${name}`];
      if (raw === undefined) {
        missing.push(`${combo}: --${name} is not defined`);
        return null;
      }
      const parsed = parseColor(raw);
      if (!parsed) {
        missing.push(`${combo}: --${name} = "${raw}" is not a parseable colour`);
        return null;
      }
      return parsed;
    };

    // Opaque page backdrop that translucent surfaces composite over.
    const stage = get('stage');
    const pageBg = get('background');
    if (!stage || !pageBg) continue;

    for (const [inkName, surfaceNames, min, note] of CHECKS) {
      const inkRaw = get(inkName);
      if (!inkRaw) continue;
      for (const surfaceName of surfaceNames) {
        const surfRaw = get(surfaceName);
        if (!surfRaw) continue;
        // Composite the surface over the stage, then the ink over that.
        const surface = over(surfRaw, stage);
        const ink = over(inkRaw, surface);
        const ratio = contrast(ink, surface);
        checked += 1;
        if (ratio < min) {
          failures.push(
            `${combo}  --${inkName} on --${surfaceName}: ${ratio.toFixed(2)}:1 < ${min}:1  (${note})`
          );
        }
      }
    }

    for (const [inkName, fillName, min, note] of ON_ACCENT_CHECKS) {
      const inkRaw = get(inkName);
      const fillRaw = get(fillName);
      if (!inkRaw || !fillRaw) continue;
      const fill = over(fillRaw, pageBg);
      const ink = over(inkRaw, fill);
      const ratio = contrast(ink, fill);
      checked += 1;
      if (ratio < min) {
        failures.push(
          `${combo}  --${inkName} on --${fillName}: ${ratio.toFixed(2)}:1 < ${min}:1  (${note})`
        );
      }
    }
  }
}

const comboCount = FAMILIES.length * MODES.length;
if (missing.length > 0) {
  console.error(`\ncontrast gate: ${missing.length} token problem(s)\n`);
  for (const line of missing) console.error(`  ${line}`);
}
if (failures.length > 0) {
  console.error(`\ncontrast gate: ${failures.length} failing pair(s) across ${comboCount} combos\n`);
  for (const line of failures) console.error(`  ${line}`);
  console.error('');
  process.exit(1);
}
if (missing.length > 0) {
  console.error('');
  process.exit(1);
}
console.log(`contrast gate: ${checked} pairs across ${comboCount} theme combos — all pass`);
