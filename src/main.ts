/**
 * Split-Flap Desktop — main entry point.
 * Phase 1 demo: cycles through preset strings on a FlapBoard.
 */

import './styles.css';
import { FlapBoard } from './components/FlapBoard.js';

const DEMO_STRINGS: string[] = [
  'BUENOS AIRES    1430',
  'NEW YORK        0815',
  'LONDON HEATHROW 1255',
  'TOKYO NARITA    2340',
  'SPLIT-FLAP DEMO 2026',
  'HAVE A GREAT DAY    ',
];

let currentIndex = 0;

window.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app')!;

  // Create board (20 characters wide)
  const board = new FlapBoard(20);
  app.appendChild(board.element);
  app.appendChild(board.ariaRegion);

  // Controls
  const btn = document.getElementById('btn-next')!;
  const label = document.getElementById('current-label')!;

  function showNext() {
    const text = DEMO_STRINGS[currentIndex % DEMO_STRINGS.length];
    board.setText(text);
    label.textContent = `Showing: ${(currentIndex % DEMO_STRINGS.length) + 1} / ${DEMO_STRINGS.length}`;
    currentIndex++;
  }

  btn.addEventListener('click', showNext);

  // Auto-cycle every 4 seconds
  const autoBtn = document.getElementById('btn-auto')!;
  let autoInterval: ReturnType<typeof setInterval> | null = null;

  autoBtn.addEventListener('click', () => {
    if (autoInterval) {
      clearInterval(autoInterval);
      autoInterval = null;
      autoBtn.textContent = 'Start Auto-Cycle';
    } else {
      showNext();
      autoInterval = setInterval(showNext, 4000);
      autoBtn.textContent = 'Stop Auto-Cycle';
    }
  });

  // Show first string immediately
  showNext();
});
