/* ============================================================
   Youkoku — algorithmic music generator
   Not AI-generated audio (no trained model, no samples) — this is a
   rule-based composer: a mood score picks a scale, tempo, and a
   selectable "timbre" (synthesis technique), then a pad + melody are
   scheduled and rendered offline into a real AudioBuffer using the
   Web Audio API. "Piano"/"Guitar"/"Analog Synth" are real synthesis
   techniques (multi-harmonic decay, Karplus-Strong plucked string,
   detuned filtered sawtooth) — not sampled instruments.
   ============================================================ */
window.YoukokuMusic = (() => {
  const SCALES = {
    tense: [0, 1, 3, 5, 7, 8, 10, 12],
    calm: [0, 2, 4, 7, 9, 12, 14],
    neutral: [0, 2, 3, 5, 7, 8, 10, 12],
  };

  const TIMBRES = ['pad', 'piano', 'guitar', 'synth'];

  function noteFreq(base, semitone) { return base * Math.pow(2, semitone / 12); }

  function karplusStrongBuffer(ctx, freq, dur, sampleRate) {
    const length = Math.max(1, Math.round(dur * sampleRate));
    const bufferLen = Math.max(2, Math.round(sampleRate / freq));
    const ring = new Float32Array(bufferLen);
    for (let i = 0; i < bufferLen; i++) ring[i] = Math.random() * 2 - 1;
    const out = new Float32Array(length);
    let prev = 0;
    const damping = 0.996;
    for (let i = 0; i < length; i++) {
      const idx = i % bufferLen;
      const next = (ring[idx] + prev) * 0.5 * damping;
      out[i] = ring[idx];
      ring[idx] = next;
      prev = next;
    }
    const buf = ctx.createBuffer(1, length, sampleRate);
    buf.copyToChannel(out, 0);
    return buf;
  }

  function schedulePadNote(ctx, master, freq, t, noteLen, key) {
    const osc = ctx.createOscillator();
    osc.type = key === 'tense' ? 'sawtooth' : 'triangle';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.03);
    g.gain.linearRampToValueAtTime(0, t + noteLen * 0.9);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + noteLen);
  }

  function schedulePianoNote(ctx, master, freq, t, noteLen) {
    const harmonics = [{ mult: 1, gain: 0.3 }, { mult: 2, gain: 0.12 }, { mult: 3, gain: 0.06 }];
    harmonics.forEach((h) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * h.mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(h.gain, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + noteLen * 1.8);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + noteLen * 1.8 + 0.05);
    });
  }

  function scheduleGuitarNote(ctx, master, freq, t, noteLen, sampleRate) {
    const buf = karplusStrongBuffer(ctx, freq, noteLen * 2.2, sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 0.9;
    src.connect(g).connect(master);
    src.start(t);
  }

  function scheduleSynthNote(ctx, master, freq, t, noteLen) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq * 4 + 200;
    filter.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.02);
    g.gain.linearRampToValueAtTime(0, t + noteLen * 0.95);
    filter.connect(g).connect(master);
    [-6, 6].forEach((cents) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq * Math.pow(2, cents / 1200);
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + noteLen + 0.05);
    });
  }

  async function generate(opts) {
    const { mood = 0, duration = 20, timbre = 'pad' } = opts || {};
    const sampleRate = 44100;
    const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
    const key = mood > 4 ? 'tense' : mood < -4 ? 'calm' : 'neutral';
    const scale = SCALES[key];
    const baseFreq = key === 'tense' ? 220 : 196;
    const noteLen = key === 'tense' ? 0.26 : 0.42;

    const master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);

    if (timbre === 'pad' || timbre === 'synth') {
      const pad = ctx.createOscillator();
      pad.type = 'sine';
      pad.frequency.value = baseFreq / 2;
      const padGain = ctx.createGain();
      padGain.gain.value = 0.11;
      pad.connect(padGain).connect(master);
      pad.start(0);
      pad.stop(duration);

      const pad2 = ctx.createOscillator();
      pad2.type = 'sine';
      pad2.frequency.value = (baseFreq / 2) * Math.pow(2, 7 / 12);
      const pad2Gain = ctx.createGain();
      pad2Gain.gain.value = 0.06;
      pad2.connect(pad2Gain).connect(master);
      pad2.start(0);
      pad2.stop(duration);
    }

    let t = 0, i = 0;
    while (t < duration) {
      const degree = scale[Math.floor(Math.abs(Math.sin(i * 0.7 + i * i * 0.01)) * scale.length) % scale.length];
      const octaveShift = i % 8 < 5 ? 12 : 0;
      const freq = noteFreq(baseFreq, degree + octaveShift);

      if (timbre === 'piano') schedulePianoNote(ctx, master, freq, t, noteLen);
      else if (timbre === 'guitar') scheduleGuitarNote(ctx, master, freq, t, noteLen, sampleRate);
      else if (timbre === 'synth') scheduleSynthNote(ctx, master, freq, t, noteLen);
      else schedulePadNote(ctx, master, freq, t, noteLen, key);

      t += noteLen;
      i += 1;
    }

    return await ctx.startRendering();
  }

  return { generate, SCALES, TIMBRES };
})();
