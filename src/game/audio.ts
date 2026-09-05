export function createAudio() {
  let ctx: AudioContext | null = null;
  let wind: { gain: GainNode } | null = null;

  function ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }

  function beep(freq: number, dur: number, type: OscillatorType, gain = 0.06, slide = 0) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function startWind() {
    const c = ensure();
    if (!c || wind) return;
    const bufferSize = 2 * c.sampleRate;
    const noise = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    const g = c.createGain();
    g.gain.value = 0.018;
    src.connect(filter);
    filter.connect(g);
    g.connect(c.destination);
    src.start();
    wind = { gain: g };
  }

  return {
    unlock() {
      ensure();
      startWind();
    },
    jump() {
      beep(420, 0.12, "triangle", 0.05, -180);
    },
    land() {
      beep(90, 0.1, "sine", 0.07, -40);
    },
    bump() {
      beep(160, 0.07, "square", 0.03, 0);
    },
    fall() {
      beep(220, 0.28, "sine", 0.05, -160);
    },
  };
}

export type AudioBus = ReturnType<typeof createAudio>;
