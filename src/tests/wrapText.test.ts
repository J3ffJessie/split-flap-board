import { describe, expect, it } from 'vitest';
import { wrapText } from '../utils/wrapText.js';

describe('wrapText', () => {
  it('returns a single line when text fits within the width', () => {
    expect(wrapText('HELLO WORLD', 20, 40)).toEqual(['HELLO WORLD']);
  });

  it('wraps across multiple lines at word boundaries', () => {
    const lines = wrapText('the quick brown fox jumps over the lazy dog', 10, 40);
    expect(lines.every((l) => l.length <= 10)).toBe(true);
    expect(lines.join(' ')).toBe('the quick brown fox jumps over the lazy dog');
  });

  it('never breaks a word across lines when it fits alone on the next line', () => {
    const lines = wrapText('one two three', 7, 40);
    // "one two" is 7 chars (fits), "three" doesn't fit alongside it
    expect(lines).toEqual(['one two', 'three']);
  });

  it('hard-splits a single word longer than the column width', () => {
    const lines = wrapText('supercalifragilisticexpialidocious', 10, 40);
    expect(lines.every((l) => l.length <= 10)).toBe(true);
    expect(lines.join('')).toBe('supercalifragilisticexpialidocious');
  });

  it('returns one blank line for empty input', () => {
    expect(wrapText('', 20, 40)).toEqual(['']);
  });

  it('returns one blank line for whitespace-only input', () => {
    expect(wrapText('   ', 20, 40)).toEqual(['']);
  });

  it('caps output at maxLines', () => {
    const longText = Array.from({ length: 20 }, (_, i) => `word${i}`).join(' ');
    const lines = wrapText(longText, 10, 3);
    expect(lines.length).toBe(3);
  });

  it('marks the last line with a truncation indicator when capped', () => {
    const longText = Array.from({ length: 20 }, (_, i) => `word${i}`).join(' ');
    const lines = wrapText(longText, 10, 3);
    expect(lines[2].endsWith('...')).toBe(true);
    expect(lines[2].length).toBeLessThanOrEqual(10);
  });

  it('does not add a truncation indicator when nothing was cut', () => {
    const lines = wrapText('short quote', 20, 40);
    expect(lines[lines.length - 1].endsWith('...')).toBe(false);
  });
});
