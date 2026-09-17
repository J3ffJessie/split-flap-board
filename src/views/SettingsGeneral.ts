/**
 * SettingsGeneral — app-level behavior: launch on login, and a reminder
 * that closing the window minimizes to the system tray rather than quitting
 * (use the tray icon's Quit item to actually exit).
 */

import { isEnabled, enable, disable } from '@tauri-apps/plugin-autostart';
import { isFlipSoundEnabled, setFlipSoundEnabled } from '../audio/flipSound.js';

export class SettingsGeneralPanel {
  readonly element: HTMLElement;

  private toggleBtn: HTMLButtonElement;
  private soundToggleBtn: HTMLButtonElement;
  private errorEl: HTMLElement;

  constructor() {
    this.element = document.createElement('section');
    this.element.className = 'settings-general';
    this.element.setAttribute('aria-label', 'General settings');

    const heading = document.createElement('h2');
    heading.className = 'settings-heading';
    heading.textContent = 'General';
    this.element.appendChild(heading);

    const help = document.createElement('p');
    help.className = 'settings-help';
    help.textContent =
      'Closing this window minimizes it to the system tray — the board keeps running ' +
      'in the background. Right-click the tray icon and choose Quit to fully exit.';
    this.element.appendChild(help);

    this.errorEl = document.createElement('p');
    this.errorEl.className = 'settings-error';
    this.errorEl.setAttribute('role', 'alert');
    this.element.appendChild(this.errorEl);

    this.toggleBtn = document.createElement('button');
    this.toggleBtn.type = 'button';
    this.toggleBtn.textContent = 'Start with Windows';
    this.toggleBtn.setAttribute('aria-pressed', 'false');
    this.toggleBtn.addEventListener('click', () => void this.toggleAutostart());
    this.element.appendChild(this.toggleBtn);

    this.soundToggleBtn = document.createElement('button');
    this.soundToggleBtn.type = 'button';
    this.soundToggleBtn.addEventListener('click', () => this.toggleFlipSound());
    this.element.appendChild(this.soundToggleBtn);
    this.updateSoundToggleLabel();

    void this.refresh();
  }

  private toggleFlipSound(): void {
    setFlipSoundEnabled(!isFlipSoundEnabled());
    this.updateSoundToggleLabel();
  }

  private updateSoundToggleLabel(): void {
    const enabled = isFlipSoundEnabled();
    this.soundToggleBtn.setAttribute('aria-pressed', String(enabled));
    this.soundToggleBtn.textContent = enabled ? 'Flip Sound (on)' : 'Flip Sound (off)';
  }

  private async toggleAutostart(): Promise<void> {
    this.errorEl.textContent = '';
    try {
      if (await isEnabled()) {
        await disable();
      } else {
        await enable();
      }
      await this.refresh();
    } catch (err) {
      this.errorEl.textContent = String(err);
    }
  }

  async refresh(): Promise<void> {
    try {
      const enabled = await isEnabled();
      this.toggleBtn.setAttribute('aria-pressed', String(enabled));
      this.toggleBtn.textContent = enabled ? 'Starts with Windows (on)' : 'Start with Windows';
    } catch (err) {
      this.errorEl.textContent = String(err);
    }
  }
}
