import { describe, expect, it } from 'vitest';
import { sanitizeForBoard } from '../utils/sanitizeForBoard.js';

describe('sanitizeForBoard', () => {
  it('converts curly apostrophes to straight ones', () => {
    expect(sanitizeForBoard('don’t')).toBe("don't");
  });

  it('converts curly double quotes to straight ones', () => {
    expect(sanitizeForBoard('“hello”')).toBe('"hello"');
  });

  it('converts em and en dashes to hyphens', () => {
    expect(sanitizeForBoard('a—b–c')).toBe('a-b-c');
  });

  it('converts an ellipsis character to three periods', () => {
    expect(sanitizeForBoard('wait…')).toBe('wait...');
  });

  it('converts a non-breaking space to a regular space', () => {
    expect(sanitizeForBoard('a b')).toBe('a b');
  });

  it('leaves plain ASCII text untouched', () => {
    expect(sanitizeForBoard("Stay hungry, stay foolish.")).toBe('Stay hungry, stay foolish.');
  });
});
