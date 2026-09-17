import { describe, it, expect } from 'vitest';

/**
 * Pure-logic tests for the board string-padding/diffing behaviour.
 * These functions mirror what FlapBoard.setText() does without needing DOM.
 */

const BOARD_WIDTH = 20;

function padString(text: string, width: number): string {
  return text.toUpperCase().padEnd(width, ' ').slice(0, width);
}

function diffStrings(current: string, next: string): number[] {
  const changed: number[] = [];
  for (let i = 0; i < current.length; i++) {
    if (current[i] !== next[i]) changed.push(i);
  }
  return changed;
}

describe('padString', () => {
  it('pads short strings with spaces to board width', () => {
    expect(padString('HELLO', BOARD_WIDTH)).toBe('HELLO               ');
    expect(padString('HELLO', BOARD_WIDTH).length).toBe(BOARD_WIDTH);
  });

  it('truncates strings longer than board width', () => {
    const long = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const result = padString(long, BOARD_WIDTH);
    expect(result.length).toBe(BOARD_WIDTH);
    expect(result).toBe(long.slice(0, BOARD_WIDTH));
  });

  it('uppercases lowercase input', () => {
    expect(padString('hello world', BOARD_WIDTH)).toContain('HELLO WORLD');
  });

  it('returns all spaces for empty string', () => {
    expect(padString('', BOARD_WIDTH)).toBe(' '.repeat(BOARD_WIDTH));
  });
});

describe('diffStrings', () => {
  it('returns empty array for identical strings', () => {
    const s = padString('HELLO', BOARD_WIDTH);
    expect(diffStrings(s, s)).toEqual([]);
  });

  it('identifies changed character positions', () => {
    const a = padString('AAAA', BOARD_WIDTH);
    const b = padString('AABA', BOARD_WIDTH);
    const changed = diffStrings(a, b);
    expect(changed).toContain(2); // index 2 changed from A to B
    expect(changed).not.toContain(0);
    expect(changed).not.toContain(1);
  });

  it('detects all changed positions when strings are completely different', () => {
    const a = 'AAAAAAAAAAAAAAAAAAAA'; // 20 A's
    const b = 'BBBBBBBBBBBBBBBBBBBB'; // 20 B's
    const changed = diffStrings(a, b);
    expect(changed.length).toBe(BOARD_WIDTH);
  });

  it('only includes positions that actually changed', () => {
    const a = padString('HELLO WORLD', BOARD_WIDTH);
    const b = padString('HELLO EARTH', BOARD_WIDTH);
    const changed = diffStrings(a, b);
    // "WORLD" → "EARTH": indices 6-10 change
    expect(changed.length).toBeGreaterThan(0);
    // First 5 chars (HELLO) + space should not be in changed
    expect(changed).not.toContain(0);
    expect(changed).not.toContain(1);
    expect(changed).not.toContain(4);
  });
});
