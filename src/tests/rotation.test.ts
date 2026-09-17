import { describe, it, expect } from 'vitest';
import { interleave, formatForBoard, type RotationQuote } from '../quotes/rotation.js';

function q(text: string, source: 'local' | 'api', author: string | null = null): RotationQuote {
  return { text, author, source };
}

describe('interleave', () => {
  it('alternates local and api quotes starting with local', () => {
    const local = [q('L1', 'local'), q('L2', 'local')];
    const api = [q('A1', 'api'), q('A2', 'api')];
    const result = interleave(local, api);
    expect(result.map((r) => r.text)).toEqual(['L1', 'A1', 'L2', 'A2']);
  });

  it('appends leftover items when one list is longer', () => {
    const local = [q('L1', 'local')];
    const api = [q('A1', 'api'), q('A2', 'api'), q('A3', 'api')];
    const result = interleave(local, api);
    expect(result.map((r) => r.text)).toEqual(['L1', 'A1', 'A2', 'A3']);
  });

  it('handles an empty local list', () => {
    const result = interleave([], [q('A1', 'api')]);
    expect(result.map((r) => r.text)).toEqual(['A1']);
  });

  it('handles both lists empty', () => {
    expect(interleave([], [])).toEqual([]);
  });
});

describe('formatForBoard', () => {
  it('includes the author when present', () => {
    expect(formatForBoard(q('Carpe diem', 'api', 'Horace'))).toBe('Carpe diem - Horace');
  });

  it('omits the author when null', () => {
    expect(formatForBoard(q('Stay hungry', 'local', null))).toBe('Stay hungry');
  });
});
