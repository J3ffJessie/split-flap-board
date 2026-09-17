/**
 * FlapTile — single character split-flap tile.
 *
 * Animates from current character to target by cycling through the glyph
 * sequence using CSS 3D rotateX transforms driven by requestAnimationFrame.
 * Each intermediate-glyph step takes ~100ms — a tile far from its target in
 * the glyph sequence (e.g. space → '#') steps through every glyph in
 * between, so this per-step cost (not the column stagger) is what dominates
 * how long a full phrase takes to animate in. The staggered delay between
 * columns is applied by the caller (FlapBoard) so tiles cascade across the
 * board.
 */

import { playFlipClick } from '../audio/flipSound.js';

export const GLYPH_SEQUENCE: readonly string[] =
  ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:!?-\'"/()@#'.split('');

export const FLIP_DURATION_MS = 150;

export class FlapTile {
  readonly element: HTMLElement;

  private currentIndex: number;
  private animating = false;
  private rafId: number | null = null;
  private startTime: number | null = null;
  private stepsTotal = 0;
  private stepsCompleted = 0;
  private midpointPassed = false;

  constructor(initialChar = ' ') {
    this.element = document.createElement('div');
    this.element.className = 'flap-tile';
    this.element.setAttribute('aria-hidden', 'true');

    this.currentIndex = this.glyphIndex(initialChar);

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
    if (idx !== -1) return idx;
    // Falls back to '#' rather than space: an unsupported character (e.g. an
    // unhandled Unicode punctuation mark) should be visibly obvious, not a
    // silent gap that looks like a rendering bug.
    return GLYPH_SEQUENCE.indexOf('#');
  }

  private stepsForward(from: number, to: number): number {
    if (to === from) return 0;
    return to > from
      ? to - from
      : GLYPH_SEQUENCE.length - from + to;
  }

  private scheduleNextFlip(): void {
    this.startTime = null;
    this.midpointPassed = false;
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
      // Advance current char exactly once at the midpoint
      if (!this.midpointPassed) {
        this.midpointPassed = true;
        this.currentIndex = (this.currentIndex + 1) % GLYPH_SEQUENCE.length;
        this.updatePanelChar(upper, GLYPH_SEQUENCE[this.currentIndex]);
        this.updatePanelChar(lower, GLYPH_SEQUENCE[this.currentIndex]);
      }
    }

    if (progress < 1) {
      this.rafId = requestAnimationFrame((ts) => this.animateFlip(ts));
    } else {
      // Flip complete
      this.stepsCompleted++;
      playFlipClick();
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
