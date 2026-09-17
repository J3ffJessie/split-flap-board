/**
 * FlapTile — single character split-flap tile.
 *
 * Animates from current character to target by cycling through the glyph
 * sequence using CSS 3D rotateX transforms driven by requestAnimationFrame.
 * Each full character flip takes ~250ms.  The staggered delay is applied
 * by the caller (FlapBoard) so tiles cascade across the board.
 */

export const GLYPH_SEQUENCE: readonly string[] =
  ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:!?-\'"/()@#'.split('');

const FLIP_DURATION_MS = 250;

export class FlapTile {
  readonly element: HTMLElement;

  private currentIndex: number;
  private targetIndex: number;
  private animating = false;
  private rafId: number | null = null;
  private startTime: number | null = null;
  private stepsTotal = 0;
  private stepsCompleted = 0;

  constructor(initialChar = ' ') {
    this.element = document.createElement('div');
    this.element.className = 'flap-tile';
    this.element.setAttribute('aria-hidden', 'true');

    this.currentIndex = this.glyphIndex(initialChar);
    this.targetIndex = this.currentIndex;

    this.renderStatic();
  }

  get currentChar(): string {
    return GLYPH_SEQUENCE[this.currentIndex];
  }

  /**
   * Animate this tile to the given character.
   * @param char   Target character (falls back to space if not in sequence)
   * @param delay  Milliseconds to wait before starting the animation
   */
  setChar(char: string, delay = 0): void {
    const targetIdx = this.glyphIndex(char.toUpperCase());

    if (targetIdx === this.currentIndex && !this.animating) return;

    this.targetIndex = targetIdx;

    // Number of steps forward through the glyph ring
    const steps = this.stepsForward(this.currentIndex, targetIdx);
    if (steps === 0) return;

    this.stepsTotal = steps;
    this.stepsCompleted = 0;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    // Respect prefers-reduced-motion: skip animation, jump straight to target
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.currentIndex = targetIdx;
      this.renderStatic();
      return;
    }

    setTimeout(() => {
      this.animating = true;
      this.startTime = null;
      this.scheduleNextFlip();
    }, delay);
  }

  // ── private ────────────────────────────────────────────────────────────────

  private glyphIndex(char: string): number {
    const idx = GLYPH_SEQUENCE.indexOf(char);
    return idx === -1 ? 0 : idx; // fallback to space
  }

  private stepsForward(from: number, to: number): number {
    if (to === from) return 0;
    return to > from
      ? to - from
      : GLYPH_SEQUENCE.length - from + to;
  }

  private scheduleNextFlip(): void {
    this.startTime = null;
    this.rafId = requestAnimationFrame((ts) => this.animateFlip(ts));
  }

  private animateFlip(timestamp: number): void {
    if (this.startTime === null) this.startTime = timestamp;

    const elapsed = timestamp - this.startTime;
    const progress = Math.min(elapsed / FLIP_DURATION_MS, 1);

    // Two-panel split-flap physics:
    // 0.0–0.5: top half rotates from 0° → -90° (top flap falls)
    // 0.5–1.0: bottom half rotates from 90° → 0° (bottom flap rises)
    const upper = this.element.querySelector<HTMLElement>('.flap-upper');
    const lower = this.element.querySelector<HTMLElement>('.flap-lower');

    if (progress < 0.5) {
      const angle = progress * 2 * -90; // 0 → -90
      if (upper) {
        upper.style.transform = `rotateX(${angle}deg)`;
        upper.style.zIndex = '2';
      }
      if (lower) {
        lower.style.transform = 'rotateX(90deg)';
        lower.style.zIndex = '1';
      }
      // Show next glyph on lower panel mid-flight
      const nextIndex = (this.currentIndex + 1) % GLYPH_SEQUENCE.length;
      this.updatePanelChar(lower, GLYPH_SEQUENCE[nextIndex]);
    } else {
      const angle = (1 - progress) * 2 * 90; // 90 → 0
      if (upper) {
        upper.style.transform = 'rotateX(-90deg)';
        upper.style.zIndex = '1';
      }
      if (lower) {
        lower.style.transform = `rotateX(${angle}deg)`;
        lower.style.zIndex = '2';
      }
      // Advance current char at the halfway point
      this.currentIndex = (this.currentIndex + 1) % GLYPH_SEQUENCE.length;
      this.updatePanelChar(upper, GLYPH_SEQUENCE[this.currentIndex]);
      this.updatePanelChar(lower, GLYPH_SEQUENCE[this.currentIndex]);
    }

    if (progress < 1) {
      this.rafId = requestAnimationFrame((ts) => this.animateFlip(ts));
    } else {
      // Flip complete
      this.stepsCompleted++;
      if (upper) upper.style.transform = 'rotateX(0deg)';
      if (lower) lower.style.transform = 'rotateX(0deg)';
      this.renderStatic();

      if (this.stepsCompleted < this.stepsTotal) {
        this.scheduleNextFlip();
      } else {
        this.animating = false;
        this.rafId = null;
      }
    }
  }

  private renderStatic(): void {
    const char = GLYPH_SEQUENCE[this.currentIndex];
    this.element.innerHTML = `
      <div class="flap-panel flap-upper" style="transform:rotateX(0deg)">${char}</div>
      <div class="flap-panel flap-lower" style="transform:rotateX(0deg)">${char}</div>
    `;
  }

  private updatePanelChar(panel: HTMLElement | null, char: string): void {
    if (panel) panel.textContent = char;
  }
}
