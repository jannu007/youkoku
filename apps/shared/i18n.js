/* ============================================================
   AI Records — shared client-side language switcher (no server,
   no paid translation API). Reads window.YOUKOKU_I18N_DICT (an
   object of { en: {key: text}, ja: {key: text} }, merged from the
   shared dictionary plus each page's own strings), swaps the text
   of every [data-i18n] / [data-i18n-placeholder] / [data-i18n-title]
   element, and injects a small EN / 日本語 switcher into the page's
   header. Preference is stored in localStorage so it carries across
   every page on the same origin. Default language is English.
   ============================================================ */
window.YoukokuI18n = (() => {
  const STORAGE_KEY = 'youkoku_lang';
  const DEFAULT_LANG = 'en';
  const LANGS = [
    { code: 'en', label: 'EN' },
    { code: 'ja', label: '日本語' },
  ];

  function getLang() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && LANGS.some((l) => l.code === saved)) return saved;
    } catch (err) { /* localStorage unavailable — fall through to default */ }
    return DEFAULT_LANG;
  }

  function setLang(code) {
    try { localStorage.setItem(STORAGE_KEY, code); } catch (err) { /* ignore */ }
    apply();
    updateSwitcherUI();
  }

  function dict() {
    return (window.YOUKOKU_I18N_DICT && window.YOUKOKU_I18N_DICT[getLang()]) || {};
  }

  function t(key, vars) {
    const d = dict();
    let text = d[key];
    if (text === undefined) return key;
    if (vars) {
      Object.keys(vars).forEach((k) => { text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), vars[k]); });
    }
    return text;
  }

  function apply() {
    const d = dict();
    document.documentElement.lang = getLang();
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (d[key] !== undefined) el.textContent = d[key];
    });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
      const key = el.getAttribute('data-i18n-html');
      if (d[key] !== undefined) el.innerHTML = d[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (d[key] !== undefined) el.setAttribute('placeholder', d[key]);
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      if (d[key] !== undefined) el.setAttribute('title', d[key]);
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      const key = el.getAttribute('data-i18n-aria');
      if (d[key] !== undefined) el.setAttribute('aria-label', d[key]);
    });
    const titleKey = document.body && document.body.getAttribute('data-i18n-doctitle');
    if (titleKey && d[titleKey] !== undefined) document.title = d[titleKey];
    document.dispatchEvent(new CustomEvent('youkoku-lang-change', { detail: { lang: getLang() } }));
  }

  let switcherEl = null;
  function updateSwitcherUI() {
    if (!switcherEl) return;
    const lang = getLang();
    switcherEl.querySelectorAll('button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });
  }

  function injectStyles() {
    if (document.getElementById('youkoku-i18n-style')) return;
    const style = document.createElement('style');
    style.id = 'youkoku-i18n-style';
    style.textContent = `
      .yk-lang-switch{ display:inline-flex; align-items:center; gap:.25rem; border:1px solid rgba(255,255,255,.18); border-radius:999px; padding:.2rem; flex-shrink:0; }
      .yk-lang-switch button{ font:inherit; font-size:.7rem; letter-spacing:.04em; padding:.32rem .65rem; border-radius:999px; border:none; background:transparent; color:inherit; opacity:.6; cursor:pointer; transition:opacity .2s ease, background .2s ease; }
      .yk-lang-switch button.active{ opacity:1; background:rgba(255,255,255,.14); }
      .yk-lang-switch button:hover{ opacity:1; }
    `;
    document.head.appendChild(style);
  }

  function buildSwitcher() {
    const wrap = document.createElement('div');
    wrap.className = 'yk-lang-switch';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Language');
    LANGS.forEach((l) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = l.label;
      btn.dataset.lang = l.code;
      btn.addEventListener('click', () => setLang(l.code));
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function injectSwitcher() {
    if (switcherEl) return;
    injectStyles();
    switcherEl = buildSwitcher();
    const target = document.querySelector('[data-i18n-slot]') || document.querySelector('.header-cta') || document.querySelector('.topbar');
    if (!target) return;
    target.appendChild(switcherEl);
    updateSwitcherUI();
  }

  function init() {
    injectSwitcher();
    apply();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { getLang, setLang, t, apply };
})();
