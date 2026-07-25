(() => {
  'use strict';

  /* ---------- loader ---------- */
  const loader = document.getElementById('loader');
  window.addEventListener('load', () => {
    setTimeout(() => loader.classList.add('done'), 450);
  });

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
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
