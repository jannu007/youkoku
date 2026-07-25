/* ============================================================
   Youkoku — algorithmic music generator
   Not AI-generated audio (no trained model, no samples) — this is a
   rule-based composer: a mood score picks a scale, tempo, and
   waveform, then a pad + melody are scheduled and rendered offline
   into a real AudioBuffer using the Web Audio API.
   ============================================================ */
window.YoukokuMusic = (() => {
  const SCALES = {
    tense: [0, 1, 3, 5, 7, 8, 10, 12],
    calm: [0, 2, 4, 7, 9, 12, 14],
    neutral: [0, 2, 3, 5, 7, 8, 10, 12],
  };

  function noteFreq(base, semitone) { return base * Math.pow(2, semitone / 12); }

  async function generate(opts) {
    const { mood = 0, duration = 20 } = opts || {};
    const sampleRate = 44100;
    const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
    const key = mood > 4 ? 'tense' : mood < -4 ? 'calm' : 'neutral';
    const scale = SCALES[key];
    const baseFreq = key === 'tense' ? 220 : 196;
    const noteLen = key === 'tense' ? 0.26 : 0.42;

    const master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);

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

    let t = 0, i = 0;
    while (t < duration) {
      const degree = scale[Math.floor(Math.abs(Math.sin(i * 0.7 + i * i * 0.01)) * scale.length) % scale.length];
      const octaveShift = i % 8 < 5 ? 12 : 0;
      const freq = noteFreq(baseFreq, degree + octaveShift);
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
      t += noteLen;
      i += 1;
    }

    return await ctx.startRendering();
  }

  return { generate, SCALES };
})();
