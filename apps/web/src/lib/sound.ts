// Short UI sounds synthesised with Web Audio (no audio files). On by default; the choice is kept in localStorage.
export type Sfx = "tick" | "open" | "toggleOn" | "toggleOff" | "swap" | "done" | "shutter" | "error";

let ctx: AudioContext | null = null;
let muted = (() => { try { return localStorage.getItem("sound") === "off"; } catch { return false; } })();
const listeners = new Set<(m: boolean) => void>();

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem("sound", m ? "off" : "on"); } catch { /* storage blocked */ }
  listeners.forEach((l) => l(m));
}
export function onMuted(fn: (m: boolean) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

// [frequency Hz, start s, duration s, wave, volume]
type Note = [number, number, number, OscillatorType, number];
const SOUNDS: Record<Exclude<Sfx, "shutter">, Note[]> = {
  tick: [[1400, 0, 0.035, "sine", 0.05]],
  open: [[900, 0, 0.05, "sine", 0.035], [1300, 0.03, 0.05, "sine", 0.03]],
  toggleOn: [[700, 0, 0.06, "sine", 0.05], [1050, 0.05, 0.08, "sine", 0.05]],
  toggleOff: [[1050, 0, 0.06, "sine", 0.05], [700, 0.05, 0.08, "sine", 0.05]],
  swap: [[520, 0, 0.07, "triangle", 0.05], [780, 0.06, 0.09, "triangle", 0.045]],
  done: [[880, 0, 0.09, "sine", 0.05], [1320, 0.07, 0.16, "sine", 0.045]],
  error: [[220, 0, 0.12, "square", 0.03], [180, 0.11, 0.16, "square", 0.03]],
};

export function sfx(kind: Sfx) {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime;
    if (kind === "shutter") return noise(ctx, t0);
    for (const [f, at, dur, wave, vol] of SOUNDS[kind]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = wave;
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + at);
      g.gain.linearRampToValueAtTime(vol, t0 + at + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + at);
      o.stop(t0 + at + dur + 0.02);
    }
  } catch { /* audio unavailable: stay silent */ }
}

/** Camera-shutter-like click: a short filtered noise burst. */
function noise(c: AudioContext, t0: number) {
  const len = Math.floor(c.sampleRate * 0.08);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = c.createBufferSource();
  const f = c.createBiquadFilter();
  const g = c.createGain();
  src.buffer = buf;
  f.type = "bandpass";
  f.frequency.value = 2400;
  g.gain.value = 0.18;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
}
