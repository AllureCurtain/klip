import { describe, it, expect } from 'vitest';
import { formatTime, formatSize, formatDate, truncate, parseMetadata } from './utils';

describe('formatTime', () => {
  it('returns "just now" for timestamps less than a minute old', () => {
    const now = Date.now() - 1000;
    expect(formatTime(now)).toBe('just now');
  });

  it('returns minutes ago for recent timestamps', () => {
    const fiveMinAgo = Date.now() - 5 * 60_000;
    expect(formatTime(fiveMinAgo)).toBe('5m ago');
  });

  it('returns hours ago for timestamps within a day', () => {
    const twoHoursAgo = Date.now() - 2 * 3_600_000;
    expect(formatTime(twoHoursAgo)).toBe('2h ago');
  });

  it('returns days ago for timestamps within a week', () => {
    const threeDaysAgo = Date.now() - 3 * 86_400_000;
    expect(formatTime(threeDaysAgo)).toBe('3d ago');
  });

  it('returns a date string for older timestamps', () => {
    const old = new Date('2020-06-15T12:00:00Z').getTime();
    const result = formatTime(old);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(3);
  });
});

describe('formatSize', () => {
  it('formats bytes correctly', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(500)).toBe('500 B');
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(2048)).toBe('2.0 KB');
    expect(formatSize(1048576)).toBe('1.0 MB');
    expect(formatSize(5242880)).toBe('5.0 MB');
  });
});

describe('formatDate', () => {
  it('returns a string representation', () => {
    const ts = new Date('2024-01-01T00:00:00Z').getTime();
    const result = formatDate(ts);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('truncate', () => {
  it('does not truncate short strings', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates long strings with ellipsis character', () => {
    expect(truncate('abcdefghijklmnop', 5)).toBe('abcde…');
  });

  it('returns empty string for null/undefined', () => {
    expect(truncate(null, 5)).toBe('');
    expect(truncate(undefined, 5)).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(truncate('', 5)).toBe('');
  });
});

describe('parseMetadata', () => {
  it('parses valid JSON', () => {
    const result = parseMetadata('{"key":"value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('returns null for invalid JSON', () => {
    expect(parseMetadata('not json')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(parseMetadata(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseMetadata('')).toBeNull();
  });
});
