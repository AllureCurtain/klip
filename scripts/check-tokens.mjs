#!/usr/bin/env node
/**
 * Semantic token gate (docs/NEXT_PHASE_IMPLEMENTATION.md §7.2).
 *
 * §7.2 freezes the rule "组件不得直接写入颜色值或 indigo/emerald/sky 等颜色名".
 * This walks every component source and fails on:
 *   - Tailwind palette color names (bg-indigo-500, text-emerald-400/70, ...)
 *   - raw color literals in className strings (#rrggbb, rgb(), hsl())
 *
 * globals.css is the one place allowed to hold literals: it *defines* the tokens.
 * Exits non-zero with file:line so a styling shortcut cannot silently reintroduce
 * a hardcoded content-type color.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const srcDir = join(root, 'src');

/** Tailwind's default palette. Semantic tokens (content-text, warning) are not here. */
const PALETTE = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
];

const PALETTE_RE = new RegExp(String.raw`\b(?:${PALETTE.join('|')})-\d{2,3}\b`, 'g');

/**
 * Color literals baked into styling: Tailwind arbitrary values like `bg-[#14b8a6]`
 * or `text-[rgb(...)]`. A bare hex elsewhere is data (a default `<input type="color">`
 * value, a tag color persisted to SQLite) and is not a styling decision, so it passes.
 */
const ARBITRARY_RE =
  /\b(?:bg|text|border|fill|stroke|from|via|to|ring|outline|shadow|decoration|accent|caret|divide)-\[(?:#[0-9a-fA-F]{3,8}|rgba?\([^\]]*\)|hsla?\([^\]]*\))\]/g;

/** globals.css is the one place allowed to hold literals: it *defines* the tokens. */
const ALLOWED = new Set(['src/styles/globals.css']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|css)$/.test(entry) && !entry.includes('.test.')) out.push(full);
  }
  return out;
}

const problems = [];
for (const file of walk(srcDir)) {
  const rel = relative(root, file).replace(/\\/g, '/');
  if (ALLOWED.has(rel)) continue;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const re of [PALETTE_RE, ARBITRARY_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        problems.push(`${rel}:${i + 1}  ${m[0]}  ${line.trim().slice(0, 90)}`);
      }
    }
  });
}

if (problems.length > 0) {
  console.error(
    `token gate: ${problems.length} hardcoded color(s) found — use semantic tokens (§7.2)\n`,
  );
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('token gate: no hardcoded colors outside globals.css — all pass');
