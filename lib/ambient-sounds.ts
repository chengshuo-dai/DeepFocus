export type SoundType = 'rain' | 'forest' | 'cafe' | 'none';

interface AmbientController {
  start: () => void;
  stop: () => void;
  setVolume: (v: number) => void;
}

let currentController: AmbientController | null = null;

// ── Helpers ───────────────────────────────────────────

/** Pink-like noise: lowpass-filtered, flatter spectrum than white */
function createPinkishNoise(ctx: AudioContext, duration: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * duration);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  // Brown-ish noise: integrate white noise for -6dB/oct rolloff → warmer
  let prev = 0;
  for (let i = 0; i < len; i++) {
    prev = prev + (Math.random() * 2 - 1) * 0.02;
    // Soft clamp to prevent runaway
    if (prev > 1) prev = 1;
    if (prev < -1) prev = -1;
    d[i] = prev;
  }
  return buf;
}

/** White noise buffer (for layers that need brightness) */
function createWhiteNoise(ctx: AudioContext, duration: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * duration);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Play a looping noise buffer through a signal chain, return cleanup fn */
function loopNoise(
  ctx: AudioContext, buf: AudioBuffer, dest: AudioNode, gainVal = 0.3,
): { src: AudioBufferSourceNode; gain: GainNode } {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const gain = ctx.createGain();
  gain.gain.value = gainVal;
  src.connect(gain);
  gain.connect(dest);
  src.start();
  return { src, gain };
}

// ── Rain ────────────────────────────────────────────
function createRain(ctx: AudioContext, masterGain: GainNode) {
  // Single, carefully shaped noise source — no harsh layers, no clicky drops.
  // Real rain through a window is a smooth wash of sound, mostly low-mid frequencies.

  const merge = ctx.createGain();
  merge.gain.value = 0.55; // overall soft
  merge.connect(masterGain);

  // Base: warm brown noise (inherently dark, no sharp highs)
  const buf = createPinkishNoise(ctx, 10);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  // Gentle bandpass: cut sub rumble below 200 Hz, cut harshness above 2500 Hz
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 180;
  hp.Q.value = 0.5;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2200;
  lp.Q.value = 0.5;

  const gain = ctx.createGain();
  gain.gain.value = 0.35;

  src.connect(hp);
  hp.connect(lp);
  lp.connect(gain);
  gain.connect(merge);
  src.start();

  // Very slow, gentle volume LFO — like rain intensity naturally varies
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.05; // one cycle every 20 seconds
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.04; // subtle ±4% variation
  lfo.connect(lfoGain);
  lfoGain.connect(gain.gain);
  lfo.start();

  return {
    source: src,
    nodes: [merge, hp, lp, gain, lfoGain],
    extraStart: [lfo],
    extraStop: () => { try { lfo.stop(); } catch {} },
  };
}

// ── Forest ──────────────────────────────────────────
function createForest(ctx: AudioContext, masterGain: GainNode) {
  const merge = ctx.createGain();
  merge.gain.value = 1;
  merge.connect(masterGain);

  // Wind — very low pink noise, slowly modulated
  const windBuf = createPinkishNoise(ctx, 8);
  const windLp = ctx.createBiquadFilter();
  windLp.type = 'lowpass';
  windLp.frequency.value = 250;
  const windGain = ctx.createGain();
  windGain.gain.value = 0.18;
  const windSrc = ctx.createBufferSource();
  windSrc.buffer = windBuf;
  windSrc.loop = true;
  windSrc.connect(windLp);
  windLp.connect(windGain);
  windGain.connect(merge);
  windSrc.start();

  // Wind modulation LFO
  const windLfo = ctx.createOscillator();
  windLfo.type = 'sine';
  windLfo.frequency.value = 0.06;
  const windLfoGain = ctx.createGain();
  windLfoGain.gain.value = 0.06;
  windLfo.connect(windLfoGain);
  windLfoGain.connect(windGain.gain);
  windLfo.start();

  // Leaves rustling — mid-frequency pink noise
  const leavesBuf = createPinkishNoise(ctx, 5);
  const leavesBp = ctx.createBiquadFilter();
  leavesBp.type = 'bandpass';
  leavesBp.frequency.value = 2000;
  leavesBp.Q.value = 0.4;
  const leavesGain = ctx.createGain();
  leavesGain.gain.value = 0.06;
  const leavesSrc = ctx.createBufferSource();
  leavesSrc.buffer = leavesBuf;
  leavesSrc.loop = true;
  leavesSrc.connect(leavesBp);
  leavesBp.connect(leavesGain);
  leavesGain.connect(merge);
  leavesSrc.start();

  // Bird calls — natural-sounding frequency sweeps with harmonics
  let birdTimer: ReturnType<typeof setInterval>;
  const scheduleBird = () => {
    birdTimer = setTimeout(() => {
      if (ctx.state !== 'running') { scheduleBird(); return; }
      const now = ctx.currentTime;
      const baseFreq = 1800 + Math.random() * 3000;
      const callDur = 0.1 + Math.random() * 0.25;

      // Fundamental with vibrato
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      const osc1Gain = ctx.createGain();
      // Frequency curve: start low, rise quickly, fall slowly (typical bird call pattern)
      osc1.frequency.setValueAtTime(baseFreq * 0.7, now);
      osc1.frequency.linearRampToValueAtTime(baseFreq, now + 0.03);
      osc1.frequency.linearRampToValueAtTime(baseFreq * 1.15, now + 0.06);
      osc1.frequency.linearRampToValueAtTime(baseFreq * 0.75, now + callDur);

      // Vibrato LFO
      const vibrato = ctx.createOscillator();
      vibrato.type = 'sine';
      vibrato.frequency.value = 8 + Math.random() * 12;
      const vibratoGain = ctx.createGain();
      vibratoGain.gain.value = baseFreq * 0.04;
      vibrato.connect(vibratoGain);
      vibratoGain.connect(osc1.frequency);
      vibrato.start(now);
      vibrato.stop(now + callDur);

      // Second harmonic (quieter)
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      const osc2Gain = ctx.createGain();
      osc2.frequency.setValueAtTime(baseFreq * 1.5, now);
      osc2.frequency.linearRampToValueAtTime(baseFreq * 1.98, now + callDur * 0.5);
      osc2.frequency.linearRampToValueAtTime(baseFreq * 1.2, now + callDur);

      // Gain envelope: quick attack, gentle decay
      osc1Gain.gain.setValueAtTime(0, now);
      osc1Gain.gain.linearRampToValueAtTime(0.07, now + 0.015);
      osc1Gain.gain.exponentialRampToValueAtTime(0.001, now + callDur);

      osc2Gain.gain.setValueAtTime(0, now);
      osc2Gain.gain.linearRampToValueAtTime(0.025, now + 0.02);
      osc2Gain.gain.exponentialRampToValueAtTime(0.001, now + callDur);

      const birdMerge = ctx.createGain();
      birdMerge.gain.value = 0.7;
      birdMerge.connect(merge);

      osc1.connect(osc1Gain);
      osc1Gain.connect(birdMerge);
      osc2.connect(osc2Gain);
      osc2Gain.connect(birdMerge);

      osc1.start(now);
      osc1.stop(now + callDur + 0.05);
      osc2.start(now);
      osc2.stop(now + callDur + 0.05);

      scheduleBird();
    }, 1500 + Math.random() * 5000);
  };

  return {
    source: windSrc,
    nodes: [merge, windLp, windGain, windLfoGain, leavesBp, leavesGain],
    extraStart: [leavesSrc, windLfo, scheduleBird],
    extraStop: () => {
      clearTimeout(birdTimer);
      try { windLfo.stop(); } catch {}
    },
  };
}

// ── Cafe ────────────────────────────────────────────
function createCafe(ctx: AudioContext, masterGain: GainNode) {
  const merge = ctx.createGain();
  merge.gain.value = 1;
  merge.connect(masterGain);

  // Multiple murmur layers simulating distant conversations
  const murmurBands = [
    { freq: 180, q: 0.5, gain: 0.1 },
    { freq: 300, q: 0.6, gain: 0.09 },
    { freq: 500, q: 0.7, gain: 0.07 },
    { freq: 700, q: 0.8, gain: 0.05 },
  ];

  const murmurCleanups: (() => void)[] = [];
  for (const band of murmurBands) {
    const buf = createPinkishNoise(ctx, 7 + Math.random() * 3);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = band.freq;
    bp.Q.value = band.q;
    const g = ctx.createGain();
    g.gain.value = band.gain;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(bp);
    bp.connect(g);
    g.connect(merge);
    src.start();

    // Subtle independent volume wobble per band
    const bandLfo = ctx.createOscillator();
    bandLfo.type = 'sine';
    bandLfo.frequency.value = 0.04 + Math.random() * 0.06;
    const bandLfoGain = ctx.createGain();
    bandLfoGain.gain.value = band.gain * 0.25;
    bandLfo.connect(bandLfoGain);
    bandLfoGain.connect(g.gain);
    bandLfo.start();

    murmurCleanups.push(() => { try { bandLfo.stop(); } catch {} });
  }

  // Subtle room tone — very low brown noise
  const roomBuf = createPinkishNoise(ctx, 8);
  const roomLp = ctx.createBiquadFilter();
  roomLp.type = 'lowpass';
  roomLp.frequency.value = 120;
  const roomGain = ctx.createGain();
  roomGain.gain.value = 0.06;
  const roomSrc = ctx.createBufferSource();
  roomSrc.buffer = roomBuf;
  roomSrc.loop = true;
  roomSrc.connect(roomLp);
  roomLp.connect(roomGain);
  roomGain.connect(merge);
  roomSrc.start();

  // Cup clinks — metallic impulse sounds using inharmonic partials
  let clinkTimer: ReturnType<typeof setInterval>;
  const startClinks = () => {
    const schedule = () => {
      if (ctx.state !== 'running') { clinkTimer = setTimeout(schedule, 3000); return; }
      const now = ctx.currentTime;

      // A metallic clink: 2-3 inharmonic sine partials with very fast decay
      const partials = [
        { freq: 2800 + Math.random() * 3000, amp: 0.04 },
        { freq: 4500 + Math.random() * 2000, amp: 0.025 },
        { freq: 1200 + Math.random() * 1500, amp: 0.03 },
      ];

      const clinkMerge = ctx.createGain();
      clinkMerge.gain.value = 0.5;
      clinkMerge.connect(merge);

      for (const p of partials) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(p.freq, now);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(p.amp, now + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25 + Math.random() * 0.2);
        osc.connect(g);
        g.connect(clinkMerge);
        osc.start(now);
        osc.stop(now + 0.3);
      }

      clinkTimer = setTimeout(schedule, 5000 + Math.random() * 12000);
    };
    schedule();
  };

  return {
    source: roomSrc,
    nodes: [merge, roomLp, roomGain],
    extraStart: [startClinks],
    extraStop: () => {
      clearTimeout(clinkTimer);
      murmurCleanups.forEach(fn => fn());
    },
  };
}

// ── Public API ──────────────────────────────────────
export function createAmbientSound(type: SoundType, volume = 0.25): AmbientController {
  currentController?.stop();

  if (type === 'none') {
    const ctrl: AmbientController = {
      start: () => {},
      stop: () => {},
      setVolume: () => {},
    };
    currentController = ctrl;
    return ctrl;
  }

  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let started = false;
  let cleanupFns: (() => void)[] = [];

  const ensureCtx = () => {
    if (!ctx) {
      ctx = new AudioContext();
      masterGain = ctx.createGain();
      masterGain.gain.value = volume;
      masterGain.connect(ctx.destination);
    }
    return { ctx: ctx!, masterGain: masterGain! };
  };

  const start = () => {
    if (started) return;
    started = true;
    const { ctx: audioCtx, masterGain: mg } = ensureCtx();

    let result: ReturnType<typeof createRain | typeof createForest | typeof createCafe>;

    switch (type) {
      case 'rain':
        result = createRain(audioCtx, mg);
        break;
      case 'forest':
        result = createForest(audioCtx, mg);
        break;
      case 'cafe':
        result = createCafe(audioCtx, mg);
        break;
    }

    if ((result as any).source?.start) {
      try { (result as any).source.start(); } catch {}
    }
    if ((result as any).extraStart) {
      for (const fn of (result as any).extraStart) {
        if (typeof fn === 'function') fn();
      }
    }
    cleanupFns = [() => {
      if ((result as any).source?.stop) {
        try { (result as any).source.stop(); } catch {}
      }
      if ((result as any).extraStop) (result as any).extraStop();
      for (const n of (result as any).nodes || []) {
        try { n.disconnect(); } catch {}
      }
    }];
  };

  const stop = () => {
    cleanupFns.forEach(fn => fn());
    cleanupFns = [];
    if (ctx && ctx.state !== 'closed') {
      ctx.close().catch(() => {});
    }
    ctx = null;
    masterGain = null;
    started = false;
  };

  const setVolume = (v: number) => {
    volume = v;
    if (masterGain) {
      masterGain.gain.setTargetAtTime(v, ctx!.currentTime, 0.05);
    }
  };

  const ctrl: AmbientController = { start, stop, setVolume };
  currentController = ctrl;
  return ctrl;
}
