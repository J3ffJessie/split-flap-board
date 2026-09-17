import { describe, it, expect } from 'vitest';
import { GLYPH_SEQUENCE } from '../components/FlapTile.js';

describe('GLYPH_SEQUENCE', () => {
  it('contains space as first character', () => {
    expect(GLYPH_SEQUENCE[0]).toBe(' ');
  });

  it('contains all uppercase letters', () => {
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      expect(GLYPH_SEQUENCE).toContain(letter);
    }
  });

  it('contains all digits', () => {
    for (const digit of '0123456789') {
      expect(GLYPH_SEQUENCE).toContain(digit);
    }
  });

  it('has no duplicate characters', () => {
    const unique = new Set(GLYPH_SEQUENCE);
    expect(unique.size).toBe(GLYPH_SEQUENCE.length);
  });
});

describe('stepsForward logic (pure calculation)', () => {
  const len = GLYPH_SEQUENCE.length;

  function stepsForward(from: number, to: number): number {
    if (to === from) return 0;
    return to > from ? to - from : len - from + to;
  }

  it('returns 0 for same position', () => {
    expect(stepsForward(0, 0)).toBe(0);
    expect(stepsForward(5, 5)).toBe(0);
  });

  it('returns positive steps when to > from', () => {
    expect(stepsForward(0, 3)).toBe(3);
    expect(stepsForward(1, 5)).toBe(4);
  });

  it('wraps around the glyph ring correctly', () => {
    // Going from index 0 to the last index should be len-1 steps forward
    expect(stepsForward(0, len - 1)).toBe(len - 1);
    // Going backwards: from last to first is 1 step forward (wrap)
    expect(stepsForward(len - 1, 0)).toBe(1);
  });

  it('never returns negative steps', () => {
    for (let i = 0; i < len; i++) {
      for (let j = 0; j < len; j++) {
        expect(stepsForward(i, j)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
