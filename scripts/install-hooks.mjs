#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, chmodSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const hooksSrc = join(__dirname, 'hooks');
const hooksDst = join(repoRoot, '.git', 'hooks');

if (!existsSync(join(repoRoot, '.git'))) {
  console.log('install-hooks: not a git checkout, skipping');
  process.exit(0);
}

if (!existsSync(hooksDst)) {
  mkdirSync(hooksDst, { recursive: true });
}

for (const file of readdirSync(hooksSrc)) {
  const src = join(hooksSrc, file);
  const dst = join(hooksDst, file);
  copyFileSync(src, dst);
  try {
    chmodSync(dst, 0o755);
  } catch {
    // Windows ignores chmod; git for windows respects shebang regardless.
  }
  console.log(`install-hooks: installed ${file}`);
}
