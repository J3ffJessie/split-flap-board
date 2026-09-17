import { describe, expect, it } from 'vitest';
import { parseBulkQuotes } from '../quotes/parseBulk.js';

describe('parseBulkQuotes', () => {
  it('parses a quote with an author', () => {
    expect(parseBulkQuotes('Stay hungry, stay foolish. | Steve Jobs')).toEqual([
      { text: 'Stay hungry, stay foolish.', author: 'Steve Jobs' },
    ]);
  });

  it('parses a quote with no author when there is no pipe', () => {
    expect(parseBulkQuotes('Just a quote with no author')).toEqual([
      { text: 'Just a quote with no author', author: null },
    ]);
  });

  it('parses multiple lines', () => {
    const input = 'First quote | Author A\nSecond quote | Author B';
    expect(parseBulkQuotes(input)).toEqual([
      { text: 'First quote', author: 'Author A' },
      { text: 'Second quote', author: 'Author B' },
    ]);
  });

  it('skips blank lines', () => {
    const input = 'One quote\n\n   \nAnother quote';
    expect(parseBulkQuotes(input)).toEqual([
      { text: 'One quote', author: null },
      { text: 'Another quote', author: null },
    ]);
  });

  it('trims whitespace around text and author', () => {
    expect(parseBulkQuotes('  Padded quote   |   Padded Author  ')).toEqual([
      { text: 'Padded quote', author: 'Padded Author' },
    ]);
  });

  it('treats a blank author after a trailing pipe as no author', () => {
    expect(parseBulkQuotes('Quote with trailing pipe |')).toEqual([
      { text: 'Quote with trailing pipe', author: null },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseBulkQuotes('')).toEqual([]);
  });

  it('drops a line that is only a pipe with nothing else', () => {
    expect(parseBulkQuotes('|')).toEqual([]);
  });
});
