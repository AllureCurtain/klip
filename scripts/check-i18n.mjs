#!/usr/bin/env node
/**
 * i18n coverage gate.
 *
 * The settings rework (spec §10.2) moved every panel onto `t(...)` keys. A key
 * that is missing from a locale renders as the raw key string in the UI, which
 * type-checking and lint cannot catch. This gate walks the settings sources,
 * collects both literal and template-built keys, and fails when any locale is
 * missing one.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const LOCALE_DIR = 'src/i18n/locales';
const LOCALES = ['en-US', 'zh-CN'];

/**
 * Template keys such as t(`settings.appearance.families.${value}`) cannot be
 * resolved statically, so each prefix is paired with its known value set.
 */
const DYNAMIC_KEYS = [
  ...['ember', 'graphite', 'brick', 'rose'].flatMap((family) => [
    `settings.appearance.families.${family}`,
    `settings.appearance.familyHints.${family}`,
  ]),
  ...['light', 'dark', 'system'].map((mode) => `settings.appearance.${mode}`),
  ...['zh-CN', 'en-US'].map((lang) => `language.${lang}`),
  ...[
    'toggle_window',
    ...Array.from({ length: 9 }, (_, index) => `quick_paste_${index + 1}`),
  ].map((action) => `settings.shortcuts.actions.${action}`),
  ...['invalid', 'reserved', 'duplicate', 'missing', 'occupied'].map(
    (code) => `settings.shortcuts.issues.${code}`
  ),
];

function sourceFiles() {
  const root = 'src/components/settings';
  const files = readdirSync(root)
    .filter((name) => /\.(tsx|ts)$/.test(name) && !name.includes('.test.'))
    .map((name) => join(root, name));
  for (const name of readdirSync(join(root, 'panels'))) {
    if (/\.(tsx|ts)$/.test(name) && !name.includes('.test.')) {
      files.push(join(root, 'panels', name));
    }
  }
  return files;
}

function collectKeys() {
  const keys = new Set(DYNAMIC_KEYS);
  for (const file of sourceFiles()) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\bt\(\s*'([^']+)'/g)) keys.add(match[1]);
    for (const match of source.matchAll(/\b(?:labelKey|descriptionKey):\s*'([^']+)'/g)) {
      keys.add(match[1]);
    }
  }
  return [...keys].sort();
}

function read(messages, path) {
  return path
    .split('.')
    .reduce((current, segment) =>
      current && typeof current === 'object' ? current[segment] : undefined,
      messages
    );
}

const keys = collectKeys();
let failed = false;

for (const locale of LOCALES) {
  const messages = JSON.parse(readFileSync(join(LOCALE_DIR, `${locale}.json`), 'utf8'));
  const missing = keys.filter((key) => {
    const value = read(messages, key);
    return typeof value !== 'string' || value.trim() === '';
  });
  if (missing.length > 0) {
    failed = true;
    console.error(`\n${locale}: missing ${missing.length} of ${keys.length} keys`);
    for (const key of missing) console.error(`  ${key}`);
  }
}

if (failed) {
  console.error('\ni18n gate: FAILED');
  process.exit(1);
}

console.log(`i18n gate: ${keys.length} settings keys present in ${LOCALES.join(', ')} — all pass`);
