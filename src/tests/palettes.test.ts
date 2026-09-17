import { describe, it, expect } from 'vitest';
import { BUILTIN_PALETTES, findPalette } from '../theme/palettes.js';

describe('findPalette', () => {
  it('returns the matching palette by id', () => {
    const palette = findPalette('neon');
    expect(palette.id).toBe('neon');
  });

  it('falls back to the first built-in palette for an unknown id', () => {
    const palette = findPalette('does-not-exist');
    expect(palette.id).toBe(BUILTIN_PALETTES[0].id);
  });

  it('has at least the three documented built-in palettes', () => {
    const ids = BUILTIN_PALETTES.map((p) => p.id);
    expect(ids).toEqual(['airport-classic', 'neon', 'pastel']);
  });
});
