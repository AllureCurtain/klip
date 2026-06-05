#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, chmodSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const hooksSrc = join(__dirname, 'hooks');

if (!existsSync(join(repoRoot, '.git'))) {
  console.log('install-hooks: not a git checkout, skipping');
  process.exit(0);
}

const gitHooksPath = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();
const hooksDst = isAbsolute(gitHooksPath) ? gitHooksPath : join(repoRoot, gitHooksPath);

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
