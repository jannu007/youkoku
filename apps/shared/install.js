(() => {
  'use strict';

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
        setLabel(btn, 'インストール済み ✓');
        btn.disabled = true;
      } else {
        setLabel(btn, 'インストール');
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
        <p class="ios-sheet-title">ホーム画面に追加する</p>
        ${bodyHtml}
        <button type="button" class="ios-sheet-close">閉じる</button>
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
        <li>画面下の <strong>共有ボタン</strong>(□に↑)をタップ</li>
        <li>メニューから <strong>「ホーム画面に追加」</strong> を選択</li>
        <li>右上の <strong>「追加」</strong> をタップして完了</li>
      </ol>
    `);
  }

  function showGenericSheet() {
    showSheet(`
      <ol>
        <li>ブラウザ右上の <strong>メニュー(⋮)</strong> を開く</li>
        <li><strong>「アプリをインストール」</strong> または <strong>「ホーム画面に追加」</strong> を選択</li>
        <li>表示に従って追加すれば完了です</li>
      </ol>
      <p class="ios-sheet-note">メニューにその項目が見当たらない場合は、数秒待ってからボタンをもう一度押してみてください。</p>
    `);
  }

  function showInAppBrowserSheet() {
    showSheet(`
      <ol>
        <li>右上の <strong>「…」または「⋮」メニュー</strong>を開く</li>
        <li><strong>「他のブラウザで開く」「ブラウザで開く」「Chromeで開く」</strong>などを選択</li>
        <li>開き直した後、もう一度このページで「インストール」を押してください</li>
      </ol>
      <p class="ios-sheet-note">LINEやInstagramなどアプリ内のブラウザでは、仕組み上インストールができません。Chromeなど通常のブラウザで開く必要があります。</p>
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
      setLabel(btn, '準備中…');
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
})();
