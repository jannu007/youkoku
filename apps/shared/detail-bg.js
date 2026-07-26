(() => {
  'use strict';

  /* ---------- dynamic per-app background ----------
     Reads window.YOUKOKU_BG_THEMES (an array of {type, colors} set inline
     by each app's detail page) and renders one, chosen at random on load,
     as a fixed full-page canvas behind the content — mirroring the
     homepage's randomized space/nature background but themed to match
     each app's own identity and accent colors. */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.getElementById('bgCanvas');
  const themes = window.YOUKOKU_BG_THEMES;
  if (!canvas || !themes || !themes.length || reduceMotion) return;

  const ctx = canvas.getContext('2d');
  const BASE = '#070c26';
  let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  let running = true, raf = null;

  function resize() {
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const chosen = themes[Math.floor(Math.random() * themes.length)];
  const colors = chosen.colors;
  const pick = () => colors[Math.floor(Math.random() * colors.length)];
  let state = {};

  /* ---- bokeh: soft glowing color orbs drifting and pulsing ---- */
  function initBokeh() {
    const count = Math.round((w * h) / 16000);
    state.orbs = Array.from({ length: Math.min(count, 40) }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: Math.random() * 70 + 40,
      c: pick(),
      vx: (Math.random() - 0.5) * 0.12, vy: (Math.random() - 0.5) * 0.12,
      a: Math.random() * 0.14 + 0.06,
      pulse: Math.random() * Math.PI * 2, pulseSpeed: Math.random() * 0.01 + 0.004,
    }));
  }
  function drawBokeh() {
    ctx.fillStyle = BASE;
    ctx.fillRect(0, 0, w, h);
    state.orbs.forEach((o) => {
      o.x += o.vx; o.y += o.vy;
      o.pulse += o.pulseSpeed;
      if (o.x < -o.r) o.x = w + o.r; if (o.x > w + o.r) o.x = -o.r;
      if (o.y < -o.r) o.y = h + o.r; if (o.y > h + o.r) o.y = -o.r;
      const r = o.r * (0.85 + 0.15 * Math.sin(o.pulse));
      const alpha = o.a * (0.7 + 0.3 * Math.sin(o.pulse));
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r);
      g.addColorStop(0, `rgba(${o.c},${alpha})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(o.x - r, o.y - r, r * 2, r * 2);
    });
  }

  /* ---- streaks: diagonal light-trail streaks sweeping across ---- */
  function spawnStreak() {
    return {
      x: -200 - Math.random() * 200, y: Math.random() * h,
      len: 140 + Math.random() * 220,
      speed: 1.4 + Math.random() * 2.4,
      thickness: Math.random() * 2 + 0.6,
      c: pick(), a: Math.random() * 0.35 + 0.18,
      angle: -0.14 + Math.random() * 0.06,
    };
  }
  function initStreaks() {
    const count = Math.round(h / 70);
    state.streaks = Array.from({ length: Math.min(count, 14) }, spawnStreak);
    state.primed = false;
  }
  function drawStreaks() {
    if (!state.primed) { ctx.fillStyle = BASE; ctx.fillRect(0, 0, w, h); state.primed = true; }
    ctx.fillStyle = 'rgba(7,12,38,0.14)';
    ctx.fillRect(0, 0, w, h);
    state.streaks.forEach((s) => {
      s.x += s.speed * Math.cos(s.angle);
      s.y += s.speed * Math.sin(s.angle);
      if (s.x > w + s.len) Object.assign(s, spawnStreak());
      const dx = Math.cos(s.angle) * s.len, dy = Math.sin(s.angle) * s.len;
      const grad = ctx.createLinearGradient(s.x - dx, s.y - dy, s.x, s.y);
      grad.addColorStop(0, `rgba(${s.c},0)`);
      grad.addColorStop(1, `rgba(${s.c},${s.a})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = s.thickness;
      ctx.beginPath();
      ctx.moveTo(s.x - dx, s.y - dy);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
    });
  }

  /* ---- ripple: concentric sound-wave circles expanding outward ---- */
  function spawnRipple() {
    return { x: Math.random() * w, y: Math.random() * h, r: 0, maxR: 160 + Math.random() * 220, a: 0.4, c: pick() };
  }
  function initRipple() {
    state.ripples = [];
    state.timer = 10;
  }
  function drawRipple() {
    ctx.fillStyle = 'rgba(7,12,38,0.16)';
    ctx.fillRect(0, 0, w, h);
    state.timer -= 1;
    if (state.timer <= 0 && state.ripples.length < 6) {
      state.ripples.push(spawnRipple());
      state.timer = 40 + Math.random() * 70;
    }
    state.ripples = state.ripples.filter((r) => r.r < r.maxR);
    state.ripples.forEach((r) => {
      r.r += 1.1;
      const alpha = r.a * (1 - r.r / r.maxR);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${r.c},${alpha})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    });
  }

  /* ---- embers: warm particles drifting upward with flicker ---- */
  function initEmbers() {
    const count = Math.round((w * h) / 9000);
    state.embers = Array.from({ length: Math.min(count, 90) }, () => ({
      x: Math.random() * w, y: Math.random() * h * 1.3 - h * 0.15,
      r: Math.random() * 2 + 0.6,
      vy: -(Math.random() * 0.35 + 0.12), vx: (Math.random() - 0.5) * 0.15,
      flicker: Math.random() * Math.PI * 2, flickerSpeed: Math.random() * 0.05 + 0.02,
      c: pick(),
    }));
  }
  function drawEmbers() {
    ctx.fillStyle = BASE;
    ctx.fillRect(0, 0, w, h);
    state.embers.forEach((e) => {
      e.x += e.vx; e.y += e.vy;
      e.flicker += e.flickerSpeed;
      if (e.y < -10) { e.y = h + 10; e.x = Math.random() * w; }
      const a = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(e.flicker));
      const r = e.r * 3.5;
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
      g.addColorStop(0, `rgba(${e.c},${a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(e.x - r, e.y - r, r * 2, r * 2);
    });
  }

  /* ---- wire: drifting perspective grid + floating wireframe polygons ---- */
  function initWire() {
    state.gridPhase = 0;
    state.polys = Array.from({ length: 6 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      size: 40 + Math.random() * 70, rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.006,
      vx: (Math.random() - 0.5) * 0.15, vy: (Math.random() - 0.5) * 0.15,
      sides: 3 + Math.floor(Math.random() * 4), c: pick(),
    }));
  }
  function drawWire() {
    ctx.fillStyle = BASE;
    ctx.fillRect(0, 0, w, h);
    state.gridPhase += 0.15;
    const spacing = 46;
    ctx.strokeStyle = `rgba(${colors[0]},0.10)`;
    ctx.lineWidth = 1;
    for (let y = (state.gridPhase % spacing) - spacing; y < h; y += spacing) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    for (let x = 0; x < w; x += spacing * 1.6) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    state.polys.forEach((p) => {
      p.x += p.vx; p.y += p.vy; p.rot += p.rotSpeed;
      if (p.x < -p.size) p.x = w + p.size; if (p.x > w + p.size) p.x = -p.size;
      if (p.y < -p.size) p.y = h + p.size; if (p.y > h + p.size) p.y = -p.size;
      ctx.beginPath();
      for (let i = 0; i <= p.sides; i++) {
        const a = p.rot + (i / p.sides) * Math.PI * 2;
        const px = p.x + Math.cos(a) * p.size, py = p.y + Math.sin(a) * p.size;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = `rgba(${p.c},0.35)`;
      ctx.lineWidth = 1.3;
      ctx.stroke();
    });
  }

  /* ---- petals: drifting flower petals falling and swaying ---- */
  function spawnPetal() {
    return {
      x: Math.random() * w, y: -20 - Math.random() * h * 0.3,
      size: 7 + Math.random() * 12,
      rot: Math.random() * Math.PI * 2, rotSpeed: (Math.random() - 0.5) * 0.03,
      vy: 0.35 + Math.random() * 0.55,
      swayPhase: Math.random() * Math.PI * 2, swaySpeed: 0.012 + Math.random() * 0.018, swayAmp: 18 + Math.random() * 28,
      c: pick(), a: 0.3 + Math.random() * 0.35,
    };
  }
  function initPetals() {
    const count = Math.round((w * h) / 24000);
    state.petals = Array.from({ length: Math.min(count, 46) }, spawnPetal);
  }
  function drawPetalShape(x, y, size, rot, c, a) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.bezierCurveTo(size * 0.7, -size * 0.5, size * 0.7, size * 0.5, 0, size);
    ctx.bezierCurveTo(-size * 0.7, size * 0.5, -size * 0.7, -size * 0.5, 0, -size);
    ctx.closePath();
    ctx.fillStyle = `rgba(${c},${a})`;
    ctx.fill();
    ctx.restore();
  }
  function drawPetals() {
    ctx.fillStyle = BASE;
    ctx.fillRect(0, 0, w, h);
    state.petals.forEach((p) => {
      p.y += p.vy;
      p.rot += p.rotSpeed;
      p.swayPhase += p.swaySpeed;
      const x = p.x + Math.sin(p.swayPhase) * p.swayAmp;
      drawPetalShape(x, p.y, p.size, p.rot, p.c, p.a);
      if (p.y > h + 20) Object.assign(p, spawnPetal(), { y: -20 });
    });
  }

  const initters = { bokeh: initBokeh, streaks: initStreaks, ripple: initRipple, embers: initEmbers, wire: initWire, petals: initPetals };
  const drawers = { bokeh: drawBokeh, streaks: drawStreaks, ripple: drawRipple, embers: drawEmbers, wire: drawWire, petals: drawPetals };
  const init = initters[chosen.type] || initBokeh;
  const draw = drawers[chosen.type] || drawBokeh;

  function tick() {
    if (!running) return;
    draw();
    raf = requestAnimationFrame(tick);
  }

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running && !raf) tick();
    if (!running && raf) { cancelAnimationFrame(raf); raf = null; }
  });

  window.addEventListener('resize', resize, { passive: true });
  resize();
  init();
  tick();
})();
