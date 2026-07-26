/* ============================================================
   AI Records — generative art from text
   Not AI image generation (that needs a paid API or a huge model
   download) — this is a fully offline, client-side "scene compositor."
   It scans the text for concrete keywords (time of day, sky objects,
   landscape, weather, and a few subjects) in both Japanese and English,
   draws matching silhouettes/motifs in a fixed layering order, then
   tints the result with a mood-driven abstract color-blob texture on
   top for a painterly finish. A deterministic PRNG seeded from the text
   itself means the same input always yields the same piece.
   ============================================================ */
window.YoukokuTextToArt = (() => {
  const TENSE_WORDS = ['泣','叫','恐怖','死','戦','怒','悲し','絶望','痛み','逃げ','血','銃','剣','争い','恐ろし','苦し','崩れ','壊れ','裏切り','孤独', 'fear', 'death', 'war', 'angry', 'anger', 'sad', 'despair', 'pain', 'blood', 'scream', 'terrible', 'lonely', 'betray'];
  const CALM_WORDS = ['笑','幸せ','平和','安心','喜び','愛','希望','美しい','穏やか','優しい','温かい','眠り','光','花','祝','感謝', 'happy', 'peace', 'joy', 'love', 'hope', 'beautiful', 'calm', 'gentle', 'warm', 'sleep', 'light', 'flower', 'grateful'];

  function countOccurrences(text, word) {
    let count = 0, idx = 0;
    while ((idx = text.indexOf(word, idx)) !== -1) { count++; idx += word.length; }
    return count;
  }

  function scoreText(text) {
    const len = (text || '').replace(/\s/g, '').length || 1;
    let tense = 0, calm = 0;
    const lower = (text || '').toLowerCase();
    TENSE_WORDS.forEach((w) => { tense += countOccurrences(lower, w.toLowerCase()); });
    CALM_WORDS.forEach((w) => { calm += countOccurrences(lower, w.toLowerCase()); });
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

  /* ---------- keyword lexicon (Japanese + English) ---------- */
  const CATEGORIES = {
    timeNight: ['夜','夜空','深夜','真夜中', 'night', 'midnight'],
    timeSunset: ['夕焼け','夕暮れ','夕方', 'sunset', 'dusk', 'twilight'],
    timeMorning: ['朝','夜明け','早朝', 'morning', 'dawn', 'sunrise'],
    timeDay: ['昼','日中','正午', 'daytime', 'noon'],
    sun: ['太陽','日差し','陽光', 'sun', 'sunlight', 'sunshine'],
    moon: ['月','月光', 'moon', 'moonlight'],
    stars: ['星','星空','星々', 'star', 'stars', 'starry'],
    ocean: ['海','波','浜辺','ビーチ', 'sea', 'ocean', 'wave', 'waves', 'beach', 'shore'],
    mountain: ['山','山脈','丘', 'mountain', 'mountains', 'hill', 'hills'],
    forest: ['森','木','木々','林', 'forest', 'tree', 'trees', 'woods'],
    city: ['街','都市','ビル','建物', 'city', 'building', 'buildings', 'urban', 'skyline'],
    snow: ['雪','雪原', 'snow', 'snowy', 'snowfall'],
    rain: ['雨','雨降り', 'rain', 'rainy', 'raindrop'],
    fire: ['火','炎','焚き火', 'fire', 'flame', 'flames', 'burning'],
    flower: ['花','花畑','花園', 'flower', 'flowers', 'blossom', 'garden'],
    bird: ['鳥','小鳥', 'bird', 'birds'],
    cat: ['猫','子猫', 'cat', 'kitten'],
    dog: ['犬','子犬', 'dog', 'puppy'],
    person: ['少女','少年','女性','男性', 'girl', 'boy', 'woman', 'man', 'person'],
  };

  function detectCategories(text) {
    const lower = (text || '').toLowerCase();
    const counts = {};
    Object.keys(CATEGORIES).forEach((cat) => {
      counts[cat] = CATEGORIES[cat].reduce((sum, w) => sum + countOccurrences(lower, w.toLowerCase()), 0);
    });
    return counts;
  }

  function pickTop(counts, keys) {
    let best = null, bestCount = 0;
    keys.forEach((k) => {
      if (counts[k] > bestCount) { best = k; bestCount = counts[k]; }
    });
    return best;
  }

  /* ---------- sky ---------- */
  function drawSky(ctx, w, h, timeCat, accentRgb) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (timeCat === 'timeNight') {
      g.addColorStop(0, '#050818'); g.addColorStop(1, '#0d1440');
    } else if (timeCat === 'timeSunset') {
      g.addColorStop(0, '#2b1140'); g.addColorStop(0.55, '#a8386b'); g.addColorStop(1, '#f4a04a');
    } else if (timeCat === 'timeMorning') {
      g.addColorStop(0, '#dfe9f5'); g.addColorStop(1, '#f7d9a8');
    } else if (timeCat === 'timeDay') {
      g.addColorStop(0, '#4fa8e8'); g.addColorStop(1, '#cfeaf8');
    } else {
      g.addColorStop(0, `rgb(${accentRgb})`); g.addColorStop(1, '#070c26');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function drawSunOrMoon(ctx, w, h, rand, isSun) {
    const cx = w * (0.62 + rand() * 0.22), cy = h * (0.14 + rand() * 0.14), r = Math.min(w, h) * (0.07 + rand() * 0.03);
    if (isSun) {
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 4);
      glow.addColorStop(0, 'rgba(255,214,120,0.55)');
      glow.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffd873';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.save();
      ctx.fillStyle = '#eef1f8';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(cx + r * 0.42, cy - r * 0.3, r * 0.92, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawStars(ctx, w, h, rand, count) {
    for (let i = 0; i < count; i++) {
      const x = rand() * w, y = rand() * h * 0.65, r = 0.6 + rand() * 1.6;
      ctx.fillStyle = `rgba(255,255,255,${0.35 + rand() * 0.5})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* ---------- landscape silhouettes (drawn along the lower portion) ---------- */
  function drawOcean(ctx, w, h, rand) {
    const horizon = h * 0.62;
    const bands = 4;
    for (let i = 0; i < bands; i++) {
      const t = i / bands;
      const y = horizon + (h - horizon) * t;
      const amp = 6 + rand() * 8;
      const freq = 0.015 + rand() * 0.01;
      const phase = rand() * Math.PI * 2;
      const shade = 20 + t * 20;
      ctx.fillStyle = `rgba(${shade},${60 + t * 40},${110 + t * 60},${0.55 + t * 0.3})`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 10) ctx.lineTo(x, y + Math.sin(x * freq + phase) * amp);
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
      ctx.fill();
    }
  }

  function drawMountain(ctx, w, h, rand) {
    const horizon = h * 0.66;
    const peakSets = 2;
    for (let layer = 0; layer < peakSets; layer++) {
      const baseY = horizon + layer * h * 0.05;
      const shade = 18 + layer * 14;
      ctx.fillStyle = `rgba(${shade},${shade + 6},${shade + 22},${0.85 - layer * 0.25})`;
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, baseY);
      const peaks = 4 + Math.floor(rand() * 2);
      for (let i = 0; i <= peaks; i++) {
        const x = (w / peaks) * i;
        const peakH = baseY - (h * 0.12 + rand() * h * 0.14);
        ctx.lineTo(x, i % 2 === 0 ? peakH : baseY - h * 0.03);
      }
      ctx.lineTo(w, baseY);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawForest(ctx, w, h, rand) {
    const horizon = h * 0.7;
    ctx.fillStyle = 'rgba(10,20,14,0.9)';
    ctx.fillRect(0, horizon, w, h - horizon);
    const count = 8 + Math.floor(rand() * 6);
    for (let i = 0; i < count; i++) {
      const x = rand() * w;
      const trunkH = h * (0.08 + rand() * 0.08);
      const y = horizon - rand() * h * 0.05;
      const r = h * (0.05 + rand() * 0.05);
      ctx.strokeStyle = 'rgba(8,16,10,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - trunkH); ctx.stroke();
      ctx.fillStyle = 'rgba(8,18,12,0.92)';
      ctx.beginPath(); ctx.arc(x, y - trunkH, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawCity(ctx, w, h, rand) {
    const horizon = h * 0.68;
    ctx.fillStyle = 'rgba(6,8,16,0.92)';
    ctx.fillRect(0, horizon, w, h - horizon);
    let x = 0;
    while (x < w) {
      const bw = w * (0.05 + rand() * 0.07);
      const bh = h * (0.08 + rand() * 0.22);
      ctx.fillStyle = 'rgba(8,10,20,0.95)';
      ctx.fillRect(x, horizon - bh, bw, bh + (h - horizon));
      const windows = Math.floor(bh / 14);
      for (let i = 0; i < windows; i++) {
        if (rand() > 0.55) {
          ctx.fillStyle = `rgba(255,214,120,${0.4 + rand() * 0.4})`;
          ctx.fillRect(x + bw * 0.25, horizon - bh + i * 14 + 4, bw * 0.18, 6);
        }
      }
      x += bw + w * 0.012;
    }
  }

  /* ---------- weather overlays ---------- */
  function drawRain(ctx, w, h, rand) {
    ctx.strokeStyle = 'rgba(200,220,240,0.35)';
    ctx.lineWidth = 1.4;
    const count = 60;
    for (let i = 0; i < count; i++) {
      const x = rand() * w, y = rand() * h, len = 10 + rand() * 16;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len * 0.25, y + len); ctx.stroke();
    }
  }

  function drawSnow(ctx, w, h, rand) {
    const count = 70;
    for (let i = 0; i < count; i++) {
      const x = rand() * w, y = rand() * h, r = 1 + rand() * 2.4;
      ctx.fillStyle = `rgba(255,255,255,${0.4 + rand() * 0.5})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawFire(ctx, w, h, rand) {
    const baseX = w * 0.5, baseY = h * 0.86;
    const flameCount = 6;
    for (let i = 0; i < flameCount; i++) {
      const fx = baseX + (rand() - 0.5) * w * 0.3;
      const fh = h * (0.14 + rand() * 0.16);
      const fw = fh * (0.35 + rand() * 0.2);
      const grad = ctx.createLinearGradient(fx, baseY, fx, baseY - fh);
      grad.addColorStop(0, 'rgba(255,90,20,0.9)');
      grad.addColorStop(0.6, 'rgba(255,170,40,0.85)');
      grad.addColorStop(1, 'rgba(255,230,120,0.2)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(fx, baseY);
      ctx.quadraticCurveTo(fx - fw, baseY - fh * 0.5, fx, baseY - fh);
      ctx.quadraticCurveTo(fx + fw, baseY - fh * 0.5, fx, baseY);
      ctx.closePath();
      ctx.fill();
    }
    const glow = ctx.createRadialGradient(baseX, baseY - h * 0.1, 0, baseX, baseY - h * 0.1, w * 0.4);
    glow.addColorStop(0, 'rgba(255,140,40,0.25)');
    glow.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  }

  /* ---------- subject motifs (drawn more prominently, center-ish) ---------- */
  function drawFlower(ctx, w, h, rand) {
    const cx = w * (0.35 + rand() * 0.3), cy = h * (0.45 + rand() * 0.2);
    const scale = Math.min(w, h) * (0.16 + rand() * 0.08);
    const petalColors = ['#fb7185', '#f472b6', '#ec4899', '#fda4af'];
    ctx.save();
    ctx.strokeStyle = 'rgba(74,155,110,0.85)';
    ctx.lineWidth = scale * 0.08;
    ctx.beginPath(); ctx.moveTo(cx, cy + scale * 0.3); ctx.lineTo(cx, cy + scale * 2.1); ctx.stroke();
    const petals = 6;
    for (let i = 0; i < petals; i++) {
      const angle = (i / petals) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(angle) * scale * 0.42;
      const py = cy + Math.sin(angle) * scale * 0.42;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle - Math.PI / 2);
      ctx.fillStyle = petalColors[i % petalColors.length];
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.ellipse(0, 0, scale * 0.16, scale * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#facc15';
    ctx.beginPath(); ctx.arc(cx, cy, scale * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawBird(ctx, w, h, rand, count) {
    ctx.strokeStyle = 'rgba(20,20,30,0.75)';
    ctx.lineWidth = 2;
    for (let i = 0; i < count; i++) {
      const x = w * (0.15 + rand() * 0.7), y = h * (0.12 + rand() * 0.28), s = 6 + rand() * 8;
      ctx.beginPath();
      ctx.moveTo(x - s, y);
      ctx.quadraticCurveTo(x - s * 0.3, y - s * 0.8, x, y);
      ctx.quadraticCurveTo(x + s * 0.3, y - s * 0.8, x + s, y);
      ctx.stroke();
    }
  }

  function drawSilhouette(ctx, w, h, rand, kind) {
    const cx = w * (0.4 + rand() * 0.2), groundY = h * 0.88;
    const scale = Math.min(w, h) * 0.22;
    const halo = ctx.createRadialGradient(cx, groundY - scale * 0.7, 0, cx, groundY - scale * 0.7, scale * 1.6);
    halo.addColorStop(0, 'rgba(255,244,220,0.4)');
    halo.addColorStop(1, 'rgba(255,244,220,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(12,12,18,0.9)';
    if (kind === 'person') {
      ctx.beginPath(); ctx.arc(cx, groundY - scale * 1.55, scale * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - scale * 0.24, groundY);
      ctx.lineTo(cx - scale * 0.3, groundY - scale * 1.2);
      ctx.quadraticCurveTo(cx, groundY - scale * 1.42, cx + scale * 0.3, groundY - scale * 1.2);
      ctx.lineTo(cx + scale * 0.24, groundY);
      ctx.closePath(); ctx.fill();
    } else if (kind === 'cat' || kind === 'dog') {
      const bodyW = scale * 0.9, bodyH = scale * 0.55;
      ctx.beginPath(); ctx.ellipse(cx, groundY - bodyH * 0.5, bodyW * 0.5, bodyH * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      const headR = scale * 0.28;
      const headX = cx + bodyW * 0.42, headY = groundY - bodyH * 0.85;
      ctx.beginPath(); ctx.arc(headX, headY, headR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      if (kind === 'cat') {
        ctx.moveTo(headX - headR * 0.7, headY - headR * 0.7);
        ctx.lineTo(headX - headR * 0.2, headY - headR * 1.5);
        ctx.lineTo(headX + headR * 0.15, headY - headR * 0.75);
        ctx.moveTo(headX + headR * 0.2, headY - headR * 0.8);
        ctx.lineTo(headX + headR * 0.55, headY - headR * 1.5);
        ctx.lineTo(headX + headR * 0.85, headY - headR * 0.6);
      } else {
        ctx.ellipse(headX - headR * 0.6, headY - headR * 0.3, headR * 0.28, headR * 0.5, -0.3, 0, Math.PI * 2);
        ctx.ellipse(headX + headR * 0.7, headY - headR * 0.3, headR * 0.28, headR * 0.5, 0.3, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - bodyW * 0.5, groundY - bodyH * 0.7);
      ctx.quadraticCurveTo(cx - bodyW * 0.85, groundY - bodyH * 1.3, cx - bodyW * 0.6, groundY - bodyH * 0.2);
      ctx.lineWidth = scale * 0.08;
      ctx.strokeStyle = 'rgba(12,12,18,0.88)';
      ctx.stroke();
    }
  }

  /* ---------- main entry point ---------- */
  function generate(canvas, text) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const src = text || '';
    const { mood } = scoreText(src);
    const seed = hashString(src || 'ai-records');
    const rand = mulberry32(seed);
    const key = mood > 4 ? 'tense' : mood < -4 ? 'calm' : 'neutral';
    const palette = PALETTES[key];
    const counts = detectCategories(src);

    const timeCat = pickTop(counts, ['timeNight', 'timeSunset', 'timeMorning', 'timeDay']);
    const envCat = pickTop(counts, ['ocean', 'mountain', 'forest', 'city']);
    const weatherCat = pickTop(counts, ['snow', 'rain', 'fire']);
    const celestialCat = pickTop(counts, ['sun', 'moon']);
    const subjectCat = pickTop(counts, ['flower', 'bird', 'cat', 'dog', 'person']);
    const starsOn = counts.stars > 0 || timeCat === 'timeNight';

    /* 1. sky */
    drawSky(ctx, w, h, timeCat, palette[0]);

    /* 2. celestial (behind landscape) */
    if (starsOn) drawStars(ctx, w, h, rand, 40 + Math.floor(rand() * 40));
    if (celestialCat) drawSunOrMoon(ctx, w, h, rand, celestialCat === 'sun');

    /* 3. landscape silhouette */
    if (envCat === 'ocean') drawOcean(ctx, w, h, rand);
    else if (envCat === 'mountain') drawMountain(ctx, w, h, rand);
    else if (envCat === 'forest') drawForest(ctx, w, h, rand);
    else if (envCat === 'city') drawCity(ctx, w, h, rand);

    /* 4. weather overlay */
    if (weatherCat === 'rain') drawRain(ctx, w, h, rand);
    else if (weatherCat === 'snow') drawSnow(ctx, w, h, rand);
    else if (weatherCat === 'fire') drawFire(ctx, w, h, rand);

    /* 5. subject motif */
    if (subjectCat === 'flower') drawFlower(ctx, w, h, rand);
    else if (subjectCat === 'bird') drawBird(ctx, w, h, rand, 2 + Math.floor(rand() * 3));
    else if (subjectCat === 'cat' || subjectCat === 'dog' || subjectCat === 'person') drawSilhouette(ctx, w, h, rand, subjectCat);

    /* 6. mood-driven abstract color texture, layered on top at reduced strength */
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    const blobCount = 4 + Math.floor(rand() * 4);
    for (let i = 0; i < blobCount; i++) {
      const x = rand() * w, y = rand() * h, r = (0.15 + rand() * 0.35) * Math.max(w, h);
      const c = palette[Math.floor(rand() * palette.length)];
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${c},${0.16 + rand() * 0.14})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const lineCount = key === 'tense' ? 4 : 3;
    for (let i = 0; i < lineCount; i++) {
      const c = palette[Math.floor(rand() * palette.length)];
      ctx.strokeStyle = `rgba(${c},0.16)`;
      ctx.lineWidth = 2 + rand() * 3;
      ctx.beginPath();
      const amp = 40 + rand() * 80, freq = 0.002 + rand() * 0.004, phase = rand() * Math.PI * 2, baseY = rand() * h;
      ctx.moveTo(0, baseY);
      for (let x = 0; x <= w; x += 12) ctx.lineTo(x, baseY + Math.sin(x * freq + phase) * amp);
      ctx.stroke();
    }
    ctx.restore();

    return { mood, key, categories: counts, scene: { timeCat, envCat, weatherCat, celestialCat, subjectCat } };
  }

  return { generate, scoreText };
})();
