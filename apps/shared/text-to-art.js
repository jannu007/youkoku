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
  const TENSE_WORDS = ['泣','叫','恐怖','死','戦','怒','悲し','絶望','痛み','逃げ','血','銃','剣','争い','恐ろし','苦し','崩れ','壊れ','裏切り','孤独','憎','恨','嫉妬','不安','焦り','絶望的','悔し','切ない','苦悩','悲鳴','怖','震え','涙', 'fear', 'death', 'war', 'angry', 'anger', 'sad', 'sadness', 'despair', 'pain', 'blood', 'scream', 'terrible', 'lonely', 'betray', 'hate', 'grief', 'suffer', 'suffering', 'anxious', 'anxiety', 'dread', 'nightmare', 'cry', 'crying', 'tears'];
  const CALM_WORDS = ['笑','幸せ','平和','安心','喜び','愛','希望','美しい','穏やか','優しい','温かい','眠り','光','花','祝','感謝','癒','和やか','のどか','安らぎ','微笑','幸福','愛おしい','嬉し','楽しい','安心感','温もり','平穏', 'happy', 'happiness', 'peace', 'peaceful', 'joy', 'love', 'hope', 'beautiful', 'calm', 'gentle', 'warm', 'sleep', 'light', 'flower', 'grateful', 'gratitude', 'smile', 'joyful', 'serene', 'tender', 'comfort', 'cozy'];

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

  /* ---------- keyword lexicon (Japanese + English) ----------
     Deliberately broad: many synonyms, conjugated/compound forms, and casual expressions
     per category, since real sentences rarely use the one "canonical" word for a concept. */
  const CATEGORIES = {
    timeNight: ['夜','夜空','深夜','真夜中','夜中','宵','夜更け','闇夜','夜長','今夜','夜間', 'night', 'midnight', 'nighttime', 'nightfall', 'dark night', 'after dark'],
    timeSunset: ['夕焼け','夕暮れ','夕方','黄昏','日没','夕方の光','夕陽','入り日', 'sunset', 'dusk', 'twilight', 'evening', 'golden hour'],
    timeMorning: ['朝','夜明け','早朝','明け方','朝方','朝もぼろけ','朝焼け','今朝', 'morning', 'dawn', 'sunrise', 'daybreak', 'early morning'],
    timeDay: ['昼','日中','正午','真昼','午後','昼下がり','昼間','午前', 'daytime', 'noon', 'afternoon', 'midday', 'morning light'],
    sun: ['太陽','日差し','陽光','朝日','夕日','日光','陽射し','日輪','お日様', 'sun', 'sunlight', 'sunshine', 'sunrise', 'sunset', 'sunbeam', 'sunny', 'sunlit'],
    moon: ['月','月光','満月','新月','月明かり','半月','月夜','三日月','月夜空', 'moon', 'moonlight', 'moonlit', 'crescent moon', 'full moon', 'lunar'],
    stars: ['星','星空','星々','星屑','天の川','流れ星','満天の星','オーロラ','彗星','北極星', 'star', 'stars', 'starry', 'stardust', 'milky way', 'shooting star', 'aurora', 'comet', 'galaxy', 'cosmos', 'nebula'],
    ocean: ['海','波','浜辺','ビーチ','湖','川','滝','水面','岸','水平線','海岸','水辺','港','小川','入り江','沼','池','海底','水中','船','ボート','灯台','島', 'sea', 'ocean', 'wave', 'waves', 'beach', 'shore', 'lake', 'river', 'waterfall', 'coast', 'coastline', 'horizon', 'harbor', 'stream', 'pond', 'swamp', 'underwater', 'boat', 'ship', 'lighthouse', 'island'],
    mountain: ['山','山脈','丘','峰','山頂','山々','稜線','岩山','谷','火山','洞窟', 'mountain', 'mountains', 'hill', 'hills', 'peak', 'summit', 'ridge', 'cliff', 'valley', 'volcano', 'cave'],
    forest: ['森','木','木々','林','緑','樹木','木漏れ日','竹林','森林','草原','野原','庭','農場','牧場','公園', 'forest', 'tree', 'trees', 'woods', 'greenery', 'jungle', 'meadow', 'grove', 'field', 'garden', 'farm', 'park'],
    city: ['街','都市','ビル','建物','夜景','街並み','街灯','都会','駅','橋','道路','路地','城','神社','寺','市場','学校','家','家屋','商店街', 'city', 'building', 'buildings', 'urban', 'skyline', 'town', 'streetlight', 'street', 'bridge', 'alley', 'castle', 'shrine', 'temple', 'market', 'school', 'house'],
    desert: ['砂漠','砂丘','オアシス','荒野','砂', 'desert', 'dune', 'dunes', 'oasis', 'sand', 'wasteland', 'arid'],
    snow: ['雪','雪原','雪景色','吹雪','粉雪','雪化粧','積雪','雪だるま','初雪', 'snow', 'snowy', 'snowfall', 'blizzard', 'snowflake', 'snowstorm', 'first snow'],
    rain: ['雨','雨降り','嵐','荒れ狂う','暴風雨','梅雨','小雨','豪雨','雨音','雨粒','台風','にわか雨', 'rain', 'rainy', 'raindrop', 'storm', 'stormy', 'drizzle', 'downpour', 'thunderstorm', 'typhoon', 'hurricane'],
    thunder: ['雷','雷鳴','稲光','落雷', 'thunder', 'lightning', 'thunderbolt'],
    fire: ['火','炎','焚き火','火事','篝火','火花','キャンドル','ろうそく','提灯','ランタン', 'fire', 'flame', 'flames', 'burning', 'bonfire', 'wildfire', 'spark', 'candle', 'lantern'],
    fog: ['霧','霞','ミスト','もや','朝霧', 'fog', 'mist', 'haze', 'foggy', 'misty'],
    wind: ['風','風が吹く','風に舞う','突風','そよ風','疾風','強風', 'wind', 'windy', 'breeze', 'gust', 'gale'],
    rainbow: ['虹','虹色', 'rainbow'],
    autumn: ['紅葉','秋','落ち葉','黄葉','紅葉狩り', 'autumn', 'fall foliage', 'red leaves', 'maple leaves'],
    flower: ['花','花畑','花園','桜','薔薇','バラ','向日葵','ひまわり','チューリップ','花びら','満開','蓮','菊','紫陽花','梅', 'flower', 'flowers', 'blossom', 'garden', 'cherry blossom', 'sakura', 'rose', 'sunflower', 'tulip', 'petal', 'bloom', 'lotus', 'hydrangea'],
    bird: ['鳥','小鳥','カラス','鳩','白鳥','ツバメ','渡り鳥','フクロウ','孔雀','鶴', 'bird', 'birds', 'crow', 'dove', 'swan', 'swallow', 'owl', 'peacock', 'crane'],
    cat: ['猫','子猫','ネコ', 'cat', 'kitten'],
    dog: ['犬','子犬','イヌ','馬','鹿','牛','羊','ライオン','虎','狼','熊','キツネ','象','ウサギ以外の動物', 'dog', 'puppy', 'horse', 'deer', 'cow', 'sheep', 'lion', 'tiger', 'wolf', 'bear', 'fox', 'elephant'],
    rabbit: ['うさぎ','ウサギ','兎','子うさぎ', 'rabbit', 'bunny'],
    fish: ['魚','金魚','熱帯魚','鯉', 'fish', 'goldfish', 'koi'],
    butterfly: ['蝶','蝶々','チョウ', 'butterfly'],
    umbrella: ['傘','雨傘','日傘', 'umbrella', 'parasol'],
    person: ['少女','少年','女性','男性','人','子供','老人','彼女','彼','私','僕','人々','群衆','花嫁','花婿', 'girl', 'boy', 'woman', 'man', 'person', 'child', 'kid', 'she', 'he', 'people', 'crowd', 'bride', 'groom'],
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

  function drawSunOrMoon(ctx, w, h, rand, isSun, lowInSky) {
    const cx = w * (0.62 + rand() * 0.22);
    const cy = lowInSky ? h * (0.4 + rand() * 0.14) : h * (0.14 + rand() * 0.14);
    const r = Math.min(w, h) * (0.07 + rand() * 0.03);
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

  /* soft radiating light shafts from the sun through the sky, for a dramatic sunny/morning feel */
  function drawGodRays(ctx, w, h, rand, sun) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const rayCount = 5 + Math.floor(rand() * 3);
    const maxLen = Math.max(w, h) * 1.3;
    for (let i = 0; i < rayCount; i++) {
      const baseAngle = Math.PI / 2 + (rand() - 0.5) * 1.5;
      const spread = 0.05 + rand() * 0.05;
      const a1 = baseAngle - spread, a2 = baseAngle + spread;
      ctx.beginPath();
      ctx.moveTo(sun.cx, sun.cy);
      ctx.lineTo(sun.cx + Math.cos(a1) * maxLen, sun.cy + Math.sin(a1) * maxLen);
      ctx.lineTo(sun.cx + Math.cos(a2) * maxLen, sun.cy + Math.sin(a2) * maxLen);
      ctx.closePath();
      const g = ctx.createRadialGradient(sun.cx, sun.cy, 0, sun.cx, sun.cy, maxLen);
      g.addColorStop(0, 'rgba(255,240,190,0.14)');
      g.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.restore();
  }

  /* sparkle highlights scattered across wave crests when the sun is out */
  function drawWaterGlitter(ctx, w, h, rand, horizonY) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const count = 40;
    for (let i = 0; i < count; i++) {
      const x = rand() * w;
      const y = horizonY + rand() * (h - horizonY);
      const len = 3 + rand() * 8;
      ctx.strokeStyle = `rgba(255,255,255,${0.25 + rand() * 0.35})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - len / 2, y); ctx.lineTo(x + len / 2, y); ctx.stroke();
    }
    ctx.restore();
  }

  /* a low, soft band of mist hugging the ground for atmosphere */
  function drawGroundMist(ctx, w, h, rand, horizonY, rgb) {
    const bandTop = horizonY - h * 0.03;
    const bandH = h * 0.16;
    const g = ctx.createLinearGradient(0, bandTop, 0, bandTop + bandH);
    g.addColorStop(0, `rgba(${rgb},0)`);
    g.addColorStop(0.5, `rgba(${rgb},0.28)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, bandTop, w, bandH);
  }

  /* white dusting on top of forest canopy / mountain ridge when it's snowing */
  function drawSnowCaps(ctx, w, h, rand, envCat, horizon) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (envCat === 'forest') {
      const count = 14;
      for (let i = 0; i < count; i++) {
        const x = rand() * w;
        const y = horizon - rand() * h * 0.09;
        const r = h * (0.012 + rand() * 0.018);
        ctx.fillStyle = `rgba(255,255,255,${0.35 + rand() * 0.3})`;
        ctx.beginPath(); ctx.ellipse(x, y, r * 1.4, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      }
    } else if (envCat === 'mountain') {
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      const peaks = 5;
      for (let i = 0; i <= peaks; i++) {
        const x = (w / peaks) * i;
        const peakH = horizon - (h * 0.14 + rand() * h * 0.1);
        ctx.lineTo(x, i % 2 === 0 ? peakH : horizon - h * 0.03);
      }
      ctx.lineTo(w, horizon);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
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

  /* rolling sand dunes with a warm gradient wash, plus a couple of low silhouette bumps
     to suggest distant dunes without needing a whole extra rendering pass */
  function drawDesert(ctx, w, h, rand) {
    const horizon = h * 0.64;
    const g = ctx.createLinearGradient(0, horizon, 0, h);
    g.addColorStop(0, '#e8b672');
    g.addColorStop(0.5, '#d99a52');
    g.addColorStop(1, '#b5793a');
    ctx.fillStyle = g;
    ctx.fillRect(0, horizon, w, h - horizon);
    const dunes = 3;
    for (let i = 0; i < dunes; i++) {
      const y = horizon + h * (0.06 + i * 0.1) + (rand() - 0.5) * h * 0.02;
      const amp = h * (0.02 + rand() * 0.02);
      ctx.fillStyle = `rgba(${120 - i * 10},${80 - i * 8},${40 - i * 4},${0.25 + i * 0.12})`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 20) ctx.lineTo(x, y + Math.sin(x * 0.006 + i) * amp);
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
      ctx.fill();
    }
    return horizon;
  }

  /* thin diagonal streaks suggesting a gust of wind, plus a few drifting particles */
  function drawWind(ctx, w, h, rand) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineCap = 'round';
    for (let i = 0; i < 18; i++) {
      const y = rand() * h;
      const x = rand() * w;
      const len = w * (0.06 + rand() * 0.1);
      ctx.lineWidth = 1 + rand() * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + len * 0.5, y - len * 0.08, x + len, y + len * 0.03);
      ctx.stroke();
    }
    ctx.restore();
  }

  const AUTUMN_CANOPY = ['193,68,14', '224,135,30', '242,177,52', '182,36,79'];

  function drawForest(ctx, w, h, rand, autumn) {
    const horizon = h * 0.7;
    ctx.fillStyle = autumn ? 'rgba(48,26,18,0.55)' : 'rgba(24,40,30,0.55)';
    ctx.fillRect(0, horizon - h * 0.05, w, h * 0.05);
    ctx.fillStyle = autumn ? 'rgba(30,14,10,0.92)' : 'rgba(10,20,14,0.92)';
    ctx.fillRect(0, horizon, w, h - horizon);
    const count = 10 + Math.floor(rand() * 6);
    for (let i = 0; i < count; i++) {
      const x = rand() * w;
      const depth = rand();
      const trunkH = h * (0.07 + depth * 0.09);
      const y = horizon - depth * h * 0.06;
      const r = h * (0.04 + depth * 0.055);
      const shade = 6 + Math.floor(depth * 10);
      ctx.strokeStyle = autumn ? `rgba(${40 + shade},${20 + shade},${shade},0.9)` : `rgba(${shade},${shade + 8},${shade + 4},0.9)`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - trunkH); ctx.stroke();
      if (autumn) {
        const c = AUTUMN_CANOPY[Math.floor(rand() * AUTUMN_CANOPY.length)];
        ctx.fillStyle = `rgba(${c},${0.65 + depth * 0.3})`;
      } else {
        ctx.fillStyle = `rgba(${shade},${shade + 10},${shade + 4},0.94)`;
      }
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

  /* thick, layered fog banks that soften everything behind them — much stronger than the
     thin horizon haze used for ordinary depth cueing */
  function drawFog(ctx, w, h, rand) {
    const bands = 4;
    for (let i = 0; i < bands; i++) {
      const y = h * (0.35 + i * 0.15) + (rand() - 0.5) * h * 0.06;
      const bandH = h * (0.14 + rand() * 0.08);
      const g = ctx.createLinearGradient(0, y - bandH / 2, 0, y + bandH / 2);
      g.addColorStop(0, 'rgba(225,230,236,0)');
      g.addColorStop(0.5, `rgba(225,230,236,${0.32 + rand() * 0.18})`);
      g.addColorStop(1, 'rgba(225,230,236,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y - bandH / 2, w, bandH);
    }
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = 'rgba(220,225,232,1)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /* a single bright flash line + brief screen-wide glow, standing in for a lightning strike */
  function drawThunder(ctx, w, h, rand) {
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = 'rgba(230,240,255,1)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    let x = w * (0.2 + rand() * 0.6), y = 0;
    ctx.strokeStyle = 'rgba(240,245,255,0.85)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    while (y < h * 0.55) {
      x += (rand() - 0.5) * w * 0.09;
      y += h * (0.06 + rand() * 0.05);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  /* a soft, wide color-banded arc, only drawn for daylight scenes */
  function drawRainbow(ctx, w, h, rand) {
    const cx = w * 0.5, cy = h * 0.78, r = Math.min(w, h) * (0.55 + rand() * 0.1);
    const bands = ['239,68,68', '245,158,11', '250,204,21', '34,197,94', '59,130,246', '139,92,246'];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    bands.forEach((c, i) => {
      ctx.strokeStyle = `rgba(${c},0.32)`;
      ctx.lineWidth = r * 0.028;
      ctx.beginPath();
      ctx.arc(cx, cy, r - i * r * 0.03, Math.PI, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();
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

  /* small fish shapes near the water surface — only meaningful over an ocean/lake scene */
  function drawFish(ctx, w, h, rand, count, horizonY) {
    const bandTop = horizonY + (h - horizonY) * 0.15;
    const bandBottom = horizonY + (h - horizonY) * 0.7;
    for (let i = 0; i < count; i++) {
      const x = rand() * w, y = bandTop + rand() * (bandBottom - bandTop), s = 5 + rand() * 6;
      const dir = rand() > 0.5 ? 1 : -1;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(dir, 1);
      ctx.fillStyle = `rgba(255,${180 + Math.floor(rand() * 50)},${90 + Math.floor(rand() * 40)},0.75)`;
      ctx.beginPath();
      ctx.moveTo(-s, 0);
      ctx.quadraticCurveTo(0, -s * 0.55, s, 0);
      ctx.quadraticCurveTo(0, s * 0.55, -s, 0);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-s, 0); ctx.lineTo(-s * 1.5, -s * 0.4); ctx.lineTo(-s * 1.5, s * 0.4); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  /* a few small butterflies, fluttering near flowers or just scattered in the frame */
  function drawButterfly(ctx, w, h, rand, count) {
    const palette = ['251,146,60', '236,72,153', '250,204,21', '167,139,250'];
    for (let i = 0; i < count; i++) {
      const x = w * (0.15 + rand() * 0.7), y = h * (0.35 + rand() * 0.4), s = 5 + rand() * 5;
      const color = palette[Math.floor(rand() * palette.length)];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((rand() - 0.5) * 0.6);
      ctx.fillStyle = `rgba(${color},0.85)`;
      [-1, 1].forEach((side) => {
        ctx.beginPath();
        ctx.ellipse(side * s * 0.55, -s * 0.35, s * 0.55, s * 0.4, side * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(side * s * 0.45, s * 0.35, s * 0.4, s * 0.32, side * -0.4, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.strokeStyle = 'rgba(20,20,25,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -s * 0.6); ctx.lineTo(0, s * 0.6); ctx.stroke();
      ctx.restore();
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
    } else if (kind === 'cat' || kind === 'dog' || kind === 'rabbit') {
      const bodyW = scale * (kind === 'rabbit' ? 0.7 : 0.92), bodyH = scale * (kind === 'rabbit' ? 0.48 : 0.55);
      // legs
      ctx.fillStyle = 'rgba(10,10,16,0.92)';
      [-0.32, -0.05, 0.18, 0.4].forEach((off) => {
        ctx.beginPath();
        ctx.ellipse(cx + bodyW * off, groundY - scale * 0.06, scale * 0.055, scale * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      // body
      ctx.beginPath(); ctx.ellipse(cx, groundY - bodyH * 0.62, bodyW * 0.5, bodyH * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      const headR = scale * (kind === 'rabbit' ? 0.24 : 0.28);
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
      } else if (kind === 'rabbit') {
        // tall, slightly curved upright ears
        ctx.ellipse(headX - headR * 0.35, headY - headR * 1.9, headR * 0.22, headR * 1.1, -0.12, 0, Math.PI * 2);
        ctx.ellipse(headX + headR * 0.35, headY - headR * 1.9, headR * 0.22, headR * 1.1, 0.12, 0, Math.PI * 2);
      } else {
        ctx.ellipse(headX - headR * 0.6, headY - headR * 0.3, headR * 0.28, headR * 0.5, -0.3, 0, Math.PI * 2);
        ctx.ellipse(headX + headR * 0.7, headY - headR * 0.3, headR * 0.28, headR * 0.5, 0.3, 0, Math.PI * 2);
      }
      ctx.fill();
      // snout
      ctx.beginPath();
      ctx.ellipse(headX + headR * 0.75, headY + headR * 0.15, headR * (kind === 'rabbit' ? 0.22 : 0.32), headR * (kind === 'rabbit' ? 0.16 : 0.22), 0, 0, Math.PI * 2);
      ctx.fill();
      // tail: a small round puff for rabbits, a curved sweep for cat/dog
      ctx.beginPath();
      if (kind === 'rabbit') {
        ctx.arc(cx - bodyW * 0.48, groundY - bodyH * 0.7, scale * 0.09, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.moveTo(cx - bodyW * 0.5, groundY - bodyH * 0.75);
        ctx.quadraticCurveTo(cx - bodyW * 0.95, groundY - bodyH * 1.35, cx - bodyW * 0.62, groundY - bodyH * 0.15);
        ctx.lineWidth = scale * 0.08;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(10,10,16,0.9)';
        ctx.stroke();
      }
    }
    return { cx, groundY, scale };
  }

  /* a simple open umbrella held above a person's head, for rain scenes */
  function drawUmbrella(ctx, cx, groundY, scale, rand) {
    const topY = groundY - scale * 1.85;
    const r = scale * 0.42;
    const color = ['#e63946', '#2a9d8f', '#457b9d', '#f4a261'][Math.floor(rand() * 4)];
    ctx.save();
    ctx.strokeStyle = 'rgba(20,20,25,0.85)';
    ctx.lineWidth = scale * 0.05;
    ctx.beginPath(); ctx.moveTo(cx, topY); ctx.lineTo(cx, groundY - scale * 0.5); ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - r, topY);
    ctx.quadraticCurveTo(cx, topY - r * 0.9, cx + r, topY);
    for (let i = 3; i >= 1; i--) {
      const x = cx - r + (r * 2 * i) / 4;
      ctx.quadraticCurveTo(x - r * 0.25, topY + r * 0.18, x, topY);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
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

  /* very light paper-like grain so flat fills read as painted rather than vector-flat */
  let grainTile = null;
  function getGrainTile() {
    if (grainTile) return grainTile;
    const size = 96;
    grainTile = document.createElement('canvas');
    grainTile.width = size; grainTile.height = size;
    const gctx = grainTile.getContext('2d');
    const imgData = gctx.createImageData(size, size);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.floor(Math.random() * 255);
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
    }
    gctx.putImageData(imgData, 0, 0);
    return grainTile;
  }
  function drawGrain(ctx, w, h) {
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = ctx.createPattern(getGrainTile(), 'repeat');
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
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
    const envCat = pickTop(counts, ['ocean', 'mountain', 'forest', 'city', 'desert']);
    const weatherCats = pickAll(counts, ['snow', 'rain', 'fire', 'fog', 'thunder', 'wind']);
    const celestialCat = pickTop(counts, ['sun', 'moon']);
    const flowerOn = counts.flower > 0;
    const birdOn = counts.bird > 0;
    const fishOn = counts.fish > 0;
    const butterflyOn = counts.butterfly > 0;
    const rainbowOn = counts.rainbow > 0;
    const autumnOn = counts.autumn > 0;
    const umbrellaOn = counts.umbrella > 0;
    const animalKind = pickTop(counts, ['cat', 'dog', 'rabbit', 'person']);
    const starsOn = counts.stars > 0 || timeCat === 'timeNight';
    const tone = TIME_TONE[timeCat] || TIME_TONE.neutral;

    /* 1. sky */
    drawSky(ctx, w, h, timeCat, palette[0]);

    /* 2. celestial + clouds (behind landscape) */
    if (starsOn) drawStars(ctx, w, h, rand, 40 + Math.floor(rand() * 40));
    let celestial = null;
    if (celestialCat) {
      const lowInSky = timeCat === 'timeSunset' || timeCat === 'timeMorning';
      celestial = drawSunOrMoon(ctx, w, h, rand, celestialCat === 'sun', lowInSky);
    }
    if (timeCat === 'timeDay' || timeCat === 'timeMorning' || timeCat === 'timeSunset') {
      drawClouds(ctx, w, h, rand, tone);
    }
    if (celestialCat === 'sun' && (timeCat === 'timeDay' || timeCat === 'timeMorning' || timeCat === 'timeSunset')) {
      drawGodRays(ctx, w, h, rand, celestial);
    }
    if (rainbowOn && timeCat !== 'timeNight') drawRainbow(ctx, w, h, rand);

    /* 3. landscape silhouette, blended into the sky at the horizon for depth */
    let horizon = null;
    if (envCat === 'ocean') { drawHorizonHaze(ctx, w, h, h * 0.62, tone.shadow); horizon = drawOcean(ctx, w, h, rand); }
    else if (envCat === 'mountain') { drawHorizonHaze(ctx, w, h, h * 0.66, tone.shadow); horizon = drawMountain(ctx, w, h, rand); }
    else if (envCat === 'forest') { drawHorizonHaze(ctx, w, h, h * 0.7, tone.shadow); horizon = drawForest(ctx, w, h, rand, autumnOn); }
    else if (envCat === 'city') { drawHorizonHaze(ctx, w, h, h * 0.68, tone.shadow); horizon = drawCity(ctx, w, h, rand); }
    else if (envCat === 'desert') { drawHorizonHaze(ctx, w, h, h * 0.64, tone.shadow); horizon = drawDesert(ctx, w, h, rand); }

    if (envCat === 'ocean' && celestial) drawWaterReflection(ctx, w, h, horizon, celestial);
    if (envCat === 'ocean' && celestialCat === 'sun') drawWaterGlitter(ctx, w, h, rand, horizon);
    if (envCat === 'ocean' && fishOn && horizon !== null) {
      drawFish(ctx, w, h, rand, Math.min(8, 2 + counts.fish + Math.floor(rand() * 2)), horizon);
    }
    if (horizon !== null && (envCat === 'forest' || envCat === 'mountain') && timeCat !== 'timeNight') {
      drawGroundMist(ctx, w, h, rand, horizon, tone.light);
    }

    /* 4. weather overlay(s) — every mentioned weather condition renders, not just one */
    weatherCats.forEach((wc) => {
      if (wc === 'rain') drawRain(ctx, w, h, rand);
      else if (wc === 'snow') { drawSnow(ctx, w, h, rand); if (horizon !== null) drawSnowCaps(ctx, w, h, rand, envCat, horizon); }
      else if (wc === 'fire') drawFire(ctx, w, h, rand);
      else if (wc === 'fog') drawFog(ctx, w, h, rand);
      else if (wc === 'thunder') drawThunder(ctx, w, h, rand);
      else if (wc === 'wind') drawWind(ctx, w, h, rand);
    });

    /* 5. subject motifs — flowers, birds, and an animal/person can all coexist */
    if (birdOn) {
      const birdCount = Math.min(9, 2 + counts.bird + Math.floor(rand() * 2));
      drawBird(ctx, w, h, rand, birdCount);
    }
    if (butterflyOn) {
      const butterflyCount = Math.min(7, 2 + counts.butterfly + Math.floor(rand() * 2));
      drawButterfly(ctx, w, h, rand, butterflyCount);
    }
    if (flowerOn) {
      const flowerCount = Math.min(9, Math.max(1, counts.flower + Math.floor(rand() * 3)));
      for (let i = 0; i < flowerCount; i++) drawFlower(ctx, w, h, rand, i, flowerCount);
    }
    if (animalKind) {
      const placed = drawSilhouette(ctx, w, h, rand, animalKind, 0, 1, tone.light);
      if (animalKind === 'person' && umbrellaOn && placed) {
        drawUmbrella(ctx, placed.cx, placed.groundY, placed.scale, rand);
      }
    }

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

    // a last whisper of paper grain so the piece reads as painted, not flat vector art
    drawGrain(ctx, w, h);

    return { mood, key, categories: counts, scene: { timeCat, envCat, weatherCats, celestialCat, flowerOn, birdOn, fishOn, butterflyOn, rainbowOn, autumnOn, umbrellaOn, animalKind } };
  }

  return { generate, scoreText };
})();
