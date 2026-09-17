/**
 * Synthesizes a short mechanical "clack" per flap step via the Web Audio
 * API — no bundled audio asset needed. The AudioContext is created lazily
 * (browsers require it to start after a user gesture, and this module may
 * load before any interaction happens).
 */

const STORAGE_KEY = 'splitflap.soundEnabled';

let audioCtx: AudioContext | null = null;
let enabled = loadEnabled();

function loadEnabled(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

export function isFlipSoundEnabled(): boolean {
  return enabled;
}

export function setFlipSoundEnabled(value: boolean): void {
  enabled = value;
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Best-effort only — the preference just won't persist across launches.
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

let noiseBuffer: AudioBuffer | null = null;

/** A short burst of white noise — the raw material for the click, filtered
 * and shaped per-play below. Generated once and reused (safe: a
 * BufferSourceNode just reads it, many can share the same buffer). */
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const frameCount = Math.floor(ctx.sampleRate * 0.02);
  const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBuffer = buffer;
  return buffer;
}

/**
 * Plays a brief mechanical click approximating a flap falling into place.
 * A pitched tone reads as a "pop" — real clicks are noise-based and very
 * short, so this high-passes a tiny white-noise burst (cutting the low end
 * that would otherwise sound like a thump) with a near-instant decay.
 */
export function playFlipClick(): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);

  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.setValueAtTime(2500, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.012);

  noise.connect(highpass);
  highpass.connect(gain);
  gain.connect(ctx.destination);

  noise.start(now);
  noise.stop(now + 0.02);
}
