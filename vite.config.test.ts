import { describe, expect, it } from 'vitest';

import eslintConfig from './eslint.config.js';
import packageJson from './package.json';
import tsconfigNode from './tsconfig.node.json';
import config from './vite.config.ts';

describe('vite test config', () => {
  it('ignores nested local git worktrees when tests run from the repository root', () => {
    expect(Array.isArray(config)).toBe(false);
    expect(typeof config).toBe('object');

    const testConfig = 'test' in config ? config.test : undefined;

    expect(testConfig?.exclude).toEqual(expect.arrayContaining(['**/.worktrees/**']));
  });

  it('pins local commands to the TypeScript Vite config', () => {
    expect(packageJson.scripts.dev).toContain('--config vite.config.ts');
    expect(packageJson.scripts.build).toContain('vite build --config vite.config.ts');
    expect(packageJson.scripts.preview).toContain('--config vite.config.ts');
    expect(packageJson.scripts.test).toContain('--config vite.config.ts');
    expect(packageJson.scripts['test:coverage']).toContain('--config vite.config.ts');
  });

  it('keeps generated Vite config artifacts out of the repository root', () => {
    expect(tsconfigNode.compilerOptions).toMatchObject({
      outDir: 'node_modules/.cache/tsconfig-node',
    });
  });

  it('keeps linting focused on the active checkout', () => {
    expect(eslintConfig[0].ignores).toEqual(
      expect.arrayContaining(['.worktrees/**', 'coverage/**'])
    );
  });
});
