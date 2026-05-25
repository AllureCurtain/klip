import { describe, expect, it } from 'vitest';
import enUS from './en-US.json';
import zhCN from './zh-CN.json';

const REQUIRED_KEYS = [
  'settings.data.createTag',
  'settings.data.snippets',
  'settings.data.snippetTitle',
  'settings.data.snippetContent',
  'settings.data.createSnippet',
  'settings.data.snippetCreated',
  'settings.data.copySnippet',
  'settings.data.deleteSnippet',
  'settings.data.sourceRules',
  'settings.data.sourceRuleType',
  'settings.data.sourceRuleProcess',
  'settings.data.sourceRuleTitle',
  'settings.data.sourceRuleAny',
  'settings.data.sourceRulePattern',
  'settings.data.createSourceRule',
  'settings.data.sourceRuleCreated',
  'settings.data.toggleSourceRule',
  'settings.data.deleteSourceRule',
  'settings.data.readiness',
  'settings.data.monitoring',
  'settings.data.updatesEnabled',
  'settings.data.updateFeedUrl',
  'settings.data.encryptionEnabled',
  'settings.data.encryptionStatus',
  'settings.data.syncFolder',
  'settings.data.pluginFolder',
  'settings.about.copyPath',
  'settings.about.openPath',
] as const;

describe('locale coverage', () => {
  it.each([
    ['en-US', enUS],
    ['zh-CN', zhCN],
  ])('%s includes product settings translations', (_locale, messages) => {
    for (const key of REQUIRED_KEYS) {
      expect(readMessage(messages, key), key).toEqual(expect.any(String));
      expect(readMessage(messages, key), key).not.toBe('');
    }
  });
});

function readMessage(messages: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((current, segment) => {
      if (current && typeof current === 'object' && segment in current) {
        return (current as Record<string, unknown>)[segment];
      }
      return undefined;
    }, messages);
}
