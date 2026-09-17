/**
 * Parses bulk-pasted quote text for the Settings > Quotes import textarea.
 * One quote per line; an optional author follows a `|`:
 *   Quote text here | Author Name
 * A line with no `|` is treated as quote text with no author. Blank lines
 * are ignored.
 */
export interface ParsedQuote {
  text: string;
  author: string | null;
}

export function parseBulkQuotes(input: string): ParsedQuote[] {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const pipeIndex = line.indexOf('|');
      if (pipeIndex === -1) {
        return { text: line, author: null };
      }
      const text = line.slice(0, pipeIndex).trim();
      const author = line.slice(pipeIndex + 1).trim();
      return { text, author: author.length > 0 ? author : null };
    })
    .filter((quote) => quote.text.length > 0);
}
