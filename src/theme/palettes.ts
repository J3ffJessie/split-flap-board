/**
 * Built-in color palettes + custom color persistence.
 * Palettes map directly onto the CSS custom properties defined in styles.css,
 * so applying a theme is just setting properties on :root.
 */

export interface Palette {
  id: string;
  name: string;
  bg: string;
  surface: string;
  tileBg: string;
  tileFg: string;
  tileBorder: string;
}

export const BUILTIN_PALETTES: readonly Palette[] = [
  {
    id: 'airport-classic',
    name: 'Airport Classic',
    bg: '#0a0a0a',
    surface: '#111111',
    tileBg: '#1a1a1a',
    tileFg: '#f5c518',
    tileBorder: '#2a2a2a',
  },
  {
    id: 'neon',
    name: 'Neon',
    bg: '#0a0014',
    surface: '#140022',
    tileBg: '#1c0630',
    tileFg: '#00fff2',
    tileBorder: '#3a1a55',
  },
  {
    id: 'pastel',
    name: 'Pastel',
    bg: '#1a1620',
    surface: '#241f2c',
    tileBg: '#2e2836',
    tileFg: '#ffb6d9',
    tileBorder: '#463c52',
  },
];

const STORAGE_KEY = 'splitflap.theme';

export interface ThemeSelection {
  paletteId: string;
  /** Custom accent color overriding the palette's tileFg, if set. */
  customColor: string | null;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function findPalette(id: string): Palette {
  return BUILTIN_PALETTES.find((p) => p.id === id) ?? BUILTIN_PALETTES[0];
}

export function applyTheme(selection: ThemeSelection): void {
  const palette = findPalette(selection.paletteId);
  const accent = selection.customColor ?? palette.tileFg;
  const root = document.documentElement.style;

  root.setProperty('--bg', palette.bg);
  root.setProperty('--surface', palette.surface);
  root.setProperty('--tile-bg', palette.tileBg);
  root.setProperty('--tile-border', palette.tileBorder);
  root.setProperty('--tile-fg', accent);
  root.setProperty('--tile-shadow', hexToRgba(accent, 0.15));
}

export function loadTheme(): ThemeSelection {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { paletteId: BUILTIN_PALETTES[0].id, customColor: null };
    const parsed = JSON.parse(raw);
    return {
      paletteId: typeof parsed.paletteId === 'string' ? parsed.paletteId : BUILTIN_PALETTES[0].id,
      customColor: typeof parsed.customColor === 'string' ? parsed.customColor : null,
    };
  } catch {
    return { paletteId: BUILTIN_PALETTES[0].id, customColor: null };
  }
}

export function saveTheme(selection: ThemeSelection): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
}

export function initTheme(): ThemeSelection {
  const selection = loadTheme();
  applyTheme(selection);
  return selection;
}
