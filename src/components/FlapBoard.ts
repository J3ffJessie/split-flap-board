/**
 * FlapBoard — a fixed grid of FlapTiles (rows × width), like a real
 * departure board's physical size. Word-wraps the target text across as
 * many of those rows as it needs; any rows beyond that just go blank,
 * rather than the board growing or shrinking to fit — so switching between
 * a one-line quote and a long one never resizes the board itself. Only
 * tiles whose character actually changed animate. Tiles are staggered by a
 * short delay per column position so a row's cascade reads left-to-right;
 * every row shares the same per-column stagger, so using more rows doesn't
 * lengthen the animation.
 */

import { FlapTile, FLIP_DURATION_MS } from './FlapTile.js';
import { wrapText } from '../utils/wrapText.js';
import { sanitizeForBoard } from '../utils/sanitizeForBoard.js';

const TILE_STAGGER_MS = 25;
const DEFAULT_WIDTH = 20;
const DEFAULT_ROWS = 8;

export class FlapBoard {
  readonly element: HTMLElement;
  /** Live ARIA text mirror — updated after each full board animation. */
  readonly ariaRegion: HTMLElement;

  private rows: FlapTile[][] = [];
  private currentLines: string[];
  private width: number;
  private rowCount: number;

  constructor(width = DEFAULT_WIDTH, rowCount = DEFAULT_ROWS) {
    this.width = width;
    this.rowCount = rowCount;
    this.currentLines = Array.from({ length: rowCount }, () => ' '.repeat(width));

    this.element = document.createElement('div');
    this.element.className = 'flap-board';
    this.element.setAttribute('role', 'presentation');

    // ARIA live region — invisible but readable by screen readers
    this.ariaRegion = document.createElement('div');
    this.ariaRegion.setAttribute('role', 'status');
    this.ariaRegion.setAttribute('aria-live', 'polite');
    this.ariaRegion.setAttribute('aria-atomic', 'true');
    this.ariaRegion.className = 'flap-aria-live';

    this.buildRows();
  }

  /**
   * Word-wraps text across up to `rowCount` rows and animates each row's
   * tiles toward the wrapped line (rows beyond what the text needs go
   * blank). Only tiles whose character actually changed animate.
   */
  setText(text: string): void {
    const wrapped = wrapText(sanitizeForBoard(text), this.width, this.rowCount);
    const lines = Array.from({ length: this.rowCount }, (_, rowIndex) =>
      (wrapped[rowIndex] ?? '').toUpperCase().padEnd(this.width, ' ').slice(0, this.width),
    );

    lines.forEach((line, rowIndex) => this.setRowText(rowIndex, line));
    this.currentLines = lines;

    // Update ARIA region after the column cascade completes and the last
    // tile's flip has had time to settle.
    const cascadeDuration = (this.width - 1) * TILE_STAGGER_MS + FLIP_DURATION_MS + 50;
    setTimeout(() => {
      this.ariaRegion.textContent = lines
        .map((line) => line.trim())
        .filter(Boolean)
        .join('. ');
    }, cascadeDuration);
  }

  /** Full displayed text across every row of the grid, one per line. */
  getCurrentText(): string {
    return this.rows.map((tiles) => tiles.map((t) => t.currentChar).join('')).join('\n');
  }

  /** Resize the board's column width, rebuilding the grid at the same row count. */
  resize(newWidth: number): void {
    if (newWidth === this.width) return;
    this.width = newWidth;
    this.currentLines = Array.from({ length: this.rowCount }, () => ' '.repeat(newWidth));
    this.element.innerHTML = '';
    this.rows = [];
    this.buildRows();
  }

  // ── private ────────────────────────────────────────────────────────────────

  private setRowText(rowIndex: number, padded: string): void {
    const tiles = this.rows[rowIndex];
    const previous = this.currentLines[rowIndex];
    for (let i = 0; i < this.width; i++) {
      const targetChar = padded[i];
      if (targetChar !== previous[i]) {
        tiles[i].setChar(targetChar, i * TILE_STAGGER_MS);
      }
    }
  }

  /** Builds the fixed rowCount × width grid once. */
  private buildRows(): void {
    for (let r = 0; r < this.rowCount; r++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'flap-board-row';
      const tiles = Array.from({ length: this.width }, () => {
        const tile = new FlapTile(' ');
        rowEl.appendChild(tile.element);
        return tile;
      });
      this.element.appendChild(rowEl);
      this.rows.push(tiles);
    }
  }
}
