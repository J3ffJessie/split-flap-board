/**
 * SettingsDisplay — switch between windowed, always-on-top widget, and
 * fullscreen kiosk display modes. Applies live via the Rust `set_display_mode`
 * command and persists the choice so it's restored on next launch.
 */

import { invoke } from '@tauri-apps/api/core';

export type DisplayMode = 'windowed' | 'widget' | 'fullscreen';

const STORAGE_KEY = 'splitflap.displayMode';
const MODES: { id: DisplayMode; label: string }[] = [
  { id: 'windowed', label: 'Windowed' },
  { id: 'widget', label: 'Widget' },
  { id: 'fullscreen', label: 'Fullscreen' },
];

export function loadDisplayMode(): DisplayMode {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === 'windowed' || raw === 'widget' || raw === 'fullscreen' ? raw : 'windowed';
}

export function saveDisplayMode(mode: DisplayMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
}

export async function applyDisplayMode(mode: DisplayMode): Promise<void> {
  await invoke('set_display_mode', { mode });
}

export class SettingsDisplayPanel {
  readonly element: HTMLElement;

  private current: DisplayMode;
  private errorEl: HTMLElement;

  constructor() {
    this.current = loadDisplayMode();

    this.element = document.createElement('section');
    this.element.className = 'settings-display';
    this.element.setAttribute('aria-label', 'Choose display mode');

    const heading = document.createElement('h2');
    heading.className = 'settings-heading';
    heading.textContent = 'Display Mode';
    this.element.appendChild(heading);

    this.errorEl = document.createElement('p');
    this.errorEl.className = 'settings-error';
    this.errorEl.setAttribute('role', 'alert');
    this.element.appendChild(this.errorEl);

    const row = document.createElement('div');
    row.className = 'display-mode-row';

    for (const mode of MODES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = mode.label;
      btn.setAttribute('aria-pressed', String(this.current === mode.id));
      btn.addEventListener('click', () => void this.choose(mode.id, row));
      row.appendChild(btn);
    }

    this.element.appendChild(row);
  }

  private async choose(mode: DisplayMode, row: HTMLElement): Promise<void> {
    this.errorEl.textContent = '';
    try {
      await applyDisplayMode(mode);
      this.current = mode;
      saveDisplayMode(mode);
      row.querySelectorAll('button').forEach((el, i) => {
        el.setAttribute('aria-pressed', String(MODES[i].id === mode));
      });
    } catch (err) {
      this.errorEl.textContent = String(err);
    }
  }
}
