import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

it('installs hooks from a git worktree checkout', () => {
  expect(() => {
    execFileSync(process.execPath, ['scripts/install-hooks.mjs'], {
      cwd: repoRoot,
      stdio: 'pipe',
    });
  }).not.toThrow();
});
