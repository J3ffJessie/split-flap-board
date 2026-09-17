/**
 * Maps common "smart" typographic punctuation — which real-world quote/event
 * text is full of, but FlapTile's glyph set doesn't include — to its ASCII
 * equivalent. Applied before word-wrapping so line-length calculations are
 * based on the characters that will actually render, not the originals.
 */
const CHAR_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ['‘', "'"], // ‘ left single quote
  ['’', "'"], // ’ right single quote / apostrophe
  ['‚', "'"], // ‚ single low-9 quote
  ['“', '"'], // “ left double quote
  ['”', '"'], // ” right double quote
  ['„', '"'], // „ double low-9 quote
  ['–', '-'], // – en dash
  ['—', '-'], // — em dash
  ['…', '...'], // … ellipsis
  [' ', ' '], // non-breaking space
];

export function sanitizeForBoard(text: string): string {
  let result = text;
  for (const [from, to] of CHAR_REPLACEMENTS) {
    result = result.split(from).join(to);
  }
  return result;
}
