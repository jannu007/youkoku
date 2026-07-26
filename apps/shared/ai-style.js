/* ============================================================
   AI Records — lightweight AI style finish for Lumen.
   Uses Google Magenta's ArbitraryStyleTransferNetwork (@magenta/image,
   ~12MB total: a 9.6MB style-prediction net + a 2.4MB style-transfer
   net), running on TensorFlow.js. Runs via WebGL when available and
   falls back to CPU otherwise — no WebGPU dependency, no multi-GB
   download, so none of the crash/stall risk that ai-image-gen.js hit.
   This is deliberately a *finishing* filter, not a generator: it takes
   whatever is already on the canvas (procedural art or an uploaded
   photo) as the "content" image and blends in the texture of a small
   built-in "style" image, produced procedurally here (a few abstract
   brushstroke/wash textures) so there's no artwork-licensing question.
   ============================================================ */
window.YoukokuAIStyle = (() => {
  const LIB_URL = 'https://cdn.jsdelivr.net/npm/@magenta/image@0.2.1';
  const STYLE_SIZE = 256;

  let model = null;
  let loadingPromise = null;
  let styleCache = {};

  function isSupported() {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl') || c.getContext('experimental-webgl') || c.getContext('2d'));
    } catch (e) {
      return false;
    }
  }

  function isReady() { return !!model; }

  /* ---------- procedural style textures (no external artwork, no licensing risk) ---------- */
  const STYLES = {
    watercolor: { labelKey: 'lumen.tool.aiStyleWatercolor', build: buildWatercolor },
    oil: { labelKey: 'lumen.tool.aiStyleOil', build: buildOil },
    ink: { labelKey: 'lumen.tool.aiStyleInk', build: buildInk },
  };

  function getStyleKeys() { return Object.keys(STYLES); }

  function buildWatercolor(seed) {
    const c = document.createElement('canvas');
    c.width = STYLE_SIZE; c.height = STYLE_SIZE;
    const ctx = c.getContext('2d');
    const rand = mulberry32(seed);
    const palette = ['#f7d9a8', '#a8386b', '#2f8fdb', '#78bdec', '#e0703f'];
    ctx.fillStyle = '#fdf6ec';
    ctx.fillRect(0, 0, STYLE_SIZE, STYLE_SIZE);
    for (let i = 0; i < 26; i++) {
      const x = rand() * STYLE_SIZE, y = rand() * STYLE_SIZE, r = 24 + rand() * 60;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const color = palette[Math.floor(rand() * palette.length)];
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    return c;
  }

  function buildOil(seed) {
    const c = document.createElement('canvas');
    c.width = STYLE_SIZE; c.height = STYLE_SIZE;
    const ctx = c.getContext('2d');
    const rand = mulberry32(seed);
    const palette = ['#e63946', '#f1a208', '#1d3557', '#2a9d8f', '#f4a261'];
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, STYLE_SIZE, STYLE_SIZE);
    for (let i = 0; i < 180; i++) {
      const x = rand() * STYLE_SIZE, y = rand() * STYLE_SIZE;
      const len = 10 + rand() * 26, angle = rand() * Math.PI * 2;
      ctx.strokeStyle = palette[Math.floor(rand() * palette.length)];
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 3 + rand() * 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return c;
  }

  function buildInk(seed) {
    const c = document.createElement('canvas');
    c.width = STYLE_SIZE; c.height = STYLE_SIZE;
    const ctx = c.getContext('2d');
    const rand = mulberry32(seed);
    ctx.fillStyle = '#f5f2ea';
    ctx.fillRect(0, 0, STYLE_SIZE, STYLE_SIZE);
    ctx.strokeStyle = 'rgba(20,20,25,0.65)';
    for (let pass = 0; pass < 2; pass++) {
      const angle = pass === 0 ? 0.6 : -0.6;
      ctx.lineWidth = 1.2;
      for (let i = -STYLE_SIZE; i < STYLE_SIZE * 2; i += 7 + rand() * 3) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + STYLE_SIZE * Math.tan(angle), STYLE_SIZE);
        ctx.stroke();
      }
    }
    return c;
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

  function getStyleImage(key) {
    if (styleCache[key]) return styleCache[key];
    const def = STYLES[key];
    if (!def) throw new Error(`unknown-style:${key}`);
    const img = def.build(hashKey(key));
    styleCache[key] = img;
    return img;
  }

  function hashKey(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return h >>> 0;
  }

  /* ---------- load the model (lazy, on first use) ---------- */
  async function loadModel(onProgress) {
    if (model) return;
    if (loadingPromise) return loadingPromise;
    const report = (stage) => { if (onProgress) onProgress({ stage }); };

    loadingPromise = (async () => {
      report('loading-library');
      if (!window.mi) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = LIB_URL;
          script.onload = resolve;
          script.onerror = () => reject(new Error('library-load-failed'));
          document.head.appendChild(script);
        });
      }
      if (!window.mi || !window.mi.ArbitraryStyleTransferNetwork) {
        throw new Error('library-unavailable');
      }
      report('loading-model');
      model = new window.mi.ArbitraryStyleTransferNetwork();
      await model.initialize();
      report('ready');
    })();

    try {
      await loadingPromise;
    } catch (e) {
      model = null;
      throw e;
    } finally {
      loadingPromise = null;
    }
  }

  /* real photos (e.g. a phone camera's ~6000x5120 shot) can exceed the GPU's max WebGL
     texture size — one real-device failure was "texture size [6000x5120] greater than
     WebGL maximum ... [4096x4096]". 2048 is comfortably under even conservative mobile GPU
     limits, so the content image handed to the model is capped there; the result still gets
     rescaled back up to the caller's original canvas size in applyStyle below. */
  const MAX_STYLIZE_DIM = 2048;
  function downscaleForStylize(canvas) {
    const longest = Math.max(canvas.width, canvas.height);
    if (longest <= MAX_STYLIZE_DIM) return canvas;
    const scale = MAX_STYLIZE_DIM / longest;
    const small = document.createElement('canvas');
    small.width = Math.max(1, Math.round(canvas.width * scale));
    small.height = Math.max(1, Math.round(canvas.height * scale));
    small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
    return small;
  }

  /* ---------- apply a style to whatever is currently on a canvas ----------
     The model's output resolution doesn't necessarily match the input's, so the result is
     always rescaled back onto a fresh canvas at the original width/height rather than
     resizing the caller's canvas — callers that redraw from a stored "source" image (as
     Lumen's non-destructive render() does) shouldn't see the canvas's own dimensions change
     out from under them. Returns a new canvas the caller can use as its next source image;
     it never reads from and writes to the same canvas in the same operation. */
  /* the real-device debug dump showed canvas/content/style all at sane sizes (1200x800,
     1200x800, 256x256) yet the old bundled tfjs inside @magenta/image@0.2.1 still requested
     a fixed [6000x5120] texture — on a device reporting devicePixelRatio=3.5. That old
     (~2018) WebGL backend is a known-era source of devicePixelRatio-related canvas texture
     bugs, so as a targeted experiment: temporarily force devicePixelRatio to 1 for the
     duration of the stylize() call (some environments allow redefining it; if not, this is
     a harmless no-op) to see whether that's actually what's driving the oversized request. */
  function withForcedDevicePixelRatio(fn) {
    let restore = null;
    try {
      const original = window.devicePixelRatio;
      if (original !== 1) {
        Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
        restore = () => Object.defineProperty(window, 'devicePixelRatio', { value: original, configurable: true });
      }
    } catch (e) { /* non-configurable in this browser — proceed without the override */ }
    return fn().finally(() => { if (restore) restore(); });
  }

  async function applyStyle(canvas, styleKey, strength) {
    if (!model) throw new Error('model-not-loaded');
    const styleImg = getStyleImage(styleKey);
    const content = downscaleForStylize(canvas);
    let imageData;
    try {
      imageData = await withForcedDevicePixelRatio(() => model.stylize(content, styleImg));
    } catch (e) {
      // diagnostic: the real-device failures reported a fixed [6000x5120] texture
      // request regardless of actual content size, which none of canvas/content/style
      // dimensions here should ever produce — surfacing all of them to find the mismatch.
      const de = document.documentElement;
      const dims = `canvas=${canvas.width}x${canvas.height} content=${content.width}x${content.height} `
        + `style=${styleImg.width}x${styleImg.height} dpr=${window.devicePixelRatio} `
        + `window=${window.innerWidth}x${window.innerHeight} `
        + `doc=${de.scrollWidth}x${de.scrollHeight} body=${document.body.scrollWidth}x${document.body.scrollHeight}`;
      const msg = (e && e.message) || String(e);
      throw new Error(`${msg} [debug: ${dims}]`);
    }
    const mix = Math.max(0, Math.min(1, strength == null ? 1 : strength));

    const stylized = document.createElement('canvas');
    stylized.width = imageData.width; stylized.height = imageData.height;
    stylized.getContext('2d').putImageData(imageData, 0, 0);

    const result = document.createElement('canvas');
    result.width = canvas.width; result.height = canvas.height;
    const rctx = result.getContext('2d');
    rctx.drawImage(canvas, 0, 0, canvas.width, canvas.height);
    rctx.save();
    rctx.globalAlpha = mix;
    rctx.drawImage(stylized, 0, 0, stylized.width, stylized.height, 0, 0, canvas.width, canvas.height);
    rctx.restore();
    return result;
  }

  return { isSupported, isReady, loadModel, applyStyle, getStyleKeys, STYLES };
})();
