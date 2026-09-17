/**
 * SettingsTheme — palette picker + custom accent color picker.
 * Applies changes live via theme/palettes.ts and persists the selection.
 */

import { BUILTIN_PALETTES, applyTheme, loadTheme, saveTheme, type ThemeSelection } from '../theme/palettes.js';

export class SettingsThemePanel {
  readonly element: HTMLElement;

  private selection: ThemeSelection;

  constructor() {
    this.selection = loadTheme();

    this.element = document.createElement('section');
    this.element.className = 'settings-theme';
    this.element.setAttribute('aria-label', 'Choose display theme');

    const heading = document.createElement('h2');
    heading.className = 'settings-heading';
    heading.textContent = 'Theme';
    this.element.appendChild(heading);

    const paletteRow = document.createElement('div');
    paletteRow.className = 'palette-row';

    for (const palette of BUILTIN_PALETTES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'palette-swatch';
      btn.style.setProperty('--swatch-color', palette.tileFg);
      btn.style.setProperty('--swatch-bg', palette.bg);
      btn.textContent = palette.name;
      btn.setAttribute('aria-pressed', String(this.selection.paletteId === palette.id));
      btn.addEventListener('click', () => this.choosePalette(palette.id, paletteRow));
      paletteRow.appendChild(btn);
    }

    this.element.appendChild(paletteRow);

    const customRow = document.createElement('div');
    customRow.className = 'custom-color-row';

    const label = document.createElement('label');
    label.textContent = 'Custom accent color';
    label.htmlFor = 'custom-color-input';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.id = 'custom-color-input';
    colorInput.value = this.selection.customColor ?? '#f5c518';
    colorInput.addEventListener('input', () => {
      this.selection = { ...this.selection, customColor: colorInput.value };
      applyTheme(this.selection);
      saveTheme(this.selection);
    });

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.textContent = 'Use Palette Default';
    resetBtn.addEventListener('click', () => {
      this.selection = { ...this.selection, customColor: null };
      applyTheme(this.selection);
      saveTheme(this.selection);
    });

    customRow.appendChild(label);
    customRow.appendChild(colorInput);
    customRow.appendChild(resetBtn);
    this.element.appendChild(customRow);
  }

  private choosePalette(paletteId: string, paletteRow: HTMLElement): void {
    this.selection = { ...this.selection, paletteId };
    applyTheme(this.selection);
    saveTheme(this.selection);

    paletteRow.querySelectorAll('.palette-swatch').forEach((el, i) => {
      el.setAttribute('aria-pressed', String(BUILTIN_PALETTES[i].id === paletteId));
    });
  }
}
