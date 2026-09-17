import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  } as Storage;
}

describe('flipSound enable/disable persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeMemoryStorage());
    vi.resetModules();
  });

  it('defaults to enabled when nothing is stored', async () => {
    const { isFlipSoundEnabled } = await import('../audio/flipSound.js');
    expect(isFlipSoundEnabled()).toBe(true);
  });

  it('persists a disabled preference across module reloads', async () => {
    const mod = await import('../audio/flipSound.js');
    mod.setFlipSoundEnabled(false);
    expect(mod.isFlipSoundEnabled()).toBe(false);

    vi.resetModules();
    const reloaded = await import('../audio/flipSound.js');
    expect(reloaded.isFlipSoundEnabled()).toBe(false);
  });

  it('playFlipClick does not throw when no AudioContext is available', async () => {
    const { playFlipClick } = await import('../audio/flipSound.js');
    expect(() => playFlipClick()).not.toThrow();
  });
});
