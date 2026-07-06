let audioCtx: AudioContext | null = null;
let warmListenersAttached = false;
let pendingPlay = false;

function createContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctx =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    return new Ctx();
  } catch {
    return null;
  }
}

async function getAudioContext(): Promise<AudioContext | null> {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) audioCtx = createContext();
    if (!audioCtx) return null;
    if (audioCtx.state === "suspended") await audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function playTone(ctx: AudioContext, freq: number, start: number, duration: number, volume: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = freq;
  osc.type = "triangle";
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function playTones(ctx: AudioContext) {
  const t = ctx.currentTime;
  playTone(ctx, 880, t, 0.22, 0.9);
  playTone(ctx, 1175, t + 0.12, 0.35, 0.95);
}

function flushPendingSound() {
  if (!pendingPlay || !audioCtx || audioCtx.state !== "running") return;
  pendingPlay = false;
  try {
    playTones(audioCtx);
  } catch {
    /* ignore */
  }
}

function attachWarmListeners() {
  if (warmListenersAttached || typeof window === "undefined") return;
  warmListenersAttached = true;
  const warm = () => {
    void getAudioContext().then(() => flushPendingSound());
  };
  window.addEventListener("pointerdown", warm, { capture: true });
  window.addEventListener("keydown", warm, { capture: true });
}

export function warmTicketSound(): void {
  attachWarmListeners();
}

export async function playTicketSound(): Promise<boolean> {
  attachWarmListeners();
  const ctx = await getAudioContext();
  if (!ctx) return false;

  if (ctx.state !== "running") {
    pendingPlay = true;
    ctx.addEventListener("statechange", () => {
      if (ctx.state === "running") flushPendingSound();
    }, { once: true });
    return false;
  }

  try {
    playTones(ctx);
    return true;
  } catch {
    return false;
  }
}

export function playTicketSoundFromUserGesture(): void {
  attachWarmListeners();
  try {
    if (!audioCtx) audioCtx = createContext();
    if (!audioCtx) return;
    const ctx = audioCtx;
    const run = () => {
      if (ctx.state === "running") {
        pendingPlay = false;
        playTones(ctx);
      }
    };
    if (ctx.state === "running") {
      run();
      return;
    }
    void ctx.resume().then(run);
  } catch {
    pendingPlay = true;
  }
}
