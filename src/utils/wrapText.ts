/**
 * Word-wraps text across a fixed column width and a maximum number of
 * lines — the board grows the number of rows it uses to fit a quote or
 * event, but each row stays a consistent width (like a real departure
 * board's columns), rather than growing wider per-message.
 */

/** Marks a truncated final line — all characters are in FlapTile's glyph set. */
const TRUNCATION_MARK = '...';

export function wrapText(text: string, width: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  const pushCurrent = () => {
    if (current) {
      lines.push(current);
      current = '';
    }
  };

  for (const word of words) {
    if (word.length > width) {
      // A single "word" (e.g. a long URL) longer than the whole row —
      // hard-split it across as many rows as it needs.
      pushCurrent();
      for (let i = 0; i < word.length; i += width) {
        lines.push(word.slice(i, i + width));
      }
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > width) {
      pushCurrent();
      current = word;
    } else {
      current = candidate;
    }
  }
  pushCurrent();

  if (lines.length === 0) return [''];

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const lastIndex = kept.length - 1;
    const last = kept[lastIndex];
    kept[lastIndex] =
      last.length + TRUNCATION_MARK.length > width
        ? last.slice(0, width - TRUNCATION_MARK.length).trimEnd() + TRUNCATION_MARK
        : `${last}${TRUNCATION_MARK}`;
    return kept;
  }

  return lines;
}
