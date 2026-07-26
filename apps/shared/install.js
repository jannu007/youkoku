(() => {
  'use strict';

  const t = (key) => (window.YoukokuI18n ? window.YoukokuI18n.t(key) : key);

  if ('serviceWorker' in navigator) {
    // Register as early as possible (not gated behind window 'load') since
    // Chrome only evaluates installability once a service worker with a
    // fetch handler is registered — waiting delays beforeinstallprompt.
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
      reg.update().catch(() => {});
    }).catch(() => {});
  }

  const buttons = () => document.querySelectorAll('.install-btn');
  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  // LINE/Instagram/X/Facebook's in-app webviews can't install PWAs at all —
  // no beforeinstallprompt support and often no "add to home screen" menu
  // item — so detect them and point the user at their real browser instead.
  const isInAppBrowser = /Line\/|FBAN|FBAV|Instagram|Twitter|MicroMessenger/i.test(navigator.userAgent);

  let deferredPrompt = null;
  let promptWaiters = [];

  function setButtonsState(state) {
    buttons().forEach((btn) => {
      btn.dataset.state = state;
      if (state === 'installed') {
        setLabel(btn, t('common.installed'));
        btn.disabled = true;
      } else {
        setLabel(btn, t('common.install'));
        btn.disabled = false;
      }
    });
  }

  function setLabel(btn, text) {
    const span = btn.querySelector('.btn-label');
    if (span) span.textContent = text; else btn.textContent = text;
  }

  function waitForPrompt(timeoutMs) {
    if (deferredPrompt) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        promptWaiters = promptWaiters.filter((w) => w !== onReady);
        resolve();
      }, timeoutMs);
      const onReady = () => { clearTimeout(timer); resolve(); };
      promptWaiters.push(onReady);
    });
  }

  function showSheet(bodyHtml) {
    if (document.getElementById('iosInstallSheet')) return;
    const overlay = document.createElement('div');
    overlay.id = 'iosInstallSheet';
    overlay.innerHTML = `
      <div class="ios-sheet-backdrop"></div>
      <div class="ios-sheet">
        <p class="ios-sheet-title">${t('install.sheetTitle')}</p>
        ${bodyHtml}
        <button type="button" class="ios-sheet-close">${t('install.close')}</button>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.ios-sheet-backdrop').addEventListener('click', close);
    overlay.querySelector('.ios-sheet-close').addEventListener('click', close);
  }

  function showIOSSheet() {
    showSheet(`
      <ol>
        <li>${t('install.iosStep1')}</li>
        <li>${t('install.iosStep2')}</li>
        <li>${t('install.iosStep3')}</li>
      </ol>
    `);
  }

  function showGenericSheet() {
    showSheet(`
      <ol>
        <li>${t('install.genericStep1')}</li>
        <li>${t('install.genericStep2')}</li>
        <li>${t('install.genericStep3')}</li>
      </ol>
      <p class="ios-sheet-note">${t('install.genericNote')}</p>
    `);
  }

  function showInAppBrowserSheet() {
    showSheet(`
      <ol>
        <li>${t('install.inAppStep1')}</li>
        <li>${t('install.inAppStep2')}</li>
        <li>${t('install.inAppStep3')}</li>
      </ol>
      <p class="ios-sheet-note">${t('install.inAppNote')}</p>
    `);
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    setButtonsState('ready');
    promptWaiters.forEach((w) => w());
    promptWaiters = [];
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    setButtonsState('installed');
  });

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.install-btn');
    if (!btn) return;
    e.preventDefault();

    if (isStandalone()) {
      window.location.href = 'app/';
      return;
    }

    if (isInAppBrowser) {
      showInAppBrowserSheet();
      return;
    }

    if (!deferredPrompt && !isIOS) {
      // beforeinstallprompt may not have fired yet — give Chrome a brief
      // window to deliver it before falling back to manual instructions,
      // so a real user click reliably gets the native install dialog.
      const originalLabel = btn.textContent;
      btn.disabled = true;
      setLabel(btn, t('common.installPreparing'));
      await waitForPrompt(3000);
      btn.disabled = false;
      setLabel(btn, originalLabel);
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (choice.outcome !== 'accepted') setButtonsState('idle');
      return;
    }
    if (isIOS) {
      showIOSSheet();
    } else {
      showGenericSheet();
    }
  });

  if (isStandalone()) setButtonsState('installed');

  document.addEventListener('youkoku-lang-change', () => {
    const btn = buttons()[0];
    setButtonsState(btn && btn.dataset.state === 'installed' ? 'installed' : 'idle');
  });
})();
