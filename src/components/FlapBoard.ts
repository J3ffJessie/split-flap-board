/**
 * FlapBoard — a horizontal row of FlapTiles.
 *
 * Accepts a target string and diffs it against the current displayed string,
 * animating only the tiles that need to change.  Tiles are staggered by 40ms
 * per position so the cascade completes within ~1.5 s for a 20-char line:
 *   stagger 0–760ms + flip ~250ms = ~1010ms total.
 */

import { FlapTile } from './FlapTile.js';

const TILE_STAGGER_MS = 40;
const DEFAULT_WIDTH = 20;

export class FlapBoard {
  readonly element: HTMLElement;
  /** Live ARIA text mirror — updated after each full board animation. */
  readonly ariaRegion: HTMLElement;

  private tiles: FlapTile[];
  private currentString: string;
  private width: number;

  constructor(width = DEFAULT_WIDTH) {
    this.width = width;
    this.currentString = ' '.repeat(width);

    this.element = document.createElement('div');
    this.element.className = 'flap-board';
    this.element.setAttribute('role', 'presentation');

    // ARIA live region — invisible but readable by screen readers
    this.ariaRegion = document.createElement('div');
    this.ariaRegion.setAttribute('role', 'status');
    this.ariaRegion.setAttribute('aria-live', 'polite');
    this.ariaRegion.setAttribute('aria-atomic', 'true');
    this.ariaRegion.className = 'flap-aria-live';

    this.tiles = Array.from({ length: width }, () => {
      const tile = new FlapTile(' ');
      this.element.appendChild(tile.element);
      return tile;
    });
  }

  /**
   * Animate the board to display the given string.
   * Pads/truncates to board width.  Only changed tiles animate.
   */
  setText(text: string): void {
    const padded = text.toUpperCase().padEnd(this.width, ' ').slice(0, this.width);

    for (let i = 0; i < this.width; i++) {
      const targetChar = padded[i];
      if (targetChar !== this.currentString[i]) {
        this.tiles[i].setChar(targetChar, i * TILE_STAGGER_MS);
      }
    }

    this.currentString = padded;

    // Update ARIA region after cascade completes (~1.5s is safe)
    const cascadeDuration = (this.width - 1) * TILE_STAGGER_MS + 300;
    setTimeout(() => {
      this.ariaRegion.textContent = padded.trim();
    }, cascadeDuration);
  }

  /** Current displayed string (may differ from target during animation). */
  getCurrentText(): string {
    return this.tiles.map((t) => t.currentChar).join('');
  }

  /** Resize the board to a new width, clearing all tiles. */
  resize(newWidth: number): void {
    if (newWidth === this.width) return;

    // Remove existing tiles
    this.tiles.forEach((t) => t.element.remove());

    this.width = newWidth;
    this.currentString = ' '.repeat(newWidth);
    this.tiles = Array.from({ length: newWidth }, () => {
      const tile = new FlapTile(' ');
      this.element.appendChild(tile.element);
      return tile;
    });
  }
}
