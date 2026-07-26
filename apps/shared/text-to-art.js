/* ============================================================
   AI Records — generative art from text
   Not AI image generation (that needs a paid API or a huge model
   download) — this is a fully offline, client-side "scene compositor."
   It scans the text for concrete keywords (time of day, sky objects,
   landscape, weather, and a few subjects) in both Japanese and English,
   then paints a layered illustration: sky -> clouds/celestial -> hazy
   distant landscape -> weather -> subjects -> foreground -> a cinematic
   color grade. A deterministic PRNG seeded from the text itself means
   the same input always yields the same piece.
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

  /* per-time-of-day tone used for clouds, haze and the final color grade */
  const TIME_TONE = {
    timeNight: { sky: '9,12,32', light: '150,165,220', shadow: '30,35,70', warm: false },
    timeSunset: { sky: '168,56,107', light: '255,224,190', shadow: '120,60,90', warm: true },
    timeMorning: { sky: '223,233,245', light: '255,255,255', shadow: '190,200,220', warm: true },
    timeDay: { sky: '79,168,232', light: '255,255,255', shadow: '190,205,225', warm: false },
    neutral: { sky: '20,24,50', light: '210,210,230', shadow: '40,42,70', warm: false },
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
    rain: ['雨','雨降り','嵐','荒れ狂う','暴風雨', 'rain', 'rainy', 'raindrop', 'storm', 'stormy'],
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

  function pickAll(counts, keys) {
    return keys.filter((k) => counts[k] > 0);
  }

  /* ---------- sky ---------- */
  function drawSky(ctx, w, h, timeCat, accentRgb) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (timeCat === 'timeNight') {
      g.addColorStop(0, '#050818'); g.addColorStop(0.6, '#0d1440'); g.addColorStop(1, '#141b4d');
    } else if (timeCat === 'timeSunset') {
      g.addColorStop(0, '#2b1140'); g.addColorStop(0.5, '#a8386b'); g.addColorStop(0.78, '#e0703f'); g.addColorStop(1, '#f4a04a');
    } else if (timeCat === 'timeMorning') {
      g.addColorStop(0, '#c9dbf0'); g.addColorStop(0.55, '#eef0e0'); g.addColorStop(1, '#f7d9a8');
    } else if (timeCat === 'timeDay') {
      g.addColorStop(0, '#2f8fdb'); g.addColorStop(0.6, '#78bdec'); g.addColorStop(1, '#d9f0f8');
    } else {
      g.addColorStop(0, `rgb(${accentRgb})`); g.addColorStop(1, '#070c26');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function drawClouds(ctx, w, h, rand, tone) {
    const count = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      const cx = w * (0.08 + rand() * 0.84);
      const cy = h * (0.08 + rand() * 0.3);
      const scale = Math.min(w, h) * (0.075 + rand() * 0.08);
      const puffs = 4 + Math.floor(rand() * 3);
      const alpha = 0.5 + rand() * 0.35;
      for (let p = 0; p < puffs; p++) {
        const spread = (p - (puffs - 1) / 2);
        const px = cx + spread * scale * 0.62 + (rand() - 0.5) * scale * 0.15;
        const py = cy - Math.abs(spread) * scale * 0.22 + (rand() - 0.5) * scale * 0.12;
        const pr = scale * (0.5 + rand() * 0.32) * (1 - Math.abs(spread) * 0.12);
        const g = ctx.createRadialGradient(px, py - pr * 0.35, pr * 0.1, px, py, pr);
        g.addColorStop(0, `rgba(${tone.light},${alpha})`);
        g.addColorStop(1, `rgba(${tone.shadow},${alpha * 0.4})`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(px, py, pr, pr * 0.66, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawSunOrMoon(ctx, w, h, rand, isSun) {
    const cx = w * (0.62 + rand() * 0.22), cy = h * (0.14 + rand() * 0.14), r = Math.min(w, h) * (0.07 + rand() * 0.03);
    if (isSun) {
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 4.4);
      glow.addColorStop(0, 'rgba(255,214,120,0.6)');
      glow.addColorStop(0.4, 'rgba(255,190,110,0.22)');
      glow.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      const body = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, 0, cx, cy, r);
      body.addColorStop(0, '#fff3cf');
      body.addColorStop(1, '#ffc94d');
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    } else {
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3.2);
      glow.addColorStop(0, 'rgba(210,220,255,0.28)');
      glow.addColorStop(1, 'rgba(210,220,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      const body = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
      body.addColorStop(0, '#ffffff');
      body.addColorStop(1, '#c7d0ea');
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(cx + r * 0.42, cy - r * 0.3, r * 0.92, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    return { cx, cy, r, color: isSun ? '255,201,77' : '199,208,234' };
  }

  function drawStars(ctx, w, h, rand, count) {
    for (let i = 0; i < count; i++) {
      const x = rand() * w, y = rand() * h * 0.65, r = 0.6 + rand() * 1.6;
      ctx.fillStyle = `rgba(255,255,255,${0.35 + rand() * 0.5})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (r > 1.6) {
        ctx.strokeStyle = `rgba(255,255,255,${0.15 + rand() * 0.15})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(x - r * 2.2, y); ctx.lineTo(x + r * 2.2, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y - r * 2.2); ctx.lineTo(x, y + r * 2.2); ctx.stroke();
      }
    }
  }

  /* soft gradient band where sky meets land, so the horizon doesn't look pasted-on */
  function drawHorizonHaze(ctx, w, h, horizonY, rgb) {
    const g = ctx.createLinearGradient(0, horizonY - h * 0.16, 0, horizonY + h * 0.02);
    g.addColorStop(0, `rgba(${rgb},0)`);
    g.addColorStop(1, `rgba(${rgb},0.4)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, horizonY - h * 0.16, w, h * 0.18);
  }

  /* soft vertical glow reflecting the sun/moon onto water */
  function drawWaterReflection(ctx, w, h, horizonY, celestial) {
    if (!celestial) return;
    const g = ctx.createLinearGradient(celestial.cx, horizonY, celestial.cx, h);
    g.addColorStop(0, `rgba(${celestial.color},0.45)`);
    g.addColorStop(1, `rgba(${celestial.color},0)`);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(celestial.cx - w * 0.045, horizonY);
    ctx.lineTo(celestial.cx + w * 0.045, horizonY);
    ctx.lineTo(celestial.cx + w * 0.13, h);
    ctx.lineTo(celestial.cx - w * 0.13, h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* ---------- landscape silhouettes (drawn along the lower portion) ---------- */
  function drawOcean(ctx, w, h, rand) {
    const horizon = h * 0.62;
    const bands = 5;
    for (let i = 0; i < bands; i++) {
      const t = i / bands;
      const y = horizon + (h - horizon) * t;
      const amp = 5 + rand() * 7;
      const freq = 0.015 + rand() * 0.01;
      const phase = rand() * Math.PI * 2;
      const shade = 16 + t * 22;
      ctx.fillStyle = `rgba(${shade},${58 + t * 42},${108 + t * 62},${0.5 + t * 0.32})`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 10) ctx.lineTo(x, y + Math.sin(x * freq + phase) * amp);
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
      ctx.fill();
      if (i === 0) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 10) {
          const yy = y + Math.sin(x * freq + phase) * amp;
          if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
        ctx.restore();
      }
    }
    return horizon;
  }

  function drawMountain(ctx, w, h, rand) {
    const horizon = h * 0.66;
    const layers = 3;
    for (let layer = 0; layer < layers; layer++) {
      const baseY = horizon + layer * h * 0.045;
      const shade = 20 + layer * 18;
      const opacity = layer === 0 ? 0.38 : (layer === 1 ? 0.68 : 0.92);
      ctx.fillStyle = `rgba(${shade},${shade + 6},${shade + 24},${opacity})`;
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, baseY);
      const peaks = 4 + Math.floor(rand() * 2);
      for (let i = 0; i <= peaks; i++) {
        const x = (w / peaks) * i;
        const peakH = baseY - (h * (0.1 + layer * 0.04) + rand() * h * 0.14);
        ctx.lineTo(x, i % 2 === 0 ? peakH : baseY - h * 0.03);
      }
      ctx.lineTo(w, baseY);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      if (layer === layers - 1) {
        // a thin snow-cap highlight on the nearest ridge
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.moveTo(0, baseY);
        for (let i = 0; i <= peaks; i++) {
          const x = (w / peaks) * i;
          const peakH = baseY - (h * 0.14 + rand() * h * 0.1);
          ctx.lineTo(x, i % 2 === 0 ? peakH : baseY - h * 0.03);
        }
        ctx.lineTo(w, baseY);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    return horizon;
  }

  function drawForest(ctx, w, h, rand) {
    const horizon = h * 0.7;
    ctx.fillStyle = 'rgba(24,40,30,0.55)';
    ctx.fillRect(0, horizon - h * 0.05, w, h * 0.05);
    ctx.fillStyle = 'rgba(10,20,14,0.92)';
    ctx.fillRect(0, horizon, w, h - horizon);
    const count = 10 + Math.floor(rand() * 6);
    for (let i = 0; i < count; i++) {
      const x = rand() * w;
      const depth = rand();
      const trunkH = h * (0.07 + depth * 0.09);
      const y = horizon - depth * h * 0.06;
      const r = h * (0.04 + depth * 0.055);
      const shade = 6 + Math.floor(depth * 10);
      ctx.strokeStyle = `rgba(${shade},${shade + 8},${shade + 4},0.9)`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - trunkH); ctx.stroke();
      ctx.fillStyle = `rgba(${shade},${shade + 10},${shade + 4},0.94)`;
      ctx.beginPath();
      ctx.arc(x, y - trunkH, r, 0, Math.PI * 2);
      ctx.arc(x - r * 0.65, y - trunkH + r * 0.28, r * 0.68, 0, Math.PI * 2);
      ctx.arc(x + r * 0.62, y - trunkH + r * 0.22, r * 0.64, 0, Math.PI * 2);
      ctx.arc(x + r * 0.1, y - trunkH - r * 0.5, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    return horizon;
  }

  function drawCity(ctx, w, h, rand) {
    const horizon = h * 0.68;
    ctx.fillStyle = 'rgba(20,26,45,0.4)';
    ctx.fillRect(0, horizon - h * 0.04, w, h * 0.04);
    ctx.fillStyle = 'rgba(6,8,16,0.92)';
    ctx.fillRect(0, horizon, w, h - horizon);
    let x = 0;
    let pass = 0;
    // a fainter, shorter skyline behind the main one for depth
    while (x < w) {
      const bw = w * (0.06 + rand() * 0.08);
      const bh = h * (0.05 + rand() * 0.12);
      ctx.fillStyle = 'rgba(14,18,32,0.6)';
      ctx.fillRect(x, horizon - bh, bw, bh);
      x += bw + w * 0.02;
    }
    x = 0;
    while (x < w) {
      const bw = w * (0.05 + rand() * 0.07);
      const bh = h * (0.1 + rand() * 0.24);
      ctx.fillStyle = 'rgba(8,10,20,0.96)';
      ctx.fillRect(x, horizon - bh, bw, bh + (h - horizon));
      const windows = Math.floor(bh / 14);
      for (let i = 0; i < windows; i++) {
        if (rand() > 0.52) {
          ctx.fillStyle = `rgba(255,214,120,${0.4 + rand() * 0.45})`;
          ctx.fillRect(x + bw * 0.25, horizon - bh + i * 14 + 4, bw * 0.18, 6);
        }
      }
      x += bw + w * 0.012;
      pass++;
    }
    return horizon;
  }

  /* ---------- weather overlays ---------- */
  function drawRain(ctx, w, h, rand) {
    ctx.strokeStyle = 'rgba(200,220,240,0.35)';
    ctx.lineWidth = 1.4;
    const count = 70;
    for (let i = 0; i < count; i++) {
      const x = rand() * w, y = rand() * h, len = 10 + rand() * 16;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len * 0.25, y + len); ctx.stroke();
    }
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = 'rgba(40,50,70,1)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawSnow(ctx, w, h, rand) {
    const count = 160;
    for (let i = 0; i < count; i++) {
      const x = rand() * w, y = rand() * h, r = 1.6 + rand() * 4.2;
      ctx.save();
      ctx.shadowColor = 'rgba(255,255,255,0.9)';
      ctx.shadowBlur = r * 1.5;
      ctx.fillStyle = `rgba(255,255,255,${0.55 + rand() * 0.4})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    const groundY = h * 0.86;
    const g = ctx.createLinearGradient(0, groundY, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(235,242,250,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, groundY, w, h - groundY);
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
  function drawFlower(ctx, w, h, rand, index, total) {
    const spread = total > 1 ? (index + 0.5) / total : 0.5;
    const cx = w * (0.12 + spread * 0.76 + (rand() - 0.5) * (0.5 / Math.max(1, total)));
    const cy = h * (0.5 + rand() * 0.3);
    const scale = Math.min(w, h) * (total > 1 ? (0.08 + rand() * 0.05) : (0.16 + rand() * 0.08));
    const petalColors = ['#fb7185', '#f472b6', '#ec4899', '#fda4af'];
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(cx + scale * 0.08, cy + scale * 2.14, scale * 0.5, scale * 0.12, 0, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = 'rgba(58,130,90,0.9)';
    ctx.lineWidth = scale * 0.09;
    ctx.beginPath();
    ctx.moveTo(cx, cy + scale * 0.3);
    ctx.quadraticCurveTo(cx + scale * 0.12, cy + scale * 1.2, cx, cy + scale * 2.1);
    ctx.stroke();
    // a small leaf on the stem
    ctx.fillStyle = 'rgba(64,145,100,0.9)';
    ctx.beginPath();
    ctx.ellipse(cx + scale * 0.22, cy + scale * 1.3, scale * 0.22, scale * 0.1, -0.5, 0, Math.PI * 2);
    ctx.fill();

    const petals = 6;
    for (let i = 0; i < petals; i++) {
      const angle = (i / petals) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(angle) * scale * 0.42;
      const py = cy + Math.sin(angle) * scale * 0.42;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle - Math.PI / 2);
      const petalColor = petalColors[i % petalColors.length];
      const pg = ctx.createRadialGradient(0, scale * 0.1, 0, 0, 0, scale * 0.38);
      pg.addColorStop(0, '#fff1f5');
      pg.addColorStop(0.35, petalColor);
      pg.addColorStop(1, petalColor);
      ctx.fillStyle = pg;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.ellipse(0, 0, scale * 0.16, scale * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    const centerG = ctx.createRadialGradient(cx - scale * 0.05, cy - scale * 0.05, 0, cx, cy, scale * 0.22);
    centerG.addColorStop(0, '#fff6c9');
    centerG.addColorStop(1, '#f2b90f');
    ctx.fillStyle = centerG;
    ctx.beginPath(); ctx.arc(cx, cy, scale * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawBird(ctx, w, h, rand, count) {
    ctx.strokeStyle = 'rgba(20,20,30,0.75)';
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const x = w * (0.15 + rand() * 0.7), y = h * (0.1 + rand() * 0.3), s = 6 + rand() * 9;
      ctx.lineWidth = 1.4 + s * 0.06;
      ctx.beginPath();
      ctx.moveTo(x - s, y);
      ctx.quadraticCurveTo(x - s * 0.3, y - s * 0.85, x, y);
      ctx.quadraticCurveTo(x + s * 0.3, y - s * 0.85, x + s, y);
      ctx.stroke();
    }
  }

  function drawSilhouette(ctx, w, h, rand, kind, index, total, glowRgb) {
    const spread = total > 1 ? (index + 0.5) / total : 0.5;
    const cx = total > 1
      ? w * (0.15 + spread * 0.7 + (rand() - 0.5) * (0.4 / Math.max(1, total)))
      : w * (0.4 + rand() * 0.2);
    const groundY = h * 0.88;
    const scale = Math.min(w, h) * 0.22;
    const halo = ctx.createRadialGradient(cx, groundY - scale * 0.7, 0, cx, groundY - scale * 0.7, scale * 1.7);
    halo.addColorStop(0, `rgba(${glowRgb},0.38)`);
    halo.addColorStop(1, `rgba(${glowRgb},0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);

    // contact shadow grounds the subject
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(cx, groundY + scale * 0.04, scale * 0.5, scale * 0.09, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = 'rgba(10,10,16,0.92)';
    if (kind === 'person') {
      const hipY = groundY - scale * 0.55;
      // legs
      ctx.lineWidth = scale * 0.16;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(10,10,16,0.92)';
      ctx.beginPath();
      ctx.moveTo(cx - scale * 0.08, hipY); ctx.lineTo(cx - scale * 0.14, groundY);
      ctx.moveTo(cx + scale * 0.08, hipY); ctx.lineTo(cx + scale * 0.1, groundY);
      ctx.stroke();
      // torso
      ctx.beginPath();
      ctx.moveTo(cx - scale * 0.24, hipY + scale * 0.04);
      ctx.lineTo(cx - scale * 0.3, groundY - scale * 1.2);
      ctx.quadraticCurveTo(cx, groundY - scale * 1.42, cx + scale * 0.3, groundY - scale * 1.2);
      ctx.lineTo(cx + scale * 0.24, hipY + scale * 0.04);
      ctx.closePath(); ctx.fill();
      // arms
      ctx.lineWidth = scale * 0.1;
      ctx.beginPath();
      ctx.moveTo(cx - scale * 0.28, groundY - scale * 1.15);
      ctx.quadraticCurveTo(cx - scale * 0.42, groundY - scale * 0.85, cx - scale * 0.34, groundY - scale * 0.5);
      ctx.moveTo(cx + scale * 0.28, groundY - scale * 1.15);
      ctx.quadraticCurveTo(cx + scale * 0.4, groundY - scale * 0.9, cx + scale * 0.3, groundY - scale * 0.55);
      ctx.stroke();
      // head + hair
      ctx.beginPath(); ctx.arc(cx, groundY - scale * 1.55, scale * 0.22, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'cat' || kind === 'dog') {
      const bodyW = scale * 0.92, bodyH = scale * 0.55;
      // legs
      ctx.fillStyle = 'rgba(10,10,16,0.92)';
      [-0.32, -0.05, 0.18, 0.4].forEach((off) => {
        ctx.beginPath();
        ctx.ellipse(cx + bodyW * off, groundY - scale * 0.06, scale * 0.055, scale * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      // body
      ctx.beginPath(); ctx.ellipse(cx, groundY - bodyH * 0.62, bodyW * 0.5, bodyH * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      const headR = scale * 0.28;
      const headX = cx + bodyW * 0.42, headY = groundY - bodyH * 0.95;
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
      // snout
      ctx.beginPath();
      ctx.ellipse(headX + headR * 0.75, headY + headR * 0.15, headR * 0.32, headR * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      // tail
      ctx.beginPath();
      ctx.moveTo(cx - bodyW * 0.5, groundY - bodyH * 0.75);
      ctx.quadraticCurveTo(cx - bodyW * 0.95, groundY - bodyH * 1.35, cx - bodyW * 0.62, groundY - bodyH * 0.15);
      ctx.lineWidth = scale * 0.08;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(10,10,16,0.9)';
      ctx.stroke();
    }
  }

  function drawForegroundFringe(ctx, w, h, rand, color) {
    const baseY = h;
    ctx.fillStyle = color;
    // a soft, low silhouette line of overlapping rounded bumps (bushes/undergrowth),
    // never taller than a small fraction of the canvas so it frames rather than intrudes
    let x = -w * 0.02;
    while (x < w * 1.02) {
      const r = h * (0.02 + rand() * 0.028);
      ctx.beginPath();
      ctx.ellipse(x, baseY, r * 1.3, r, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      x += r * (1.1 + rand() * 0.5);
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
    const weatherCats = pickAll(counts, ['snow', 'rain', 'fire']);
    const celestialCat = pickTop(counts, ['sun', 'moon']);
    const flowerOn = counts.flower > 0;
    const birdOn = counts.bird > 0;
    const animalKind = pickTop(counts, ['cat', 'dog', 'person']);
    const starsOn = counts.stars > 0 || timeCat === 'timeNight';
    const tone = TIME_TONE[timeCat] || TIME_TONE.neutral;

    /* 1. sky */
    drawSky(ctx, w, h, timeCat, palette[0]);

    /* 2. celestial + clouds (behind landscape) */
    if (starsOn) drawStars(ctx, w, h, rand, 40 + Math.floor(rand() * 40));
    let celestial = null;
    if (celestialCat) celestial = drawSunOrMoon(ctx, w, h, rand, celestialCat === 'sun');
    if (timeCat === 'timeDay' || timeCat === 'timeMorning' || timeCat === 'timeSunset') {
      drawClouds(ctx, w, h, rand, tone);
    }

    /* 3. landscape silhouette, blended into the sky at the horizon for depth */
    let horizon = null;
    if (envCat === 'ocean') { drawHorizonHaze(ctx, w, h, h * 0.62, tone.shadow); horizon = drawOcean(ctx, w, h, rand); }
    else if (envCat === 'mountain') { drawHorizonHaze(ctx, w, h, h * 0.66, tone.shadow); horizon = drawMountain(ctx, w, h, rand); }
    else if (envCat === 'forest') { drawHorizonHaze(ctx, w, h, h * 0.7, tone.shadow); horizon = drawForest(ctx, w, h, rand); }
    else if (envCat === 'city') { drawHorizonHaze(ctx, w, h, h * 0.68, tone.shadow); horizon = drawCity(ctx, w, h, rand); }

    if (envCat === 'ocean' && celestial) drawWaterReflection(ctx, w, h, horizon, celestial);

    /* 4. weather overlay(s) — every mentioned weather condition renders, not just one */
    weatherCats.forEach((wc) => {
      if (wc === 'rain') drawRain(ctx, w, h, rand);
      else if (wc === 'snow') drawSnow(ctx, w, h, rand);
      else if (wc === 'fire') drawFire(ctx, w, h, rand);
    });

    /* 5. subject motifs — flowers, birds, and an animal/person can all coexist */
    if (birdOn) {
      const birdCount = Math.min(9, 2 + counts.bird + Math.floor(rand() * 2));
      drawBird(ctx, w, h, rand, birdCount);
    }
    if (flowerOn) {
      const flowerCount = Math.min(9, Math.max(1, counts.flower + Math.floor(rand() * 3)));
      for (let i = 0; i < flowerCount; i++) drawFlower(ctx, w, h, rand, i, flowerCount);
    }
    if (animalKind) drawSilhouette(ctx, w, h, rand, animalKind, 0, 1, tone.light);

    /* 6. foreground fringe for extra depth on ground scenes */
    if (envCat === 'forest' || envCat === 'mountain' || (!envCat && (flowerOn || animalKind))) {
      drawForegroundFringe(ctx, w, h, rand, 'rgba(4,6,8,0.85)');
    }

    /* 7. cinematic color grade: soft top-to-bottom tone wash + vignette, replacing noisy blobs */
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    const wash = ctx.createLinearGradient(0, 0, 0, h);
    wash.addColorStop(0, `rgba(${palette[0]},0.22)`);
    wash.addColorStop(1, `rgba(${palette[2] || palette[0]},0.14)`);
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const lineCount = key === 'tense' ? 3 : 2;
    for (let i = 0; i < lineCount; i++) {
      const c = palette[Math.floor(rand() * palette.length)];
      ctx.strokeStyle = `rgba(${c},0.1)`;
      ctx.lineWidth = 2 + rand() * 3;
      ctx.beginPath();
      const amp = 40 + rand() * 80, freq = 0.002 + rand() * 0.004, phase = rand() * Math.PI * 2, baseY = rand() * h;
      ctx.moveTo(0, baseY);
      for (let x = 0; x <= w; x += 12) ctx.lineTo(x, baseY + Math.sin(x * freq + phase) * amp);
      ctx.stroke();
    }
    ctx.restore();

    // vignette: darken the corners so the eye settles on the center, like a finished poster
    const vignette = ctx.createRadialGradient(w / 2, h * 0.48, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.max(w, h) * 0.75);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.32)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    return { mood, key, categories: counts, scene: { timeCat, envCat, weatherCats, celestialCat, flowerOn, birdOn, animalKind } };
  }

  return { generate, scoreText };
})();
