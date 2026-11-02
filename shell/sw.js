// Service Worker：讓網站裝成 App 後能自動更新。
// 有網路就拿最新版，斷網才用存下來的版本，所以使用者不會卡在舊畫面。
//
// 安裝時要改：APP_ID
// 每次部署前要改：SW_VERSION（數字加 1）。沒改的話，開著沒關的 App 視窗不會自動換新版。
const APP_ID = 'my-app';   // 英數短名。同一個網域放多個 App 時，每個都要不同
const SW_VERSION = 'v1';

// 網址含這些字的請求不存本機（登入、API、後台）。依網站實際路徑增減
const NO_CACHE_PATHS = ['/api/', '/auth/', '/__/', '/login', '/admin'];

const CACHE_PREFIX = APP_ID + '@';
const CACHE_NAME = CACHE_PREFIX + SW_VERSION;

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.add('./')).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    await self.clients.claim();
    // 只清自己的舊快取，同網域其他 App 的不能動（例如 GitHub Pages 的多個專案）
    const keys = await caches.keys();
    const old = keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME);
    await Promise.all(old.map(k => caches.delete(k)));
    // 第一次安裝沒有舊快取，不通知，避免新使用者開頁就被重新整理
    if (old.length) {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: SW_VERSION }));
    }
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 外部網域（Firebase SDK、Google 登入、CDN）一律不攔，否則會擋掉登入
  if (url.origin !== self.location.origin) return;
  // 影音走分段下載，存起來又佔空間，交給瀏覽器
  if (req.destination === 'video' || req.destination === 'audio') return;
  if (NO_CACHE_PATHS.some(p => url.pathname.includes(p))) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const res = await fetch(req);
      const noStore = (res.headers.get('cache-control') || '').includes('no-store');
      if (res.status === 200 && !noStore) {
        e.waitUntil(cache.put(req, res.clone()).catch(() => {}));
      }
      return res;
    } catch {
      const cached = await cache.match(req);
      if (cached) return cached;
      // 斷網又沒存過這頁：開 App 首頁，不要跳瀏覽器的錯誤畫面
      if (req.mode === 'navigate') {
        const home = await cache.match('./');
        if (home) return home;
      }
      return Response.error();
    }
  })());
});
