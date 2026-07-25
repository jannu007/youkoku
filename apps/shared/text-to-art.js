/* ============================================================
   Youkoku — generative art from text
   Not AI image generation (that needs a paid API or a huge model
   download) — this scores the text's tense/calm balance with a small
   keyword lexicon, seeds a deterministic PRNG from the text itself, and
   paints a layered abstract composition whose palette and motion are
   driven by that mood. Same input text always yields the same piece.
   ============================================================ */
window.YoukokuTextToArt = (() => {
  const TENSE_WORDS = ['泣','叫','恐怖','死','戦','怒','悲し','絶望','痛み','逃げ','血','銃','剣','争い','恐ろし','苦し','崩れ','壊れ','裏切り','孤独'];
  const CALM_WORDS = ['笑','幸せ','平和','安心','喜び','愛','希望','美しい','穏やか','優しい','温かい','眠り','光','花','祝','感謝'];

  function countOccurrences(text, word) {
    let count = 0, idx = 0;
    while ((idx = text.indexOf(word, idx)) !== -1) { count++; idx += word.length; }
    return count;
  }

  function scoreText(text) {
    const len = (text || '').replace(/\s/g, '').length || 1;
    let tense = 0, calm = 0;
    TENSE_WORDS.forEach((w) => { tense += countOccurrences(text, w); });
    CALM_WORDS.forEach((w) => { calm += countOccurrences(text, w); });
    return { mood: ((tense * 2) - calm) / len * 1000, tense, calm };
  }

  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const PALETTES = {
    tense: ['217,45,60', '236,72,153', '251,146,60', '124,15,45'],
    calm: ['59,130,246', '45,212,191', '139,92,246', '34,116,180'],
    neutral: ['139,92,246', '236,72,153', '34,211,238', '245,158,11'],
  };

  function generate(canvas, text) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const { mood } = scoreText(text || '');
    const seed = hashString(text || 'youkoku');
    const rand = mulberry32(seed);
    const key = mood > 4 ? 'tense' : mood < -4 ? 'calm' : 'neutral';
    const palette = PALETTES[key];

    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, `rgb(${palette[0]})`);
    bg.addColorStop(1, '#070c26');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const blobCount = 6 + Math.floor(rand() * 6);
    for (let i = 0; i < blobCount; i++) {
      const x = rand() * w, y = rand() * h, r = (0.15 + rand() * 0.35) * Math.max(w, h);
      const c = palette[Math.floor(rand() * palette.length)];
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${c},${0.32 + rand() * 0.25})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.globalCompositeOperation = 'lighter';
    const lineCount = key === 'tense' ? 6 : 4;
    for (let i = 0; i < lineCount; i++) {
      const c = palette[Math.floor(rand() * palette.length)];
      ctx.strokeStyle = `rgba(${c},0.28)`;
      ctx.lineWidth = 2 + rand() * 3;
      ctx.beginPath();
      const amp = 40 + rand() * 80, freq = 0.002 + rand() * 0.004, phase = rand() * Math.PI * 2, baseY = rand() * h;
      ctx.moveTo(0, baseY);
      for (let x = 0; x <= w; x += 12) ctx.lineTo(x, baseY + Math.sin(x * freq + phase) * amp);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    return { mood, key };
  }

  return { generate, scoreText };
})();
