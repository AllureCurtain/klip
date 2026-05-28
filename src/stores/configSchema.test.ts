import { describe, expect, it } from 'vitest';
import { CONFIG_SCHEMA, DEFAULT_CONFIG, parseConfig, serializeConfig } from './configSchema';

describe('configSchema', () => {
  it('parses defaults from a single schema definition', () => {
    expect(parseConfig({})).toEqual(DEFAULT_CONFIG);
  });

  it('clamps parsed window sizes to packaged minimums', () => {
    const config = parseConfig({
      window_width: '300',
      window_height: '400',
    });

    expect(config.window_width).toBe(360);
    expect(config.window_height).toBe(480);
  });

  it('serializes persisted config values without deprecated tray visibility', () => {
    const entries = serializeConfig({
      ...DEFAULT_CONFIG,
      clipboard_monitor_enabled: false,
      privacy_mode_until: 1234,
    });

    expect(entries).toContainEqual(['clipboard_monitor_enabled', 'false']);
    expect(entries).toContainEqual(['privacy_mode_until', '1234']);
    expect(entries).not.toContainEqual(['show_in_tray', expect.any(String)]);
  });

  it('has one descriptor per frontend config field', () => {
    const keys = CONFIG_SCHEMA.map((descriptor) => descriptor.key);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.sort()).toEqual(Object.keys(DEFAULT_CONFIG).sort());
  });
});
