(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- loader ---------- */
  const loader = document.getElementById('loader');
  window.addEventListener('load', () => {
    setTimeout(() => loader.classList.add('done'), 450);
  });

  /* ---------- dynamic space/nature background ----------
     A full-page generative backdrop, chosen at random on each load from
     four themes (starfield/nebula, aurora, deep ocean, firefly forest),
     so the site never looks quite the same twice. */
  const bgCanvas = document.getElementById('bgCanvas');
  if (bgCanvas && !reduceMotion) {
    const bctx = bgCanvas.getContext('2d');
    let bw = 0, bh = 0, bdpr = Math.min(window.devicePixelRatio || 1, 2);
    let bgRunning = true, bgRaf = null;

    function bgResize() {
      bw = window.innerWidth; bh = window.innerHeight;
      bgCanvas.width = bw * bdpr; bgCanvas.height = bh * bdpr;
      bctx.setTransform(bdpr, 0, 0, bdpr, 0, 0);
    }

    const THEMES = ['starfield', 'aurora', 'ocean', 'forest'];
    const theme = THEMES[Math.floor(Math.random() * THEMES.length)];

    let stars = [], nebulae = [], auroraBands = [], bubbles = [], fireflies = [];
    let shootingStar = null;

    function makeStars() {
      const count = Math.round((bw * bh) / 3200);
      return Array.from({ length: Math.min(count, 260) }, () => ({
        x: Math.random() * bw, y: Math.random() * bh,
        r: Math.random() * 1.3 + 0.3,
        baseA: Math.random() * 0.6 + 0.25,
        tw: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.05 + 0.01,
        drift: Math.random() * 0.06 + 0.02,
      }));
    }
    function makeNebulae() {
      const palettes = [['139,92,246', '236,72,153'], ['34,211,238', '139,92,246'], ['236,72,153', '34,211,238']];
      return Array.from({ length: 2 }, () => {
        const p = palettes[Math.floor(Math.random() * palettes.length)];
        return {
          x: Math.random() * bw, y: Math.random() * bh,
          r: Math.max(bw, bh) * (0.35 + Math.random() * 0.25),
          c1: p[0], c2: p[1],
          vx: (Math.random() - 0.5) * 0.06, vy: (Math.random() - 0.5) * 0.06,
        };
      });
    }
    function makeAuroraBands() {
      const hues = ['139,92,246', '34,211,238', '45,212,191', '236,72,153'];
      return Array.from({ length: 3 }, (_, i) => ({
        y: bh * (0.15 + i * 0.16),
        amp: 30 + Math.random() * 40,
        len: 220 + Math.random() * 160,
        phase: Math.random() * Math.PI * 2,
        speed: 0.15 + Math.random() * 0.15,
        c: hues[(i + Math.floor(Math.random() * 2)) % hues.length],
      }));
    }
    function makeBubbles() {
      const count = Math.round((bw * bh) / 9000);
      return Array.from({ length: Math.min(count, 140) }, () => ({
        x: Math.random() * bw, y: Math.random() * bh,
        r: Math.random() * 3 + 1, speed: Math.random() * 0.35 + 0.15,
        sway: Math.random() * Math.PI * 2, swaySpeed: Math.random() * 0.02 + 0.01,
        a: Math.random() * 0.35 + 0.15,
      }));
    }
    function makeFireflies() {
      const count = Math.round((bw * bh) / 14000);
      return Array.from({ length: Math.min(count, 60) }, () => ({
        x: Math.random() * bw, y: Math.random() * bh,
        vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
        flicker: Math.random() * Math.PI * 2, flickerSpeed: Math.random() * 0.04 + 0.02,
        c: Math.random() < 0.5 ? '190,242,100' : '253,224,71',
      }));
    }

    function bgInit() {
      bgResize();
      stars = makeStars();
      nebulae = makeNebulae();
      auroraBands = makeAuroraBands();
      bubbles = makeBubbles();
      fireflies = makeFireflies();
    }

    function maybeSpawnShootingStar() {
      if (!shootingStar && Math.random() < 0.006) {
        shootingStar = {
          x: Math.random() * bw * 0.5, y: Math.random() * bh * 0.6,
          vx: 6 + Math.random() * 4, vy: 2 + Math.random() * 2, life: 1,
        };
      }
    }

    function drawStarfield() {
      const grad = bctx.createLinearGradient(0, 0, 0, bh);
      grad.addColorStop(0, '#05050f'); grad.addColorStop(1, '#0a0a18');
      bctx.fillStyle = grad; bctx.fillRect(0, 0, bw, bh);

      nebulae.forEach((n) => {
        n.x += n.vx; n.y += n.vy;
        if (n.x < -n.r) n.x = bw + n.r; if (n.x > bw + n.r) n.x = -n.r;
        if (n.y < -n.r) n.y = bh + n.r; if (n.y > bh + n.r) n.y = -n.r;
        const g = bctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
        g.addColorStop(0, `rgba(${n.c1},0.10)`);
        g.addColorStop(0.5, `rgba(${n.c2},0.05)`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        bctx.fillStyle = g;
        bctx.fillRect(0, 0, bw, bh);
      });

      stars.forEach((s) => {
        s.tw += s.speed;
        s.y += s.drift;
        if (s.y > bh + 2) { s.y = -2; s.x = Math.random() * bw; }
        const a = s.baseA * (0.6 + 0.4 * Math.sin(s.tw));
        bctx.beginPath();
        bctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        bctx.fillStyle = `rgba(255,255,255,${a})`;
        bctx.fill();
      });

      maybeSpawnShootingStar();
      if (shootingStar) {
        const s = shootingStar;
        bctx.strokeStyle = `rgba(255,255,255,${s.life})`;
        bctx.lineWidth = 1.4;
        bctx.beginPath();
        bctx.moveTo(s.x, s.y);
        bctx.lineTo(s.x - s.vx * 8, s.y - s.vy * 8);
        bctx.stroke();
        s.x += s.vx; s.y += s.vy; s.life -= 0.02;
        if (s.life <= 0 || s.x > bw || s.y > bh) shootingStar = null;
      }
    }

    function drawAurora() {
      const grad = bctx.createLinearGradient(0, 0, 0, bh);
      grad.addColorStop(0, '#04060c'); grad.addColorStop(1, '#070912');
      bctx.fillStyle = grad; bctx.fillRect(0, 0, bw, bh);

      bctx.globalCompositeOperation = 'lighter';
      auroraBands.forEach((band) => {
        band.phase += band.speed * 0.02;
        bctx.beginPath();
        bctx.moveTo(0, band.y);
        for (let x = 0; x <= bw; x += 20) {
          const y = band.y + Math.sin(x / band.len + band.phase) * band.amp;
          bctx.lineTo(x, y);
        }
        bctx.lineTo(bw, bh); bctx.lineTo(0, bh);
        bctx.closePath();
        const g = bctx.createLinearGradient(0, band.y - band.amp, 0, band.y + band.amp * 2);
        g.addColorStop(0, `rgba(${band.c},0.32)`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        bctx.fillStyle = g;
        bctx.fill();
      });
      bctx.globalCompositeOperation = 'source-over';

      stars.forEach((s) => {
        s.tw += s.speed;
        const a = s.baseA * 0.5 * (0.6 + 0.4 * Math.sin(s.tw));
        bctx.beginPath();
        bctx.arc(s.x, s.y * 0.5, s.r * 0.8, 0, Math.PI * 2);
        bctx.fillStyle = `rgba(255,255,255,${a})`;
        bctx.fill();
      });
    }

    function drawOcean() {
      const grad = bctx.createLinearGradient(0, 0, 0, bh);
      grad.addColorStop(0, '#03080d'); grad.addColorStop(1, '#04141a');
      bctx.fillStyle = grad; bctx.fillRect(0, 0, bw, bh);

      bubbles.forEach((b) => {
        b.y -= b.speed;
        b.sway += b.swaySpeed;
        if (b.y < -10) { b.y = bh + 10; b.x = Math.random() * bw; }
        const x = b.x + Math.sin(b.sway) * 12;
        bctx.beginPath();
        bctx.arc(x, b.y, b.r, 0, Math.PI * 2);
        bctx.fillStyle = `rgba(45,212,191,${b.a})`;
        bctx.fill();
      });
    }

    function drawForest() {
      const grad = bctx.createLinearGradient(0, 0, 0, bh);
      grad.addColorStop(0, '#040a06'); grad.addColorStop(1, '#020503');
      bctx.fillStyle = grad; bctx.fillRect(0, 0, bw, bh);

      fireflies.forEach((f) => {
        f.x += f.vx; f.y += f.vy;
        f.flicker += f.flickerSpeed;
        if (Math.random() < 0.01) { f.vx = (Math.random() - 0.5) * 0.3; f.vy = (Math.random() - 0.5) * 0.3; }
        if (f.x < 0) f.x = bw; if (f.x > bw) f.x = 0;
        if (f.y < 0) f.y = bh; if (f.y > bh) f.y = 0;
        const a = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(f.flicker));
        const g = bctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 6);
        g.addColorStop(0, `rgba(${f.c},${a})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        bctx.fillStyle = g;
        bctx.fillRect(f.x - 6, f.y - 6, 12, 12);
      });
    }

    const drawers = { starfield: drawStarfield, aurora: drawAurora, ocean: drawOcean, forest: drawForest };
    const draw = drawers[theme] || drawStarfield;

    function bgTick() {
      if (!bgRunning) return;
      draw();
      bgRaf = requestAnimationFrame(bgTick);
    }

    document.addEventListener('visibilitychange', () => {
      bgRunning = !document.hidden;
      if (bgRunning && !bgRaf) bgTick();
      if (!bgRunning && bgRaf) { cancelAnimationFrame(bgRaf); bgRaf = null; }
    });

    window.addEventListener('resize', bgResize, { passive: true });
    bgInit();
    bgTick();
  }

  /* ---------- header scroll state ---------- */
  const header = document.getElementById('header');
  const progressBar = document.getElementById('progressBar');

  const onScroll = () => {
    header.classList.toggle('scrolled', window.scrollY > 40);
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - doc.clientHeight;
    const pct = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
    progressBar.style.width = pct + '%';
  };
  document.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- mobile nav ---------- */
  const burger = document.getElementById('burger');
  const mobileNav = document.getElementById('mobileNav');
  burger.addEventListener('click', () => {
    burger.classList.toggle('open');
    mobileNav.classList.toggle('open');
    document.body.style.overflow = mobileNav.classList.contains('open') ? 'hidden' : '';
  });
  mobileNav.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      burger.classList.remove('open');
      mobileNav.classList.remove('open');
      document.body.style.overflow = '';
    });
  });

  /* ---------- scroll reveal ---------- */
  const revealEls = document.querySelectorAll('.reveal, .reveal-line');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  revealEls.forEach(el => io.observe(el));

  /* ---------- to top ---------- */
  const toTop = document.getElementById('toTop');
  if (toTop) {
    toTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ---------- active nav highlight ---------- */
  const navLinks = document.querySelectorAll('.nav a');
  const sections = [...navLinks].map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const navIo = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const id = '#' + entry.target.id;
      const link = document.querySelector(`.nav a[href="${id}"]`);
      if (!link) return;
      if (entry.isIntersecting) {
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
      }
    });
  }, { threshold: 0.4 });
  sections.forEach(s => navIo.observe(s));

  /* ---------- hero particle network ----------
     A generative, mouse-reactive constellation evoking AI-made art,
     echoing the three product accent colors (violet, magenta, cyan).
     Nearby particles link up with fading lines; the cursor gently
     repels points that drift close to it. */
  const canvas = document.getElementById('heroCanvas');
  if (canvas && !reduceMotion) {
    const ctx = canvas.getContext('2d');
    const colors = ['139,92,246', '236,72,153', '34,211,238', '59,130,246', '45,212,191'];
    const LINK_DIST = 130;
    const REPEL_DIST = 140;
    let particles = [];
    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    let running = true;
    let rafId = null;
    let pointer = { x: -9999, y: -9999, active: false };

    function resize() {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round((w * h) / 15000);
      particles = Array.from({ length: Math.min(count, 150) }, () => spawn());
    }

    function spawn() {
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.6 + 0.6,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        c: colors[Math.floor(Math.random() * colors.length)],
        a: Math.random() * 0.5 + 0.3,
      };
    }

    function tick() {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);

      // links first, so dots sit on top
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const p1 = particles[i], p2 = particles[j];
          const dx = p1.x - p2.x, dy = p1.y - p2.y;
          const d = Math.hypot(dx, dy);
          if (d < LINK_DIST) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(139,92,246,${(1 - d / LINK_DIST) * 0.18})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;

        if (pointer.active) {
          const dx = p.x - pointer.x, dy = p.y - pointer.y;
          const d = Math.hypot(dx, dy);
          if (d < REPEL_DIST && d > 0.01) {
            const force = (1 - d / REPEL_DIST) * 0.6;
            p.x += (dx / d) * force;
            p.y += (dy / d) * force;
          }
        }

        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.c},${p.a})`;
        ctx.fill();
      });
      rafId = requestAnimationFrame(tick);
    }

    const heroSection = canvas.closest('.hero');
    if (heroSection) {
      heroSection.addEventListener('pointermove', (e) => {
        const rect = canvas.getBoundingClientRect();
        pointer.x = e.clientX - rect.left;
        pointer.y = e.clientY - rect.top;
        pointer.active = true;
      });
      heroSection.addEventListener('pointerleave', () => { pointer.active = false; });
    }

    document.addEventListener('visibilitychange', () => {
      running = !document.hidden;
      if (running && !rafId) tick();
      if (!running && rafId) { cancelAnimationFrame(rafId); rafId = null; }
    });

    window.addEventListener('resize', resize, { passive: true });
    resize();
    tick();
  }

  /* ---------- cursor glow ----------
     A soft, blended light that follows the pointer across the hero and
     app-showcase sections, giving those areas a live, tactile feel. */
  const cursorGlow = document.getElementById('cursorGlow');
  if (cursorGlow && !reduceMotion && window.matchMedia('(hover:hover)').matches) {
    const glowZones = ['.hero', '.apps'].map(sel => document.querySelector(sel)).filter(Boolean);
    let glowX = 0, glowY = 0, targetX = 0, targetY = 0, glowActive = false;

    function moveGlow() {
      glowX += (targetX - glowX) * 0.15;
      glowY += (targetY - glowY) * 0.15;
      cursorGlow.style.transform = `translate3d(${glowX}px,${glowY}px,0) translate(-50%,-50%)`;
      if (glowActive) requestAnimationFrame(moveGlow);
    }

    document.addEventListener('pointermove', (e) => {
      const overZone = glowZones.some(z => {
        const r = z.getBoundingClientRect();
        return e.clientY >= r.top && e.clientY <= r.bottom;
      });
      targetX = e.clientX;
      targetY = e.clientY;
      cursorGlow.classList.toggle('active', overZone);
      if (overZone && !glowActive) { glowActive = true; moveGlow(); }
      if (!overZone) glowActive = false;
    }, { passive: true });
  }

  /* ---------- device-frame tilt ----------
     A light 3D tilt that tracks the pointer, making each app mockup feel
     like a physical panel rather than a flat screenshot. */
  if (!reduceMotion && window.matchMedia('(hover:hover)').matches) {
    document.querySelectorAll('.device-frame').forEach((frame) => {
      frame.addEventListener('pointermove', (e) => {
        const rect = frame.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        frame.classList.add('tilting');
        frame.style.transform = `rotateY(${px * 10}deg) rotateX(${-py * 10}deg) scale3d(1.02,1.02,1.02)`;
      });
      frame.addEventListener('pointerleave', () => {
        frame.classList.remove('tilting');
        frame.style.transform = '';
      });
    });
  }

  /* ---------- count-up stats ---------- */
  const statEls = document.querySelectorAll('.dyn-stat-num');
  if (statEls.length) {
    const statIo = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        statIo.unobserve(entry.target);
        const el = entry.target;
        const target = Number(el.dataset.count || 0);
        const prefix = el.dataset.prefix || '';
        const suffix = el.dataset.suffix || '';
        const duration = 1200;
        const start = performance.now();
        function step(now) {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          el.textContent = prefix + Math.round(target * eased) + suffix;
          if (t < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.6 });
    statEls.forEach(el => statIo.observe(el));
  }

})();
