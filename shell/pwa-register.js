// 註冊 Service Worker、自動換新版、顯示「安裝 App」按鈕。不用改內容。
// 這支要跟 sw.js 放同一層，用一般 <script> 載入（不能用 type="module"）。
//
// 想放安裝按鈕：在頁面上放 <button data-pwa-install hidden>安裝 App</button>
// 瀏覽器判定可以安裝時才會出現，已經裝好或不支援就維持隱藏。
(function () {
  if (!('serviceWorker' in navigator)) return;

  var script = document.currentScript;
  var swUrl = new URL('sw.js', script ? script.src : location.href);

  var didReload = false;
  var pendingReload = false;

  // 使用者正在填東西時不能重新整理，否則輸入內容會不見
  function formBusy() {
    var el = document.activeElement;
    if (el && el.isContentEditable) return true;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') &&
        typeof el.value === 'string' && el.value.trim() !== '') return true;
    return Array.prototype.some.call(document.querySelectorAll('textarea'), function (t) {
      return t.value.trim() !== '';
    });
  }

  function reloadOnce() {
    if (didReload) return;
    if (formBusy()) { pendingReload = true; return; }
    didReload = true;
    setTimeout(function () { location.reload(); }, 300);
  }

  // 兩個訊號都接，哪個先到都只重新整理一次
  navigator.serviceWorker.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'SW_UPDATED') reloadOnce();
  });
  var hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadController) { hadController = true; return; }
    reloadOnce();
  });

  navigator.serviceWorker.register(swUrl.href).then(function (reg) {
    function check() {
      reg.update().catch(function () {});
      if (pendingReload) { pendingReload = false; reloadOnce(); }
    }
    // 瀏覽器自己約一天才檢查一次新版，所以要主動問
    reg.update().catch(function () {});
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') check();
    });
    // 桌面視窗切來切去不一定會觸發 visibilitychange，常常整天開著，所以再加這兩個
    window.addEventListener('focus', check);
    setInterval(check, 60 * 60 * 1000);
  }).catch(function () {});

  var installEvent = null;
  function installButtons(show) {
    document.querySelectorAll('[data-pwa-install]').forEach(function (b) { b.hidden = !show; });
  }
  window.addEventListener('beforeinstallprompt', function (e) {
    if (!document.querySelector('[data-pwa-install]')) return;
    e.preventDefault();
    installEvent = e;
    installButtons(true);
  });
  window.addEventListener('appinstalled', function () {
    installEvent = null;
    installButtons(false);
  });
  document.addEventListener('click', function (e) {
    if (!installEvent || !e.target.closest('[data-pwa-install]')) return;
    installEvent.prompt();
    installEvent = null;
    installButtons(false);
  });
})();
